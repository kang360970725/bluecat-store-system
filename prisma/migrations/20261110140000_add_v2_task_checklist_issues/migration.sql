-- AlterTable
ALTER TABLE `v2_operational_tasks` ADD COLUMN `checklist_issues` JSON NULL,
    ADD COLUMN `source_issue` JSON NULL;

-- AlterTable
ALTER TABLE `v2_operational_task_reopens` ADD COLUMN `checklist_issues` JSON NULL;
