import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { CurrentUser } from '@bluecat/shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateEmployeeDto,
  CreateStoreAreaDto,
  CreateStoreDto,
  UpdateEmployeeDto,
  UpdateStoreAreaDto,
  UpdateStoreDto,
  UpsertAreaPricesDto
} from './dto/store.dto';

@Injectable()
export class StoreService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: CurrentUser) {
    return this.prisma.store.findMany({
      where: this.storeScope(user),
      include: {
        org: {
          select: {
            id: true,
            name: true,
            code: true
          }
        },
        managerEmployee: {
          select: {
            id: true,
            name: true,
            employeeNo: true,
            phone: true
          }
        },
        responsibleEmployee: {
          select: {
            id: true,
            name: true,
            employeeNo: true,
            phone: true
          }
        },
        _count: {
          select: {
            employees: true,
            areas: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  async create(dto: CreateStoreDto, user: CurrentUser) {
    this.ensureSuperAdmin(user, '只有超级管理员可以新增门店');
    await this.ensureOrgExists(dto.orgId);
    await this.ensureStoreEmployeesExist(
      dto.managerEmployeeId,
      dto.responsibleEmployeeId
    );

    return this.prisma.store.create({
      data: dto
    });
  }

  async update(id: string, dto: UpdateStoreDto, user: CurrentUser) {
    await this.ensureStoreAccess(id, user);

    if (dto.orgId) {
      await this.ensureOrgExists(dto.orgId);
    }
    await this.ensureStoreEmployeesExist(
      dto.managerEmployeeId,
      dto.responsibleEmployeeId
    );

    return this.prisma.store.update({
      where: { id },
      data: dto
    });
  }

  async remove(id: string, user: CurrentUser) {
    this.ensureSuperAdmin(user, '只有超级管理员可以删除门店');
    await this.ensureStoreExists(id);

    return this.prisma.store.update({
      where: { id },
      data: {
        deletedAt: new Date()
      }
    });
  }

  listEmployees(user: CurrentUser, storeId?: string) {
    const where: Prisma.EmployeeWhereInput = {
      deletedAt: null,
      store: this.storeScope(user)
    };

    if (storeId) {
      this.ensureStoreIdInUserScope(storeId, user);
      where.storeId = storeId;
    }

    return this.prisma.employee.findMany({
      where,
      include: {
        store: {
          select: {
            id: true,
            name: true,
            code: true
          }
        },
        user: {
          select: {
            id: true,
            username: true,
            nickname: true
          }
        },
        positionRef: {
          select: {
            id: true,
            name: true,
            code: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async createEmployee(dto: CreateEmployeeDto, user: CurrentUser) {
    await this.ensureStoreAccess(dto.storeId, user);
    await this.ensureUserExists(dto.userId);
    await this.ensurePositionExists(dto.positionId);

    return this.prisma.employee.create({ data: dto });
  }

  async updateEmployee(id: string, dto: UpdateEmployeeDto, user: CurrentUser) {
    const employee = await this.ensureEmployeeExists(id);
    this.ensureStoreIdInUserScope(employee.storeId, user);

    if (dto.storeId) {
      await this.ensureStoreAccess(dto.storeId, user);
    }
    await this.ensureUserExists(dto.userId);
    await this.ensurePositionExists(dto.positionId);

    return this.prisma.employee.update({
      where: { id },
      data: dto
    });
  }

  async removeEmployee(id: string, user: CurrentUser) {
    const employee = await this.ensureEmployeeExists(id);
    this.ensureStoreIdInUserScope(employee.storeId, user);

    const referencedStore = await this.prisma.store.findFirst({
      where: {
        deletedAt: null,
        OR: [{ managerEmployeeId: id }, { responsibleEmployeeId: id }]
      },
      select: { id: true }
    });

    if (referencedStore) {
      throw new BadRequestException('员工已被设置为门店经理或负责人，不能删除');
    }

    return this.prisma.employee.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  listAreas(user: CurrentUser, storeId?: string) {
    const where: Prisma.StoreAreaWhereInput = {
      deletedAt: null,
      store: this.storeScope(user)
    };

    if (storeId) {
      this.ensureStoreIdInUserScope(storeId, user);
      where.storeId = storeId;
    }

    return this.prisma.storeArea.findMany({
      where,
      include: {
        store: {
          select: {
            id: true,
            name: true,
            code: true
          }
        },
        prices: {
          where: { deletedAt: null },
          orderBy: { tier: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async createArea(dto: CreateStoreAreaDto, user: CurrentUser) {
    const storeId = dto.storeId ?? this.defaultStoreId(user);
    await this.ensureStoreAccess(storeId, user);
    const { prices, ...area } = dto;

    return this.prisma.storeArea.create({
      data: {
        ...area,
        storeId,
        prices: {
          create: prices?.map((price) => ({
            tier: price.tier,
            price: price.price
          }))
        }
      },
      include: {
        prices: true
      }
    });
  }

  async updateArea(id: string, dto: UpdateStoreAreaDto, user: CurrentUser) {
    await this.ensureAreaAccess(id, user);

    return this.prisma.storeArea.update({
      where: { id },
      data: dto,
      include: {
        prices: {
          where: { deletedAt: null }
        }
      }
    });
  }

  async removeArea(id: string, user: CurrentUser) {
    await this.ensureAreaAccess(id, user);

    return this.prisma.$transaction(async (tx) => {
      await tx.storeAreaPrice.updateMany({
        where: { areaId: id, deletedAt: null },
        data: { deletedAt: new Date() }
      });

      return tx.storeArea.update({
        where: { id },
        data: { deletedAt: new Date() }
      });
    });
  }

  async upsertAreaPrices(
    areaId: string,
    dto: UpsertAreaPricesDto,
    user: CurrentUser
  ) {
    await this.ensureAreaAccess(areaId, user);

    return this.prisma.$transaction(
      dto.prices.map((price) =>
        this.prisma.storeAreaPrice.upsert({
          where: {
            areaId_tier: {
              areaId,
              tier: price.tier
            }
          },
          update: {
            price: price.price,
            deletedAt: null
          },
          create: {
            areaId,
            tier: price.tier,
            price: price.price
          }
        })
      )
    );
  }

  private async ensureOrgExists(id: string) {
    const org = await this.prisma.org.findFirst({
      where: {
        id,
        deletedAt: null
      },
      select: {
        id: true
      }
    });

    if (!org) {
      throw new NotFoundException('组织不存在');
    }
  }

  private async ensureStoreExists(id: string) {
    const store = await this.prisma.store.findFirst({
      where: {
        id,
        deletedAt: null
      },
      select: {
        id: true
      }
    });

    if (!store) {
      throw new NotFoundException('门店不存在');
    }
  }

  private async ensureEmployeeExists(id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id,
        deletedAt: null
      },
      select: {
        id: true,
        storeId: true
      }
    });

    if (!employee) {
      throw new NotFoundException('员工不存在');
    }

    return employee;
  }

  private async ensureAreaExists(id: string) {
    const area = await this.prisma.storeArea.findFirst({
      where: {
        id,
        deletedAt: null
      },
      select: {
        id: true,
        storeId: true
      }
    });

    if (!area) {
      throw new NotFoundException('区域不存在');
    }

    return area;
  }

  private async ensureUserExists(id?: string | null) {
    if (!id) {
      return;
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null
      },
      select: {
        id: true
      }
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }
  }

  private async ensurePositionExists(id?: string | null) {
    if (!id) {
      return;
    }

    const position = await this.prisma.position.findFirst({
      where: {
        id,
        deletedAt: null
      },
      select: {
        id: true
      }
    });

    if (!position) {
      throw new NotFoundException('岗位不存在');
    }
  }

  private async ensureStoreEmployeesExist(
    managerEmployeeId?: string | null,
    responsibleEmployeeId?: string | null
  ) {
    const employeeIds = [managerEmployeeId, responsibleEmployeeId].filter(
      Boolean
    ) as string[];

    if (!employeeIds.length) {
      return;
    }

    const count = await this.prisma.employee.count({
      where: {
        id: {
          in: employeeIds
        },
        deletedAt: null
      }
    });

    if (count !== new Set(employeeIds).size) {
      throw new NotFoundException('员工不存在');
    }
  }

  private isSuperAdmin(user: CurrentUser) {
    return user.roles.includes('super_admin');
  }

  private ensureSuperAdmin(user: CurrentUser, message: string) {
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenException(message);
    }
  }

  private storeScope(user: CurrentUser): Prisma.StoreWhereInput {
    if (this.isSuperAdmin(user)) {
      return { deletedAt: null };
    }

    return {
      deletedAt: null,
      id: {
        in: user.accessibleStoreIds
      }
    };
  }

  private ensureStoreIdInUserScope(storeId: string, user: CurrentUser) {
    if (this.isSuperAdmin(user)) {
      return;
    }

    if (!user.accessibleStoreIds.includes(storeId)) {
      throw new ForbiddenException('无权访问该门店数据');
    }
  }

  private defaultStoreId(user: CurrentUser) {
    const storeId = user.accessibleStoreIds[0];
    if (!storeId) {
      throw new ForbiddenException('当前账号未关联可维护门店');
    }
    return storeId;
  }

  private async ensureStoreAccess(id: string, user: CurrentUser) {
    this.ensureStoreIdInUserScope(id, user);
    await this.ensureStoreExists(id);
  }

  private async ensureAreaAccess(id: string, user: CurrentUser) {
    const area = await this.ensureAreaExists(id);
    this.ensureStoreIdInUserScope(area.storeId, user);
  }
}
