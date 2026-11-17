import { PartnerExternalResultStatus } from '../domain/enums/partner-external-result-status.enum';
import { mergeExternalResultStatus } from './partner-external-result.util';

describe('mergeExternalResultStatus', () => {
  it('keeps SUCCEEDED when delayed PROCESSING arrives', () => {
    expect(
      mergeExternalResultStatus(
        PartnerExternalResultStatus.SUCCEEDED,
        PartnerExternalResultStatus.PROCESSING,
      ),
    ).toBe(PartnerExternalResultStatus.SUCCEEDED);
  });

  it('maps NOT_FOUND to UNKNOWN (not terminal failure)', () => {
    expect(
      mergeExternalResultStatus(
        PartnerExternalResultStatus.PROCESSING,
        PartnerExternalResultStatus.NOT_FOUND,
      ),
    ).toBe(PartnerExternalResultStatus.UNKNOWN);
  });

  it('detects terminal conflict', () => {
    expect(
      mergeExternalResultStatus(
        PartnerExternalResultStatus.SUCCEEDED,
        PartnerExternalResultStatus.FAILED,
      ),
    ).toBe('CONFLICT');
  });

  it('allows PROCESSING → SUCCEEDED', () => {
    expect(
      mergeExternalResultStatus(
        PartnerExternalResultStatus.PROCESSING,
        PartnerExternalResultStatus.SUCCEEDED,
      ),
    ).toBe(PartnerExternalResultStatus.SUCCEEDED);
  });
});
