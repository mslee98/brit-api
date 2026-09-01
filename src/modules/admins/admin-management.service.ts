import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import {
  buildPaginationMeta,
  type PaginationMeta,
} from '../../common/dto/pagination-query.dto';
import { AuthService } from '../auth/auth.service';
import { RoleGrantStatus } from '../users/domain/enums/role-grant-status.enum';
import { UserRole } from '../users/domain/enums/user-role.enum';
import { UserStatus } from '../users/domain/enums/user-status.enum';
import { UserRoleEntity } from '../users/infrastructure/entities/user-role.entity';
import { UserEntity } from '../users/infrastructure/entities/user.entity';
import { UserService } from '../users/user.service';
import { AuditLogService } from './audit-log.service';
import { AuditActionType } from './domain/enums/audit-action-type.enum';
import { AuditTargetType } from './domain/enums/audit-target-type.enum';
import { ActivateAdminDto } from './dto/activate-admin.dto';
import { DeactivateAdminDto } from './dto/deactivate-admin.dto';
import { RegisterAdminDto } from './dto/register-admin.dto';
import { RevokeAdminRoleDto } from './dto/revoke-admin-role.dto';
import { RevokeAdminSessionsDto } from './dto/revoke-admin-sessions.dto';
import { SearchAdminsDto } from './dto/search-admins.dto';
import { UpdateAdminPermissionsDto } from './dto/update-admin-permissions.dto';
import { UpdateAdminProfileDto } from './dto/update-admin-profile.dto';
import { AdminDomainException } from './exceptions/admin.exceptions';
import { AdminProfileEntity } from './infrastructure/entities/admin-profile.entity';

