import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource, In, Repository } from 'typeorm';

import { encryptAccountNumber } from '../../common/utils/account-crypto.util';
import { hashSecret } from '../../common/utils/password.util';
import { AuditLogService } from '../admins/audit-log.service';
import { AuditActionType } from '../admins/domain/enums/audit-action-type.enum';
import { AuditTargetType } from '../admins/domain/enums/audit-target-type.enum';
import { PartnerClientEnvironment } from './domain/enums/partner-client-environment.enum';
import { PartnerClientProcessingModel } from './domain/enums/partner-client-processing-model.enum';
import { PartnerClientScopeCode } from './domain/enums/partner-client-scope-code.enum';
import { PartnerClientSecretStatus } from './domain/enums/partner-client-secret-status.enum';
import { PartnerClientSecretType } from './domain/enums/partner-client-secret-type.enum';
import { PartnerClientStatus } from './domain/enums/partner-client-status.enum';
import { PartnerClientType } from './domain/enums/partner-client-type.enum';
import { PartnerMemberRole } from './domain/enums/partner-member-role.enum';
import { PartnerStatus } from './domain/enums/partner-status.enum';
import { CreatePartnerClientDto } from './dto/create-partner-client.dto';
import {
  PartnerClientIssuedResponseDto,
  PartnerClientResponseDto,
} from './dto/partner-client-response.dto';
import {
  CreatePortalPartnerClientDto,
  UpdatePortalPartnerClientDto,
} from './dto/portal-partner-client.dto';
import { UpdatePartnerClientDto } from './dto/update-partner-client.dto';
import { PartnerDomainException } from './exceptions/partner.exceptions';
import { PartnerClientOriginEntity } from './infrastructure/entities/partner-client-origin.entity';
import { PartnerClientScopeEntity } from './infrastructure/entities/partner-client-scope.entity';
import { PartnerClientSecretEntity } from './infrastructure/entities/partner-client-secret.entity';
import { PartnerClientEntity } from './infrastructure/entities/partner-client.entity';
import { PartnerEntity } from './infrastructure/entities/partner.entity';
import { assertSafeOperationsBaseUrl } from './utils/partner-operations-url.util';
import { assertSafeWebhookUrl } from './utils/partner-webhook-url.util';

export const PORTAL_ALLOWED_CLIENT_SCOPES: readonly PartnerClientScopeCode[] = [
  PartnerClientScopeCode.USER_LINK,
  PartnerClientScopeCode.EXCHANGE_CHARGE,
  PartnerClientScopeCode.EXCHANGE_REDEEM,
  PartnerClientScopeCode.STATUS_READ,
];

export const PORTAL_SANDBOX_CLIENT_LIMIT = 5;

const PORTAL_AUDIT_REASON = {
  create: '업체 포털 Sandbox 연동 키 발급',
  update: '업체 포털 Sandbox 연동 키 수정',
  rotate: '업체 포털 Sandbox 비밀키 재발급',
} as const;

export type PartnerPortalActor = {
  userId: string;
  partnerId: string;
  memberRole: PartnerMemberRole;
};

