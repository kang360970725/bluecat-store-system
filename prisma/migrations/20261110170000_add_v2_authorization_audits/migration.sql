-- CreateTable
CREATE TABLE `v2_authorization_audits` (
    `id` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `subject_id` VARCHAR(191) NOT NULL,
    `subject_name` VARCHAR(191) NOT NULL,
    `actor_id` VARCHAR(191) NOT NULL,
    `before` JSON NULL,
    `after` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `v2_authorization_audits_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
