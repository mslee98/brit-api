import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, Length, ValidateNested } from 'class-validator';

class PushSubscriptionKeysDto {
  @ApiProperty()
  @IsString()
  @Length(1, 255)
  p256dh!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 255)
  auth!: string;
}

export class CreatePushSubscriptionDto {
  @ApiProperty()
  @IsString()
  @Length(8, 2048)
  endpoint!: string;

  @ApiProperty({ type: PushSubscriptionKeysDto })
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;
}

export class DeletePushSubscriptionDto {
  @ApiProperty()
  @IsString()
  @Length(8, 2048)
  endpoint!: string;
}
