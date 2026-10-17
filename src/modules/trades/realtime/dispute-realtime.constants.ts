export const DISPUTE_WS_NAMESPACE = '/disputes';

export const DISPUTE_WS_EVENTS = {
  JOIN: 'dispute.join',
  LEAVE: 'dispute.leave',
  MESSAGE_CREATED: 'dispute.message.created',
  OPENED: 'dispute.opened',
  UPDATED: 'dispute.updated',
  RESOLVED: 'dispute.resolved',
} as const;

export function disputeRoom(disputeId: string): string {
  return `dispute:${disputeId}`;
}

export function partyUserRoom(userId: string): string {
  return `user:${userId}`;
}

export const ADMIN_DISPUTES_ROOM = 'admin:disputes';
