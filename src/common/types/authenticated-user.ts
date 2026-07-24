export type AuthenticatedUser = {
  userId: string;
  sessionId: string;
  tokenType: 'access';
};
