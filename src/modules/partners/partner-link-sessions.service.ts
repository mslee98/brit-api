import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomInt } from 'crypto';
import { Observable } from 'rxjs';
import { Repository } from 'typeorm';

import { getNotificationCopy } from '../notifications/domain/constants/notification.constants';
import { NotificationEventType } from '../notifications/domain/enums/notification-event-type.enum';
import { NotificationPriority } from '../notifications/domain/enums/notification-priority.enum';
import { NotificationReferenceType } from '../notifications/domain/enums/notification-reference-type.enum';
import { NotificationService } from '../notifications/notification.service';
import { PartnerLinkSessionStatus } from './domain/enums/partner-link-session-status.enum';
import { UserPartnerLinkStatus } from './domain/enums/user-partner-link-status.enum';
import {
  CreatePartnerLinkSessionDto,
  type EmbedLinkSessionResponseDto,
  type EmbedLinkState,
  type EmbedLinkWaitResponseDto,
  type PartnerLinkApprovalPreviewDto,
  type PartnerLinkSessionCreatedDto,
  type PartnerLinkSessionExchangedDto,
} from './dto/partner-link-session.dto';
import { PartnerDomainException } from './exceptions/partner.exceptions';
import { PartnerClientOriginEntity } from './infrastructure/entities/partner-client-origin.entity';
import { PartnerLinkSessionEntity } from './infrastructure/entities/partner-link-session.entity';
import { PartnerEntity } from './infrastructure/entities/partner.entity';
import { UserPartnerLinkEntity } from './infrastructure/entities/user-partner-link.entity';
import { LinkSessionStreamService } from './link-session-stream.service';
import { PartnerExchangeService } from './partner-exchange.service';
import { maskPartnerUserKey } from './utils/mask-partner-user-key';

/** MC-P9 — 연결 코드·세션 유효 시간 (넥슨 플러그형 짧은 TTL) */
const SESSION_TTL_MS = 3 * 60 * 1000;
const CODE_TTL_MS = 5 * 60 * 1000;
const PAIRING_MAX_ATTEMPTS = 5;
/** `BRIT_EMBED_BASE_URL` 미설정 시 brit-front 개발 서버 기본 포트 */
const DEFAULT_EMBED_BASE_URL = 'http://localhost:5173';

/**
 * 최종 사용자 ↔ 업체 계정 연결 (OAuth authorization code 방식).
 * MC-P9: Embed에서 claim → BRIT 클라이언트가 코드/알림으로 승인 → 팝업이 code를 샵에 전달.
 * Embed consent는 ALREADY_LINKED_SAME 빠른 경로만. NEW는 claim+클라이언트 승인.
 */
@Injectable()
export class PartnerLinkSessionsService {
  constructor(
    @InjectRepository(PartnerLinkSessionEntity)
    private readonly sessionRepository: Repository<PartnerLinkSessionEntity>,
    @InjectRepository(PartnerClientOriginEntity)
    private readonly originRepository: Repository<PartnerClientOriginEntity>,
    @InjectRepository(PartnerEntity)
    private readonly partnerRepository: Repository<PartnerEntity>,
    @InjectRepository(UserPartnerLinkEntity)
    private readonly linkRepository: Repository<UserPartnerLinkEntity>,
    private readonly partnerExchangeService: PartnerExchangeService,
    private readonly configService: ConfigService,
    private readonly linkSessionStream: LinkSessionStreamService,
    private readonly notificationService: NotificationService,
  ) {}

