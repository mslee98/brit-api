import { UserRole } from '../../modules/users/domain/enums/user-role.enum';

export type AuthenticatedUser = {
  /** users.id (JWT sub) */
  userId: string;
  /** user_sessions.id (JWT sid) */
  sessionId: string;
  /** JWT role (USER / ADMIN / SYS_ADMIN) */
  role: UserRole;
  tokenType: 'access';
};
