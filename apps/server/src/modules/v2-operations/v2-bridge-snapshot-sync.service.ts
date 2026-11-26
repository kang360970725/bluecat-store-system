import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { V2OperationsService } from './v2-operations.service';

@Injectable()
export class V2BridgeSnapshotSyncService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(V2BridgeSnapshotSyncService.name);
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly running = new Set<string>();
  private readonly pending = new Map<string, () => Promise<unknown>>();

  constructor(
    private readonly operations: V2OperationsService,
    private readonly config: ConfigService
  ) {}

  onModuleInit() {
    if (
      !this.config.get<boolean>('app.backgroundJobsEnabled') ||
      !this.config.get<boolean>('app.bluecatV2SnapshotSyncEnabled')
    ) {
      this.logger.log('V2 Bridge snapshot sync disabled');
      return;
    }
    const liveMinutes = this.interval('app.bluecatV2LiveSyncIntervalMinutes', 2);
    const shiftMinutes = this.interval('app.bluecatV2ShiftSyncIntervalMinutes', 5);
    const dailyMinutes = this.interval('app.bluecatV2DailySyncIntervalMinutes', 60);
    this.timers.push(
      setInterval(() => void this.syncLive(), liveMinutes * 60_000),
      setInterval(() => void this.syncShifts(), shiftMinutes * 60_000),
      setInterval(() => void this.syncDaily(), dailyMinutes * 60_000)
    );
    this.timers.forEach((timer) => timer.unref());
    setTimeout(() => void this.recover(), 10_000).unref();
    this.logger.log(
      `V2 Bridge snapshot sync enabled: live=${liveMinutes}m shifts=${shiftMinutes}m daily=${dailyMinutes}m`
    );
  }

  onModuleDestroy() {
    this.timers.forEach((timer) => clearInterval(timer));
    this.pending.clear();
  }

  private interval(key: string, fallback: number) {
    const value = Number(this.config.get<number>(key) ?? fallback);
    return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;
  }

  private day(offset = 0) {
    return new Date(Date.now() + offset * 86_400_000).toLocaleDateString('en-CA', {
      timeZone: 'Asia/Shanghai'
    });
  }

  private bucket(minutes: number) {
    return Math.floor(Date.now() / (Math.max(1, minutes) * 60_000));
  }

  private async recover() {
    await this.exclusive('recovery', async () => {
      await this.operations.discoverStoresForActor();
      const configured = Number(
        this.config.get<number>('app.bluecatV2RecoveryDays') ?? 3
      );
      const recoveryDays = Number.isFinite(configured)
        ? Math.min(14, Math.max(1, Math.floor(configured)))
        : 3;
      for (let offset = -recoveryDays; offset < 0; offset += 1)
        await this.syncDay(this.day(offset));
      await this.syncLiveWork();
      await this.syncShiftsWork();
      return { recoveryDays };
    });
  }

  private syncLive() {
    return this.exclusive('live', () => this.syncLiveWork());
  }

  private async syncLiveWork() {
    const reportDate = this.day();
    await this.operations.runCollectorTask(
      'income',
      reportDate,
      `v2-live:${reportDate}:${this.bucket(this.interval('app.bluecatV2LiveSyncIntervalMinutes', 2))}`
    );
    const revenue = await this.operations.syncCollectorLive(reportDate);
    const productExclusions = await this.safeSync(() =>
      this.operations.syncAllLiveProductExclusions(reportDate)
    );
    return { reportDate, revenue, productExclusions };
  }

  private syncShifts() {
    return this.exclusive('shifts', () => this.syncShiftsWork());
  }

  private async syncShiftsWork() {
    const reportDate = this.day();
    await this.operations.runCollectorTask(
      'shifts',
      reportDate,
      `v2-shifts:${reportDate}:${this.bucket(this.interval('app.bluecatV2ShiftSyncIntervalMinutes', 5))}`
    );
    return this.operations.syncCollectorShifts(this.day(-2), reportDate);
  }

  private syncDaily() {
    return this.exclusive('daily', () => this.syncDay(this.day(-1)));
  }

  private async syncDay(reportDate: string) {
    const retryBucket = this.bucket(
      this.interval('app.bluecatV2DailySyncIntervalMinutes', 60)
    );
    const taskResults = {
      income: await this.safeSync(() =>
        this.operations.runCollectorTask(
          'income',
          reportDate,
          `v2-daily:income:${reportDate}:${retryBucket}`
        )
      ),
      ota: await this.safeSync(() =>
        this.operations.runCollectorTask(
          'ota',
          reportDate,
          `v2-daily:ota:${reportDate}:${retryBucket}`
        )
      ),
      shifts: await this.safeSync(() =>
        this.operations.runCollectorTask(
          'shifts',
          reportDate,
          `v2-daily:shifts:${reportDate}:${retryBucket}`
        )
      ),
      products: await this.safeSync(() =>
        this.operations.runCollectorTask(
          'products',
          reportDate,
          `v2-daily:products:${reportDate}:${retryBucket}`
        )
      )
    };
    const stores = await this.operations.productExclusionStoreIds();
    return {
      reportDate,
      tasks: taskResults,
      settled: await this.safeSync(() =>
        this.operations.syncCollectorSettled(reportDate)
      ),
      ota: await this.safeSync(() =>
        this.operations.syncCollectorOtaDaily(reportDate)
      ),
      otaRedemptions: await this.safeSync(() =>
        this.operations.syncCollectorOtaRedemptions(reportDate)
      ),
      shifts: await this.safeSync(() =>
        this.operations.syncCollectorShifts(reportDate, reportDate)
      ),
      productExclusions: await this.safeSync(() =>
        this.mapWithConcurrency(stores, 2, (storeId) =>
            this.operations.syncStoreProductExclusionDay(
              storeId,
              reportDate,
              false
            )
        )
      )
    };
  }

  private async exclusive(label: string, task: () => Promise<unknown>) {
    if (this.running.size > 0) {
      const alreadyPending = this.pending.has(label);
      this.pending.set(label, task);
      if (!alreadyPending)
        this.logger.warn(
          `V2 ${label} sync coalesced behind ${[...this.running].join(',')}`
        );
      return;
    }
    this.running.add(label);
    try {
      const result = await task();
      this.logger.log(
        `V2 ${label} sync succeeded: ${this.compactResult(result)}`
      );
      return result;
    } catch (error) {
      this.logger.error(`V2 ${label} sync failed: ${this.reason(error)}`);
    } finally {
      this.running.delete(label);
      queueMicrotask(() => void this.drainPending());
    }
  }

  private async drainPending() {
    if (this.running.size > 0 || this.pending.size === 0) return;
    const next = this.pending.entries().next().value as
      | [string, () => Promise<unknown>]
      | undefined;
    if (!next) return;
    const [label, task] = next;
    this.pending.delete(label);
    await this.exclusive(label, task);
  }

  private async safeSync(task: () => Promise<unknown>) {
    try {
      return await task();
    } catch (error) {
      return { failed: true, error: this.reason(error) };
    }
  }

  private reason(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  private compactResult(result: unknown) {
    const serialized = JSON.stringify(result);
    const maxLength = 2_000;
    return serialized.length <= maxLength
      ? serialized
      : `${serialized.slice(0, maxLength)}… [truncated ${serialized.length - maxLength} chars]`;
  }

  private async mapWithConcurrency<T, R>(
    values: T[],
    concurrency: number,
    task: (value: T) => Promise<R>
  ) {
    const results = new Array<R>(values.length);
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await task(values[index]);
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(Math.max(1, concurrency), values.length) },
        () => worker()
      )
    );
    return results;
  }
}
