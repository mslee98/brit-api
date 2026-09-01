import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import {
  ADMIN_PERMISSION_KEY,
  type AdminPermissionKey,
} from '../decorators/require-admin-permission.decorator';
import { AdminDomainException } from '../exceptions/admin.exceptions';
import { AdminProfileEntity } from '../infrastructure/entities/admin-profile.entity';

/**
 * 민감 권한은 JWT가 아니라 admin_profiles DB를 재검증한다.
 */
@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(AdminProfileEntity)
    private readonly adminProfileRepository: Repository<AdminProfileEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<AdminPermissionKey>(
      ADMIN_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!permission) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const userId = request.user?.userId;
    if (!userId) {
      throw AdminDomainException.forbidden();
    }

    const profile = await this.adminProfileRepository.findOne({
      where: { userId },
    });
    if (!profile?.isActive) {
      throw AdminDomainException.adminProfileInactive();
    }

    const allowed =
      permission === 'canViewRevenue'
        ? profile.canViewRevenue
        : profile.canViewFullIdentity;

    if (!allowed) {
      throw AdminDomainException.forbidden();
    }

    return true;
  }
}
