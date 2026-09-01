import { EntityManager } from 'typeorm';

import { OrderNumberSequenceEntity } from '../infrastructure/entities/order-number-sequence.entity';

/** KST 기준 YYYYMMDD */
export function kstYyyymmdd(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const month = parts.find((p) => p.type === 'month')?.value ?? '00';
  const day = parts.find((p) => p.type === 'day')?.value ?? '00';
  return `${year}${month}${day}`;
}

/**
 * TX 내 주문/거래/분쟁번호 채번. prefix는 'BO' | 'SO' | 'TO' | 'TD'.
 * 형식: {prefix}-{YYYYMMDD}-{NNNNNN}
 */
export async function nextOrderNumber(
  manager: EntityManager,
  prefix: 'BO' | 'SO' | 'TO' | 'TD',
): Promise<string> {
  const yyyymmdd = kstYyyymmdd();
  const seqRepository = manager.getRepository(OrderNumberSequenceEntity);

  let seq = await seqRepository.findOne({
    where: { prefix, yyyymmdd },
    lock: { mode: 'pessimistic_write' },
  });

  if (!seq) {
    seq = seqRepository.create({ prefix, yyyymmdd, lastValue: 0 });
    await seqRepository.save(seq);
    seq = await seqRepository.findOneOrFail({
      where: { prefix, yyyymmdd },
      lock: { mode: 'pessimistic_write' },
    });
  }

  seq.lastValue += 1;
  await seqRepository.save(seq);

  const padded = String(seq.lastValue).padStart(6, '0');
  return `${prefix}-${yyyymmdd}-${padded}`;
}
