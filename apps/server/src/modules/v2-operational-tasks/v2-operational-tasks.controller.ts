import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
  UseGuards
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { CurrentUser } from '@bluecat/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsObject,
  IsString,
  IsUUID,
  IsDefined,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested
} from 'class-validator';
import { CurrentUserInfo } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { TaskReportQuery } from './task-report';
import { maxEvidenceFiles, maxEvidenceFileSize } from './task-evidence';
import {
  V2OperationalTasksService,
  type TaskListFilters
} from './v2-operational-tasks.service';

class TaskListDto implements TaskListFilters {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  storeId?: string;

  @IsOptional()
  @IsIn(['PENDING', 'CLAIMED', 'SUBMITTED', 'DONE', 'EXPIRED'])
  status?: TaskListFilters['status'];

  @IsOptional()
  @IsIn(['TASK', 'RECTIFICATION'])
  kind?: TaskListFilters['kind'];

  @IsOptional()
  @IsString()
  @Length(1, 120)
  keyword?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;

  @IsOptional()
  @IsIn(['ACTIVE', 'HISTORY'])
  assignedMode?: TaskListFilters['assignedMode'];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  assignedPage = 1;
}

class TaskReportDto implements TaskReportQuery {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  from!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  to!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  storeId?: string;

  @IsOptional()
  @IsIn(['TASK', 'RECTIFICATION'])
  kind?: TaskReportQuery['kind'];
}

class TargetDto {
  @IsString()
  @Length(1, 100)
  storeId!: string;

  @Matches(/^(store|org):[a-z0-9_-]{1,100}$/i)
  targetKey!: string;
}

class DispatchDto {
  @IsUUID()
  batchId!: string;

  @IsString()
  @Length(1, 120)
  title!: string;

  @IsString()
  @Length(1, 3000)
  description!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 120, { each: true })
  checklist?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @Length(1, 100, { each: true })
  ccUsernames?: string[];

  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  dueAt!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  sourceTaskId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(19)
  sourceItemIndex?: number;

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  sourceSubmittedAt?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TargetDto)
  targets!: TargetDto[];
}

class ScheduleDto {
  @IsUUID()
  requestId!: string;

  @IsString()
  @Length(1, 120)
  title!: string;

  @IsString()
  @Length(1, 3000)
  description!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 120, { each: true })
  checklist?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @Length(1, 100, { each: true })
  ccUsernames?: string[];

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => TargetDto)
  target!: TargetDto;

  @IsIn(['DAILY', 'WEEKLY', 'MONTHLY'])
  cadence!: 'DAILY' | 'WEEKLY' | 'MONTHLY';

  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  firstRunAt!: string;

  @IsInt()
  @Min(1)
  @Max(168)
  dueHours!: number;
}

class ScheduleEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

class SubmitDto {
  @IsString()
  @Length(1, 3000)
  submission!: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  checkedItems?: string;

  @IsOptional()
  @IsString()
  @Length(2, 12000)
  checklistIssues?: string;
}

class RequestExtensionDto {
  @IsString()
  @Length(1, 1000)
  reason!: string;
}

class ReviewExtensionDto {
  @IsBoolean()
  approved!: boolean;

  @IsString()
  @Length(1, 1000)
  note!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  dueAt?: string;
}

class ReviewTaskDto {
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  submittedAt!: string;
}

class ReleaseDto {
  @IsString()
  @Length(1, 1000)
  reason!: string;

  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  claimedAt!: string;
}

class ReopenDto extends ReviewTaskDto {
  @IsString()
  @Length(1, 1000)
  reason!: string;

  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  dueAt!: string;
}

@Controller('v2/operational-tasks')
@UseGuards(JwtAuthGuard)
export class V2OperationalTasksController {
  constructor(private readonly tasks: V2OperationalTasksService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUserInfo() user: CurrentUser, @Query() query: TaskListDto) {
    return this.tasks.list(user.id, query);
  }

  @Get('extensions')
  @Header('Cache-Control', 'no-store')
  extensions(@CurrentUserInfo() user: CurrentUser) {
    return this.tasks.pendingExtensions(user.id);
  }

