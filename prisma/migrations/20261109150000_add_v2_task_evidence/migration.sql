-- CreateTable
CREATE TABLE `v2_operational_task_evidence` (
    `id` VARCHAR(191) NOT NULL,
    `task_id` VARCHAR(191) NOT NULL,
    `reopen_id` VARCHAR(191) NULL,
    `image` MEDIUMBLOB NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `v2_operational_task_evidence_task_id_reopen_id_idx`(`task_id`, `reopen_id`),
    INDEX `v2_operational_task_evidence_reopen_id_idx`(`reopen_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `v2_operational_task_evidence` ADD CONSTRAINT `v2_operational_task_evidence_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `v2_operational_tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `v2_operational_task_evidence` ADD CONSTRAINT `v2_operational_task_evidence_reopen_id_fkey` FOREIGN KEY (`reopen_id`) REFERENCES `v2_operational_task_reopens`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
