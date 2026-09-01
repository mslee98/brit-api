import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { UsersModule } from '../users/users.module';
import { UserRoleEntity } from '../users/infrastructure/entities/user-role.entity';
import { UserEntity } from '../users/infrastructure/entities/user.entity';
import { AdminAccessService } from './admin-access.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminManagementController } from './admin-management.controller';
import { AdminManagementService } from './admin-management.service';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';
import { ActiveAdminGuard } from './guards/active-admin.guard';
import { AdminPermissionGuard } from './guards/admin-permission.guard';
import { AdminProfileEntity } from './infrastructure/entities/admin-profile.entity';
import { AuditLogEntity } from './infrastructure/entities/audit-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AdminProfileEntity,
      AuditLogEntity,
      UserRoleEntity,
      UserEntity,
    ]),
    AuthGuardsModule,
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),
  ],
  controllers: [
    AdminAuthController,
    AdminManagementController,
    AuditLogController,
  ],
  providers: [
    AdminAccessService,
    AdminAuthService,
    AdminManagementService,
    AuditLogService,
    ActiveAdminGuard,
    AdminPermissionGuard,
  ],
  exports: [
    TypeOrmModule,
    AdminAccessService,
    AuditLogService,
    ActiveAdminGuard,
    AdminPermissionGuard,
  ],
})
export class AdminsModule {}
