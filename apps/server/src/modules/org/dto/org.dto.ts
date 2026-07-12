import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOrgDto {
  @ApiProperty({ example: '华东区域' })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 'EAST' })
  @IsString()
  @MaxLength(40)
  code!: string;

  @ApiPropertyOptional({ example: 'cmrbr78hu0000s966le4et3a5' })
  @IsOptional()
  @IsString()
  parentId?: string;
}

export class UpdateOrgDto {
  @ApiPropertyOptional({ example: '华东区域' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ example: 'cmrbr78hu0000s966le4et3a5' })
  @IsOptional()
  @IsString()
  parentId?: string | null;
}