@Injectable()
export class AdminManagementService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly userService: UserService,
    private readonly authService: AuthService,
    private readonly auditLogService: AuditLogService,
    @InjectRepository(AdminProfileEntity)
    private readonly adminProfileRepository: Repository<AdminProfileEntity>,
  ) {}

  async search(
    actor: { userId: string; role: UserRole },
    query: SearchAdminsDto,
  ): Promise<{
    items: Array<Record<string, unknown>>;
    pagination: PaginationMeta;
  }> {
    await this.assertCanListAdmins(actor);

    const page = query.page ?? 1;
    const size = query.size ?? 20;

    const qb = this.adminProfileRepository
      .createQueryBuilder('profile')
      .innerJoinAndSelect('profile.user', 'user')
      .leftJoinAndSelect('user.profile', 'userProfile')
      .innerJoin(
        UserRoleEntity,
        'role',
        'role.userId = profile.userId AND role.status = :roleStatus AND role.role IN (:...adminRoles)',
        {
          roleStatus: RoleGrantStatus.ACTIVE,
          adminRoles: [UserRole.ADMIN, UserRole.SYS_ADMIN],
        },
      )
      .distinct(true)
      .orderBy('profile.createdAt', 'DESC');

    if (query.keyword) {
      qb.andWhere(
        '(user.loginId ILIKE :like OR userProfile.name ILIKE :like)',
        { like: `%${query.keyword}%` },
      );
    }
    if (query.role) {
      qb.andWhere('role.role = :filterRole', { filterRole: query.role });
    }
    if (query.adminLevel !== undefined) {
      qb.andWhere('profile.adminLevel = :adminLevel', {
        adminLevel: query.adminLevel,
      });
    }
    if (query.isLeader !== undefined) {
      qb.andWhere('profile.isLeader = :isLeader', {
        isLeader: query.isLeader,
      });
    }
    if (query.isActive !== undefined) {
      qb.andWhere('profile.isActive = :isActive', {
        isActive: query.isActive,
      });
    }

    const [rows, totalItems] = await qb
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();

    const items = await Promise.all(
      rows.map(async (profile) => {
        const roles = await this.userService.listActiveRoles(profile.userId);
        return {
          id: profile.userId,
          loginId: profile.user.loginId,
          name: profile.user.profile?.name ?? null,
          roles: roles.filter(
            (role) => role === UserRole.ADMIN || role === UserRole.SYS_ADMIN,
          ),
          adminLevel: profile.adminLevel,
          isLeader: profile.isLeader,
          isActive: profile.isActive,
          canViewRevenue: profile.canViewRevenue,
          canViewFullIdentity: profile.canViewFullIdentity,
          lastLoginAt: profile.user.lastLoginAt,
          createdAt: profile.createdAt,
        };
      }),
    );

    return {
      items,
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  async getDetail(
    actor: { userId: string; role: UserRole },
    adminId: string,
  ): Promise<Record<string, unknown>> {
    await this.assertCanViewAdmin(actor, adminId);

    const profile = await this.adminProfileRepository.findOne({
      where: { userId: adminId },
      relations: { user: { profile: true } },
    });
    if (!profile) {
      throw AdminDomainException.adminNotFound();
    }

    const roles = await this.userService.listActiveRoles(adminId);
    const sessions = await this.authService.listSessionsForUser(adminId, '');
    const activeSessionCount = sessions.filter(
      (session) => session.status === 'ACTIVE',
    ).length;

    return {
      id: adminId,
      loginId: profile.user.loginId,
      name: profile.user.profile?.name ?? null,
      status: profile.user.status,
      roles: roles.filter(
        (role) => role === UserRole.ADMIN || role === UserRole.SYS_ADMIN,
      ),
      adminProfile: {
        adminLevel: profile.adminLevel,
        isLeader: profile.isLeader,
        canViewRevenue: profile.canViewRevenue,
        canViewFullIdentity: profile.canViewFullIdentity,
        isActive: profile.isActive,
      },
      activeSessionCount,
      lastLoginAt: profile.user.lastLoginAt,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  async registerAdmin(
    actorUserId: string,
    dto: RegisterAdminDto,
    ipAddress: string | null,
  ): Promise<{ id: string }> {
    if (dto.role !== UserRole.ADMIN && dto.role !== UserRole.SYS_ADMIN) {
      throw AdminDomainException.invalidAdminRole();
    }

    return this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(UserEntity).findOne({
        where: { id: dto.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        throw AdminDomainException.userNotFound();
      }
      if (user.status !== UserStatus.ACTIVE) {
        throw AdminDomainException.userNotActive();
      }

      const hasAdmin = await manager.getRepository(UserRoleEntity).exist({
        where: {
          userId: dto.userId,
          status: RoleGrantStatus.ACTIVE,
          role: UserRole.ADMIN,
        },
      });
      const hasSys = await manager.getRepository(UserRoleEntity).exist({
        where: {
          userId: dto.userId,
          status: RoleGrantStatus.ACTIVE,
          role: UserRole.SYS_ADMIN,
        },
      });
      if (hasAdmin || hasSys) {
        throw AdminDomainException.alreadyAdmin();
      }

      await this.userService.grantAdminRoleInTransaction(manager, {
        userId: dto.userId,
        role: dto.role,
        grantedByUserId: actorUserId,
      });

      const profileRepository = manager.getRepository(AdminProfileEntity);
      let profile = await profileRepository.findOne({
        where: { userId: dto.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (profile) {
        profile.adminLevel = dto.adminLevel;
        profile.isLeader = dto.isLeader;
        profile.canViewRevenue = dto.canViewRevenue;
        profile.canViewFullIdentity = dto.canViewFullIdentity;
        profile.isActive = true;
      } else {
        profile = profileRepository.create({
          userId: dto.userId,
          adminLevel: dto.adminLevel,
          isLeader: dto.isLeader,
          canViewRevenue: dto.canViewRevenue,
          canViewFullIdentity: dto.canViewFullIdentity,
          isActive: true,
        });
      }
      await profileRepository.save(profile);

      await this.authService.revokeAllActiveSessionsInTransaction(
        manager,
        dto.userId,
        'ADMIN_ROLE_GRANTED',
      );

      await this.auditLogService.writeInTransaction(manager, {
        actorUserId,
        actionType: AuditActionType.GRANT_ADMIN_ROLE,
        targetType: AuditTargetType.ADMIN_PROFILE,
        targetId: dto.userId,
        beforeData: null,
        afterData: {
          role: dto.role,
          adminLevel: dto.adminLevel,
          isLeader: dto.isLeader,
          canViewRevenue: dto.canViewRevenue,
          canViewFullIdentity: dto.canViewFullIdentity,
        },
        reason: dto.reason,
        ipAddress,
      });

      return { id: dto.userId };
    });
  }

  async updateProfile(
    actor: { userId: string; role: UserRole },
    adminId: string,
    dto: UpdateAdminProfileDto,
    ipAddress: string | null,
  ): Promise<void> {
    if (actor.role !== UserRole.SYS_ADMIN) {
      throw AdminDomainException.forbidden();
    }

    await this.dataSource.transaction(async (manager) => {
      const profileRepository = manager.getRepository(AdminProfileEntity);
      const profile = await profileRepository.findOne({
        where: { userId: adminId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!profile) {
        throw AdminDomainException.adminNotFound();
      }

      const actorProfile = await profileRepository.findOne({
        where: { userId: actor.userId },
      });
      if (
        actorProfile &&
        actorProfile.adminLevel < profile.adminLevel &&
        actor.userId !== adminId
      ) {
        throw AdminDomainException.insufficientAdminLevel();
      }

      const before = {
        adminLevel: profile.adminLevel,
        isLeader: profile.isLeader,
      };
      if (dto.adminLevel !== undefined) {
        profile.adminLevel = dto.adminLevel;
      }
      if (dto.isLeader !== undefined) {
        profile.isLeader = dto.isLeader;
      }
      await profileRepository.save(profile);

      await this.auditLogService.writeInTransaction(manager, {
        actorUserId: actor.userId,
        actionType: AuditActionType.CHANGE_ADMIN_PROFILE,
        targetType: AuditTargetType.ADMIN_PROFILE,
        targetId: adminId,
        beforeData: before,
        afterData: {
          adminLevel: profile.adminLevel,
          isLeader: profile.isLeader,
        },
        reason: dto.reason,
        ipAddress,
      });
    });
  }

  async updatePermissions(
    actorUserId: string,
    adminId: string,
    dto: UpdateAdminPermissionsDto,
    ipAddress: string | null,
  ): Promise<void> {
    if (actorUserId === adminId) {
      const current = await this.adminProfileRepository.findOne({
        where: { userId: adminId },
      });
      if (!current) {
        throw AdminDomainException.adminNotFound();
      }
      if (
        (dto.canViewRevenue && !current.canViewRevenue) ||
        (dto.canViewFullIdentity && !current.canViewFullIdentity)
      ) {
        throw AdminDomainException.selfPermissionEscalationNotAllowed();
      }
    }

    await this.dataSource.transaction(async (manager) => {
      const profileRepository = manager.getRepository(AdminProfileEntity);
      const profile = await profileRepository.findOne({
        where: { userId: adminId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!profile) {
        throw AdminDomainException.adminNotFound();
      }

      const before = {
        canViewRevenue: profile.canViewRevenue,
        canViewFullIdentity: profile.canViewFullIdentity,
      };
      profile.canViewRevenue = dto.canViewRevenue;
      profile.canViewFullIdentity = dto.canViewFullIdentity;
      await profileRepository.save(profile);

      await this.authService.revokeAllActiveSessionsInTransaction(
        manager,
        adminId,
        'ADMIN_PERMISSION_CHANGED',
      );

      await this.auditLogService.writeInTransaction(manager, {
        actorUserId,
        actionType: AuditActionType.CHANGE_ADMIN_PERMISSION,
        targetType: AuditTargetType.ADMIN_PROFILE,
        targetId: adminId,
        beforeData: before,
        afterData: {
          canViewRevenue: profile.canViewRevenue,
          canViewFullIdentity: profile.canViewFullIdentity,
        },
        reason: dto.reason,
        ipAddress,
      });
    });
  }

  async deactivate(
    actorUserId: string,
    adminId: string,
    dto: DeactivateAdminDto,
    ipAddress: string | null,
  ): Promise<void> {
    if (actorUserId === adminId) {
      throw AdminDomainException.selfDeactivationNotAllowed();
    }

    await this.dataSource.transaction(async (manager) => {
      const profileRepository = manager.getRepository(AdminProfileEntity);
      const profile = await profileRepository.findOne({
        where: { userId: adminId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!profile) {
        throw AdminDomainException.adminNotFound();
      }

      const isSysAdmin = await manager.getRepository(UserRoleEntity).exist({
        where: {
          userId: adminId,
          role: UserRole.SYS_ADMIN,
          status: RoleGrantStatus.ACTIVE,
        },
      });
      if (isSysAdmin && profile.isActive) {
        const count =
          await this.userService.lockAndCountActiveSysAdmins(manager);
        if (count <= 1) {
          throw AdminDomainException.lastSysAdminRequired();
        }
      }

      const before = { isActive: profile.isActive };
      profile.isActive = false;
      await profileRepository.save(profile);

      await this.authService.revokeAllActiveSessionsInTransaction(
        manager,
        adminId,
        'ADMIN_DEACTIVATED',
      );

      await this.auditLogService.writeInTransaction(manager, {
        actorUserId,
        actionType: AuditActionType.DEACTIVATE_ADMIN,
        targetType: AuditTargetType.ADMIN_PROFILE,
        targetId: adminId,
        beforeData: before,
        afterData: { isActive: false },
        reason: dto.reason,
        ipAddress,
      });
    });
  }

  async activate(
    actorUserId: string,
    adminId: string,
    dto: ActivateAdminDto,
    ipAddress: string | null,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(UserEntity).findOne({
        where: { id: adminId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        throw AdminDomainException.adminNotFound();
      }
      if (user.status !== UserStatus.ACTIVE) {
        throw AdminDomainException.userNotActive();
      }

      const hasAdminRole = await manager.getRepository(UserRoleEntity).exist({
        where: {
          userId: adminId,
          status: RoleGrantStatus.ACTIVE,
          role: In([UserRole.ADMIN, UserRole.SYS_ADMIN]),
        },
      });
      if (!hasAdminRole) {
        throw AdminDomainException.adminRoleRequired();
      }

      const profileRepository = manager.getRepository(AdminProfileEntity);
      const profile = await profileRepository.findOne({
        where: { userId: adminId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!profile) {
        throw AdminDomainException.adminNotFound();
      }
      if (profile.isActive) {
        throw AdminDomainException.adminAlreadyActive();
      }

      const before = { isActive: profile.isActive };
      profile.isActive = true;
      await profileRepository.save(profile);

      await this.auditLogService.writeInTransaction(manager, {
        actorUserId,
        actionType: AuditActionType.ACTIVATE_ADMIN,
        targetType: AuditTargetType.ADMIN_PROFILE,
        targetId: adminId,
        beforeData: before,
        afterData: { isActive: true },
        reason: dto.reason,
        ipAddress,
      });
    });
  }

  async revokeRole(
    actorUserId: string,
    adminId: string,
    dto: RevokeAdminRoleDto,
    ipAddress: string | null,
  ): Promise<void> {
    if (dto.role !== UserRole.ADMIN && dto.role !== UserRole.SYS_ADMIN) {
      throw AdminDomainException.invalidAdminRole();
    }
    if (actorUserId === adminId) {
      throw AdminDomainException.selfDeactivationNotAllowed();
    }

    await this.dataSource.transaction(async (manager) => {
      const profileRepository = manager.getRepository(AdminProfileEntity);
      await profileRepository.findOne({
        where: { userId: adminId },
        lock: { mode: 'pessimistic_write' },
      });

      const roleRepository = manager.getRepository(UserRoleEntity);
      const activeRole = await roleRepository.findOne({
        where: {
          userId: adminId,
          role: dto.role,
          status: RoleGrantStatus.ACTIVE,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!activeRole) {
        throw AdminDomainException.adminNotFound();
      }

      if (dto.role === UserRole.SYS_ADMIN) {
        const count =
          await this.userService.lockAndCountActiveSysAdmins(manager);
        if (count <= 1) {
          throw AdminDomainException.lastSysAdminRequired();
        }
      }

      const revoked = await this.userService.revokeAdminRoleInTransaction(
        manager,
        {
          userId: adminId,
          role: dto.role,
          revokedByUserId: actorUserId,
          reason: dto.reason,
        },
      );
      if (!revoked) {
        throw AdminDomainException.adminNotFound();
      }

      const profile = await profileRepository.findOne({
        where: { userId: adminId },
      });
      if (profile) {
        profile.isActive = false;
        await profileRepository.save(profile);
      }

      await this.authService.revokeAllActiveSessionsInTransaction(
        manager,
        adminId,
        'ADMIN_ROLE_REVOKED',
      );

      await this.auditLogService.writeInTransaction(manager, {
        actorUserId,
        actionType: AuditActionType.REVOKE_ADMIN_ROLE,
        targetType: AuditTargetType.USER_ROLE,
        targetId: adminId,
        beforeData: { role: dto.role, status: RoleGrantStatus.ACTIVE },
        afterData: { role: dto.role, status: RoleGrantStatus.REVOKED },
        reason: dto.reason,
        ipAddress,
      });
    });
  }

  async revokeSessions(
    actorUserId: string,
    adminId: string,
    dto: RevokeAdminSessionsDto,
    ipAddress: string | null,
  ): Promise<{ revokedSessionCount: number }> {
    return this.dataSource.transaction(async (manager) => {
      const profile = await manager.getRepository(AdminProfileEntity).findOne({
        where: { userId: adminId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!profile) {
        throw AdminDomainException.adminNotFound();
      }

      const revokedSessionCount =
        await this.authService.revokeAllActiveSessionsInTransaction(
          manager,
          adminId,
          'ADMIN_SESSIONS_REVOKED',
        );

      await this.auditLogService.writeInTransaction(manager, {
        actorUserId,
        actionType: AuditActionType.REVOKE_ADMIN_SESSIONS,
        targetType: AuditTargetType.ADMIN_PROFILE,
        targetId: adminId,
        beforeData: null,
        afterData: { revokedSessionCount },
        reason: dto.reason,
        ipAddress,
      });

      return { revokedSessionCount };
    });
  }

  private async assertCanListAdmins(actor: {
    userId: string;
    role: UserRole;
  }): Promise<void> {
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

  private async assertCanViewAdmin(
    actor: { userId: string; role: UserRole },
    adminId: string,
  ): Promise<void> {
    if (actor.userId === adminId) {
      return;
    }
    await this.assertCanListAdmins(actor);
  }
}