@Injectable()
export class PartnerClientsService {
  constructor(
    @InjectRepository(PartnerEntity)
    private readonly partnerRepository: Repository<PartnerEntity>,
    @InjectRepository(PartnerClientEntity)
    private readonly clientRepository: Repository<PartnerClientEntity>,
    @InjectRepository(PartnerClientSecretEntity)
    private readonly secretRepository: Repository<PartnerClientSecretEntity>,
    private readonly auditLogService: AuditLogService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async listClients(partnerId: string): Promise<PartnerClientResponseDto[]> {
    await this.requirePartner(partnerId);
    const clients = await this.clientRepository.find({
      where: { partnerId },
      relations: { scopes: true, origins: true },
      order: { createdAt: 'DESC' },
    });
    const secretFlags = await this.activeApiSecretFlags(
      clients.map((c) => c.id),
    );
    return clients.map((client) =>
      PartnerClientResponseDto.from(client, {
        hasActiveApiSecret: secretFlags.has(client.id),
      }),
    );
  }

  async getClient(
    partnerId: string,
    partnerClientId: string,
  ): Promise<PartnerClientResponseDto> {
    const client = await this.requireClient(partnerId, partnerClientId);
    const secretFlags = await this.activeApiSecretFlags([client.id]);
    return PartnerClientResponseDto.from(client, {
      hasActiveApiSecret: secretFlags.has(client.id),
    });
  }

  async createClient(
    actorUserId: string,
    partnerId: string,
    dto: CreatePartnerClientDto,
    ipAddress: string | null,
  ): Promise<PartnerClientIssuedResponseDto> {
    if (dto.scopes.length === 0) {
      throw PartnerDomainException.clientScopesRequired();
    }
    if (
      dto.clientType === PartnerClientType.PUBLIC_SDK &&
      (!dto.origins || dto.origins.length === 0)
    ) {
      throw PartnerDomainException.clientOriginsRequired();
    }

    return this.dataSource.transaction(async (manager) => {
      const partnerRepo = manager.getRepository(PartnerEntity);
      const clientRepo = manager.getRepository(PartnerClientEntity);
      const secretRepo = manager.getRepository(PartnerClientSecretEntity);
      const scopeRepo = manager.getRepository(PartnerClientScopeEntity);
      const originRepo = manager.getRepository(PartnerClientOriginEntity);

      const partner = await partnerRepo.findOne({ where: { id: partnerId } });
      if (!partner) {
        throw PartnerDomainException.notFound();
      }
      if (partner.status === PartnerStatus.TERMINATED) {
        throw PartnerDomainException.terminated();
      }

      let webhookUrl: string | null = dto.webhookUrl?.trim() || null;
      if (webhookUrl) {
        try {
          webhookUrl = assertSafeWebhookUrl(webhookUrl, dto.environment)
            .toString()
            .replace(/\/$/, '');
        } catch {
          throw PartnerDomainException.webhookUrlInvalid();
        }
      }

      const clientId = this.buildPublicClientId(partner.code, dto.environment);
      const client = clientRepo.create({
        partnerId,
        clientId,
        clientType: dto.clientType,
        environment: dto.environment,
        name: dto.name.trim(),
        webhookUrl,
        status: PartnerClientStatus.ACTIVE,
      });
      const saved = await clientRepo.save(client);

      await scopeRepo.save(
        dto.scopes.map((scopeCode) =>
          scopeRepo.create({
            partnerClientId: saved.id,
            scopeCode,
          }),
        ),
      );

      const origins = (dto.origins ?? []).map((o) => o.trim()).filter(Boolean);
      if (origins.length > 0) {
        await originRepo.save(
          origins.map((origin) =>
            originRepo.create({
              partnerClientId: saved.id,
              origin,
            }),
          ),
        );
      }

      let apiSecretPlaintext: string | null = null;
      if (dto.clientType === PartnerClientType.SERVER) {
        apiSecretPlaintext = this.generateSecretPlaintext();
        await secretRepo.save(
          secretRepo.create({
            partnerClientId: saved.id,
            secretType: PartnerClientSecretType.API_SECRET,
            secretHash: await hashSecret(apiSecretPlaintext),
            status: PartnerClientSecretStatus.ACTIVE,
            expiresAt: null,
            revokedAt: null,
          }),
        );
      }

      let webhookSecretPlaintext: string | null = null;
      if (saved.webhookUrl) {
        webhookSecretPlaintext = await this.issueWebhookSecretInTransaction(
          secretRepo,
          saved.id,
        );
      }

      await this.auditLogService.writeInTransaction(manager, {
        actorUserId,
        actionType: AuditActionType.CREATE_PARTNER_CLIENT,
        targetType: AuditTargetType.PARTNER_CLIENT,
        targetId: saved.id,
        beforeData: null,
        afterData: {
          partnerId,
          clientId: saved.clientId,
          clientType: saved.clientType,
          environment: saved.environment,
          scopes: dto.scopes,
          origins,
          issuedWebhookSecret: webhookSecretPlaintext != null,
        },
        reason: dto.reason,
        ipAddress,
      });

      return PartnerClientIssuedResponseDto.fromIssued(saved, {
        scopes: dto.scopes,
        origins,
        hasActiveApiSecret: apiSecretPlaintext != null,
        apiSecretPlaintext,
        webhookSecretPlaintext,
      });
    });
  }

  async updateClient(
    actorUserId: string,
    partnerId: string,
    partnerClientId: string,
    dto: UpdatePartnerClientDto,
    ipAddress: string | null,
  ): Promise<PartnerClientResponseDto | PartnerClientIssuedResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const clientRepo = manager.getRepository(PartnerClientEntity);
      const scopeRepo = manager.getRepository(PartnerClientScopeEntity);
      const originRepo = manager.getRepository(PartnerClientOriginEntity);
      const secretRepo = manager.getRepository(PartnerClientSecretEntity);

      const client = await clientRepo.findOne({
        where: { id: partnerClientId, partnerId },
        relations: { scopes: true, origins: true },
      });
      if (!client) {
        throw PartnerDomainException.clientNotFound();
      }
      if (client.status === PartnerClientStatus.REVOKED) {
        throw PartnerDomainException.clientRevoked();
      }

      const before = {
        name: client.name,
        webhookUrl: client.webhookUrl,
        processingModel: client.processingModel,
        operationsBaseUrl: client.operationsBaseUrl,
        scopes: client.scopes?.map((s) => s.scopeCode) ?? [],
        origins: client.origins?.map((o) => o.origin) ?? [],
      };

      if (dto.name !== undefined) client.name = dto.name.trim();
      if (dto.webhookUrl !== undefined) {
        const raw = dto.webhookUrl?.trim() || null;
        if (raw) {
          try {
            client.webhookUrl = assertSafeWebhookUrl(raw, client.environment)
              .toString()
              .replace(/\/$/, '');
          } catch {
            throw PartnerDomainException.webhookUrlInvalid();
          }
        } else {
          client.webhookUrl = null;
        }
      }
      if (dto.processingModel !== undefined) {
        client.processingModel = dto.processingModel;
      }
      if (dto.operationsBaseUrl !== undefined) {
        const raw = dto.operationsBaseUrl?.trim() || null;
        if (raw) {
          try {
            client.operationsBaseUrl = assertSafeOperationsBaseUrl(
              raw,
              client.environment,
            )
              .toString()
              .replace(/\/$/, '');
          } catch {
            throw PartnerDomainException.operationsUrlInvalid();
          }
        } else {
          client.operationsBaseUrl = null;
        }
      }
      await clientRepo.save(client);

      let scopes = before.scopes;
      if (dto.scopes !== undefined) {
        if (dto.scopes.length === 0) {
          throw PartnerDomainException.clientScopesRequired();
        }
        await scopeRepo.delete({ partnerClientId: client.id });
        await scopeRepo.save(
          dto.scopes.map((scopeCode) =>
            scopeRepo.create({ partnerClientId: client.id, scopeCode }),
          ),
        );
        scopes = dto.scopes;
      }

      let origins = before.origins;
      if (dto.origins !== undefined) {
        if (
          client.clientType === PartnerClientType.PUBLIC_SDK &&
          dto.origins.length === 0
        ) {
          throw PartnerDomainException.clientOriginsRequired();
        }
        await originRepo.delete({ partnerClientId: client.id });
        const cleaned = dto.origins.map((o) => o.trim()).filter(Boolean);
        if (cleaned.length > 0) {
          await originRepo.save(
            cleaned.map((origin) =>
              originRepo.create({ partnerClientId: client.id, origin }),
            ),
          );
        }
        origins = cleaned;
      }

      let operationsSigningSecretPlaintext: string | null = null;
      const becameBritOperations =
        client.processingModel ===
          PartnerClientProcessingModel.BRIT_OPERATIONS &&
        before.processingModel !==
          PartnerClientProcessingModel.BRIT_OPERATIONS;
      const shouldIssueOpsSecret =
        dto.issueOperationsSigningSecret === true || becameBritOperations;

      if (shouldIssueOpsSecret) {
        const now = new Date();
        const actives = await secretRepo.find({
          where: {
            partnerClientId: client.id,
            secretType: PartnerClientSecretType.OPERATIONS_SIGNING_SECRET,
            status: PartnerClientSecretStatus.ACTIVE,
          },
        });
        for (const secret of actives) {
          secret.status = PartnerClientSecretStatus.REVOKED;
          secret.revokedAt = now;
          await secretRepo.save(secret);
        }
        operationsSigningSecretPlaintext = this.generateSecretPlaintext();
        const encryptionKey = this.configService.getOrThrow<string>(
          'ACCOUNT_ENCRYPTION_KEY',
        );
        await secretRepo.save(
          secretRepo.create({
            partnerClientId: client.id,
            secretType: PartnerClientSecretType.OPERATIONS_SIGNING_SECRET,
            secretHash: await hashSecret(operationsSigningSecretPlaintext),
            secretEncrypted: encryptAccountNumber(
              operationsSigningSecretPlaintext,
              encryptionKey,
            ),
            status: PartnerClientSecretStatus.ACTIVE,
            expiresAt: null,
            revokedAt: null,
          }),
        );
      }

      let webhookSecretPlaintext: string | null = null;
      const webhookNewlySet =
        Boolean(client.webhookUrl) && !before.webhookUrl;
      const shouldIssueWebhookSecret =
        dto.issueWebhookSecret === true || webhookNewlySet;
      if (shouldIssueWebhookSecret) {
        if (!client.webhookUrl) {
          throw PartnerDomainException.webhookUrlInvalid();
        }
        webhookSecretPlaintext = await this.issueWebhookSecretInTransaction(
          secretRepo,
          client.id,
        );
      }

      await this.auditLogService.writeInTransaction(manager, {
        actorUserId,
        actionType: AuditActionType.UPDATE_PARTNER_CLIENT,
        targetType: AuditTargetType.PARTNER_CLIENT,
        targetId: client.id,
        beforeData: before,
        afterData: {
          name: client.name,
          webhookUrl: client.webhookUrl,
          processingModel: client.processingModel,
          operationsBaseUrl: client.operationsBaseUrl,
          scopes,
          origins,
          issuedOperationsSigningSecret: operationsSigningSecretPlaintext != null,
          issuedWebhookSecret: webhookSecretPlaintext != null,
        },
        reason: dto.reason,
        ipAddress,
      });

      const secretFlags = await this.activeApiSecretFlags(
        [client.id],
        manager.getRepository(PartnerClientSecretEntity),
      );
      if (operationsSigningSecretPlaintext || webhookSecretPlaintext) {
        return PartnerClientIssuedResponseDto.fromIssued(client, {
          scopes,
          origins,
          hasActiveApiSecret: secretFlags.has(client.id),
          apiSecretPlaintext: null,
          operationsSigningSecretPlaintext,
          webhookSecretPlaintext,
        });
      }
      return PartnerClientResponseDto.from(client, {
        scopes,
        origins,
        hasActiveApiSecret: secretFlags.has(client.id),
      });
    });
  }

  async rotateWebhookSecret(
    actorUserId: string,
    partnerId: string,
    partnerClientId: string,
    reason: string,
    ipAddress: string | null,
  ): Promise<PartnerClientIssuedResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const clientRepo = manager.getRepository(PartnerClientEntity);
      const secretRepo = manager.getRepository(PartnerClientSecretEntity);

      const client = await clientRepo.findOne({
        where: { id: partnerClientId, partnerId },
        relations: { scopes: true, origins: true },
      });
      if (!client) {
        throw PartnerDomainException.clientNotFound();
      }
      if (client.status !== PartnerClientStatus.ACTIVE) {
        throw PartnerDomainException.clientNotActive();
      }
      if (!client.webhookUrl) {
        throw PartnerDomainException.webhookUrlInvalid();
      }

      const webhookSecretPlaintext =
        await this.issueWebhookSecretInTransaction(secretRepo, client.id);

      await this.auditLogService.writeInTransaction(manager, {
        actorUserId,
        actionType: AuditActionType.ROTATE_PARTNER_CLIENT_SECRET,
        targetType: AuditTargetType.PARTNER_CLIENT,
        targetId: client.id,
        beforeData: null,
        afterData: { secretType: PartnerClientSecretType.WEBHOOK_SECRET },
        reason,
        ipAddress,
      });

      const secretFlags = await this.activeApiSecretFlags(
        [client.id],
        secretRepo,
      );
      return PartnerClientIssuedResponseDto.fromIssued(client, {
        scopes: client.scopes?.map((s) => s.scopeCode) ?? [],
        origins: client.origins?.map((o) => o.origin) ?? [],
        hasActiveApiSecret: secretFlags.has(client.id),
        apiSecretPlaintext: null,
        webhookSecretPlaintext,
      });
    });
  }

  async rotateApiSecret(
    actorUserId: string,
    partnerId: string,
    partnerClientId: string,
    reason: string,
    ipAddress: string | null,
  ): Promise<PartnerClientIssuedResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const clientRepo = manager.getRepository(PartnerClientEntity);
      const secretRepo = manager.getRepository(PartnerClientSecretEntity);

      const client = await clientRepo.findOne({
        where: { id: partnerClientId, partnerId },
        relations: { scopes: true, origins: true },
      });
      if (!client) {
        throw PartnerDomainException.clientNotFound();
      }
      if (client.status !== PartnerClientStatus.ACTIVE) {
        throw PartnerDomainException.clientNotActive();
      }
      if (client.clientType !== PartnerClientType.SERVER) {
        throw PartnerDomainException.clientSecretNotApplicable();
      }

      const now = new Date();
      const actives = await secretRepo.find({
        where: {
          partnerClientId: client.id,
          secretType: PartnerClientSecretType.API_SECRET,
          status: PartnerClientSecretStatus.ACTIVE,
        },
      });
      for (const secret of actives) {
        secret.status = PartnerClientSecretStatus.REVOKED;
        secret.revokedAt = now;
        await secretRepo.save(secret);
      }

      const apiSecretPlaintext = this.generateSecretPlaintext();
      await secretRepo.save(
        secretRepo.create({
          partnerClientId: client.id,
          secretType: PartnerClientSecretType.API_SECRET,
          secretHash: await hashSecret(apiSecretPlaintext),
          status: PartnerClientSecretStatus.ACTIVE,
          expiresAt: null,
          revokedAt: null,
        }),
      );

      await this.auditLogService.writeInTransaction(manager, {
        actorUserId,
        actionType: AuditActionType.ROTATE_PARTNER_CLIENT_SECRET,
        targetType: AuditTargetType.PARTNER_CLIENT,
        targetId: client.id,
        beforeData: { revokedSecretCount: actives.length },
        afterData: { secretType: PartnerClientSecretType.API_SECRET },
        reason,
        ipAddress,
      });

      return PartnerClientIssuedResponseDto.fromIssued(client, {
        scopes: client.scopes?.map((s) => s.scopeCode) ?? [],
        origins: client.origins?.map((o) => o.origin) ?? [],
        hasActiveApiSecret: true,
        apiSecretPlaintext,
      });
    });
  }

  async revokeClient(
    actorUserId: string,
    partnerId: string,
    partnerClientId: string,
    reason: string,
    ipAddress: string | null,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const clientRepo = manager.getRepository(PartnerClientEntity);
      const secretRepo = manager.getRepository(PartnerClientSecretEntity);

      const client = await clientRepo.findOne({
        where: { id: partnerClientId, partnerId },
      });
      if (!client) {
        throw PartnerDomainException.clientNotFound();
      }
      if (client.status === PartnerClientStatus.REVOKED) {
        throw PartnerDomainException.clientRevoked();
      }

      const beforeStatus = client.status;
      client.status = PartnerClientStatus.REVOKED;
      await clientRepo.save(client);

      const now = new Date();
      const actives = await secretRepo.find({
        where: {
          partnerClientId: client.id,
          status: PartnerClientSecretStatus.ACTIVE,
        },
      });
      for (const secret of actives) {
        secret.status = PartnerClientSecretStatus.REVOKED;
        secret.revokedAt = now;
        await secretRepo.save(secret);
      }

      await this.auditLogService.writeInTransaction(manager, {
        actorUserId,
        actionType: AuditActionType.REVOKE_PARTNER_CLIENT,
        targetType: AuditTargetType.PARTNER_CLIENT,
        targetId: client.id,
        beforeData: { status: beforeStatus },
        afterData: {
          status: PartnerClientStatus.REVOKED,
          revokedSecretCount: actives.length,
        },
        reason,
        ipAddress,
      });
    });
  }

  async createPortalClient(
    actor: PartnerPortalActor,
    dto: CreatePortalPartnerClientDto,
    ipAddress: string | null,
  ): Promise<PartnerClientIssuedResponseDto> {
    await this.requirePortalManager(actor);
    const disallowed = dto.scopes.find(
      (scope) => !PORTAL_ALLOWED_CLIENT_SCOPES.includes(scope),
    );
    if (disallowed) {
      throw PartnerDomainException.portalClientScopeNotAllowed(disallowed);
    }

    const activeSandboxCount = await this.clientRepository.count({
      where: {
        partnerId: actor.partnerId,
        environment: PartnerClientEnvironment.SANDBOX,
        status: PartnerClientStatus.ACTIVE,
      },
    });
    if (activeSandboxCount >= PORTAL_SANDBOX_CLIENT_LIMIT) {
      throw PartnerDomainException.portalClientLimitExceeded(
        PORTAL_SANDBOX_CLIENT_LIMIT,
      );
    }

    return this.createClient(
      actor.userId,
      actor.partnerId,
      {
        environment: PartnerClientEnvironment.SANDBOX,
        clientType: dto.clientType,
        name: dto.name,
        webhookUrl: null,
        scopes: dto.scopes,
        origins: dto.origins,
        reason: PORTAL_AUDIT_REASON.create,
      },
      ipAddress,
    );
  }

  async updatePortalClient(
    actor: PartnerPortalActor,
    partnerClientId: string,
    dto: UpdatePortalPartnerClientDto,
    ipAddress: string | null,
  ): Promise<PartnerClientResponseDto> {
    await this.requirePortalManager(actor);
    await this.requirePortalSandboxClient(actor.partnerId, partnerClientId);
    return this.updateClient(
      actor.userId,
      actor.partnerId,
      partnerClientId,
      {
        name: dto.name,
        origins: dto.origins,
        reason: PORTAL_AUDIT_REASON.update,
      },
      ipAddress,
    );
  }

  async rotatePortalClientSecret(
    actor: PartnerPortalActor,
    partnerClientId: string,
    ipAddress: string | null,
  ): Promise<PartnerClientIssuedResponseDto> {
    await this.requirePortalManager(actor);
    await this.requirePortalSandboxClient(actor.partnerId, partnerClientId);
    return this.rotateApiSecret(
      actor.userId,
      actor.partnerId,
      partnerClientId,
      PORTAL_AUDIT_REASON.rotate,
      ipAddress,
    );
  }

  /** 포털 쓰기: OWNER + ACTIVE 업체만. SUSPENDED는 조회만 허용한다. */
  private async requirePortalManager(actor: PartnerPortalActor): Promise<void> {
    if (actor.memberRole !== PartnerMemberRole.OWNER) {
      throw PartnerDomainException.portalOwnerRequired();
    }
    const partner = await this.requirePartner(actor.partnerId);
    if (partner.status !== PartnerStatus.ACTIVE) {
      throw PartnerDomainException.portalPartnerNotActive();
    }
  }

  private async requirePortalSandboxClient(
    partnerId: string,
    partnerClientId: string,
  ): Promise<PartnerClientEntity> {
    const client = await this.requireClient(partnerId, partnerClientId);
    if (client.environment !== PartnerClientEnvironment.SANDBOX) {
      throw PartnerDomainException.portalClientSandboxOnly();
    }
    return client;
  }

  private async requirePartner(partnerId: string): Promise<PartnerEntity> {
    const partner = await this.partnerRepository.findOne({
      where: { id: partnerId },
    });
    if (!partner) {
      throw PartnerDomainException.notFound();
    }
    return partner;
  }

  private async requireClient(
    partnerId: string,
    partnerClientId: string,
  ): Promise<PartnerClientEntity> {
    const client = await this.clientRepository.findOne({
      where: { id: partnerClientId, partnerId },
      relations: { scopes: true, origins: true },
    });
    if (!client) {
      throw PartnerDomainException.clientNotFound();
    }
    return client;
  }

  private async activeApiSecretFlags(
    clientIds: string[],
    secretRepo: Repository<PartnerClientSecretEntity> = this.secretRepository,
  ): Promise<Set<string>> {
    if (clientIds.length === 0) return new Set();
    const rows = await secretRepo.find({
      where: {
        partnerClientId: In(clientIds),
        secretType: PartnerClientSecretType.API_SECRET,
        status: PartnerClientSecretStatus.ACTIVE,
      },
      select: ['partnerClientId'],
    });
    return new Set(rows.map((r) => r.partnerClientId));
  }

  private buildPublicClientId(
    partnerCode: string,
    environment: PartnerClientEnvironment,
  ): string {
    const env =
      environment === PartnerClientEnvironment.PRODUCTION ? 'prod' : 'sandbox';
    const suffix = randomBytes(4).toString('hex');
    return `${partnerCode.toLowerCase()}_${env}_${suffix}`;
  }

  /**
   * ACTIVE WEBHOOK_SECRET을 폐기하고 새 키를 암호화 저장한 뒤 원문을 반환한다.
   * B4-5 이전 해시-only 행은 서명에 쓸 수 없으므로 회전이 필요하다.
   */
  private async issueWebhookSecretInTransaction(
    secretRepo: Repository<PartnerClientSecretEntity>,
    partnerClientId: string,
  ): Promise<string> {
    const now = new Date();
    const actives = await secretRepo.find({
      where: {
        partnerClientId,
        secretType: PartnerClientSecretType.WEBHOOK_SECRET,
        status: PartnerClientSecretStatus.ACTIVE,
      },
    });
    for (const secret of actives) {
      secret.status = PartnerClientSecretStatus.REVOKED;
      secret.revokedAt = now;
      await secretRepo.save(secret);
    }

    const plaintext = this.generateSecretPlaintext();
    const encryptionKey = this.configService.getOrThrow<string>(
      'ACCOUNT_ENCRYPTION_KEY',
    );
    await secretRepo.save(
      secretRepo.create({
        partnerClientId,
        secretType: PartnerClientSecretType.WEBHOOK_SECRET,
        secretHash: await hashSecret(plaintext),
        secretEncrypted: encryptAccountNumber(plaintext, encryptionKey),
        status: PartnerClientSecretStatus.ACTIVE,
        expiresAt: null,
        revokedAt: null,
      }),
    );
    return plaintext;
  }

  private generateSecretPlaintext(): string {
    return `brt_${randomBytes(24).toString('base64url')}`;
  }
}
