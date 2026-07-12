import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CreateOrgDto, UpdateOrgDto } from './dto/org.dto';
import { OrgService } from './org.service';

@ApiTags('org')
@ApiBearerAuth()
@Controller('orgs')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Get()
  @RequirePermissions('org:view')
  list() {
    return this.orgService.list();
  }

  @Post()
  @RequirePermissions('org:create')
  create(@Body() dto: CreateOrgDto) {
    return this.orgService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('org:update')
  update(@Param('id') id: string, @Body() dto: UpdateOrgDto) {
    return this.orgService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('org:delete')
  remove(@Param('id') id: string) {
    return this.orgService.remove(id);
  }
}
