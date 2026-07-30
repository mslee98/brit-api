import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedUser } from '../types/authenticated-user';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../../modules/users/domain/enums/user-role.enum';

/**
 * @Roles(...) 메타데이터와 JWT role을 비교한다.
 * JwtAuthGuard 이후에 사용해야 한다.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles?.length) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const role = request.user?.role;
    if (!role || !requiredRoles.includes(role)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '권한이 없어요.',
      });
    }
    return true;
  }
}
