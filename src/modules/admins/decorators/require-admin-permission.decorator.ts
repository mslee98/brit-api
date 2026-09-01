import { SetMetadata } from '@nestjs/common';

export type AdminPermissionKey =
  | 'canViewRevenue'
  | 'canViewFullIdentity';

export const ADMIN_PERMISSION_KEY = 'admin_permission';

export const RequireAdminPermission = (permission: AdminPermissionKey) =>
  SetMetadata(ADMIN_PERMISSION_KEY, permission);
