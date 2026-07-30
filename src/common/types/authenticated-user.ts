export type AuthenticatedUser = {
  /** users.id (JWT sub) */
  userId: string;
  /** user_sessions.id (JWT sid) */
  sessionId: string;
  tokenType: 'access';
};
