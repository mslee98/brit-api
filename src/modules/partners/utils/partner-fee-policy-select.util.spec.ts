import { FeeRoundingRule } from '../domain/enums/fee-rounding-rule.enum';
import { FeeSettlementCycle } from '../domain/enums/fee-settlement-cycle.enum';
import { PartnerFeeTarget } from '../domain/enums/partner-fee-target.enum';
import { PartnerFeePolicyEntity } from '../infrastructure/entities/partner-fee-policy.entity';
import { selectApplicableFeePolicy } from './partner-fee-policy-select.util';

function policy(
  id: string,
  feeTarget: PartnerFeeTarget,
): PartnerFeePolicyEntity {
  return {
    id,
    partnerId: 'p1',
    feeTarget,
    feeRateBps: 70,
    fixedFeeAmount: '0',
    roundingRule: FeeRoundingRule.FLOOR,
    settlementCycle: FeeSettlementCycle.WEEKLY,
    settlementWeekday: 1,
    paymentDueDays: 3,
    effectiveFrom: new Date(),
    effectiveTo: null,
    isActive: true,
    createdByUserId: 'u1',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as PartnerFeePolicyEntity;
}

describe('selectApplicableFeePolicy', () => {
  it('preferredTarget exact를 ALL보다 우선한다', () => {
    const rows = [
      policy('all', PartnerFeeTarget.ALL),
      policy('charge', PartnerFeeTarget.CHARGE),
    ];
    expect(selectApplicableFeePolicy(rows, PartnerFeeTarget.CHARGE)?.id).toBe(
      'charge',
    );
  });

  it('exact 없으면 ALL로 떨어진다', () => {
    const rows = [policy('all', PartnerFeeTarget.ALL)];
    expect(selectApplicableFeePolicy(rows, PartnerFeeTarget.REDEEM)?.id).toBe(
      'all',
    );
  });

  it('대시보드(preferred 없음)는 ALL을 고른다', () => {
    const rows = [
      policy('charge', PartnerFeeTarget.CHARGE),
      policy('all', PartnerFeeTarget.ALL),
    ];
    expect(selectApplicableFeePolicy(rows)?.id).toBe('all');
  });

  it('빈 목록은 null', () => {
    expect(selectApplicableFeePolicy([])).toBeNull();
  });
});
