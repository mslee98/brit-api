import { PartnerExternalResultStatus } from '../domain/enums/partner-external-result-status.enum';

const TERMINAL: ReadonlySet<PartnerExternalResultStatus> = new Set([
  PartnerExternalResultStatus.SUCCEEDED,
  PartnerExternalResultStatus.FAILED,
]);

/**
 * Exchange.externalResultStatus 단조 갱신.
 * - SUCCEEDED/FAILED는 PROCESSING·UNKNOWN·NOT_FOUND로 덮지 않음
 * - 서로 다른 최종값 충돌 시 null 반환(호출측이 대사 처리)
 * - NOT_FOUND는 최종 실패로 승격하지 않음(그대로 기록만 가능하나 최종을 덮지 않음)
 */
export function mergeExternalResultStatus(
  current: PartnerExternalResultStatus,
  incoming: PartnerExternalResultStatus,
): PartnerExternalResultStatus | 'CONFLICT' {
  if (current === incoming) return current;

  if (TERMINAL.has(current)) {
    if (TERMINAL.has(incoming) && current !== incoming) {
      return 'CONFLICT';
    }
    // 최종 이후 PROCESSING/UNKNOWN/NOT_FOUND/NOT_REQUESTED 무시
    return current;
  }

  if (incoming === PartnerExternalResultStatus.NOT_FOUND) {
    // 단독 최종 실패 금지 — UNKNOWN으로 올려 대사 대기
    if (
      current === PartnerExternalResultStatus.NOT_REQUESTED ||
      current === PartnerExternalResultStatus.PROCESSING ||
      current === PartnerExternalResultStatus.UNKNOWN
    ) {
      return PartnerExternalResultStatus.UNKNOWN;
    }
    return current;
  }

  return incoming;
}

export function isTerminalExternalResult(
  status: PartnerExternalResultStatus,
): boolean {
  return TERMINAL.has(status);
}
