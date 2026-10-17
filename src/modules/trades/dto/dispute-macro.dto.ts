import { ApiProperty } from '@nestjs/swagger';

export class DisputeMacroDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty()
  isInternal!: boolean;
}

export class DisputeMacroListDto {
  @ApiProperty({ type: [DisputeMacroDto] })
  items!: DisputeMacroDto[];
}
