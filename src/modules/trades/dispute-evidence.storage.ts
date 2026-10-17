import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';

import { resolveAssetRootPath } from '../../common/utils/asset-root-path.util';
import { DISPUTE_EVIDENCE_MAX_BYTES } from './domain/constants/trade.constants';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

@Injectable()
export class DisputeEvidenceStorage {
  constructor(private readonly configService: ConfigService) {}

  async saveDisputeImage(
    disputeId: string,
    file: Express.Multer.File,
  ): Promise<{ url: string; mimeType: string; originalName: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException({
        code: 'DISPUTE_EVIDENCE_REQUIRED',
        message: '이미지 파일이 필요해요.',
      });
    }
    if (file.size > DISPUTE_EVIDENCE_MAX_BYTES) {
      throw new BadRequestException({
        code: 'DISPUTE_EVIDENCE_TOO_LARGE',
        message: '이미지는 5MB 이하만 첨부할 수 있어요.',
      });
    }
    const mimeType = file.mimetype;
    if (!ALLOWED_MIME.has(mimeType)) {
      throw new BadRequestException({
        code: 'DISPUTE_EVIDENCE_INVALID_TYPE',
        message: 'jpeg, png, webp 이미지만 첨부할 수 있어요.',
      });
    }

    const ext =
      EXT_BY_MIME[mimeType] ??
      (extname(file.originalname).toLowerCase() || '.jpg');
    const filename = `${randomUUID()}${ext}`;
    const assetRoot = resolveAssetRootPath(
      this.configService.get<string>('ASSET_ROOT_PATH'),
    );
    const dir = join(assetRoot, 'assets', 'disputes', disputeId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), file.buffer);

    return {
      url: `/assets/disputes/${disputeId}/${filename}`,
      mimeType,
      originalName: file.originalname || filename,
    };
  }
}