  @Post(':id/extensions')
  requestExtension(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') id: string,
    @Body() body: RequestExtensionDto
  ) {
    return this.tasks.requestExtension(user.id, id, body.reason);
  }

  @Post('extensions/:id/review')
  reviewExtension(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') id: string,
    @Body() body: ReviewExtensionDto
  ) {
    return this.tasks.reviewExtension(
      user.id,
      id,
      body.approved,
      body.note,
      body.dueAt
    );
  }

  @Get('report')
  @Header('Cache-Control', 'no-store')
  report(@CurrentUserInfo() user: CurrentUser, @Query() query: TaskReportDto) {
    return this.tasks.report(user.id, query);
  }

  @Get('report.csv')
  async exportReport(
    @CurrentUserInfo() user: CurrentUser,
    @Query() query: TaskReportDto,
    @Res() response: Response
  ) {
    const content = await this.tasks.exportReport(user.id, query);
    response.set({
      'Cache-Control': 'private, no-store',
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tasks-${query.from}-${query.to}.csv"`,
      'X-Content-Type-Options': 'nosniff'
    });
    response.send(content);
  }

  @Get('inbox')
  @Header('Cache-Control', 'no-store')
  inbox(@CurrentUserInfo() user: CurrentUser) {
    return this.tasks.inbox(user.id);
  }

  @Post('inbox/:id/read')
  readNotification(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') id: string
  ) {
    return this.tasks.readNotification(user.id, id);
  }

  @Get('targets')
  @Header('Cache-Control', 'no-store')
  targets(@CurrentUserInfo() user: CurrentUser) {
    return this.tasks.dispatchTargets(user.id);
  }

  @Get('reminders')
  @Header('Cache-Control', 'no-store')
  reminders(@CurrentUserInfo() user: CurrentUser) {
    return this.tasks.reminders(user.id);
  }

  @Get('schedules')
  @Header('Cache-Control', 'no-store')
  schedules(@CurrentUserInfo() user: CurrentUser) {
    return this.tasks.schedules(user.id);
  }

  @Post('schedules')
  createSchedule(
    @CurrentUserInfo() user: CurrentUser,
    @Body() body: ScheduleDto
  ) {
    return this.tasks.createSchedule(user.id, body);
  }

  @Post('schedules/:id/enabled')
  setScheduleEnabled(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') id: string,
    @Body() body: ScheduleEnabledDto
  ) {
    return this.tasks.setScheduleEnabled(user.id, id, body.enabled);
  }

  @Post('dispatch')
  dispatch(@CurrentUserInfo() user: CurrentUser, @Body() body: DispatchDto) {
    return this.tasks.dispatch(user.id, body);
  }

  @Post(':id/claim')
  claim(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string) {
    return this.tasks.claim(user.id, id);
  }

  @Get(':id/evidence/:evidenceId')
  async evidence(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
    @Res() response: Response
  ) {
    const image = await this.tasks.evidence(user.id, id, evidenceId);
    response.set({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    response.type('image/jpeg').send(Buffer.from(image));
  }

  @Post(':id/submit')
  @UseInterceptors(
    FilesInterceptor('photos', maxEvidenceFiles, {
      limits: { fileSize: maxEvidenceFileSize, fields: 3, fieldSize: 64 * 1024 }
    })
  )
  submit(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') id: string,
    @Body() body: SubmitDto,
    @UploadedFiles() photos?: Array<{ buffer: Buffer }>
  ) {
    return this.tasks.submit(
      user.id,
      id,
      body.submission,
      photos?.map((photo) => photo.buffer) ?? [],
      body.checkedItems,
      body.checklistIssues
    );
  }

  @Post(':id/release')
  release(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') id: string,
    @Body() body: ReleaseDto
  ) {
    return this.tasks.release(user.id, id, body.reason, body.claimedAt);
  }

  @Post(':id/reopen')
  reopen(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') id: string,
    @Body() body: ReopenDto
  ) {
    return this.tasks.reopen(
      user.id,
      id,
      body.reason,
      body.dueAt,
      body.submittedAt
    );
  }

  @Post(':id/complete')
  complete(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') id: string,
    @Body() body: ReviewTaskDto
  ) {
    return this.tasks.complete(user.id, id, body.submittedAt);
  }
}
