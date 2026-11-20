import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf
} from 'class-validator';

export class CreateV2ShiftTemplateDto {
  @ApiProperty() @IsString() @MaxLength(60) name!: string;
  @ApiProperty() @IsString() @MaxLength(40) code!: string;
  @ApiProperty() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startsAt!: string;
  @ApiProperty() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endsAt!: string;
  @ApiPropertyOptional() @IsOptional() spansNextDay?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort?: number;
}

export class CreateV2SchedulePeriodDto {
  @ApiProperty() @IsString() storeId!: string;
  @ApiProperty() @IsDateString() startsOn!: string;
  @ApiProperty() @IsDateString() endsOn!: string;
}

export class CreateV2ScheduleAssignmentDto {
  @ApiProperty() @IsString() periodId!: string;
  @ApiProperty() @IsDateString() workDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() shiftId?: string;
  @ApiProperty() @IsString() employeeId!: string;
  @ApiProperty() @IsString() positionId!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRest?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() overtime?: boolean;
}

export class UpdateV2ScheduleAssignmentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() shiftId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() positionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRest?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class SaveV2StoreShiftDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() @MaxLength(60) name!: string;
  @ApiProperty()
  @IsString()
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9_-]+$/)
  code!: string;
  @ApiProperty() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startsAt!: string;
  @ApiProperty() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endsAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() spansNextDay?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort?: number;
}

export class ApplyV2ScheduleCycleDto {
  @ApiProperty() @IsArray() @IsString({ each: true }) employmentIds!: string[];
  @ApiProperty()
  @IsArray()
  @ValidateIf((_, value) => Array.isArray(value))
  cycle!: Array<string | null>;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() stagger?: boolean;
}

export class SaveV2ScheduleSuccessionDto {
  @ApiProperty() @IsString() predecessorEmployeeId!: string;
  @ApiProperty() @IsString() successorEmploymentId!: string;
  @ApiProperty() @IsDateString() effectiveFrom!: string;
}

export class CreateV2OperatingTargetDto {
  @ApiProperty() @IsString() storeId!: string;
  @ApiProperty() @Matches(/^\d{4}-\d{2}$/) targetMonth!: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) revenueTarget!: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  profitTarget?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() ruleVersion?: string;
}

export class GenerateV2TargetAllocationsDto {
  @ApiProperty() @Matches(/^\d{4}-\d{2}$/) targetMonth!: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) revenueTarget!: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  profitTarget?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weekendIncreaseRate?: number;
}

export class CreateV2ScorePlanDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsString() code!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class UpsertV2DataSourceDto {
  @ApiProperty() @IsString() storeId!: string;
  @ApiProperty() @IsString() externalStoreId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() externalStoreName?: string;
  @ApiProperty() @IsArray() @IsString({ each: true }) enabledModules!: string[];
}

export class MatchV2ExternalStoreCandidateDto {
  @ApiProperty() @IsString() storeId!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledModules?: string[];
}

export class TriggerV2CaptureDto {
  @ApiProperty() @IsString() connectionId!: string;
  @ApiProperty() @IsDateString() reportDate!: string;
  @ApiProperty() @IsArray() @IsString({ each: true }) modules!: string[];
}

export class SaveV2WecomWebhookDto {
  @ApiProperty() @IsString() @MaxLength(80) name!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  webhookUrl?: string;
  @ApiProperty() @IsIn(['SINGLE', 'MULTI', 'ALL']) reportType!:
    'SINGLE' | 'MULTI' | 'ALL';
  @ApiPropertyOptional()
  @ValidateIf((dto: SaveV2WecomWebhookDto) => dto.reportType !== 'ALL')
  @IsArray()
  @IsString({ each: true })
  storeIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() scheduleEnabled?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['DAILY', 'WEEKLY', 'MONTHLY'])
  scheduleFrequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  scheduleTime?: string;
  @ApiPropertyOptional({ description: '周一至周日对应 1-7' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  scheduleWeekday?: number;
  @ApiPropertyOptional({ description: '每月日期 1-31，短月份按最后一天执行' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  scheduleMonthDay?: number;
}
