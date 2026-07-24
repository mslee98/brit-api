import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BankEntity } from './infrastructure/entities/bank.entity';
import { BanksService } from './banks.service';

@Module({
  imports: [TypeOrmModule.forFeature([BankEntity])],
  providers: [BanksService],
  exports: [TypeOrmModule, BanksService],
})
export class BanksModule {}
