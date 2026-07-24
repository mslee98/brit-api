import { Controller, Get, HttpCode } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { BanksListResponseDto } from './dto/bank-response.dto';
import { BanksService } from './banks.service';

@ApiTags('banks')
@Controller('banks')
export class BanksController {
  constructor(private readonly banksService: BanksService) {}

  /** GET /v1/banks — 가입 전 호출, Bearer 불필요 */
  @Get()
  @HttpCode(200)
  @ApiOperation({ summary: '활성 은행 목록' })
  list(): Promise<BanksListResponseDto> {
    return this.banksService.listActiveBanks();
  }
}
