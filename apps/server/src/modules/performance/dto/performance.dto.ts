import { ApiPropertyOptional } from '@nestjs/swagger';
import { ScheduleRole } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min
} from 'class-validator';

export class UpdatePerformanceTargetDto {
  @ApiPropertyOptional({ example: 286000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  targetRevenue?: number;

  @ApiPropertyOptional({ example: 172000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  netFeeTarget?: number;

  @ApiPropertyOptional({ example: 43000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  productTarget?: number;

  @ApiPropertyOptional({ example: 27000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  managementFee?: number;

  @ApiPropertyOptional({ example: 52000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rent?: number;

  @ApiPropertyOptional({ example: 3600 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  propertyTrashFee?: number;

  @ApiPropertyOptional({ example: 30000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  utilities?: number;

  @ApiPropertyOptional({ example: 12500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  drinkMaterial?: number;

  @ApiPropertyOptional({ example: 4500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  mealMaterial?: number;

  @ApiPropertyOptional({ example: 6400 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  welfare?: number;

  @ApiPropertyOptional({ example: 56000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salary?: number;

  @ApiPropertyOptional({ example: 4000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  franchiseFee?: number;

  @ApiPropertyOptional({ example: 1200 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  baseOperationSoftware?: number;

  @ApiPropertyOptional({ example: 2500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  storeOperation?: number;

  @ApiPropertyOptional({ example: 300 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  advertisingMaterial?: number;

  @ApiPropertyOptional({ example: 3500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  financeTax?: number;

  @ApiPropertyOptional({ example: 8131 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  withdrawalFee?: number;
}

export class CreatePerformanceTargetDto extends UpdatePerformanceTargetDto {
  @ApiPropertyOptional({ example: 'cmrbr78jb0002s966irheluj8' })
  @IsString()
  storeId!: string;

  @ApiPropertyOptional({ example: '2026-08' })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  month!: string;
}

export class GeneratePerformanceSplitDto {
  @ApiPropertyOptional({ example: 172000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  netFeeTarget?: number;

  @ApiPropertyOptional({ example: 43000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  productTarget?: number;

  @ApiPropertyOptional({ example: 0.15 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weekendIncreaseRate?: number;
}

export class UpdatePerformanceSplitItemDto {
  @ApiPropertyOptional({ example: 3500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  netFeeTarget?: number;

  @ApiPropertyOptional({ example: 800 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  productTarget?: number;
}

export class UpsertEmployeeScheduleDto {
  @ApiPropertyOptional({ example: 'cmrbr78jb0002s966irheluj8' })
  @IsString()
  storeId!: string;

  @ApiPropertyOptional({ example: '2026-07-10' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  workDate!: string;

  @ApiPropertyOptional({ example: 'cmrshiftday' })
  @IsString()
  shiftId!: string;

  @ApiPropertyOptional({ enum: ScheduleRole, example: ScheduleRole.CASHIER })
  @IsEnum(ScheduleRole)
  role!: ScheduleRole;

  @ApiPropertyOptional({ example: 'cmremployee001' })
  @IsOptional()
  @IsString()
  employeeId?: string | null;
}
