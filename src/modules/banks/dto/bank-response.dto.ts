import { BankEntity } from '../infrastructure/entities/bank.entity';

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

  static from(entity: BankEntity, assetBaseUrl: string): BankResponseDto {
    const dto = new BankResponseDto();
    dto.id = Number(entity.id);
    dto.code = entity.code;
    dto.name = entity.name;
    dto.iconKey = entity.iconKey;
    dto.svgFilename = entity.svgFilename;
    const base = assetBaseUrl.replace(/\/$/, '');
    dto.iconUrl = entity.svgFilename
      ? `${base}/assets/banks/${entity.svgFilename}`
      : null;
    dto.dailyMaintenanceStart = formatTime(entity.dailyMaintenanceStart);
    dto.dailyMaintenanceEnd = formatTime(entity.dailyMaintenanceEnd);
    dto.regularMaintenanceRule = entity.regularMaintenanceRule;
    dto.regularMaintenanceStart = formatTime(entity.regularMaintenanceStart);
    dto.regularMaintenanceEnd = formatTime(entity.regularMaintenanceEnd);
    dto.maintenanceNote = entity.maintenanceNote;
    dto.sortOrder = entity.sortOrder;
    dto.isActive = entity.isActive;
    return dto;
  }
}

export class BanksListResponseDto {
  items!: BankResponseDto[];

  static of(items: BankResponseDto[]): BanksListResponseDto {
    const dto = new BanksListResponseDto();
    dto.items = items;
    return dto;
  }
}
