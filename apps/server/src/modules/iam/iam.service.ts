import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import {
  CreatePermissionDto,
  CreatePositionDto,
  CreateRoleDto,
  CreateUserDto,
  UpdatePermissionDto,
  UpdatePositionDto,
  UpdateRoleDto,
  UpdateUserDto
} from './dto/iam.dto';

@Injectable()
export class IamService {
  constructor(private readonly prisma: PrismaService) {}

  listPermissions() {
    return this.prisma.permission.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' }
    });
  }

  createPermission(dto: CreatePermissionDto) {
    return this.prisma.permission.create({ data: dto });
  }

  async updatePermission(id: string, dto: UpdatePermissionDto) {
    await this.ensurePermissionExists(id);
    return this.prisma.permission.update({ where: { id }, data: dto });
  }

  async removePermission(id: string) {
    await this.ensurePermissionExists(id);
    const roleCount = await this.prisma.rolePermission.count({
      where: { permissionId: id }
    });
    const positionCount = await this.prisma.positionPermission.count({
      where: { permissionId: id }
    });

    if (roleCount > 0 || positionCount > 0) {
      throw new BadRequestException('权限已被角色或岗位使用，不能删除');
    }

    return this.prisma.permission.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  listRoles() {
    return this.prisma.role.findMany({
      where: { deletedAt: null },
      include: {
        permissions: {
          include: {
            permission: true
          }
        },
        _count: {
          select: {
            users: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async createRole(dto: CreateRoleDto) {
    const { permissionIds, ...role } = dto;
    await this.ensurePermissionsExist(permissionIds);

    return this.prisma.role.create({
      data: {
        ...role,
        permissions: {
          create: permissionIds?.map((permissionId) => ({
            permissionId
          }))
        }
      }
    });
  }

  async updateRole(id: string, dto: UpdateRoleDto) {
    await this.ensureRoleExists(id);
    const { permissionIds, ...role } = dto;
    await this.ensurePermissionsExist(permissionIds);

    return this.prisma.$transaction(async (tx) => {
      if (permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            roleId: id,
            permissionId
          }))
        });
      }

      return tx.role.update({ where: { id }, data: role });
    });
  }

  async removeRole(id: string) {
    await this.ensureRoleExists(id);
    const userCount = await this.prisma.userRole.count({ where: { roleId: id } });

    if (userCount > 0) {
      throw new BadRequestException('角色已被用户使用，不能删除');
    }

    return this.prisma.role.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  listPositions() {
    return this.prisma.position.findMany({
      where: { deletedAt: null },
      include: {
        permissions: {
          include: {
            permission: true
          }
        },
        _count: {
          select: {
            employees: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async createPosition(dto: CreatePositionDto) {
    const { permissionIds, ...position } = dto;
    await this.ensurePermissionsExist(permissionIds);

    return this.prisma.position.create({
      data: {
        ...position,
        permissions: {
          create: permissionIds?.map((permissionId) => ({
            permissionId
          }))
        }
      },
      include: {
        permissions: {
          include: {
            permission: true
          }
        }
      }
    });
  }

  async updatePosition(id: string, dto: UpdatePositionDto) {
    await this.ensurePositionExists(id);
    const { permissionIds, ...position } = dto;
    await this.ensurePermissionsExist(permissionIds);

    return this.prisma.$transaction(async (tx) => {
      if (permissionIds) {
        await tx.positionPermission.deleteMany({ where: { positionId: id } });
        await tx.positionPermission.createMany({
          data: permissionIds.map((permissionId) => ({
            positionId: id,
            permissionId
          }))
        });
      }

      return tx.position.update({
        where: { id },
        data: position,
        include: {
          permissions: {
            include: {
              permission: true
            }
          }
        }
      });
    });
  }

  async removePosition(id: string) {
    await this.ensurePositionExists(id);
    const employeeCount = await this.prisma.employee.count({
      where: { positionId: id, deletedAt: null }
    });

    if (employeeCount > 0) {
      throw new BadRequestException('岗位已被员工使用，不能删除');
    }

    return this.prisma.position.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  listUsers() {
    return this.prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        username: true,
        nickname: true,
        enabled: true,
        orgId: true,
        storeId: true,
        createdAt: true,
        updatedAt: true,
        roles: {
          include: {
            role: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async createUser(dto: CreateUserDto) {
    const { password, roleIds, ...user } = dto;
    await this.ensureRolesExist(roleIds);
    await this.ensureOrgAndStoreExist(user.orgId, user.storeId);

    return this.prisma.user.create({
      data: {
        ...user,
        passwordHash: await hash(password, 10),
        roles: {
          create: roleIds?.map((roleId) => ({ roleId }))
        }
      },
      select: this.userSelect()
    });
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    await this.ensureUserExists(id);
    const { password, roleIds, ...user } = dto;
    await this.ensureRolesExist(roleIds);
    await this.ensureOrgAndStoreExist(user.orgId, user.storeId);

    return this.prisma.$transaction(async (tx) => {
      if (roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({
            userId: id,
            roleId
          }))
        });
      }

      return tx.user.update({
        where: { id },
        data: {
          ...user,
          ...(password ? { passwordHash: await hash(password, 10) } : {})
        },
        select: this.userSelect()
      });
    });
  }

  async removeUser(id: string) {
    await this.ensureUserExists(id);
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: this.userSelect()
    });
  }

  private userSelect() {
    return {
      id: true,
      username: true,
      nickname: true,
      enabled: true,
      orgId: true,
      storeId: true,
      createdAt: true,
      updatedAt: true
    };
  }

  private async ensurePermissionExists(id: string) {
    const permission = await this.prisma.permission.findFirst({
      where: { id, deletedAt: null },
      select: { id: true }
    });
    if (!permission) throw new NotFoundException('权限不存在');
  }

  private async ensurePermissionsExist(ids?: string[]) {
    if (!ids?.length) return;
    const count = await this.prisma.permission.count({
      where: { id: { in: ids }, deletedAt: null }
    });
    if (count !== new Set(ids).size) throw new NotFoundException('权限不存在');
  }

  private async ensureRoleExists(id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, deletedAt: null },
      select: { id: true }
    });
    if (!role) throw new NotFoundException('角色不存在');
  }

  private async ensurePositionExists(id: string) {
    const position = await this.prisma.position.findFirst({
      where: { id, deletedAt: null },
      select: { id: true }
    });
    if (!position) throw new NotFoundException('岗位不存在');
  }

  private async ensureRolesExist(ids?: string[]) {
    if (!ids?.length) return;
    const count = await this.prisma.role.count({
      where: { id: { in: ids }, deletedAt: null }
    });
    if (count !== new Set(ids).size) throw new NotFoundException('角色不存在');
  }

  private async ensureUserExists(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true }
    });
    if (!user) throw new NotFoundException('用户不存在');
  }

  private async ensureOrgAndStoreExist(
    orgId?: string | null,
    storeId?: string | null
  ) {
    if (orgId) {
      const org = await this.prisma.org.findFirst({
        where: { id: orgId, deletedAt: null },
        select: { id: true }
      });
      if (!org) throw new NotFoundException('组织不存在');
    }

    if (storeId) {
      const store = await this.prisma.store.findFirst({
        where: { id: storeId, deletedAt: null },
        select: { id: true }
      });
      if (!store) throw new NotFoundException('门店不存在');
    }
  }
}
