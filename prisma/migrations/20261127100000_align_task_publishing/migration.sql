ALTER TABLE `v2_operational_tasks` ADD COLUMN `category` VARCHAR(40) NULL;

ALTER TABLE `v2_operational_task_schedules`
  ADD COLUMN `category` VARCHAR(40) NULL,
  ADD COLUMN `archived_at` DATETIME(3) NULL;
