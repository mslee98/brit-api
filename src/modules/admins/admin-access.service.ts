import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { UserRole } from '../users/domain/enums/user-role.enum';
import { AdminDomainException } from './exceptions/admin.exceptions';
import { AdminProfileEntity } from './infrastructure/entities/admin-profile.entity';

/** 리더/SYS_ADMIN 전용 관리자 API 권한 검사 */
@Injectable()
export class AdminAccessService {
  constructor(
    @InjectRepository(AdminProfileEntity)
    private readonly adminProfileRepository: Repository<AdminProfileEntity>,
  ) {}

  async assertIsLeaderOrSysAdmin(actor: AuthenticatedUser): Promise<void> {
    if (actor.role === UserRole.SYS_ADMIN) {
      return;
    }
    const profile = await this.adminProfileRepository.findOne({
      where: { userId: actor.userId },
    });
    if (!profile?.isLeader) {
      throw AdminDomainException.forbidden();
    }
  }

  async assertActiveAdmin(userId: string): Promise<void> {
    const profile = await this.adminProfileRepository.findOne({
      where: { userId },
    });
    if (!profile) {
      throw AdminDomainException.adminNotFound();
    }
    if (!profile.isActive) {
      throw AdminDomainException.adminProfileInactive();
    }
  }
}
