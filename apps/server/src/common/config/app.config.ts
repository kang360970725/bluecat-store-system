import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: Number(process.env.APP_PORT || 3000),
  host: process.env.APP_HOST || '127.0.0.1',
  fileStorageDriver: process.env.FILE_STORAGE_DRIVER || 'minio',
  bluecatBridgeBaseUrl:
    process.env.BLUECAT_BRIDGE_BASE_URL ||
    'http://127.0.0.1:8001/bridge/bluecat',
  bluecatBridgeTaskControlToken:
    process.env.BLUECAT_BRIDGE_TASK_CONTROL_TOKEN || '',
  bluecatBridgeReadToken: process.env.BLUECAT_BRIDGE_READ_TOKEN || '',
  bluecatV2SnapshotSyncEnabled:
    String(process.env.BLUECAT_V2_SNAPSHOT_SYNC_ENABLED || 'false').toLowerCase() ===
    'true',
  bluecatV2LiveSyncIntervalMinutes: Number(
    process.env.BLUECAT_V2_LIVE_SYNC_INTERVAL_MINUTES || 2
  ),
  bluecatV2ShiftSyncIntervalMinutes: Number(
    process.env.BLUECAT_V2_SHIFT_SYNC_INTERVAL_MINUTES || 5
  ),
  bluecatV2DailySyncIntervalMinutes: Number(
    process.env.BLUECAT_V2_DAILY_SYNC_INTERVAL_MINUTES || 60
  ),
  bluecatV2RecoveryDays: Number(process.env.BLUECAT_V2_RECOVERY_DAYS || 3),
  backgroundJobsEnabled:
    String(process.env.BACKGROUND_JOBS_ENABLED || 'true').toLowerCase() ===
    'true'
}));
