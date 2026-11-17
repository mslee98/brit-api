import { PartnerExternalResultStatus } from './domain/enums/partner-external-result-status.enum';
import { PartnerExchangeStatus } from './domain/enums/partner-exchange-status.enum';
import { PartnerExchangeType } from './domain/enums/partner-exchange-type.enum';
import { PartnerChargeSettlementService } from './partner-charge-settlement.service';

describe('PartnerChargeSettlementService guards', () => {
  it('settleIfTerminal returns null for UNKNOWN', async () => {
    const exchangeRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'ex-1',
        status: PartnerExchangeStatus.PARTNER_PROCESSING,
        externalResultStatus: PartnerExternalResultStatus.UNKNOWN,
        exchangeType: PartnerExchangeType.CHARGE,
      }),
    };
    const service = new PartnerChargeSettlementService(
      exchangeRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        transaction: jest.fn(),
      } as never,
    );

    await expect(service.settleIfTerminal('ex-1')).resolves.toBeNull();
    expect(exchangeRepository.findOne).toHaveBeenCalled();
  });
});
