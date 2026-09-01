import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

import type { NotificationInboxItemResponseDto } from './dto/notification-inbox-item-response.dto';
import type { NotificationListItem } from './notification.service';
import { NotificationInboxItemResponseDto as InboxDto } from './dto/notification-inbox-item-response.dto';

export type NotificationStreamEvent = {
  type: 'notification';
  data: NotificationInboxItemResponseDto;
};

type UserStream = {
  subject: Subject<NotificationStreamEvent>;
  refCount: number;
};

/**
 * 사용자별 SSE 구독 (단일 인스턴스 P1).
 * 다중 API 인스턴스는 P2에서 Redis pub/sub로 확장한다.
 */
@Injectable()
export class NotificationStreamService implements OnModuleDestroy {
  private readonly streams = new Map<string, UserStream>();

  subscribe(userId: string): Observable<MessageEvent> {
    const stream = this.getOrCreateStream(userId);
    stream.refCount += 1;

    return new Observable<MessageEvent>((subscriber) => {
      const subscription = stream.subject.subscribe({
        next: (event) => {
          subscriber.next({
            data: JSON.stringify(event),
          } as MessageEvent);
        },
        error: (error) => subscriber.error(error),
      });

      return () => {
        subscription.unsubscribe();
        stream.refCount -= 1;
        if (stream.refCount <= 0) {
          stream.subject.complete();
          this.streams.delete(userId);
        }
      };
    });
  }

  publishToUser(userId: string, item: NotificationListItem): void {
    const stream = this.streams.get(userId);
    if (!stream) {
      return;
    }
    stream.subject.next({
      type: 'notification',
      data: InboxDto.from(item),
    });
  }

  publishToUsers(
    recipientUserIds: string[],
    itemByUserId: Map<string, NotificationListItem>,
  ): void {
    for (const userId of recipientUserIds) {
      const item = itemByUserId.get(userId);
      if (item) {
        this.publishToUser(userId, item);
      }
    }
  }

  onModuleDestroy(): void {
    for (const stream of this.streams.values()) {
      stream.subject.complete();
    }
    this.streams.clear();
  }

  private getOrCreateStream(userId: string): UserStream {
    const existing = this.streams.get(userId);
    if (existing) {
      return existing;
    }
    const created: UserStream = {
      subject: new Subject<NotificationStreamEvent>(),
      refCount: 0,
    };
    this.streams.set(userId, created);
    return created;
  }
}
