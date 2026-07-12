import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MemberPriceTier, StoreAreaLevel, StoreStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';

export class CreateStoreDto {
  @ApiProperty({ example: 'cmrbr78hu0000s966le4et3a5' })
  @IsString()
  orgId!: string;

  @ApiProperty({ example: '蓝猫电竞一店' })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 'STORE-002' })
  @IsString()
  @MaxLength(40)
  code!: string;

  @ApiPropertyOptional({ enum: StoreStatus, example: StoreStatus.ENABLED })
  @IsOptional()
  @IsEnum(StoreStatus)
  status?: StoreStatus;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  machineCount?: number;

  @ApiPropertyOptional({ example: '上海市默认地址' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @ApiPropertyOptional({ example: 121.473701 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ example: 31.230416 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: '13800000000' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'cmrbr78hu0000s966employee1' })
  @IsOptional()
  @IsString()
  managerEmployeeId?: string;

  @ApiPropertyOptional({ example: 'cmrbr78hu0000s966employee2' })
  @IsOptional()
  @IsString()
  responsibleEmployeeId?: string;
}

export class UpdateStoreDto {
  @ApiPropertyOptional({ example: 'cmrbr78hu0000s966le4et3a5' })
  @IsOptional()
  @IsString()
  orgId?: string;

  @ApiPropertyOptional({ example: '蓝猫电竞一店' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ example: 'STORE-002' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @ApiPropertyOptional({ enum: StoreStatus, example: StoreStatus.ENABLED })
  @IsOptional()
  @IsEnum(StoreStatus)
  status?: StoreStatus;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  machineCount?: number;

  @ApiPropertyOptional({ example: '上海市默认地址' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @ApiPropertyOptional({ example: 121.473701 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ example: 31.230416 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: '13800000000' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'cmrbr78hu0000s966employee1' })
  @IsOptional()
  @IsString()
  managerEmployeeId?: string | null;

  @ApiPropertyOptional({ example: 'cmrbr78hu0000s966employee2' })
  @IsOptional()
  @IsString()
  responsibleEmployeeId?: string | null;
}

export class CreateEmployeeDto {
  @ApiProperty({ example: 'cmrbr78jb0002s966irheluj8' })
  @IsString()
  storeId!: string;

  @ApiProperty({ example: 'EMP-001' })
  @IsString()
  @MaxLength(40)
  employeeNo!: string;

  @ApiProperty({ example: '张三' })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ example: '13800000000' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: '店长' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  position?: string;

  @ApiPropertyOptional({ example: 'cmrbr78n80007s966position1' })
  @IsOptional()
  @IsString()
  positionId?: string;

  @ApiPropertyOptional({ example: 'cmrbr78n80007s966v4bo96vi' })
  @IsOptional()
  @IsString()
  userId?: string;
}

export class UpdateEmployeeDto {
  @ApiPropertyOptional({ example: 'cmrbr78jb0002s966irheluj8' })
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({ example: '张三' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ example: '13800000000' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: '店长' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  position?: string;

  @ApiPropertyOptional({ example: 'cmrbr78n80007s966position1' })
  @IsOptional()
  @IsString()
  positionId?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: 'cmrbr78n80007s966v4bo96vi' })
  @IsOptional()
  @IsString()
  userId?: string | null;
}

export class AreaPriceDto {
  @ApiProperty({ enum: MemberPriceTier, example: MemberPriceTier.NORMAL_MEMBER })
  @IsEnum(MemberPriceTier)
  tier!: MemberPriceTier;

  @ApiProperty({ example: 8 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;
}

export class CreateStoreAreaDto {
  @ApiPropertyOptional({ example: 'cmrbr78jb0002s966irheluj8' })
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiProperty({ example: '卓威360单包' })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 'ZOWIE-360-SINGLE' })
  @IsString()
  @MaxLength(60)
  code!: string;

  @ApiProperty({ enum: StoreAreaLevel, example: StoreAreaLevel.HIGH })
  @IsEnum(StoreAreaLevel)
  level!: StoreAreaLevel;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  machineCount?: number;

  @ApiPropertyOptional({ example: 'RTX 4070 SUPER' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  gpuModel?: string;

  @ApiPropertyOptional({ example: 'Intel i7-14700F' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  cpuModel?: string;

  @ApiPropertyOptional({ example: 'ZOWIE XL2566K 360Hz' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  monitorModel?: string;

  @ApiPropertyOptional({ type: [AreaPriceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AreaPriceDto)
  prices?: AreaPriceDto[];
}

export class UpdateStoreAreaDto {
  @ApiPropertyOptional({ example: '卓威360单包' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ enum: StoreAreaLevel, example: StoreAreaLevel.HIGH })
  @IsOptional()
  @IsEnum(StoreAreaLevel)
  level?: StoreAreaLevel;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  machineCount?: number;

  @ApiPropertyOptional({ example: 'RTX 4070 SUPER' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  gpuModel?: string;

  @ApiPropertyOptional({ example: 'Intel i7-14700F' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  cpuModel?: string;

  @ApiPropertyOptional({ example: 'ZOWIE XL2566K 360Hz' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  monitorModel?: string;
}

export class UpsertAreaPricesDto {
  @ApiProperty({ type: [AreaPriceDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AreaPriceDto)
  prices!: AreaPriceDto[];
}
