CREATE TABLE `v2_external_store_candidates` (
  `id` VARCHAR(191) NOT NULL,
  `source_system` VARCHAR(64) NOT NULL DEFAULT 'X_MANAGER',
  `external_store_id` VARCHAR(64) NOT NULL,
  `external_branch_id` VARCHAR(128) NULL,
  `external_store_name` VARCHAR(191) NULL,
  `status` ENUM('PENDING', 'MATCHED', 'IGNORED') NOT NULL DEFAULT 'PENDING',
  `contract_version` VARCHAR(16) NULL,
  `quality_warnings` JSON NULL,
  `first_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reviewed_at` DATETIME(3) NULL,
  `reviewed_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `v2_external_store_candidate_source_key`(`source_system`, `external_store_id`),
  INDEX `v2_external_store_candidates_status_last_seen_at_idx`(`status`, `last_seen_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
