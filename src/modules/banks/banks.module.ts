import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BanksController } from './banks.controller';
import { BanksService } from './banks.service';
import { BankEntity } from './infrastructure/entities/bank.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BankEntity])],
  controllers: [BanksController],
  providers: [BanksService],
  exports: [TypeOrmModule, BanksService],
})
export class BanksModule {}
