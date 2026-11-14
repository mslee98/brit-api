import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

import type { EmbedLinkWaitResponseDto } from './dto/partner-link-session.dto';

export type LinkSessionStreamEvent = {
  type: 'link_session';
  data: EmbedLinkWaitResponseDto;
};

type SessionStream = {
  subject: Subject<LinkSessionStreamEvent>;
  refCount: number;
};

/**
 * Embed 팝업 대기용 SSE (세션 단위, 단일 인스턴스 P1).
 * 문서의 link_session.* 이벤트 — 폴링 대체.
 */
@Injectable()
export class LinkSessionStreamService implements OnModuleDestroy {
  private readonly streams = new Map<string, SessionStream>();

  subscribe(sessionId: string): Observable<MessageEvent> {
    const stream = this.getOrCreateStream(sessionId);
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
          this.streams.delete(sessionId);
        }
      };
    });
  }

  publish(sessionId: string, data: EmbedLinkWaitResponseDto): void {
    const stream = this.streams.get(sessionId);
    if (!stream) {
      return;
    }
    stream.subject.next({
      type: 'link_session',
      data,
    });
  }

  onModuleDestroy(): void {
    for (const stream of this.streams.values()) {
      stream.subject.complete();
    }
    this.streams.clear();
  }

  private getOrCreateStream(sessionId: string): SessionStream {
    let stream = this.streams.get(sessionId);
    if (!stream) {
      stream = { subject: new Subject<LinkSessionStreamEvent>(), refCount: 0 };
      this.streams.set(sessionId, stream);
    }
    return stream;
  }
}
