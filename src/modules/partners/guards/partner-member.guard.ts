import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { PartnerMemberRole } from '../domain/enums/partner-member-role.enum';
import { PartnerMemberStatus } from '../domain/enums/partner-member-status.enum';
import { PartnerStatus } from '../domain/enums/partner-status.enum';
import { PartnerDomainException } from '../exceptions/partner.exceptions';
import { PartnerMemberEntity } from '../infrastructure/entities/partner-member.entity';
import { PartnerEntity } from '../infrastructure/entities/partner.entity';

export type PartnerPortalRequest = {
  user?: AuthenticatedUser;
  partnerId?: string;
  partnerMemberId?: string;
  partnerMemberRole?: PartnerMemberRole;
};

/**
 * 업체 포털 접근: ACTIVE partner_members + TERMINATED가 아닌 업체.
 * SUSPENDED는 조회(대시보드·내역)만 허용. CHARGE/REDEEM은 ACTIVE만.
 */
@Injectable()
export class PartnerMemberGuard implements CanActivate {
  constructor(
    @InjectRepository(PartnerMemberEntity)
    private readonly memberRepository: Repository<PartnerMemberEntity>,
    @InjectRepository(PartnerEntity)
    private readonly partnerRepository: Repository<PartnerEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<PartnerPortalRequest>();
    const user = request.user;
    if (!user) {
      throw PartnerDomainException.portalForbidden();
    }

    const membership = await this.memberRepository.findOne({
      where: {
        userId: user.userId,
        status: PartnerMemberStatus.ACTIVE,
      },
    });
    if (!membership) {
      throw PartnerDomainException.portalMembershipRequired();
    }

    const partner = await this.partnerRepository.findOne({
      where: { id: membership.partnerId },
    });
    if (!partner) {
      throw PartnerDomainException.notFound();
    }
    if (partner.status === PartnerStatus.TERMINATED) {
      throw PartnerDomainException.portalPartnerTerminated();
    }

    request.partnerId = membership.partnerId;
    request.partnerMemberId = membership.id;
    request.partnerMemberRole = membership.role;

    return true;
  }
}
