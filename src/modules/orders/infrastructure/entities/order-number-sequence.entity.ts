import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * order_number_sequences — 일별 주문번호 채번 (BO/SO-YYYYMMDD-NNNNNN).
 * TX 내 pessimistic_write로 증가한다.
 */
@Entity({ name: 'order_number_sequences' })
export class OrderNumberSequenceEntity {
  @PrimaryColumn({ type: 'varchar', length: 10, name: 'prefix' })
  prefix!: string;

  @PrimaryColumn({ type: 'varchar', length: 8, name: 'yyyymmdd' })
  yyyymmdd!: string;

  @Column({ type: 'integer', name: 'last_value', default: 0 })
  lastValue!: number;
}
