import { PartnerWebhookDeliveryStatus } from './domain/enums/partner-webhook-delivery-status.enum';
import { PartnerClientEntity } from './infrastructure/entities/partner-client.entity';
import { PartnerWebhookDeliveryEntity } from './infrastructure/entities/partner-webhook-delivery.entity';
import { PartnerWebhookDeliveriesService } from './partner-webhook-deliveries.service';

describe('PartnerWebhookDeliveriesService', () => {
  it('enqueueForEventInTransaction skips when webhookUrl missing', async () => {
    const service = new PartnerWebhookDeliveriesService({} as never);
    const manager = {
      getRepository: jest.fn().mockReturnValue({
        findOne: jest
          .fn()
          .mockResolvedValue({ id: 'client-1', webhookUrl: null }),
      }),
    };

    await expect(
      service.enqueueForEventInTransaction(
        manager as never,
        { id: 'evt-1' } as never,
        { partnerClientId: 'client-1' } as never,
      ),
    ).resolves.toBeNull();
  });

  it('enqueue creates PENDING delivery', async () => {
    const deliveryRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: (data: Record<string, unknown>) => data,
      save: jest.fn(async (row: Record<string, unknown>) => ({
        ...row,
        id: 'del-1',
      })),
    };
    const clientRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'client-1',
        webhookUrl: 'http://localhost:5180/brit/webhooks',
      }),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === PartnerClientEntity) return clientRepo;
        if (entity === PartnerWebhookDeliveryEntity) return deliveryRepo;
        return {};
      }),
    };

    const service = new PartnerWebhookDeliveriesService({} as never);
    const result = await service.enqueueForEventInTransaction(
      manager as never,
      { id: 'evt-1' } as never,
      { partnerClientId: 'client-1' } as never,
    );

    expect(result).toMatchObject({
      id: 'del-1',
      partnerExchangeEventId: 'evt-1',
      status: PartnerWebhookDeliveryStatus.PENDING,
      destinationUrl: 'http://localhost:5180/brit/webhooks',
    });
    expect(deliveryRepo.save).toHaveBeenCalled();
  });
});
