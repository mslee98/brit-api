import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import type { UserPartnerLinkStatus } from '../domain/enums/user-partner-link-status.enum';

export class CreatePartnerLinkSessionDto {
  @ApiProperty({ example: 'A-123', description: '업체 회원 키' })
  @IsString()
  @Length(1, 255)
  partnerUserKey!: string;

  @ApiPropertyOptional({
    example: '김*수',
    description: '동의 화면에 보여줄 업체 회원 표시명 (마스킹 권장)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  partnerUserLabel?: string;

  @ApiProperty({
    example: 'https://shop.example.com',
    description: '팝업 결과를 받을 Origin. Client에 등록된 Origin만 허용',
  })
  @IsString()
  @MaxLength(255)
  returnOrigin!: string;
}

export class ExchangePartnerLinkCodeDto {
  @ApiProperty()
  @IsString()
  @Length(1, 128)
  code!: string;
}

/** BRIT 클라이언트 — 코드로 세션 미리보기/승인/거절 (MC-P9) */
export class PartnerLinkApprovalByCodeDto {
  @ApiProperty({ example: '0421', description: 'BRIT 팝업에 표시된 4자리' })
  @IsString()
  @Matches(/^\d{4}$/, { message: '연결 코드는 숫자 4자리여야 해요.' })
  pairingCode!: string;
}

export class PartnerLinkApprovalActionDto {
  @ApiPropertyOptional({ example: '0421' })
  @ValidateIf((o: PartnerLinkApprovalActionDto) => !o.sessionId)
  @IsString()
  @Matches(/^\d{4}$/, { message: '연결 코드는 숫자 4자리여야 해요.' })
  pairingCode?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((o: PartnerLinkApprovalActionDto) => !o.pairingCode)
  @IsUUID()
  sessionId?: string;
}

export type PartnerLinkSessionCreatedDto = {
  sessionId: string;
  sessionToken: string;
  linkUrl: string;
  expiresAt: string;
};

export type PartnerLinkSessionExchangedDto = {
  linkId: string;
  partnerUserKey: string;
  status: UserPartnerLinkStatus;
  linkedAt: string;
};

/**
 * NEW: 신규 연결 가능 · ALREADY_LINKED_SAME: 이미 같은 연결 (동의 생략)
 * CONFLICT_OTHER_KEY: 같은 업체 다른 회원 계정과 연결됨 · CONFLICT_KEY_TAKEN: 회원 키가 다른 BRIT 회원에 연결됨
 */
export type EmbedLinkState =
  | 'NEW'
  | 'ALREADY_LINKED_SAME'
  | 'CONFLICT_OTHER_KEY'
  | 'CONFLICT_KEY_TAKEN';

export type EmbedLinkSessionResponseDto = {
  partnerName: string;
  partnerCode: string;
  partnerUserKeyMasked: string;
  partnerUserLabel: string | null;
  returnOrigin: string;
  expiresAt: string;
  linkState: EmbedLinkState;
  /** NEW면 BRIT 클라이언트 승인 필요 */
  requiresPairing: boolean;
  claimed: boolean;
  /** claim 이후에만 평문. 미claim이면 null */
  pairingCode: string | null;
  pairingExpiresAt: string | null;
};

export type EmbedLinkWaitResponseDto = {
  status: 'PENDING' | 'CONSENTED' | 'REJECTED' | 'EXPIRED';
  /** CONSENTED일 때만. 샵 postMessage용 authorization code */
  code: string | null;
  returnOrigin: string;
};

export type PartnerLinkApprovalPreviewDto = {
  sessionId: string;
  partnerName: string;
  partnerCode: string;
  partnerUserKeyMasked: string;
  partnerUserLabel: string | null;
  linkState: EmbedLinkState;
  expiresAt: string;
};
