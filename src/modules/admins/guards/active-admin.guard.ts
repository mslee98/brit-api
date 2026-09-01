import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AuthClientType } from '../../auth/domain/enums/auth-client-type.enum';
import { RoleGrantStatus } from '../../users/domain/enums/role-grant-status.enum';
import { UserRole } from '../../users/domain/enums/user-role.enum';
import { UserRoleEntity } from '../../users/infrastructure/entities/user-role.entity';
import { AdminDomainException } from '../exceptions/admin.exceptions';
import { AdminProfileEntity } from '../infrastructure/entities/admin-profile.entity';

/**
 * 관리자 API 접근: clientType=ADMIN + ACTIVE 관리자 역할 + admin_profiles.is_active.
 */
@Injectable()
export class ActiveAdminGuard implements CanActivate {
  constructor(
    @InjectRepository(AdminProfileEntity)
    private readonly adminProfileRepository: Repository<AdminProfileEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly roleRepository: Repository<UserRoleEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw AdminDomainException.forbidden();
    }

    if (user.clientType !== AuthClientType.ADMIN) {
      throw AdminDomainException.adminRoleRequired();
    }

    if (
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.SYS_ADMIN
    ) {
      throw AdminDomainException.adminRoleRequired();
    }

    const activeRole = await this.roleRepository.findOne({
      where: {
        userId: user.userId,
        role: In([UserRole.ADMIN, UserRole.SYS_ADMIN]),
        status: RoleGrantStatus.ACTIVE,
      },
    });
    if (!activeRole) {
      throw AdminDomainException.adminRoleRequired();
    }

    const profile = await this.adminProfileRepository.findOne({
      where: { userId: user.userId },
    });
    if (!profile) {
      throw AdminDomainException.adminProfileNotConfigured();
    }
    if (!profile.isActive) {
      throw AdminDomainException.adminProfileInactive();
    }

    return true;
  }
}
