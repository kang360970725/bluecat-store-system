import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CurrentUser } from '@bluecat/shared';
import { Prisma } from '@prisma/client';
import { createDecipheriv, createHash } from 'node:crypto';
import sharp from 'sharp';
import { PrismaService } from '../../database/prisma.service';

const CONTEST_CODE = 'RECHARGE_BATTLE_20260928';
const CONTEST_NAME = '门店充值比武活动';
const START_AT = new Date('2026-09-28T20:00:00+08:00');
const END_AT = new Date('2026-10-07T23:59:59+08:00');
const RULES = [
  { min: 88, max: 168, score: 1 },
  { min: 168, max: 288, score: 2 },
  { min: 288, max: 498, score: 3 },
  { min: 498, max: 988, score: 5 },
  { min: 988, max: 2988, score: 8 },
  { min: 2988, max: 4988, score: 15 },
  { min: 4988, max: 9888, score: 25 },
  { min: 9888, max: null, score: 40 }
] as const;
const EXCLUDED_REMARK_KEYWORDS = ['美团', '核销', '团购', '抖音'] as const;

type BillFlowRow = Record<string, unknown>;

@Injectable()
export class V2RechargeContestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(V2RechargeContestService.name);
  private pushTimer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  onModuleInit() {
    if (new Date() > END_AT) {
      this.logger.log('V2 recharge contest ended; WeCom push disabled');
      return;
    }
    this.pushTimer = setInterval(() => void this.safePush(), 30_000);
    this.pushTimer.unref();
    this.logger.log('V2 recharge contest automatic data sync disabled; manual task control only');
  }

  onModuleDestroy() {
    if (this.pushTimer) clearInterval(this.pushTimer);
  }

  private async safePush() {
    try { await this.pushContestReport(false); }
    catch (error) { this.logger.error(`Recharge contest push failed: ${error instanceof Error ? error.message : String(error)}`); }
  }

  async sync(trigger: 'scheduled' | 'manual') {
    if (this.running) return { skipped: true, reason: 'sync_in_progress' };
    const now = new Date();
    if (now < START_AT) return { skipped: true, reason: 'contest_not_started' };
    this.running = true;
    let runId: string | undefined;
    try {
      const contest = await this.ensureContest();
      if (contest.status === 'COMPLETED')
        return { skipped: true, reason: 'contest_completed' };
      const rangeEnd = now < END_AT ? now : END_AT;
      const full =
        trigger === 'manual' ||
        !contest.lastFullSyncedAt ||
        rangeEnd.getTime() - contest.lastFullSyncedAt.getTime() >= 60 * 60_000 ||
        now >= END_AT;
      const rangeStart = full
        ? START_AT
        : new Date(Math.max(START_AT.getTime(), rangeEnd.getTime() - 10 * 60_000));
      const bucketAt = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
      try {
        const run = await this.prisma.v2RechargeContestSyncRun.create({
          data: {
            contestId: contest.id,
            bucketAt,
            rangeStart,
            rangeEnd,
            mode: full ? 'FULL' : 'INCREMENTAL'
          }
        });
        runId = run.id;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
          return { skipped: true, reason: 'minute_already_claimed' };
        throw error;
      }

      const connections = await this.prisma.v2DataSourceConnection.findMany({
        where: { store: { deletedAt: null, status: { not: 'CLOSED' } } },
        select: { storeId: true, externalStoreId: true }
      });
      let fetched = 0;
      let accepted = 0;
      const failures: Array<{ store: string; error: string }> = [];
      for (const connection of connections) {
        try {
          const response = await this.fetchCollector(connection.externalStoreId, rangeStart, rangeEnd);
          fetched += response.rows.length;
          const ingested = await this.ingestRows(
            contest.id,
            connection.storeId,
            connection.externalStoreId,
            response.rows
          );
          accepted += ingested.count;
          const reconciliationScope = {
            contestId: contest.id,
            storeId: connection.storeId,
            occurredAt: { gte: rangeStart, lte: rangeEnd }
          };
          if (ingested.sourceKeys.length)
            await this.prisma.v2RechargeContestEntry.deleteMany({
              where: { ...reconciliationScope, sourceKey: { notIn: ingested.sourceKeys } }
            });
          else
            await this.prisma.v2RechargeContestEntry.deleteMany({
              where: reconciliationScope
            });
        } catch (error) {
          failures.push({
            store: connection.externalStoreId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      if (failures.length === connections.length)
        throw new Error(
          `all stores failed: ${failures.map(item => `${item.store} ${item.error}`).join('; ')}`
        );
      const completed = now >= END_AT && full;
      await this.prisma.$transaction([
        this.prisma.v2RechargeContestSyncRun.update({
          where: { id: runId },
          data: { status: 'SUCCEEDED', recordCount: accepted, finishedAt: new Date() }
        }),
        this.prisma.v2RechargeContest.update({
          where: { id: contest.id },
          data: {
            lastSyncedAt: new Date(),
            lastFullSyncedAt: full ? new Date() : undefined,
            lastSyncError: failures.length
              ? `${failures.length} 个门店同步失败：${failures.map(item => item.store).join('、')}`
              : null,
            status: completed ? 'COMPLETED' : 'ACTIVE'
          }
        })
      ]);
      return { mode: full ? 'FULL' : 'INCREMENTAL', fetched, accepted, stores: connections.length, failures, completed };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (runId)
        await this.prisma.v2RechargeContestSyncRun.update({
          where: { id: runId },
          data: { status: 'FAILED', errorReason: reason, finishedAt: new Date() }
        });
      await this.prisma.v2RechargeContest.updateMany({
        where: { code: CONTEST_CODE },
        data: { lastSyncError: reason }
      });
      throw new BadRequestException(`充值比武同步失败：${reason}`);
    } finally {
      this.running = false;
    }
  }

  async leaderboard(user: CurrentUser) {
    const contest = await this.ensureContest();
    const scopedStoreIds = user.roles.includes('super_admin')
      ? undefined
      : user.accessibleStoreIds;
    const stores = await this.prisma.v2Store.findMany({
      where: {
        deletedAt: null,
        status: { not: 'CLOSED' },
        ...(scopedStoreIds ? { id: { in: scopedStoreIds } } : {})
      },
      select: { id: true, code: true, name: true, shortName: true }
    });
    const storeIds = stores.map(store => store.id);
    const entries = await this.prisma.v2RechargeContestEntry.findMany({
      where: { contestId: contest.id, storeId: { in: storeIds } },
      select: { storeId: true, principal: true, score: true, occurredAt: true, salespersonName: true }
    });
    const totals = new Map<string, {
      score: number;
      principal: number;
      count: number;
      latestAt: Date | null;
      bands: Record<number, number>;
    }>();
    for (const store of stores)
      totals.set(store.id, { score: 0, principal: 0, count: 0, latestAt: null, bands: {} });
    for (const entry of entries) {
      const total = totals.get(entry.storeId);
      if (!total) continue;
      total.score += entry.score;
      total.principal += Number(entry.principal);
      total.count += 1;
      total.bands[entry.score] = (total.bands[entry.score] ?? 0) + 1;
      if (!total.latestAt || entry.occurredAt > total.latestAt)
        total.latestAt = entry.occurredAt;
    }
    const items = stores
      .map(store => ({ ...store, ...totals.get(store.id)! }))
      .sort((a, b) => b.score - a.score || b.principal - a.principal || a.code.localeCompare(b.code));
    let rank = 0;
    let previousScore: number | undefined;
    const ranked = items.map((item, index) => {
      if (item.score !== previousScore) rank = index + 1;
      previousScore = item.score;
      return { ...item, rank, principal: Math.round(item.principal * 100) / 100 };
    });
    const people = new Map<string, { storeId: string; name: string; score: number; principal: number; count: number }>();
    for (const entry of entries) {
      const name = entry.salespersonName?.trim();
      if (!name) continue;
      const key = `${entry.storeId}:${name}`;
      const person = people.get(key) ?? { storeId: entry.storeId, name, score: 0, principal: 0, count: 0 };
      person.score += entry.score;
      person.principal += Number(entry.principal);
      person.count += 1;
      people.set(key, person);
    }
    const storeMap = new Map(stores.map(store => [store.id, store]));
    const salespersonRanking = [...people.values()]
      .map(person => ({ ...person, storeName: storeMap.get(person.storeId)?.shortName || storeMap.get(person.storeId)?.name || '' }))
      .sort((a, b) => b.score - a.score || b.principal - a.principal || a.name.localeCompare(b.name))
      .map((person, index) => ({ ...person, rank: index + 1, principal: Math.round(person.principal * 100) / 100 }));
    return {
      contest: {
        code: contest.code,
        name: contest.name,
        startsAt: contest.startsAt,
        endsAt: contest.endsAt,
        status: contest.status,
        rules: contest.rules,
        lastSyncedAt: contest.lastSyncedAt,
        lastFullSyncedAt: contest.lastFullSyncedAt,
        lastSyncError: contest.lastSyncError
      },
      items: ranked,
      salespersonRanking,
      generatedAt: new Date()
    };
  }

  async entries(user: CurrentUser, page: number, storeId?: string, bound?: string, card?: string, salesperson?: string) {
    const contest = await this.ensureContest();
    const storeIds = user.roles.includes('super_admin') ? undefined : user.accessibleStoreIds;
    const where: Prisma.V2RechargeContestEntryWhereInput = {
      contestId: contest.id,
      store: { status: { not: 'CLOSED' }, deletedAt: null },
      ...(storeIds ? { storeId: { in: storeIds } } : {}),
      ...(storeId ? { storeId } : {}),
      ...(card?.trim() ? { cardRef: { contains: card.trim() } } : {}),
      ...(salesperson?.trim() ? { salespersonName: { contains: salesperson.trim() } } : {}),
      ...(bound === 'BOUND' ? { salespersonName: { not: null } } : bound === 'UNBOUND' ? { salespersonName: null } : {})
    };
    const safePage = Math.max(1, page);
    const [total, items, stores] = await Promise.all([
      this.prisma.v2RechargeContestEntry.count({ where }),
      this.prisma.v2RechargeContestEntry.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (safePage - 1) * 20,
        take: 20,
        include: { store: { select: { id: true, name: true, shortName: true, code: true } } }
      }),
      this.prisma.v2Store.findMany({
        where: { deletedAt: null, status: { not: 'CLOSED' }, ...(storeIds ? { id: { in: storeIds } } : {}) },
        select: { id: true, name: true, shortName: true, code: true }, orderBy: { code: 'asc' }
      })
    ]);
    return { page: safePage, pageSize: 20, total, items, stores };
  }

  async updateEntry(id: string, values: { salespersonName?: string; note?: string }, user: CurrentUser) {
    const entry = await this.prisma.v2RechargeContestEntry.findUnique({ where: { id } });
    if (!entry) throw new BadRequestException('充值流水不存在');
    if (!user.roles.includes('super_admin') && !user.accessibleStoreIds.includes(entry.storeId))
      throw new BadRequestException('无权修改该门店流水');
    const hasSalesperson = Object.prototype.hasOwnProperty.call(values, 'salespersonName');
    const hasNote = Object.prototype.hasOwnProperty.call(values, 'note');
    if (!hasSalesperson && !hasNote) throw new BadRequestException('没有需要保存的内容');
    const salespersonName = hasSalesperson ? values.salespersonName?.trim().slice(0, 128) || null : entry.salespersonName;
    const note = hasNote ? values.note?.trim().slice(0, 4000) || null : entry.note;
    const changes: string[] = [];
    if (hasSalesperson && salespersonName !== entry.salespersonName)
      changes.push(`销售人员「${entry.salespersonName || '未填写'}」→「${salespersonName || '未填写'}」`);
    if (hasNote && note !== entry.note)
      changes.push(`备注「${entry.note || '未填写'}」→「${note || '未填写'}」`);
    if (!changes.length) return entry;
    const changedAt = this.sourceDateTime(new Date());
    const detail = `[${changedAt}] ${user.nickname || user.username}：${changes.join('；')}`;
    const changeDetails = [entry.changeDetails, detail].filter(Boolean).join('\n').slice(-65000);
    return this.prisma.v2RechargeContestEntry.update({
      where: { id },
      data: {
        salespersonName,
        note,
        changeDetails,
        ...(hasSalesperson ? { salespersonBoundAt: new Date(), salespersonBoundBy: user.id } : {})
      }
    });
  }

  async pushContestReport(force = false) {
    const now = new Date();
    if (!force && now > END_AT)
      return { skipped: true, reason: 'contest_ended' };
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now).reduce<Record<string, string>>((out, item) => { if (item.type !== 'literal') out[item.type] = item.value; return out; }, {});
    const hour = Number(parts.hour);
    const minute = Number(parts.minute);
    if (!force && (hour >= 2 && hour < 12)) return { skipped: true, reason: 'quiet_hours' };
    if (!force && minute !== 0) return { skipped: true, reason: 'not_due' };
    const contest = await this.ensureContest();
    if (!force && contest.status === 'COMPLETED')
      return { skipped: true, reason: 'contest_completed' };
    const pushKey = force
      ? `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}-manual`
      : `${parts.year}${parts.month}${parts.day}${parts.hour}00`;
    const configs = await this.prisma.v2WecomWebhookConfig.findMany({ where: { enabled: true, deletedAt: null } });
    const png = await this.renderContestReport();
    const results: Array<{ configId: string; status: string; error?: string }> = [];
    for (const config of configs) {
      let run;
      try {
        run = await this.prisma.v2RechargeContestPushRun.create({ data: { contestId: contest.id, configId: config.id, pushKey } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        throw error;
      }
      try {
        const webhook = this.decryptSecret(config.webhookEncrypted);
        const md5 = createHash('md5').update(png).digest('hex');
        const response = await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ msgtype: 'image', image: { base64: png.toString('base64'), md5 } }), signal: AbortSignal.timeout(15000) });
        const body = await response.json() as { errcode?: number; errmsg?: string };
        if (!response.ok || body.errcode !== 0) throw new Error(body.errmsg || `HTTP ${response.status}`);
        await this.prisma.v2RechargeContestPushRun.update({ where: { id: run.id }, data: { status: 'SUCCESS', imageBytes: png.length, sentAt: new Date() } });
        results.push({ configId: config.id, status: 'SUCCESS' });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        await this.prisma.v2RechargeContestPushRun.update({ where: { id: run.id }, data: { status: 'FAILED', errorReason: reason } });
        results.push({ configId: config.id, status: 'FAILED', error: reason });
      }
    }
    return { pushKey, imageBytes: png.length, results };
  }

  async previewContestReport() {
    const png = await this.renderContestReport();
    return { image: `data:image/png;base64,${png.toString('base64')}`, imageBytes: png.length, generatedAt: new Date().toISOString() };
  }

  private async renderContestReport() {
    const ranking = await this.leaderboard({ roles: ['super_admin'], accessibleStoreIds: [] } as unknown as CurrentUser);
    return sharp(Buffer.from(this.contestSvg(ranking.items, ranking.salespersonRanking)))
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();
  }

  private decryptSecret(value: string) {
    const [iv, tag, encrypted] = value.split('.');
    const secret = this.config.get<string>('WECOM_WEBHOOK_SECRET') || this.config.get<string>('jwt.secret');
    if (!iv || !tag || !encrypted || !secret) throw new Error('企微配置无法解密');
    const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
  }

  private contestSvg(stores: Array<{ rank: number; shortName?: string | null; name: string; score: number; count: number }>, people: Array<{ rank: number; name: string; storeName: string; score: number; count: number }>) {
    const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
    const topStores = stores.slice(0, 3);
    const topPeople = people.slice(0, 3);
    const totalScore = stores.reduce((sum, item) => sum + item.score, 0);
    const totalCount = stores.reduce((sum, item) => sum + item.count, 0);
    const now = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replaceAll('/', '.');
    const salesHeight = topPeople.length ? 178 : 72;
    const rankingY = 440 + salesHeight;
    const visibleStores = stores.slice(0, 18);
    const visiblePeople = people.slice(0, 10);
    const peopleRankingY = rankingY + 94 + Math.max(1, visibleStores.length) * 52 + 42;
    const peopleRowsHeight = visiblePeople.length ? visiblePeople.length * 52 : 68;
    const height = peopleRankingY + 82 + peopleRowsHeight + 68;
    const medalColors = ['#ffd54a', '#dbe7f5', '#eaa66b'];
    const storeCards = topStores.map((item, index) => {
      const gap = index === 0 ? '' : `<text x="286" y="38" class="gap">距榜首 ${Math.max(0, (topStores[0]?.score || 0) - item.score)} 分</text>`;
      return `<g transform="translate(${54 + index * 330} 252)"><rect width="312" height="154" rx="22" fill="url(#card${index})" stroke="${medalColors[index]}" stroke-opacity=".72"/><circle cx="38" cy="36" r="20" fill="${medalColors[index]}"/><text x="38" y="43" text-anchor="middle" class="medal">${item.rank}</text><text x="68" y="42" class="toplabel">TOP ${item.rank}</text><text x="24" y="84" class="cardname">${esc(item.shortName || item.name)}</text><text x="24" y="127" class="bigscore">${item.score}<tspan class="scoreunit" dx="8">分</tspan></text><text x="286" y="126" text-anchor="end" class="count">${item.count} 笔</text>${gap}</g>`;
    }).join('');
    const peopleCards = topPeople.map((item, index) => `<g transform="translate(${54 + index * 330} 468)"><rect width="312" height="126" rx="18" fill="#0b2941" stroke="#38bdf8" stroke-opacity=".45"/><text x="22" y="31" class="bluebadge">NO.${item.rank}  SALES</text><text x="22" y="65" class="personname">${esc(item.name)}</text><text x="22" y="94" class="personstore">${esc(item.storeName)}</text><text x="286" y="67" text-anchor="end" class="personscore">${item.score} 分</text><text x="286" y="95" text-anchor="end" class="count">${item.count} 笔</text></g>`).join('');
    const salesBlock = topPeople.length
      ? `<text x="54" y="448" class="section">销售先锋榜</text><text x="1008" y="448" text-anchor="end" class="hint">按已关联充值统计</text>${peopleCards}`
      : `<g transform="translate(54 438)"><rect width="972" height="54" rx="16" fill="#0b2941" stroke="#38bdf8" stroke-opacity=".28"/><text x="22" y="35" class="salesempty">销售先锋榜 · 暂无已关联销售数据</text><text x="946" y="35" text-anchor="end" class="hint">关联充值明细后自动上榜</text></g>`;
    const rows = visibleStores.map((item, index) => {
      const y = rankingY + 86 + index * 52;
      const rowFill = index < 3 ? 'rgba(251,191,36,.10)' : index % 2 ? 'rgba(255,255,255,.025)' : 'rgba(255,255,255,.05)';
      const rankFill = medalColors[index] || '#94a3b8';
      return `<g transform="translate(54 ${y})"><rect width="972" height="44" rx="11" fill="${rowFill}"/><text x="22" y="29" class="rowrank" fill="${rankFill}">${String(item.rank).padStart(2, '0')}</text><text x="82" y="29" class="rowname">${esc(item.shortName || item.name)}</text><text x="746" y="29" text-anchor="end" class="rowscore">${item.score} 分</text><text x="930" y="29" text-anchor="end" class="rowcount">${item.count} 笔有效</text></g>`;
    }).join('');
    const peopleRows = visiblePeople.length ? visiblePeople.map((item, index) => {
      const y = peopleRankingY + 64 + index * 52;
      const rowFill = index < 3 ? 'rgba(56,189,248,.12)' : index % 2 ? 'rgba(14,116,144,.08)' : 'rgba(56,189,248,.055)';
      const rankFill = index < 3 ? '#38bdf8' : '#94a3b8';
      return `<g transform="translate(54 ${y})"><rect width="972" height="44" rx="11" fill="${rowFill}"/><text x="22" y="29" class="rowrank" fill="${rankFill}">${String(item.rank).padStart(2, '0')}</text><text x="82" y="29" class="rowname">${esc(item.name)}</text><text x="440" y="29" class="personrowstore">${esc(item.storeName)}</text><text x="746" y="29" text-anchor="end" class="peopleRowscore">${item.score} 分</text><text x="930" y="29" text-anchor="end" class="rowcount">${item.count} 笔有效</text></g>`;
    }).join('') : `<g transform="translate(54 ${peopleRankingY + 62})"><rect width="972" height="54" rx="14" fill="rgba(56,189,248,.06)"/><text x="486" y="34" text-anchor="middle" class="hint">暂无已关联销售数据</text></g>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#050b17"/><stop offset=".55" stop-color="#0b2040"/><stop offset="1" stop-color="#521b16"/></linearGradient><radialGradient id="glow"><stop stop-color="#f59e0b" stop-opacity=".25"/><stop offset="1" stop-color="#f59e0b" stop-opacity="0"/></radialGradient>${[0,1,2].map(i => `<linearGradient id="card${i}" x2="1" y2="1"><stop stop-color="${i === 0 ? '#33280c' : i === 1 ? '#18263b' : '#322016'}"/><stop offset="1" stop-color="#0a1528"/></linearGradient>`).join('')}</defs><rect width="1080" height="${height}" fill="url(#bg)"/><circle cx="920" cy="80" r="310" fill="url(#glow)"/><path d="M850 0 L1080 0 L1080 230 Z" fill="#fbbf24" opacity=".035"/><style>text{font-family:'Noto Sans CJK SC','Microsoft YaHei',sans-serif;fill:#fff}.eyebrow{font-size:14px;font-weight:800;letter-spacing:4px;fill:#fbbf24}.title{font-size:52px;font-weight:900;letter-spacing:2px}.subtitle,.hint{font-size:15px;fill:#94a3b8}.metric{font-size:28px;font-weight:900}.metriclabel{font-size:13px;fill:#94a3b8}.section{font-size:25px;font-weight:900;fill:#f8fafc}.toplabel,.bluebadge{font-size:14px;font-weight:900;letter-spacing:1px;fill:#fbbf24}.bluebadge{fill:#38bdf8}.medal{font-size:20px;font-weight:900;fill:#07111f}.cardname{font-size:22px;font-weight:800}.bigscore{font-size:38px;font-weight:900;fill:#fbbf24}.scoreunit,.count,.personstore,.rowcount{font-size:16px;fill:#94a3b8}.scoreunit{font-size:16px;font-weight:500}.gap{font-size:12px;fill:#f59e0b;text-anchor:end}.personname{font-size:22px;font-weight:800}.personscore{font-size:24px;font-weight:900;fill:#38bdf8}.salesempty{font-size:17px;font-weight:800;fill:#7dd3fc}.header{font-size:13px;font-weight:700;fill:#64748b;letter-spacing:1px}.rowrank{font-size:17px;font-weight:900}.rowname{font-size:18px;font-weight:700}.rowscore{font-size:19px;font-weight:900;fill:#fbbf24}.peopleRowscore{font-size:19px;font-weight:900;fill:#38bdf8}.personrowstore{font-size:15px;fill:#7dd3fc}.rowcount{font-size:15px}</style><text x="54" y="50" class="eyebrow">BLUECAT · RECHARGE BATTLE</text><text x="54" y="108" class="title">充值巅峰之战</text><text x="54" y="140" class="subtitle">每一次充值，都在改写排名</text><g transform="translate(54 166)"><rect width="972" height="58" rx="17" fill="#ffffff" opacity=".055"/><text x="24" y="25" class="metriclabel">参战门店</text><text x="24" y="48" class="metric">${stores.length}</text><text x="208" y="25" class="metriclabel">累计战绩</text><text x="208" y="48" class="metric">${totalScore} 分</text><text x="430" y="25" class="metriclabel">有效充值</text><text x="430" y="48" class="metric">${totalCount} 笔</text><text x="948" y="36" text-anchor="end" class="subtitle">战报更新 ${esc(now)}</text></g>${storeCards}${salesBlock}<text x="54" y="${rankingY + 30}" class="section">门店全榜</text><text x="1026" y="${rankingY + 30}" text-anchor="end" class="hint">实时积分 · 冲榜进行时</text><g transform="translate(54 ${rankingY + 48})"><text x="22" class="header">名次</text><text x="82" class="header">战队</text><text x="746" text-anchor="end" class="header">积分</text><text x="930" text-anchor="end" class="header">战绩</text></g>${rows}<text x="54" y="${peopleRankingY + 30}" class="section" fill="#7dd3fc">个人前10榜</text><text x="1026" y="${peopleRankingY + 30}" text-anchor="end" class="hint">销售积分 · 逐鹿争锋</text><g transform="translate(54 ${peopleRankingY + 48})"><text x="22" class="header">名次</text><text x="82" class="header">销售人员</text><text x="440" class="header">所属门店</text><text x="746" text-anchor="end" class="header">积分</text><text x="930" text-anchor="end" class="header">战绩</text></g>${peopleRows}<text x="540" y="${height - 26}" text-anchor="middle" class="hint">活动时间 09.28 20:00 — 10.07 23:59 · 数据来自 X管家</text></svg>`;
  }

  private ensureContest() {
    return this.prisma.v2RechargeContest.upsert({
      where: { code: CONTEST_CODE },
      update: { name: CONTEST_NAME, startsAt: START_AT, endsAt: END_AT, rules: RULES as unknown as Prisma.InputJsonValue },
      create: { code: CONTEST_CODE, name: CONTEST_NAME, startsAt: START_AT, endsAt: END_AT, rules: RULES as unknown as Prisma.InputJsonValue }
    });
  }

  private async fetchCollector(externalStoreId: string, start: Date, end: Date) {
    const bridge = this.config.get<string>('app.bluecatBridgeBaseUrl')?.replace(/\/bridge\/bluecat\/?$/, '');
    if (!bridge) throw new Error('未配置采集服务地址');
    const query = new URLSearchParams({
      externalStoreId,
      start: this.sourceDateTime(start),
      end: this.sourceDateTime(end)
    });
    const readToken = this.config.get<string>('app.bluecatBridgeReadToken');
    if (!readToken) throw new Error('未配置 Bridge 读取凭据');
    const response = await fetch(`${bridge}/bridge/bluecat/v1/recharge/flows?${query}`, {
      headers: { Authorization: `Bearer ${readToken}` }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as { contractVersion?: string; rows?: BillFlowRow[] };
    if (body.contractVersion !== '1.0')
      throw new Error(`Bridge contract version mismatch: ${body.contractVersion ?? 'missing'}`);
    return { rows: Array.isArray(body.rows) ? body.rows : [] };
  }

  private async ingestRows(contestId: string, storeId: string, externalStoreId: string, rows: BillFlowRow[]) {
    let accepted = 0;
    const sourceKeys: string[] = [];
    for (const row of rows) {
      const category = this.text(row.saddName ?? row.category);
      const principal = this.money(row.caddFee ?? row.principal);
      const occurredAt = this.sourceTime(row.dtTime ?? row.createdAt ?? row.occurredAt);
      const score = this.score(principal);
      const sourceRemark = this.text(row.smemo ?? row.remark ?? row.remarks ?? row.memo ?? row.note);
      const excludedByRemark = EXCLUDED_REMARK_KEYWORDS.some(keyword => sourceRemark.includes(keyword));
      if (category !== '加本金' || score === 0 || principal >= 10000 || excludedByRemark || !occurredAt || occurredAt < START_AT || occurredAt > END_AT)
        continue;
      const sourceRecordId = this.text(row.id ?? row.flowId ?? row.billFlowId ?? row.waterId) || null;
      const transactionNo = this.text(row.dealNo ?? row.transactionNo) || null;
      const fingerprint = this.hash(this.stableStringify(row));
      const localSourceKey = sourceRecordId
        ? `id:${sourceRecordId}`
        : transactionNo
          ? `deal:${transactionNo}`
          : `hash:${fingerprint}`;
      const sourceKey = `${externalStoreId.toLowerCase()}:${localSourceKey}`;
      sourceKeys.push(sourceKey);
      await this.prisma.v2RechargeContestEntry.upsert({
        where: { contestId_sourceKey: { contestId, sourceKey } },
        update: {
          occurredAt,
          category,
          principal,
          reward: this.money(row.creward ?? row.reward),
          score,
          sourcePayload: row as Prisma.InputJsonValue,
          sourceHash: fingerprint,
          capturedAt: new Date()
        },
        create: {
          contestId,
          storeId,
          externalStoreId,
          sourceKey,
          sourceRecordId,
          transactionNo,
          occurredAt,
          category,
          cardRef: this.text(row.scardId ?? row.cardNo) || null,
          principal,
          reward: this.money(row.creward ?? row.reward),
          score,
          paymentSource: this.text(row.paySource ?? row.paymentSource) || null,
          paymentMethod: this.text(row.payTypeName ?? row.paymentMethod) || null,
          operatorLabel: this.text(row.operatorName ?? row.operator) || null,
          sourcePayload: row as Prisma.InputJsonValue,
          sourceHash: fingerprint,
          capturedAt: new Date()
        }
      });
      accepted += 1;
    }
    return { count: accepted, sourceKeys };
  }

  private score(principal: number) {
    return RULES.find(rule => principal >= rule.min && (rule.max === null || principal < rule.max))?.score ?? 0;
  }

  private money(value: unknown) {
    const parsed = Number(String(value ?? 0).replace(/[+,\s]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private text(value: unknown) {
    return value == null ? '' : String(value).trim();
  }

  private sourceTime(value: unknown) {
    const text = this.text(value);
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return null;
    const parsed = new Date(`${text.replace(' ', 'T')}+08:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private sourceDateTime(value: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(value);
    const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`;
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(item => this.stableStringify(item)).join(',')}]`;
    if (value && typeof value === 'object')
      return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${this.stableStringify(item)}`).join(',')}}`;
    return JSON.stringify(value);
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
