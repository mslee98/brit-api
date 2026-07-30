import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  BankResponseDto,
  BanksListResponseDto,
} from './dto/bank-response.dto';
import { BankEntity } from './infrastructure/entities/bank.entity';

/** 은행 마스터 조회. 가입·계좌 등록 시 bank_code 유효성 확인에 사용. */
@Injectable()
export class BanksService {
  constructor(
    @InjectRepository(BankEntity)
    private readonly bankRepository: Repository<BankEntity>,
    private readonly configService: ConfigService,
  ) {}

  async findActiveByCode(code: string): Promise<BankEntity | null> {
    return this.bankRepository.findOne({
      where: { code, isActive: true },
    });
  }

  async listActiveBanks(): Promise<BanksListResponseDto> {
    const rows = await this.bankRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });

    const assetBaseUrl = this.configService.getOrThrow<string>(
      'ASSET_PUBLIC_BASE_URL',
    );

    return BanksListResponseDto.of(
      rows.map((row) => BankResponseDto.from(row, assetBaseUrl)),
    );
  }
}
