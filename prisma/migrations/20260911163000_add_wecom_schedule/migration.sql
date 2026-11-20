ALTER TABLE `v2_wecom_webhook_configs`
  ADD COLUMN `schedule_enabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `schedule_frequency` VARCHAR(191) NULL,
  ADD COLUMN `schedule_time` VARCHAR(191) NULL,
  ADD COLUMN `schedule_weekday` INTEGER NULL,
  ADD COLUMN `schedule_month_day` INTEGER NULL,
  ADD COLUMN `last_schedule_key` VARCHAR(191) NULL,
  ADD COLUMN `last_scheduled_at` DATETIME(3) NULL,
  ADD COLUMN `last_schedule_status` VARCHAR(191) NULL,
  ADD COLUMN `last_schedule_error` TEXT NULL;

CREATE INDEX `v2_wecom_schedule_due` ON `v2_wecom_webhook_configs`(`schedule_enabled`, `enabled`, `deleted_at`);
