import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminsModule } from '../admins/admins.module';
import { AdminProfileEntity } from '../admins/infrastructure/entities/admin-profile.entity';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { AdminBanksController } from './admin-banks.controller';
import { BanksController } from './banks.controller';
import { BanksService } from './banks.service';
import { BankEntity } from './infrastructure/entities/bank.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BankEntity, AdminProfileEntity]),
    AuthGuardsModule,
    forwardRef(() => AdminsModule),
  ],
  controllers: [BanksController, AdminBanksController],
  providers: [BanksService],
  exports: [TypeOrmModule, BanksService],
})
export class BanksModule {}
