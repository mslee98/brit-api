import { PartnerFeeTarget } from '../domain/enums/partner-fee-target.enum';
import { PartnerFeePolicyEntity } from '../infrastructure/entities/partner-fee-policy.entity';

/**
 * 이미 유효기간·활성으로 필터·정렬된 정책 목록에서 적용 대상을 고른다.
 * - preferredTarget 있으면: exact → ALL
 * - 없으면(대시보드): ALL → 목록 첫 행
 */
export function selectApplicableFeePolicy(
  policies: PartnerFeePolicyEntity[],
  preferredTarget?: PartnerFeeTarget,
): PartnerFeePolicyEntity | null {
  if (policies.length === 0) {
    return null;
  }
  if (preferredTarget) {
    return (
      policies.find((p) => p.feeTarget === preferredTarget) ??
      policies.find((p) => p.feeTarget === PartnerFeeTarget.ALL) ??
      null
    );
  }
  return (
    policies.find((p) => p.feeTarget === PartnerFeeTarget.ALL) ??
    policies[0] ??
    null
  );
}

export function feeTargetsForExchange(
  preferredTarget: PartnerFeeTarget,
): PartnerFeeTarget[] {
  return [preferredTarget, PartnerFeeTarget.ALL];
}
