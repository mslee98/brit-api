import { BankEntity } from '../infrastructure/entities/bank.entity';

function publicBankIconUrl(svgFilename: string | null, assetBaseUrl: string): string | null {
  if (!svgFilename) {
    return null;
  }
  const path = `/assets/banks/${svgFilename}`;
  const base = assetBaseUrl.replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}

function formatTime(value: string | Date | null): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'string') {
    // "HH:mm:ss" or "HH:mm:ss.sss"
    return value.length >= 8 ? value.slice(0, 8) : value;
  }
  const hours = value.getUTCHours().toString().padStart(2, '0');
  const minutes = value.getUTCMinutes().toString().padStart(2, '0');
  const seconds = value.getUTCSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/** 사용자(공개)용 — 활성 은행 안내 필드만 */
export class PublicBankResponseDto {
  id!: number;
  code!: string;
  name!: string;
  iconKey!: string | null;
  svgFilename!: string | null;
  iconUrl!: string | null;
  dailyMaintenanceStart!: string | null;
  dailyMaintenanceEnd!: string | null;
  regularMaintenanceRule!: string | null;
  regularMaintenanceStart!: string | null;
  regularMaintenanceEnd!: string | null;
  maintenanceNote!: string | null;

  static from(entity: BankEntity, assetBaseUrl: string): PublicBankResponseDto {
    const dto = new PublicBankResponseDto();
    dto.id = Number(entity.id);
    dto.code = entity.code;
    dto.name = entity.name;
    dto.iconKey = entity.iconKey;
    dto.svgFilename = entity.svgFilename;
    dto.iconUrl = publicBankIconUrl(entity.svgFilename, assetBaseUrl);
    dto.dailyMaintenanceStart = formatTime(entity.dailyMaintenanceStart);
    dto.dailyMaintenanceEnd = formatTime(entity.dailyMaintenanceEnd);
    dto.regularMaintenanceRule = entity.regularMaintenanceRule;
    dto.regularMaintenanceStart = formatTime(entity.regularMaintenanceStart);
    dto.regularMaintenanceEnd = formatTime(entity.regularMaintenanceEnd);
    dto.maintenanceNote = entity.maintenanceNote;
    return dto;
  }
}

export class BanksListResponseDto {
  items!: PublicBankResponseDto[];

  static of(items: PublicBankResponseDto[]): BanksListResponseDto {
    const dto = new BanksListResponseDto();
    dto.items = items;
    return dto;
  }
}

/** 관리자용 */
export class BankResponseDto {
  id!: number;
  code!: string;
  name!: string;
  iconKey!: string | null;
  svgFilename!: string | null;
  iconUrl!: string | null;
  dailyMaintenanceStart!: string | null;
  dailyMaintenanceEnd!: string | null;
  regularMaintenanceRule!: string | null;
  regularMaintenanceStart!: string | null;
  regularMaintenanceEnd!: string | null;
  maintenanceNote!: string | null;
  sortOrder!: number;
  isActive!: boolean;
  createdAt!: string;
  updatedAt!: string;

  static from(entity: BankEntity, assetBaseUrl: string): BankResponseDto {
    const dto = new BankResponseDto();
    dto.id = Number(entity.id);
    dto.code = entity.code;
    dto.name = entity.name;
    dto.iconKey = entity.iconKey;
    dto.svgFilename = entity.svgFilename;
    dto.iconUrl = publicBankIconUrl(entity.svgFilename, assetBaseUrl);
    dto.dailyMaintenanceStart = formatTime(entity.dailyMaintenanceStart);
    dto.dailyMaintenanceEnd = formatTime(entity.dailyMaintenanceEnd);
    dto.regularMaintenanceRule = entity.regularMaintenanceRule;
    dto.regularMaintenanceStart = formatTime(entity.regularMaintenanceStart);
    dto.regularMaintenanceEnd = formatTime(entity.regularMaintenanceEnd);
    dto.maintenanceNote = entity.maintenanceNote;
    dto.sortOrder = entity.sortOrder;
    dto.isActive = entity.isActive;
    dto.createdAt = entity.createdAt.toISOString();
    dto.updatedAt = entity.updatedAt.toISOString();
    return dto;
  }
}
