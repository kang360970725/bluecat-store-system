-- AlterTable
ALTER TABLE `v2_operational_task_reopens` ADD COLUMN `action` ENUM('RETURN', 'RELEASE') NOT NULL DEFAULT 'RETURN',
    ADD COLUMN `previous_claimed_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `v2_operational_task_notifications` MODIFY `kind` ENUM('RELEASED', 'CC', 'SUBMITTED', 'COMPLETED', 'RETURNED') NOT NULL;
