import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  V2AccountStatus,
  V2AssetStatus,
  V2CostCalculationMethod,
  V2CostFrequency,
  V2DataScopeType,
  V2EmployeeStatus,
  V2InvestmentType,
  V2LeaveStatus,
  V2LeaveType,
  V2OrgType,
  V2StoreStatus
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateV2OrganizationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() parentId?: string;
  @ApiProperty({ enum: V2OrgType }) @IsEnum(V2OrgType) type!: V2OrgType;
  @ApiProperty() @IsString() @MaxLength(80) name!: string;
  @ApiProperty() @IsString() @MaxLength(40) code!: string;
}

export class CreateV2StoreDto {
  @ApiProperty() @IsString() organizationId!: string;
  @ApiProperty() @IsString() @MaxLength(80) name!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  shortName?: string;
  @ApiProperty() @IsString() @MaxLength(40) code!: string;
  @ApiPropertyOptional({ enum: V2StoreStatus })
  @IsOptional()
  @IsEnum(V2StoreStatus)
  status?: V2StoreStatus;
  @ApiPropertyOptional() @IsOptional() @IsDateString() openedOn?: string;
  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  businessDayStartsAt?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  machineCount?: number;
}

export class CreateV2PositionTemplateDto {
  @ApiProperty() @IsString() @MaxLength(60) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) code?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyBaseSalary?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyPerformanceSalary?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hourlyRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() roleId?: string;
}

export class UpdateV2PositionTemplateDto extends PartialType(
  CreateV2PositionTemplateDto
) {}

export class CreateV2StorePositionDto {
  @ApiProperty() @IsString() @MaxLength(60) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) code?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort?: number;
}

export class CreateV2EmployeeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  employeeNo?: string;
  @ApiProperty() @IsString() @MaxLength(80) name!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  loginNickname?: string;
  @ApiPropertyOptional({ enum: V2EmployeeStatus })
  @IsOptional()
  @IsEnum(V2EmployeeStatus)
  status?: V2EmployeeStatus;
  @ApiProperty() @IsDateString() hiredOn!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() storeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() positionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() organizationId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationPositionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() costStoreId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() grade?: string;
  @ApiPropertyOptional({ enum: ['MONTHLY', 'HOURLY'] })
  @IsOptional()
  @IsIn(['MONTHLY', 'HOURLY'])
  compensationType?: 'MONTHLY' | 'HOURLY';
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  createLoginAccount?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  loginPassword?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(100)
  @MaxLength(100, { each: true })
  loginRoleIds?: string[];
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(12)
  payrollGrade?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['一类', '二类', '三类'])
  payrollCategory?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  payrollBaseSalary?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  payrollPerformanceBase?: number;
}

export class UpdateV2EmployeeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  employeeNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) name?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  loginNickname?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() hiredOn?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(12)
  grade?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  gradeEffectiveOn?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  loginRoleIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  loginPassword?: string;
}

export class CreateV2EmployeePayrollProfileDto {
  @ApiProperty({ enum: ['STORE_STAFF', 'STORE_MANAGER', 'HEAD_OFFICE'] })
  @IsIn(['STORE_STAFF', 'STORE_MANAGER', 'HEAD_OFFICE'])
  employeeType!: 'STORE_STAFF' | 'STORE_MANAGER' | 'HEAD_OFFICE';
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(12)
  grade?: string;
  @ApiPropertyOptional({ enum: ['一类', '二类', '三类'] })
  @IsOptional()
  @IsIn(['一类', '二类', '三类'])
  category?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() probationary?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  baseSalary?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  performanceBase?: number;
  @ApiPropertyOptional({ enum: ['SCHEME_1', 'SCHEME_2'] })
  @IsOptional()
  @IsIn(['SCHEME_1', 'SCHEME_2'])
  socialSecurityScheme?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  socialSecuritySubsidy?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rankAllowance?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  mealAllowanceRate?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  makeupAllowance?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  employeeInsurance?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  employeeProvidentFund?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  employerInsurance?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  employerProvidentFund?: number;
  @ApiProperty() @IsDateString() effectiveFrom!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CreateV2PayrollGradeDto {
  @ApiProperty() @IsString() @MaxLength(80) name!: string;
  @ApiProperty({ enum: ['STORE_MANAGER', 'HEAD_OFFICE'] })
  @IsIn(['STORE_MANAGER', 'HEAD_OFFICE'])
  employeeType!: 'STORE_MANAGER' | 'HEAD_OFFICE';
  @ApiProperty() @IsString() @MaxLength(12) grade!: string;
  @ApiPropertyOptional({ enum: ['一类', '二类', '三类'] })
  @IsOptional()
  @IsIn(['一类', '二类', '三类'])
  category?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) baseSalary!: number;
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  performanceBase!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort?: number;
}

export class UpdateV2PayrollGradeDto extends PartialType(
  CreateV2PayrollGradeDto
) {}

