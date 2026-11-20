-- AlterTable
ALTER TABLE `v2_operational_tasks` ADD COLUMN `checklist` JSON NULL,
    ADD COLUMN `checklist_confirmed` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `v2_operational_task_reopens` ADD COLUMN `checklist_confirmed` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `v2_operational_task_schedules` ADD COLUMN `checklist` JSON NULL;