  async createSession(
    partnerId: string,
    partnerClientId: string,
    dto: CreatePartnerLinkSessionDto,
  ): Promise<PartnerLinkSessionCreatedDto> {
    const returnOrigin = normalizeOrigin(dto.returnOrigin);
    if (!returnOrigin) {
      throw PartnerDomainException.linkOriginNotAllowed();
    }
    const registered = await this.originRepository.find({
      where: { partnerClientId },
    });
    if (!registered.some((o) => normalizeOrigin(o.origin) === returnOrigin)) {
      throw PartnerDomainException.linkOriginNotAllowed();
    }

    const sessionToken = randomBytes(32).toString('base64url');
    const pairingCode = String(randomInt(0, 10000)).padStart(4, '0');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const session = await this.sessionRepository.save(
      this.sessionRepository.create({
        partnerId,
        partnerClientId,
        partnerUserKey: dto.partnerUserKey.trim(),
        partnerUserLabel: dto.partnerUserLabel?.trim() || null,
        returnOrigin,
        sessionTokenHash: hashToken(sessionToken),
        authorizationCodeHash: null,
        codeExpiresAt: null,
        expiresAt,
        pairingCodeHash: hashToken(pairingCode),
        pairingCodePlain: pairingCode,
        pairingExpiresAt: expiresAt,
        pairingAttemptCount: 0,
        pairingVerifiedAt: null,
        claimedUserId: null,
        claimedAt: null,
        status: PartnerLinkSessionStatus.PENDING,
        consentedUserId: null,
        userPartnerLinkId: null,
        consentedAt: null,
        rejectedAt: null,
        exchangedAt: null,
      }),
    );

    return {
      sessionId: session.id,
      sessionToken,
      linkUrl: `${this.embedBaseUrl()}/embed.html#session=${sessionToken}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Embed 로그인 직후 — claimedUserId 고정, 표시용 코드 반환.
   */
  async claim(
    sessionToken: string,
    userId: string,
  ): Promise<EmbedLinkSessionResponseDto> {
    const session = await this.requirePendingSession(sessionToken);
    if (session.claimedUserId && session.claimedUserId !== userId) {
      throw PartnerDomainException.linkSessionClaimedByOther();
    }
    if (!session.claimedUserId) {
      const claimed = await this.sessionRepository
        .createQueryBuilder()
        .update(PartnerLinkSessionEntity)
        .set({ claimedUserId: userId, claimedAt: new Date() })
        .where('id = :id', { id: session.id })
        .andWhere('status = :status', {
          status: PartnerLinkSessionStatus.PENDING,
        })
        .andWhere('claimed_user_id IS NULL')
        .execute();
      if (!claimed.affected) {
        const again = await this.requirePendingSession(sessionToken);
        if (again.claimedUserId !== userId) {
          throw PartnerDomainException.linkSessionClaimedByOther();
        }
        return this.toEmbedDto(again, userId);
      }
      session.claimedUserId = userId;
      session.claimedAt = new Date();
      const linkState = await this.resolveLinkState(session, userId);
      if (linkState === 'NEW') {
        await this.notifyApprovalRequested(session, userId);
      }
    }
    return this.toEmbedDto(session, userId);
  }

  async getForUser(
    sessionToken: string,
    userId: string,
  ): Promise<EmbedLinkSessionResponseDto> {
    const session = await this.requirePendingSession(sessionToken);
    if (session.claimedUserId && session.claimedUserId !== userId) {
      throw PartnerDomainException.linkSessionClaimedByOther();
    }
    return this.toEmbedDto(session, userId);
  }

  /**
   * Embed SSE — 현재 상태 1회 + 이후 승인/거절/만료 푸시.
   */
  subscribeWaitEvents(
    sessionToken: string,
    userId: string,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let inner: { unsubscribe: () => void } | undefined;
      let cancelled = false;

      void (async () => {
        try {
          const session = await this.requireClaimedPendingOrTerminal(
            sessionToken,
            userId,
          );

          const initial = await this.waitForResult(sessionToken, userId);
          if (cancelled) return;
          subscriber.next({
            data: JSON.stringify({ type: 'link_session', data: initial }),
          } as MessageEvent);

          if (initial.status !== 'PENDING') {
            subscriber.complete();
            return;
          }

          inner = this.linkSessionStream.subscribe(session.id).subscribe({
            next: (event) => subscriber.next(event),
            error: (error) => subscriber.error(error),
            complete: () => subscriber.complete(),
          });
        } catch (error) {
          if (!cancelled) subscriber.error(error);
        }
      })();

      return () => {
        cancelled = true;
        inner?.unsubscribe();
      };
    });
  }

  /**
   * 팝업 대기 상태 조회 — SSE 초기값·폴백.
   */
  async waitForResult(
    sessionToken: string,
    userId: string,
  ): Promise<EmbedLinkWaitResponseDto> {
    const session = await this.requireClaimedPendingOrTerminal(
      sessionToken,
      userId,
    );
    if (session.expiresAt.getTime() <= Date.now() && session.status === PartnerLinkSessionStatus.PENDING) {
      await this.expireSession(session.id, session.returnOrigin);
      return {
        status: 'EXPIRED',
        code: null,
        returnOrigin: session.returnOrigin,
      };
    }

    if (session.status === PartnerLinkSessionStatus.PENDING) {
      return {
        status: 'PENDING',
        code: null,
        returnOrigin: session.returnOrigin,
      };
    }
    if (session.status === PartnerLinkSessionStatus.REJECTED) {
      return {
        status: 'REJECTED',
        code: null,
        returnOrigin: session.returnOrigin,
      };
    }
    if (session.status === PartnerLinkSessionStatus.EXPIRED) {
      return {
        status: 'EXPIRED',
        code: null,
        returnOrigin: session.returnOrigin,
      };
    }
    if (
      session.status === PartnerLinkSessionStatus.CONSENTED ||
      session.status === PartnerLinkSessionStatus.EXCHANGED
    ) {
      return {
        status: 'CONSENTED',
        code: session.authorizationCodePlain,
        returnOrigin: session.returnOrigin,
      };
    }
    throw PartnerDomainException.linkSessionAlreadyUsed();
  }

  /**
   * Embed 동의 — ALREADY_LINKED_SAME만 (OTP 없음).
   * NEW는 BRIT 클라이언트 승인(approveByClient).
   */
  async consent(
    sessionToken: string,
    userId: string,
  ): Promise<{ code: string; returnOrigin: string }> {
    const session = await this.requirePendingSession(sessionToken);
    const linkState = await this.resolveLinkState(session, userId);

    if (linkState === 'NEW') {
      throw PartnerDomainException.linkClientApprovalRequired();
    }
    if (linkState === 'CONFLICT_OTHER_KEY') {
      throw PartnerDomainException.userAlreadyLinkedOtherKey();
    }
    if (linkState === 'CONFLICT_KEY_TAKEN') {
      throw PartnerDomainException.linkAlreadyExists();
    }

    return this.completeConsent(session, userId, linkState);
  }

  async reject(
    sessionToken: string,
    userId: string,
  ): Promise<{ returnOrigin: string }> {
    const session = await this.requirePendingSession(sessionToken);
    this.assertClaimedBy(session, userId);
    const result = await this.sessionRepository.update(
      { id: session.id, status: PartnerLinkSessionStatus.PENDING },
      {
        status: PartnerLinkSessionStatus.REJECTED,
        consentedUserId: userId,
        rejectedAt: new Date(),
        pairingCodePlain: null,
      },
    );
    if (!result.affected) {
      throw PartnerDomainException.linkSessionAlreadyUsed();
    }
    this.publishWait(session.id, {
      status: 'REJECTED',
      code: null,
      returnOrigin: session.returnOrigin,
    });
    return { returnOrigin: session.returnOrigin };
  }

  async previewApprovalByCode(
    userId: string,
    pairingCode: string,
  ): Promise<PartnerLinkApprovalPreviewDto> {
    return this.previewApproval(userId, { pairingCode });
  }

  async previewApproval(
    userId: string,
    input: { pairingCode?: string; sessionId?: string },
  ): Promise<PartnerLinkApprovalPreviewDto> {
    const session = await this.resolveApprovalSession(userId, input, false);
    const partner = await this.requirePartner(session.partnerId);
    const linkState = await this.resolveLinkState(session, userId);
    if (linkState === 'CONFLICT_OTHER_KEY' || linkState === 'CONFLICT_KEY_TAKEN') {
      throw PartnerDomainException.linkApprovalConflict();
    }
    return {
      sessionId: session.id,
      partnerName: partner.name,
      partnerCode: partner.code,
      partnerUserKeyMasked: maskPartnerUserKey(session.partnerUserKey),
      partnerUserLabel: session.partnerUserLabel,
      linkState,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async approveByClient(
    userId: string,
    input: { pairingCode?: string; sessionId?: string },
  ): Promise<{ sessionId: string; status: 'CONSENTED' }> {
    const session = await this.resolveApprovalSession(userId, input, true);
    const linkState = await this.resolveLinkState(session, userId);
    if (linkState === 'CONFLICT_OTHER_KEY' || linkState === 'CONFLICT_KEY_TAKEN') {
      throw PartnerDomainException.linkApprovalConflict();
    }
    if (linkState === 'NEW') {
      await this.verifyPairingCode(session, input.pairingCode ?? undefined, true);
    }
    await this.completeConsent(session, userId, linkState);
    return { sessionId: session.id, status: 'CONSENTED' };
  }

  async rejectByClient(
    userId: string,
    input: { pairingCode?: string; sessionId?: string },
  ): Promise<{ sessionId: string; status: 'REJECTED' }> {
    const session = await this.resolveApprovalSession(userId, input, false);
    const result = await this.sessionRepository.update(
      { id: session.id, status: PartnerLinkSessionStatus.PENDING },
      {
        status: PartnerLinkSessionStatus.REJECTED,
        consentedUserId: userId,
        rejectedAt: new Date(),
        pairingCodePlain: null,
      },
    );
    if (!result.affected) {
      throw PartnerDomainException.linkSessionAlreadyUsed();
    }
    this.publishWait(session.id, {
      status: 'REJECTED',
      code: null,
      returnOrigin: session.returnOrigin,
    });
    return { sessionId: session.id, status: 'REJECTED' };
  }

  async exchange(
    partnerId: string,
    code: string,
  ): Promise<PartnerLinkSessionExchangedDto> {
    const session = await this.sessionRepository.findOne({
      where: { authorizationCodeHash: hashToken(code.trim()) },
    });
    if (
      !session ||
      session.partnerId !== partnerId ||
      session.status !== PartnerLinkSessionStatus.CONSENTED ||
      !session.codeExpiresAt ||
      session.codeExpiresAt.getTime() <= Date.now() ||
      !session.userPartnerLinkId
    ) {
      throw PartnerDomainException.linkCodeInvalid();
    }

    const result = await this.sessionRepository.update(
      { id: session.id, status: PartnerLinkSessionStatus.CONSENTED },
      {
        status: PartnerLinkSessionStatus.EXCHANGED,
        exchangedAt: new Date(),
        authorizationCodePlain: null,
      },
    );
    if (!result.affected) {
      throw PartnerDomainException.linkCodeInvalid();
    }

    const link = await this.linkRepository.findOne({
      where: { id: session.userPartnerLinkId },
    });
    if (!link || link.status !== UserPartnerLinkStatus.ACTIVE) {
      throw PartnerDomainException.linkCodeInvalid();
    }
    return {
      linkId: link.id,
      partnerUserKey: link.partnerUserKey,
      status: link.status,
      linkedAt: link.linkedAt.toISOString(),
    };
  }

  private async completeConsent(
    session: PartnerLinkSessionEntity,
    userId: string,
    linkState: EmbedLinkState,
  ): Promise<{ code: string; returnOrigin: string }> {
    const link = await this.partnerExchangeService.linkUser(session.partnerId, {
      userId,
      partnerUserKey: session.partnerUserKey,
    });

    const code = randomBytes(32).toString('base64url');
    const now = new Date();
    const result = await this.sessionRepository.update(
      { id: session.id, status: PartnerLinkSessionStatus.PENDING },
      {
        status: PartnerLinkSessionStatus.CONSENTED,
        authorizationCodeHash: hashToken(code),
        authorizationCodePlain: code,
        codeExpiresAt: new Date(now.getTime() + CODE_TTL_MS),
        consentedUserId: userId,
        userPartnerLinkId: link.id,
        consentedAt: now,
        pairingCodePlain: null,
        pairingVerifiedAt:
          linkState === 'ALREADY_LINKED_SAME'
            ? session.pairingVerifiedAt
            : now,
      },
    );
    if (!result.affected) {
      throw PartnerDomainException.linkSessionAlreadyUsed();
    }
    this.publishWait(session.id, {
      status: 'CONSENTED',
      code,
      returnOrigin: session.returnOrigin,
    });
    return { code, returnOrigin: session.returnOrigin };
  }

  private async notifyApprovalRequested(
    session: PartnerLinkSessionEntity,
    userId: string,
  ): Promise<void> {
    const partner = await this.requirePartner(session.partnerId);
    const copy = getNotificationCopy(
      NotificationEventType.PARTNER_LINK_APPROVAL_REQUESTED,
    );
    await this.notificationService.createInAppEvent({
      eventType: NotificationEventType.PARTNER_LINK_APPROVAL_REQUESTED,
      priority: NotificationPriority.HIGH,
      title: copy.title,
      message: `${partner.name} 연결을 승인해 주세요`,
      actorUserId: null,
      referenceType: NotificationReferenceType.PARTNER_LINK_SESSION,
      referenceId: session.id,
      actionPath: `/partner-link/approve?sessionId=${session.id}`,
      payload: {
        partnerName: partner.name,
        partnerCode: partner.code,
      },
      recipientUserIds: [userId],
    });
  }

  private publishWait(
    sessionId: string,
    data: EmbedLinkWaitResponseDto,
  ): void {
    this.linkSessionStream.publish(sessionId, data);
  }

  private async toEmbedDto(
    session: PartnerLinkSessionEntity,
    userId: string,
  ): Promise<EmbedLinkSessionResponseDto> {
    const partner = await this.requirePartner(session.partnerId);
    const linkState = await this.resolveLinkState(session, userId);
    const claimed = session.claimedUserId === userId;
    return {
      partnerName: partner.name,
      partnerCode: partner.code,
      partnerUserKeyMasked: maskPartnerUserKey(session.partnerUserKey),
      partnerUserLabel: session.partnerUserLabel,
      returnOrigin: session.returnOrigin,
      expiresAt: session.expiresAt.toISOString(),
      linkState,
      requiresPairing: linkState === 'NEW',
      claimed,
      pairingCode: claimed ? session.pairingCodePlain : null,
      pairingExpiresAt: claimed
        ? session.pairingExpiresAt.toISOString()
        : null,
    };
  }

  private async resolveApprovalSession(
    userId: string,
    input: { pairingCode?: string; sessionId?: string },
    requireCodeForNew: boolean,
  ): Promise<PartnerLinkSessionEntity> {
    if (input.sessionId) {
      const session = await this.sessionRepository.findOne({
        where: { id: input.sessionId },
      });
      if (!session || session.status !== PartnerLinkSessionStatus.PENDING) {
        throw PartnerDomainException.linkSessionNotFound();
      }
      if (session.expiresAt.getTime() <= Date.now()) {
        await this.expireSession(session.id);
        throw PartnerDomainException.linkSessionExpired();
      }
      // sessionId 오라클 방지 — 미claim·타인 claim도 NOT_FOUND로 통일
      if (!session.claimedUserId || session.claimedUserId !== userId) {
        throw PartnerDomainException.linkSessionNotFound();
      }
      if (requireCodeForNew) {
        const linkState = await this.resolveLinkState(session, userId);
        if (linkState === 'NEW' && !input.pairingCode) {
          // sessionId 경로의 NEW는 알림 승인 — 코드 없이 허용 (claim이 증명)
          return session;
        }
      }
      return session;
    }
    if (!input.pairingCode) {
      throw PartnerDomainException.linkPairingCodeRequired();
    }
    return this.requireClaimedSessionByCode(userId, input.pairingCode, true);
  }

  /**
   * claim된 세션만 코드로 찾는다 — 전역 4자리 브루트포스 방지.
   */
  private async requireClaimedSessionByCode(
    userId: string,
    pairingCode: string,
    bumpOnMiss: boolean,
  ): Promise<PartnerLinkSessionEntity> {
    const normalized = pairingCode.trim();
    if (!/^\d{4}$/.test(normalized)) {
      throw PartnerDomainException.linkPairingCodeRequired();
    }

    const candidates = await this.sessionRepository.find({
      where: {
        claimedUserId: userId,
        status: PartnerLinkSessionStatus.PENDING,
      },
    });
    const active = candidates.filter((s) => s.expiresAt.getTime() > Date.now());
    const matched = active.find(
      (s) => s.pairingCodeHash === hashToken(normalized),
    );
    if (!matched) {
      if (bumpOnMiss && active.length > 0) {
        let exceeded = false;
        for (const target of active) {
          const attempts = await this.bumpPairingAttempt(target);
          if (attempts >= PAIRING_MAX_ATTEMPTS) {
            await this.expireSession(target.id, target.returnOrigin);
            exceeded = true;
          }
        }
        if (exceeded) {
          throw PartnerDomainException.linkPairingAttemptsExceeded();
        }
      }
      throw PartnerDomainException.linkPairingCodeInvalid();
    }
    if (matched.pairingExpiresAt.getTime() <= Date.now()) {
      await this.expireSession(matched.id);
      throw PartnerDomainException.linkPairingCodeExpired();
    }
    return matched;
  }

  private async verifyPairingCode(
    session: PartnerLinkSessionEntity,
    pairingCode: string | undefined,
    alreadyMatched = false,
  ): Promise<void> {
    if (session.pairingExpiresAt.getTime() <= Date.now()) {
      await this.expireSession(session.id);
      throw PartnerDomainException.linkPairingCodeExpired();
    }
    if (session.pairingAttemptCount >= PAIRING_MAX_ATTEMPTS) {
      await this.expireSession(session.id);
      throw PartnerDomainException.linkPairingAttemptsExceeded();
    }
    if (alreadyMatched) {
      return;
    }

    const normalized = pairingCode?.trim() ?? '';
    if (!/^\d{4}$/.test(normalized)) {
      await this.bumpPairingAttempt(session);
      throw PartnerDomainException.linkPairingCodeRequired();
    }
    if (hashToken(normalized) !== session.pairingCodeHash) {
      const attempts = await this.bumpPairingAttempt(session);
      if (attempts >= PAIRING_MAX_ATTEMPTS) {
        await this.expireSession(session.id);
        throw PartnerDomainException.linkPairingAttemptsExceeded();
      }
      throw PartnerDomainException.linkPairingCodeInvalid();
    }
  }

  private async bumpPairingAttempt(
    session: PartnerLinkSessionEntity,
  ): Promise<number> {
    const next = session.pairingAttemptCount + 1;
    await this.sessionRepository.update(
      { id: session.id, status: PartnerLinkSessionStatus.PENDING },
      { pairingAttemptCount: next },
    );
    session.pairingAttemptCount = next;
    return next;
  }

  private async expireSession(
    sessionId: string,
    returnOrigin?: string,
  ): Promise<void> {
    const session =
      returnOrigin == null
        ? await this.sessionRepository.findOne({ where: { id: sessionId } })
        : null;
    await this.sessionRepository.update(
      { id: sessionId, status: PartnerLinkSessionStatus.PENDING },
      {
        status: PartnerLinkSessionStatus.EXPIRED,
        pairingCodePlain: null,
        authorizationCodePlain: null,
      },
    );
    this.publishWait(sessionId, {
      status: 'EXPIRED',
      code: null,
      returnOrigin: returnOrigin ?? session?.returnOrigin ?? '',
    });
  }

  private assertClaimedBy(
    session: PartnerLinkSessionEntity,
    userId: string,
  ): void {
    if (!session.claimedUserId) {
      throw PartnerDomainException.linkSessionNotClaimed();
    }
    if (session.claimedUserId !== userId) {
      throw PartnerDomainException.linkSessionClaimedByOther();
    }
  }

  /**
   * wait/SSE — claim된 본인만. 이미 종료된 세션도 결과 조회 허용.
   */
  private async requireClaimedPendingOrTerminal(
    sessionToken: string,
    userId: string,
  ): Promise<PartnerLinkSessionEntity> {
    const session = await this.sessionRepository.findOne({
      where: { sessionTokenHash: hashToken(sessionToken.trim()) },
    });
    if (!session) {
      throw PartnerDomainException.linkSessionNotFound();
    }
    this.assertClaimedBy(session, userId);
    return session;
  }

  private async requirePendingSession(
    sessionToken: string,
  ): Promise<PartnerLinkSessionEntity> {
    const session = await this.sessionRepository.findOne({
      where: { sessionTokenHash: hashToken(sessionToken.trim()) },
    });
    if (!session) {
      throw PartnerDomainException.linkSessionNotFound();
    }
    if (session.status !== PartnerLinkSessionStatus.PENDING) {
      if (session.status === PartnerLinkSessionStatus.EXPIRED) {
        throw PartnerDomainException.linkSessionExpired();
      }
      throw PartnerDomainException.linkSessionAlreadyUsed();
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.expireSession(session.id, session.returnOrigin);
      throw PartnerDomainException.linkSessionExpired();
    }
    return session;
  }

  private async requirePartner(partnerId: string): Promise<PartnerEntity> {
    const partner = await this.partnerRepository.findOne({
      where: { id: partnerId },
    });
    if (!partner) {
      throw PartnerDomainException.notFound();
    }
    return partner;
  }

  private async resolveLinkState(
    session: PartnerLinkSessionEntity,
    userId: string,
  ): Promise<EmbedLinkState> {
    const byKey = await this.linkRepository.findOne({
      where: {
        partnerId: session.partnerId,
        partnerUserKey: session.partnerUserKey,
        status: UserPartnerLinkStatus.ACTIVE,
      },
    });
    if (byKey) {
      return byKey.userId === userId ? 'ALREADY_LINKED_SAME' : 'CONFLICT_KEY_TAKEN';
    }
    const byUser = await this.linkRepository.findOne({
      where: {
        partnerId: session.partnerId,
        userId,
        status: UserPartnerLinkStatus.ACTIVE,
      },
    });
    return byUser ? 'CONFLICT_OTHER_KEY' : 'NEW';
  }

  private embedBaseUrl(): string {
    const raw =
      this.configService.get<string>('BRIT_EMBED_BASE_URL') ??
      DEFAULT_EMBED_BASE_URL;
    return raw.replace(/\/+$/, '');
  }
}

function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

