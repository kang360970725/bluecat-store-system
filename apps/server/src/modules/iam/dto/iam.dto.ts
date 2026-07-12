import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DataScope } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty({ example: '查看会员' })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 'member:view' })
  @IsString()
  @MaxLength(80)
  code!: string;

  @ApiProperty({ example: 'api' })
  @IsString()
  @MaxLength(30)
  type!: string;

  @ApiPropertyOptional({ example: '/members' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  path?: string;
}

export class UpdatePermissionDto {
  @ApiPropertyOptional({ example: '查看会员' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ example: 'api' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  type?: string;

  @ApiPropertyOptional({ example: '/members' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  path?: string;
}

export class CreateRoleDto {
  @ApiProperty({ example: '店长' })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 'store_manager' })
  @IsString()
  @MaxLength(80)
  code!: string;

  @ApiPropertyOptional({ enum: DataScope, example: DataScope.STORE })
  @IsOptional()
  @IsEnum(DataScope)
  dataScope?: DataScope;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionIds?: string[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: '店长' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ enum: DataScope, example: DataScope.STORE })
  @IsOptional()
  @IsEnum(DataScope)
  dataScope?: DataScope;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionIds?: string[];
}

export class CreateUserDto {
  @ApiProperty({ example: 'zhangsan' })
  @IsString()
  @MaxLength(60)
  username!: string;

  @ApiProperty({ example: '张三' })
  @IsString()
  @MaxLength(80)
  nickname!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiPropertyOptional({ example: 'cmrbr78hu0000s966le4et3a5' })
  @IsOptional()
  @IsString()
  orgId?: string;

  @ApiPropertyOptional({ example: 'cmrbr78jb0002s966irheluj8' })
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];
}

export class CreatePositionDto {
  @ApiProperty({ example: '店长' })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 'store_manager' })
  @IsString()
  @MaxLength(80)
  code!: string;

  @ApiPropertyOptional({ example: '负责门店经营、员工和区域价格维护' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionIds?: string[];
}

export class UpdatePositionDto {
  @ApiPropertyOptional({ example: '店长' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ example: '负责门店经营、员工和区域价格维护' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionIds?: string[];
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: '张三' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  nickname?: string;

  @ApiPropertyOptional({ example: '123456' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiPropertyOptional({ example: 'cmrbr78hu0000s966le4et3a5' })
  @IsOptional()
  @IsString()
  orgId?: string | null;

  @ApiPropertyOptional({ example: 'cmrbr78jb0002s966irheluj8' })
  @IsOptional()
  @IsString()
  storeId?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];
}
