import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateOrgDto, UpdateOrgDto } from './dto/org.dto';

@Injectable()
export class OrgService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.org.findMany({
      where: {
        deletedAt: null
      },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            code: true
          }
        },
        _count: {
          select: {
            children: true,
            stores: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  async create(dto: CreateOrgDto) {
    if (dto.parentId) {
      await this.ensureOrgExists(dto.parentId);
    }

    return this.prisma.org.create({
      data: dto
    });
  }

  async update(id: string, dto: UpdateOrgDto) {
    await this.ensureOrgExists(id);

    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException('上级组织不能是自身');
      }
      await this.ensureOrgExists(dto.parentId);
    }

    return this.prisma.org.update({
      where: { id },
      data: dto
    });
  }

  async remove(id: string) {
    await this.ensureOrgExists(id);

    const relatedCount = await this.prisma.org.count({
      where: {
        parentId: id,
        deletedAt: null
      }
    });

    if (relatedCount > 0) {
      throw new BadRequestException('存在下级组织，不能删除');
    }

    const storeCount = await this.prisma.store.count({
      where: {
        orgId: id,
        deletedAt: null
      }
    });

    if (storeCount > 0) {
      throw new BadRequestException('组织下存在门店，不能删除');
    }

    return this.prisma.org.update({
      where: { id },
      data: {
        deletedAt: new Date()
      }
    });
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
}
