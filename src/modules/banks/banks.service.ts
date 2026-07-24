import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { BankEntity } from './infrastructure/entities/bank.entity';

@Injectable()
export class BanksService {
  constructor(
    @InjectRepository(BankEntity)
    private readonly bankRepository: Repository<BankEntity>,
  ) {}

  async findActiveByCode(code: string): Promise<BankEntity | null> {
    return this.bankRepository.findOne({
      where: { code, isActive: true },
    });
  }
}
