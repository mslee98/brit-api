import { SetMetadata } from '@nestjs/common';

import { UserRole } from '../../modules/users/domain/enums/user-role.enum';

export const ROLES_KEY = 'roles';

/** 허용 역할. JwtAuthGuard 이후 RolesGuard와 함께 사용. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
