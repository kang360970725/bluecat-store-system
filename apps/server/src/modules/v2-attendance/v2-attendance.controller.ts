import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards
} from '@nestjs/common';
import type { Response } from 'express';
import { Type } from 'class-transformer';
import type { CurrentUser } from '@bluecat/shared';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested
} from 'class-validator';
import { CurrentUserInfo } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { V2AttendanceService } from './v2-attendance.service';

class WechatDto {
  @IsString()
  @Length(1, 256)
  wechatCode!: string;
}

class BindDto extends WechatDto {
  @IsString()
  @Length(1, 128)
  password!: string;
}

class WifiPunchDto extends WechatDto {
  @IsString()
  @Length(1, 100)
  assignmentId!: string;

  @IsIn(['IN', 'OUT'])
  kind!: 'IN' | 'OUT';

  @Matches(/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i)
  bssid!: string;
}

class WifiNetworkDto {
  @Matches(/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i)
  bssid!: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  label?: string;
}

class WifiNetworksDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => WifiNetworkDto)
  networks!: WifiNetworkDto[];
}

class AssignmentsDto extends WechatDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  workDate?: string;
}

class RecordsDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  workDate!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  storeId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;
}

class ExportMonthDto {
  @Matches(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/)
  month!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  storeId?: string;
}

class CorrectionsQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'HISTORY'])
  mode?: 'PENDING' | 'HISTORY';
}

class CorrectionDto extends WechatDto {
  @IsString()
  @Length(1, 100)
  assignmentId!: string;

  @IsIn(['IN', 'OUT'])
  kind!: 'IN' | 'OUT';

  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  requestedTime!: string;

  @IsString()
  @Length(1, 500)
  reason!: string;
}

class ReviewDto {
  @IsBoolean()
  approved!: boolean;

  @IsString()
  @Length(1, 500)
  note!: string;
}

@Controller('v2/attendance')
export class V2AttendanceController {
  constructor(private readonly attendance: V2AttendanceService) {}

  @Get('stores/:storeId/wifi-networks')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard)
  wifiNetworks(
    @CurrentUserInfo() user: CurrentUser,
    @Param('storeId') storeId: string
  ) {
    return this.attendance.wifiNetworks(user.id, storeId);
  }

  @Patch('stores/:storeId/wifi-networks')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard)
  saveWifiNetworks(
    @CurrentUserInfo() user: CurrentUser,
    @Param('storeId') storeId: string,
    @Body() body: WifiNetworksDto
  ) {
    return this.attendance.saveWifiNetworks(user.id, storeId, body.networks);
  }

  @Post('wechat/bind')
  @UseGuards(JwtAuthGuard)
  bind(@CurrentUserInfo() user: CurrentUser, @Body() body: BindDto) {
    return this.attendance.bind(user.id, body.password, body.wechatCode);
  }

  @Post('wechat/assignments')
  @Header('Cache-Control', 'no-store')
  assignments(@Body() body: AssignmentsDto) {
    return this.attendance.assignments(body.wechatCode, body.workDate);
  }

  @Post('wechat/wifi-punch')
  @Header('Cache-Control', 'no-store')
  wifiPunch(@Body() body: WifiPunchDto) {
    return this.attendance.wifiPunch(
      body.wechatCode,
      body.assignmentId,
      body.bssid,
      body.kind
    );
  }

  @Post('wechat/corrections')
  @Header('Cache-Control', 'no-store')
  requestCorrection(@Body() body: CorrectionDto) {
    return this.attendance.requestCorrection(
      body.wechatCode,
      body.assignmentId,
      body.kind,
      body.requestedTime,
      body.reason
    );
  }

  @Get('records')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard)
  records(@CurrentUserInfo() user: CurrentUser, @Query() query: RecordsDto) {
    return this.attendance.records(
      user.id,
      query.workDate,
      query.storeId,
      query.page
    );
  }

  @Get('records.csv')
  @UseGuards(JwtAuthGuard)
  async exportMonth(
    @CurrentUserInfo() user: CurrentUser,
    @Query() query: ExportMonthDto,
    @Res() response: Response
  ) {
    const csv = await this.attendance.exportMonth(
      user.id,
      query.month,
      query.storeId
    );
    response.set({
      'Cache-Control': 'private, no-store',
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="attendance-${query.month}.csv"`,
      'X-Content-Type-Options': 'nosniff'
    });
    response.send(csv);
  }

  @Get('corrections')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard)
  corrections(
    @CurrentUserInfo() user: CurrentUser,
    @Query() query: CorrectionsQueryDto
  ) {
    return this.attendance.corrections(user.id, query.mode === 'HISTORY');
  }

  @Post('corrections/:id/review')
  @UseGuards(JwtAuthGuard)
  review(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') id: string,
    @Body() body: ReviewDto
  ) {
    return this.attendance.review(user.id, id, body.approved, body.note);
  }
}
