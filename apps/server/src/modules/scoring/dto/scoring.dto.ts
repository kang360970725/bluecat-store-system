import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min
} from 'class-validator';

export class CreateScoreItemDto {
  @IsString()
  @MaxLength(80)
  categoryCode!: string;

  @IsString()
  @MaxLength(80)
  categoryName!: string;

  @IsString()
  @MaxLength(80)
  name!: string;

  @IsString()
  @MaxLength(100)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  formulaNote?: string;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxScore?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateScoreItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  categoryName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  formulaNote?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxScore?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minScore?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpsertStoreScoreEntryDto {
  @IsString()
  storeId!: string;

  @IsString()
  itemId!: string;

  @IsString()
  month!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  rawValue?: number | null;

  @Type(() => Number)
  @IsNumber()
  score!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  remark?: string;
}