export class ChangeV2EmploymentDto {
  @ApiProperty() @IsString() storeId!: string;
  @ApiProperty() @IsString() positionId!: string;
  @ApiProperty() @IsDateString() effectiveOn!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ChangeV2ManagerStoreDto {
  @ApiProperty() @IsString() managedStoreId!: string;
  @ApiProperty() @IsDateString() effectiveOn!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class TerminateV2EmployeeDto {
  @ApiProperty() @IsDateString() effectiveOn!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CreateV2EmployeeLeaveDto {
  @ApiProperty() @IsString() storeId!: string;
  @ApiProperty({ enum: V2LeaveType }) @IsEnum(V2LeaveType) type!: V2LeaveType;
  @ApiProperty() @IsDateString() startsAt!: string;
  @ApiProperty() @IsDateString() endsAt!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReviewV2EmployeeLeaveDto {
  @ApiProperty({ enum: V2LeaveStatus })
  @IsEnum(V2LeaveStatus)
  status!: V2LeaveStatus;
}

export class UpsertV2OperatingProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  legalEntityName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  usableAreaSqm?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  seatCount?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() leaseStartsOn?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() leaseEndsOn?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateV2StoreCostDto {
  @ApiPropertyOptional() @IsOptional() @IsString() templateId?: string;
  @ApiProperty() @IsString() @MaxLength(80) name!: string;
  @ApiProperty() @IsString() @MaxLength(40) code!: string;
  @ApiProperty() @IsString() @MaxLength(40) category!: string;
  @ApiProperty({ enum: V2CostCalculationMethod })
  @IsEnum(V2CostCalculationMethod)
  method!: V2CostCalculationMethod;
  @ApiProperty({ enum: V2CostFrequency })
  @IsEnum(V2CostFrequency)
  frequency!: V2CostFrequency;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedAmount?: number;
  @ApiPropertyOptional({ description: '营业额计提比例，0.05 表示 5%' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  rate?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  formula?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveTo?: string;
}

export class CorrectV2StoreCostDto extends CreateV2StoreCostDto {
  @ApiProperty() @Matches(/^\d{4}-\d{2}$/) targetMonth!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(500) reason!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sourceConfigId?: string;
}

export class CreateV2StoreInvestmentDto {
  @ApiProperty({ enum: V2InvestmentType })
  @IsEnum(V2InvestmentType)
  type!: V2InvestmentType;
  @ApiProperty() @IsString() @MaxLength(40) category!: string;
  @ApiProperty() @IsString() @MaxLength(100) name!: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) amount!: number;
  @ApiProperty() @IsDateString() occurredOn!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class CreateV2StoreAssetDto {
  @ApiPropertyOptional() @IsOptional() @IsString() areaId?: string;
  @ApiProperty() @IsString() @MaxLength(40) assetNo!: string;
  @ApiProperty() @IsString() @MaxLength(40) category!: string;
  @ApiProperty() @IsString() @MaxLength(100) name!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  brand?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  purchasePrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() purchasedOn?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedReplacementMonths?: number;
  @ApiPropertyOptional({ enum: V2AssetStatus })
  @IsOptional()
  @IsEnum(V2AssetStatus)
  status?: V2AssetStatus;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateV2StoreAreaDto {
  @ApiProperty() @IsString() @MaxLength(80) name!: string;
  @ApiProperty() @IsString() @MaxLength(40) code!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort?: number;
}

export class UpdateV2StoreDto extends PartialType(CreateV2StoreDto) {}
export class UpdateV2StorePositionDto extends PartialType(
  CreateV2StorePositionDto
) {}
export class UpdateV2StoreCostDto extends PartialType(CreateV2StoreCostDto) {}
export class UpdateV2StoreInvestmentDto extends PartialType(
  CreateV2StoreInvestmentDto
) {}
export class UpdateV2StoreAssetDto extends PartialType(CreateV2StoreAssetDto) {}
export class UpdateV2StoreAreaDto extends PartialType(CreateV2StoreAreaDto) {}

export class CreateV2AccountDto {
  @ApiPropertyOptional() @IsOptional() @IsString() employeeId?: string;
  @ApiProperty() @IsString() @MaxLength(60) username!: string;
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(100) password!: string;
  @ApiProperty() @IsString() @MaxLength(80) displayName!: string;
  @ApiPropertyOptional({ enum: V2AccountStatus })
  @IsOptional()
  @IsEnum(V2AccountStatus)
  status?: V2AccountStatus;
  @ApiPropertyOptional({ enum: V2DataScopeType })
  @IsOptional()
  @IsEnum(V2DataScopeType)
  dataScope?: V2DataScopeType;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  storeIds?: string[];
}

export class UpdateV2AccountRolesDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  roleIds!: string[];
}

export class UpdateV2AccountScopeDto {
  @IsEnum(V2DataScopeType)
  dataScope!: V2DataScopeType;

  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  storeIds!: string[];
}

export class CreateV2RoleDto {
  @ApiProperty() @IsString() @MaxLength(80) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) code?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionCodes?: string[];
}
