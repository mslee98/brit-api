import { AuthClientType } from '../../modules/auth/domain/enums/auth-client-type.enum';
import { UserRole } from '../../modules/users/domain/enums/user-role.enum';
import { UserStatus } from '../../modules/users/domain/enums/user-status.enum';

export type AuthenticatedUser = {
  /** users.id (JWT sub) */
  userId: string;
  /** user_sessions.id (JWT sid) */
  sessionId: string;
  /** JWT role (USER / ADMIN / SYS_ADMIN) */
  role: UserRole;
  /** JWT user status */
  status?: UserStatus;
  tokenType: 'access';
  /** 관리자/사용자 인증 진입점 */
  clientType: AuthClientType;
};
