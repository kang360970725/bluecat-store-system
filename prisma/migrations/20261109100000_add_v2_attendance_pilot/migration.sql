-- CreateTable
CREATE TABLE `v2_attendance_terminals` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `secret_hash` CHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(191) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `revoked_by` VARCHAR(191) NULL,

    UNIQUE INDEX `v2_attendance_terminals_secret_hash_key`(`secret_hash`),
    INDEX `v2_attendance_terminals_store_id_idx`(`store_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `v2_attendance_wechat_bindings` (
    `account_id` VARCHAR(191) NOT NULL,
    `subject` CHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `v2_attendance_wechat_bindings_subject_key`(`subject`),
    PRIMARY KEY (`account_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `v2_attendance_punches` (
    `id` VARCHAR(191) NOT NULL,
    `assignment_id` VARCHAR(191) NOT NULL,
    `terminal_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `work_date` DATE NOT NULL,
    `punched_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `v2_attendance_punches_assignment_id_key`(`assignment_id`),
    INDEX `v2_attendance_punches_store_id_work_date_idx`(`store_id`, `work_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `v2_attendance_terminals` ADD CONSTRAINT `v2_attendance_terminals_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `v2_attendance_wechat_bindings` ADD CONSTRAINT `v2_attendance_wechat_bindings_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `v2_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `v2_attendance_punches` ADD CONSTRAINT `v2_attendance_punches_assignment_id_fkey` FOREIGN KEY (`assignment_id`) REFERENCES `v2_schedule_assignments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
