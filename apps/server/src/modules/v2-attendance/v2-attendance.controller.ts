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

class TaskSubscriptionDto extends WechatDto {
  @Matches(/^[\w-]{1,128}$/)
  templateId!: string;
}

class EmployeeTestDeviceDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  deviceToken!: string;
}

class EmployeeTestPairingDto {
  @Matches(/^[A-Za-z0-9_-]{32}$/)
  code!: string;
}

class EmployeeTestLookupDto extends EmployeeTestDeviceDto {
  @IsString()
  @Length(1, 100)
  identifier!: string;
}

class EmployeeTestEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

class EmployeeTestTicketDto extends EmployeeTestDeviceDto {
  @IsString()
  @Length(1, 2048)
  ticket!: string;
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

class AttendanceSettingsDto {
  @Matches(/^wx[a-f0-9]{16}$/i)
  appId!: string;

  @IsOptional()
  @Matches(/^[a-f0-9]{32}$/i)
  appSecret?: string;

  @IsInt()
  @Min(0)
  @Max(999)
  clockInEarly!: number;

  @IsInt()
  @Min(0)
  @Max(999)
  clockOutLate!: number;
}

@Controller('v2/attendance')
export class V2AttendanceController {
  constructor(private readonly attendance: V2AttendanceService) {}

  @Get('settings')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard)
  settings(@CurrentUserInfo() user: CurrentUser) {
    return this.attendance.settings(user.id);
  }

  @Patch('settings')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard)
  saveSettings(
    @CurrentUserInfo() user: CurrentUser,
    @Body() body: AttendanceSettingsDto
  ) {
    return this.attendance.saveSettings(user.id, body);
  }

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

  @Post('wechat/session')
  @Header('Cache-Control', 'no-store')
  openWechatSession(@Body() body: WechatDto) {
    return this.attendance.openWechatSession(body.wechatCode);
  }

  @Get('wechat/task-subscription')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard)
  taskSubscription(@CurrentUserInfo() user: CurrentUser) {
    return this.attendance.taskSubscription(user.id);
  }

  @Get('settings/employee-test-access')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard)
  employeeTestSettings(@CurrentUserInfo() user: CurrentUser) {
    return this.attendance.employeeTestSettings(user.id);
  }

  @Post('wechat/test-preview')
  @Header('Cache-Control', 'no-store')
  employeeTestPreview(@Body() body: EmployeeTestLookupDto) {
    return this.attendance.previewEmployeeTestAccount(body.identifier, body.deviceToken);
  }

  @Post('settings/employee-test-access/pairing')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard)
  issueEmployeeTestPairing(@CurrentUserInfo() user: CurrentUser) {
    return this.attendance.issueEmployeeTestPairing(user.id);
  }

  @Post('wechat/test-pair')
  @Header('Cache-Control', 'no-store')
  pairEmployeeTestDevice(@Body() body: EmployeeTestPairingDto) {
    return this.attendance.pairEmployeeTestDevice(body.code);
  }

  @Patch('settings/employee-test-access')
  @UseGuards(JwtAuthGuard)
  setEmployeeTestEnabled(@CurrentUserInfo() user: CurrentUser, @Body() body: EmployeeTestEnabledDto) {
    return this.attendance.setEmployeeTestEnabled(user.id, body.enabled);
  }

  @Post('wechat/test-confirm-preview')
  @Header('Cache-Control', 'no-store')
  employeeTestConfirmPreview(@Body() body: EmployeeTestTicketDto) {
    return this.attendance.confirmEmployeeTestPreview(body.ticket, body.deviceToken);
  }

  @Post('wechat/task-subscription')
  @UseGuards(JwtAuthGuard)
  subscribeToTask(@CurrentUserInfo() user: CurrentUser, @Body() body: TaskSubscriptionDto) {
    return this.attendance.subscribeToTask(user.id, body.wechatCode, body.templateId);
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
