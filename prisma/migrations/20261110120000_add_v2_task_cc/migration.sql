-- AlterTable
ALTER TABLE `v2_operational_tasks` ADD COLUMN `cc_recipients` JSON NULL;

-- AlterTable
ALTER TABLE `v2_operational_task_schedules` ADD COLUMN `cc_recipients` JSON NULL;

-- AlterTable
ALTER TABLE `v2_operational_task_notifications` MODIFY `kind` ENUM('CC', 'SUBMITTED', 'COMPLETED', 'RETURNED') NOT NULL;

