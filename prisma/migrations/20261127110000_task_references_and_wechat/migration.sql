ALTER TABLE `v2_attendance_wechat_bindings`
  ADD COLUMN `task_open_id_cipher` VARCHAR(255) NULL,
  ADD COLUMN `task_subscription_key` CHAR(64) NULL,
  ADD COLUMN `task_subscribed_at` DATETIME(3) NULL;

ALTER TABLE `v2_operational_tasks`
  ADD COLUMN `reference_images` JSON NULL,
  ADD COLUMN `reference_image_count` INT NOT NULL DEFAULT 0,
  ADD COLUMN `wechat_pending` BOOLEAN NOT NULL DEFAULT false,
  ADD INDEX `v2_task_wechat_pending_idx` (`wechat_pending`, `created_at`);

ALTER TABLE `v2_operational_task_schedules` ADD COLUMN `reference_images` JSON NULL;
