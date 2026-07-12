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
  CreateScoreItemDto,
  UpdateScoreItemDto,
  UpsertStoreScoreEntryDto
} from './dto/scoring.dto';

const scoreItemSelect = {
  id: true,
  categoryCode: true,
  categoryName: true,
  name: true,
  code: true,
  description: true,
  formulaNote: true,
  maxScore: true,
  minScore: true,
  sort: true,
  enabled: true
} satisfies Prisma.ScoreItemSelect;

type ScoreItemRecord = Prisma.ScoreItemGetPayload<{
  select: typeof scoreItemSelect;
}>;

@Injectable()
export class ScoringService {
  constructor(private readonly prisma: PrismaService) {}

  async listItems() {
    const items = await this.prisma.scoreItem.findMany({
      where: { deletedAt: null },
      select: scoreItemSelect,
      orderBy: [{ sort: 'asc' }, { categoryCode: 'asc' }]
    });
    return items.map((item) => this.serializeItem(item));
  }

  async createItem(dto: CreateScoreItemDto, user: CurrentUser) {
    this.ensureConfigEditable(user);
    const item = await this.prisma.scoreItem.create({
      data: {
        ...dto,
        createdBy: user.id,
        updatedBy: user.id
      },
      select: scoreItemSelect
    });
    return this.serializeItem(item);
  }

  async updateItem(id: string, dto: UpdateScoreItemDto, user: CurrentUser) {
    this.ensureConfigEditable(user);
    await this.ensureItemExists(id);
    const item = await this.prisma.scoreItem.update({
      where: { id },
      data: {
        ...dto,
        updatedBy: user.id
      },
      select: scoreItemSelect
    });
    return this.serializeItem(item);
  }

  async listMonthly(monthValue: string | undefined, user: CurrentUser) {
    const month = this.parseMonth(monthValue);
    const [items, stores] = await Promise.all([
      this.listItems(),
      this.prisma.store.findMany({
        where: this.storeScope(user),
        select: {
          id: true,
          name: true,
          code: true,
          scoreEntries: {
            where: { month, deletedAt: null },
            select: {
              itemId: true,
              rawValue: true,
              score: true,
              remark: true
            }
          }
        },
        orderBy: { code: 'asc' }
      })
    ]);

    const rows = stores.map((store) => {
      const entries = new Map(
        store.scoreEntries.map((entry) => [entry.itemId, entry])
      );
      const scores = items.map((item) => {
        const entry = entries.get(item.id);
        return {
          itemId: item.id,
          rawValue: this.toNumber(entry?.rawValue),
          score: this.toNumber(entry?.score),
          remark: entry?.remark ?? '',
          maxScore: this.toNumber(item.maxScore),
          minScore: this.toNumber(item.minScore)
        };
      });
      return {
        store: {
          id: store.id,
          name: store.name,
          code: store.code
        },
        scores,
        totalScore: scores.reduce((sum, score) => sum + score.score, 0)
      };
    });

    return {
      month: this.formatMonth(month),
      items,
      rows
    };
  }

  async upsertEntry(dto: UpsertStoreScoreEntryDto, user: CurrentUser) {
    this.ensureEntryEditable(user);
    this.ensureStoreIdInUserScope(dto.storeId, user);
    const month = this.parseMonth(dto.month);
    const item = await this.ensureItemExists(dto.itemId);
    this.validateScore(dto.score, item);

    return this.prisma.storeScoreEntry.upsert({
      where: {
        storeId_itemId_month: {
          storeId: dto.storeId,
          itemId: dto.itemId,
          month
        }
      },
      update: {
        rawValue: dto.rawValue,
        score: dto.score,
        remark: dto.remark,
        updatedBy: user.id,
        deletedAt: null
      },
      create: {
        storeId: dto.storeId,
        itemId: dto.itemId,
        month,
        rawValue: dto.rawValue,
        score: dto.score,
        remark: dto.remark,
        createdBy: user.id,
        updatedBy: user.id
      }
    });
  }

  private async ensureItemExists(id: string) {
    const item = await this.prisma.scoreItem.findFirst({
      where: { id, deletedAt: null }
    });
    if (!item) {
      throw new NotFoundException('计分项目不存在');
    }
    return item;
  }

  private validateScore(
    score: number,
    item: { maxScore: Prisma.Decimal | null; minScore: Prisma.Decimal | null }
  ) {
    const maxScore = this.toNumber(item.maxScore);
    const minScore = this.toNumber(item.minScore);
    if (item.maxScore !== null && score > maxScore) {
      throw new BadRequestException(`得分不能超过上限 ${maxScore}`);
    }
    if (item.minScore !== null && score < minScore) {
      throw new BadRequestException(`得分不能低于下限 ${minScore}`);
    }
  }

  private ensureEntryEditable(user: CurrentUser) {
    if (!this.isSuperAdmin(user) && !user.permissions.includes('scoring:update')) {
      throw new ForbiddenException('无权录入评分');
    }
  }

  private ensureConfigEditable(user: CurrentUser) {
    if (!this.isSuperAdmin(user) && !user.permissions.includes('scoring:config')) {
      throw new ForbiddenException('无权维护计分项目');
    }
  }

  private storeScope(user: CurrentUser): Prisma.StoreWhereInput {
    if (this.isSuperAdmin(user)) {
      return { deletedAt: null };
    }
    return { deletedAt: null, id: { in: user.accessibleStoreIds } };
  }

  private ensureStoreIdInUserScope(storeId: string, user: CurrentUser) {
    if (this.isSuperAdmin(user)) {
      return;
    }
    if (!user.accessibleStoreIds.includes(storeId)) {
      throw new ForbiddenException('无权访问该门店数据');
    }
  }

  private isSuperAdmin(user: CurrentUser) {
    return user.roles.includes('super_admin');
  }

  private parseMonth(value?: string) {
    const monthValue = value || this.formatMonth(new Date());
    if (!/^\d{4}-\d{2}$/.test(monthValue)) {
      throw new BadRequestException('月份格式应为 YYYY-MM');
    }
    return new Date(`${monthValue}-01T00:00:00.000Z`);
  }

  private formatMonth(value: Date) {
    return value.toISOString().slice(0, 7);
  }

  private toNumber(value?: Prisma.Decimal | number | null) {
    if (value === undefined || value === null) {
      return 0;
    }
    return Number(value);
  }

  private serializeItem(item: ScoreItemRecord) {
    return {
      id: item.id,
      categoryCode: item.categoryCode,
      categoryName: item.categoryName,
      name: item.name,
      code: item.code,
      description: item.description,
      formulaNote: item.formulaNote,
      maxScore: item.maxScore === null ? null : this.toNumber(item.maxScore),
      minScore: item.minScore === null ? null : this.toNumber(item.minScore),
      sort: item.sort,
      enabled: item.enabled
    };
  }
}
