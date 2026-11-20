-- CreateTable
CREATE TABLE `v2_operational_task_notifications` (
    `id` VARCHAR(191) NOT NULL,
    `task_id` VARCHAR(191) NOT NULL,
    `recipient_id` VARCHAR(191) NOT NULL,
    `kind` ENUM('SUBMITTED', 'COMPLETED', 'RETURNED') NOT NULL,
    `reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `read_at` DATETIME(3) NULL,

    INDEX `v2_task_notifications_recipient_idx`(`recipient_id`, `read_at`, `created_at`),
    INDEX `v2_operational_task_notifications_task_id_idx`(`task_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `v2_operational_task_notifications` ADD CONSTRAINT `v2_operational_task_notifications_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `v2_operational_tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

