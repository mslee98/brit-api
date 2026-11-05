import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { verifySecret } from '../../../common/utils/password.util';
import { PartnerClientScopeCode } from '../domain/enums/partner-client-scope-code.enum';
import { PartnerClientSecretStatus } from '../domain/enums/partner-client-secret-status.enum';
import { PartnerClientSecretType } from '../domain/enums/partner-client-secret-type.enum';
import { PartnerClientStatus } from '../domain/enums/partner-client-status.enum';
import { PartnerClientType } from '../domain/enums/partner-client-type.enum';
import { PartnerStatus } from '../domain/enums/partner-status.enum';
import { PartnerDomainException } from '../exceptions/partner.exceptions';
import { PartnerClientScopeEntity } from '../infrastructure/entities/partner-client-scope.entity';
import { PartnerClientSecretEntity } from '../infrastructure/entities/partner-client-secret.entity';
import { PartnerClientEntity } from '../infrastructure/entities/partner-client.entity';
import { PartnerEntity } from '../infrastructure/entities/partner.entity';

export const PARTNER_CLIENT_SCOPES_KEY = 'partner_client_scopes';

export const RequirePartnerScopes = (...scopes: PartnerClientScopeCode[]) =>
  SetMetadata(PARTNER_CLIENT_SCOPES_KEY, scopes);

export type PartnerClientAuthRequest = {
  headers: Record<string, string | string[] | undefined>;
  partnerId?: string;
  partnerClientId?: string;
  partnerClient?: PartnerClientEntity;
};

/**
 * SERVER Client 인증: X-Partner-Client-Id + X-Partner-Api-Secret.
 */
@Injectable()
export class PartnerClientAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(PartnerClientEntity)
    private readonly clientRepository: Repository<PartnerClientEntity>,
    @InjectRepository(PartnerClientSecretEntity)
    private readonly secretRepository: Repository<PartnerClientSecretEntity>,
    @InjectRepository(PartnerClientScopeEntity)
    private readonly scopeRepository: Repository<PartnerClientScopeEntity>,
    @InjectRepository(PartnerEntity)
    private readonly partnerRepository: Repository<PartnerEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<PartnerClientAuthRequest>();

    const clientId = header(request, 'x-partner-client-id');
    const apiSecret = header(request, 'x-partner-api-secret');
    if (!clientId || !apiSecret) {
      throw PartnerDomainException.clientAuthRequired();
    }

    const client = await this.clientRepository.findOne({
      where: { clientId },
    });
    if (
      !client ||
      client.status !== PartnerClientStatus.ACTIVE ||
      client.clientType !== PartnerClientType.SERVER
    ) {
      throw PartnerDomainException.clientAuthInvalid();
    }

    const partner = await this.partnerRepository.findOne({
      where: { id: client.partnerId },
    });
    if (!partner || partner.status !== PartnerStatus.ACTIVE) {
      throw PartnerDomainException.partnerNotActive();
    }

    const secrets = await this.secretRepository.find({
      where: {
        partnerClientId: client.id,
        secretType: PartnerClientSecretType.API_SECRET,
        status: PartnerClientSecretStatus.ACTIVE,
      },
    });
    let matched = false;
    for (const secret of secrets) {
      if (await verifySecret(apiSecret, secret.secretHash)) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      throw PartnerDomainException.clientAuthInvalid();
    }

    const required =
      this.reflector.getAllAndOverride<PartnerClientScopeCode[]>(
        PARTNER_CLIENT_SCOPES_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];

    if (required.length > 0) {
      const scopes = await this.scopeRepository.find({
        where: {
          partnerClientId: client.id,
          scopeCode: In(required),
        },
      });
      for (const scope of required) {
        if (!scopes.some((s) => s.scopeCode === scope)) {
          throw PartnerDomainException.clientScopeDenied(scope);
        }
      }
    }

    request.partnerId = client.partnerId;
    request.partnerClientId = client.id;
    request.partnerClient = client;
    return true;
  }
}

function header(
  req: PartnerClientAuthRequest,
  name: string,
): string | undefined {
  const raw = req.headers[name] ?? req.headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}
