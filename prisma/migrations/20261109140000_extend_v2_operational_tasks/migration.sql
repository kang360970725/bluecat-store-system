-- AlterTable
ALTER TABLE `v2_operational_tasks` ADD COLUMN `original_due_at` DATETIME(3) NULL,
    ADD COLUMN `source_task_id` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `v2_operational_task_reopens` (
    `id` VARCHAR(191) NOT NULL,
    `task_id` VARCHAR(191) NOT NULL,
    `actor_id` VARCHAR(191) NOT NULL,
    `reason` TEXT NOT NULL,
    `previous_claimer_id` VARCHAR(191) NULL,
    `previous_claimer_name` VARCHAR(191) NULL,
    `previous_submission` TEXT NULL,
    `previous_submitted_at` DATETIME(3) NULL,
    `previous_due_at` DATETIME(3) NOT NULL,
    `new_due_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `v2_operational_task_reopens_task_id_created_at_idx`(`task_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `v2_operational_tasks_source_task_id_idx` ON `v2_operational_tasks`(`source_task_id`);

-- AddForeignKey
ALTER TABLE `v2_operational_tasks` ADD CONSTRAINT `v2_operational_tasks_source_task_id_fkey` FOREIGN KEY (`source_task_id`) REFERENCES `v2_operational_tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `v2_operational_task_reopens` ADD CONSTRAINT `v2_operational_task_reopens_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `v2_operational_tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


INSERT INTO `v2_permissions` (`id`, `code`, `name`, `module`, `description`, `updated_at`)
VALUES (UUID(), 'operational-task:manage', '管理运营任务', 'operational-task', '派发和复核运营任务与整改', CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE `code` = VALUES(`code`);
