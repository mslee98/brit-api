import { ApiProperty } from '@nestjs/swagger';

export class AdminPartyDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  loginId!: string;

  @ApiProperty()
  name!: string;
}

export type AdminPartySummary = {
  userId: string;
  loginId: string;
  name: string;
};
