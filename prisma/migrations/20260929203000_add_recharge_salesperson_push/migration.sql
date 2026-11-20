ALTER TABLE `v2_recharge_contest_entries`
  ADD COLUMN `salesperson_name` VARCHAR(128) NULL,
  ADD COLUMN `salesperson_bound_at` DATETIME(3) NULL,
  ADD COLUMN `salesperson_bound_by` VARCHAR(191) NULL;

CREATE TABLE `v2_recharge_contest_push_runs` (
  `id` VARCHAR(191) NOT NULL,
  `contest_id` VARCHAR(191) NOT NULL,
  `config_id` VARCHAR(191) NOT NULL,
  `push_key` VARCHAR(32) NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'PROCESSING',
  `image_bytes` INTEGER NULL,
  `error_reason` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `sent_at` DATETIME(3) NULL,
  UNIQUE INDEX `v2_recharge_contest_push_key`(`contest_id`, `config_id`, `push_key`),
  INDEX `v2_recharge_contest_push_runs_contest_id_created_at_idx`(`contest_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `v2_recharge_contest_push_runs` ADD CONSTRAINT `v2_recharge_contest_push_runs_contest_id_fkey` FOREIGN KEY (`contest_id`) REFERENCES `v2_recharge_contests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
