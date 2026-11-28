CREATE TABLE `v2_employee_test_access` (
  `id` INTEGER NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT false,
  `store_id` VARCHAR(191) NOT NULL,
  `operator_account_id` VARCHAR(191) NOT NULL,
  `target_account_ids` JSON NOT NULL,
  `updated_by` VARCHAR(191) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
