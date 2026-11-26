import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { V2PayrollBatchStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
  IsIn
} from 'class-validator';

export class CreatePayrollBatchDto {
  @ApiProperty() @IsDateString() payrollMonth!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
  @ApiPropertyOptional({ example: 26 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  monthlyProrationDays?: number;
}

export class UpsertStoreProfitDto {
  @ApiProperty() @IsString() storeId!: string;
  @ApiProperty() @Type(() => Number) @IsNumber() targetProfit!: number;
  @ApiProperty() @Type(() => Number) @IsNumber() actualProfit!: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  includedInHeadOffice?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  exclusionReason?: string;
}

export class TransitionPayrollBatchDto {
  @ApiProperty({ enum: V2PayrollBatchStatus })
  @IsEnum(V2PayrollBatchStatus)
  status!: V2PayrollBatchStatus;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class PayrollEmployeeInputDto {
  @ApiProperty() @IsString() employeeId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ enum: ['STORE_STAFF', 'STORE_MANAGER', 'HEAD_OFFICE'] })
  @IsIn(['STORE_STAFF', 'STORE_MANAGER', 'HEAD_OFFICE'])
  employeeType!: 'STORE_STAFF' | 'STORE_MANAGER' | 'HEAD_OFFICE';
  @ApiPropertyOptional() @IsOptional() @IsString() grade?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['一类', '二类', '三类'])
  category?: '一类' | '二类' | '三类';
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  requiredAttendance!: number;
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualAttendance!: number;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) kpiScore!: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  baseSalary?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  performanceBase?: number;
  @ApiPropertyOptional({ enum: ['MONTHLY', 'HOURLY'] })
  @IsOptional()
  @IsIn(['MONTHLY', 'HOURLY'])
  compensationType?: 'MONTHLY' | 'HOURLY';
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hourlyRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() probationary?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() fullAttendance?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  socialSecuritySubsidy?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  rankAllowance?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mealAllowanceRate?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  makeupAllowance?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  customScoreAdjustment?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  otherEarnings?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  otherDeductions?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  employeeInsurance?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  employeeProvidentFund?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  employerInsurance?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  employerProvidentFund?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  incomeTax?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  alreadyPaid?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  advancePayment?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  attendanceOverride?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  attendanceOverrideReason?: string;
}

export class CalculatePayrollBatchDto {
  @ApiProperty({ type: [PayrollEmployeeInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PayrollEmployeeInputDto)
  employees!: PayrollEmployeeInputDto[];
}
