CREATE TABLE `v2_shift_templates` (
  `id` VARCHAR(191) NOT NULL, `name` VARCHAR(191) NOT NULL, `code` VARCHAR(191) NOT NULL,
  `starts_at` VARCHAR(5) NOT NULL, `ends_at` VARCHAR(5) NOT NULL, `spans_next_day` BOOLEAN NOT NULL DEFAULT false,
  `sort` INTEGER NOT NULL DEFAULT 0, `enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL, `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `v2_shift_templates_code_key`(`code`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_store_shifts` (
  `id` VARCHAR(191) NOT NULL, `store_id` VARCHAR(191) NOT NULL, `template_id` VARCHAR(191) NULL,
  `name` VARCHAR(191) NOT NULL, `code` VARCHAR(191) NOT NULL, `starts_at` VARCHAR(5) NOT NULL, `ends_at` VARCHAR(5) NOT NULL,
  `spans_next_day` BOOLEAN NOT NULL DEFAULT false, `sort` INTEGER NOT NULL DEFAULT 0, `enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL, `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `v2_store_shifts_store_id_code_key`(`store_id`, `code`),
  UNIQUE INDEX `v2_store_shifts_store_id_template_id_key`(`store_id`, `template_id`),
  INDEX `v2_store_shifts_store_id_sort_idx`(`store_id`, `sort`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_schedule_periods` (
  `id` VARCHAR(191) NOT NULL, `store_id` VARCHAR(191) NOT NULL, `starts_on` DATE NOT NULL, `ends_on` DATE NOT NULL,
  `status` ENUM('DRAFT','PUBLISHED','LOCKED') NOT NULL DEFAULT 'DRAFT', `published_at` DATETIME(3) NULL, `locked_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL, `updated_by` VARCHAR(191) NULL,
  UNIQUE INDEX `v2_schedule_periods_store_id_starts_on_ends_on_key`(`store_id`, `starts_on`, `ends_on`),
  INDEX `v2_schedule_periods_store_id_status_starts_on_idx`(`store_id`, `status`, `starts_on`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_schedule_assignments` (
  `id` VARCHAR(191) NOT NULL, `period_id` VARCHAR(191) NOT NULL, `work_date` DATE NOT NULL,
  `shift_id` VARCHAR(191) NOT NULL, `employee_id` VARCHAR(191) NOT NULL, `position_id` VARCHAR(191) NOT NULL,
  `locked_at` DATETIME(3) NULL, `note` TEXT NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL, `created_by` VARCHAR(191) NULL, `updated_by` VARCHAR(191) NULL,
  UNIQUE INDEX `v2_schedule_assignment_slot_key`(`period_id`, `work_date`, `shift_id`, `employee_id`),
  INDEX `v2_schedule_assignments_employee_id_work_date_idx`(`employee_id`, `work_date`),
  INDEX `v2_schedule_assignments_shift_id_work_date_idx`(`shift_id`, `work_date`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_score_plans` (
  `id` VARCHAR(191) NOT NULL, `name` VARCHAR(191) NOT NULL, `code` VARCHAR(191) NOT NULL, `version` INTEGER NOT NULL,
  `description` TEXT NULL, `enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `v2_score_plans_code_version_key`(`code`, `version`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_score_criteria` (
  `id` VARCHAR(191) NOT NULL, `plan_id` VARCHAR(191) NOT NULL, `name` VARCHAR(191) NOT NULL, `code` VARCHAR(191) NOT NULL,
  `weight` DECIMAL(7,4) NOT NULL, `max_score` DECIMAL(8,2) NOT NULL, `description` TEXT NULL, `sort` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `v2_score_criteria_plan_id_code_key`(`plan_id`, `code`), INDEX `v2_score_criteria_plan_id_sort_idx`(`plan_id`, `sort`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_employee_scores` (
  `id` VARCHAR(191) NOT NULL, `employee_id` VARCHAR(191) NOT NULL, `store_id` VARCHAR(191) NOT NULL, `plan_id` VARCHAR(191) NOT NULL,
  `period_month` DATE NOT NULL, `total_score` DECIMAL(8,2) NOT NULL, `level` VARCHAR(191) NULL, `detail` JSON NOT NULL,
  `status` ENUM('DRAFT','CONFIRMED') NOT NULL DEFAULT 'DRAFT', `confirmed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL, `updated_by` VARCHAR(191) NULL,
  UNIQUE INDEX `v2_employee_scores_employee_id_plan_id_period_month_key`(`employee_id`, `plan_id`, `period_month`),
  INDEX `v2_employee_scores_store_id_period_month_total_score_idx`(`store_id`, `period_month`, `total_score`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_operating_targets` (
  `id` VARCHAR(191) NOT NULL, `store_id` VARCHAR(191) NOT NULL, `target_month` DATE NOT NULL,
  `revenue_target` DECIMAL(14,2) NOT NULL, `profit_target` DECIMAL(14,2) NULL,
  `status` ENUM('DRAFT','PUBLISHED','LOCKED') NOT NULL DEFAULT 'DRAFT', `rule_version` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL, `updated_by` VARCHAR(191) NULL,
  UNIQUE INDEX `v2_operating_targets_store_id_target_month_key`(`store_id`, `target_month`),
  INDEX `v2_operating_targets_target_month_status_idx`(`target_month`, `status`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_target_allocations` (
  `id` VARCHAR(191) NOT NULL, `target_id` VARCHAR(191) NOT NULL, `business_date` DATE NOT NULL, `shift_id` VARCHAR(191) NULL,
  `category` VARCHAR(191) NOT NULL, `target_amount` DECIMAL(14,2) NOT NULL, `actual_amount` DECIMAL(14,2) NULL,
  `locked_at` DATETIME(3) NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `v2_target_allocation_slot_key`(`target_id`, `business_date`, `shift_id`, `category`),
  INDEX `v2_target_allocations_business_date_shift_id_idx`(`business_date`, `shift_id`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_data_source_connections` (
  `id` VARCHAR(191) NOT NULL, `store_id` VARCHAR(191) NOT NULL, `source_system` VARCHAR(191) NOT NULL DEFAULT 'X_MANAGER',
  `external_store_id` VARCHAR(191) NOT NULL, `external_store_name` VARCHAR(191) NULL, `enabled_modules` JSON NOT NULL,
  `session_status` ENUM('UNCONFIGURED','VALID','EXPIRED','ERROR') NOT NULL DEFAULT 'UNCONFIGURED',
  `last_checked_at` DATETIME(3) NULL, `last_succeeded_at` DATETIME(3) NULL, `last_error` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL, `updated_by` VARCHAR(191) NULL,
  UNIQUE INDEX `v2_data_source_connections_store_id_key`(`store_id`),
  UNIQUE INDEX `v2_data_source_connections_source_system_external_store_id_key`(`source_system`, `external_store_id`),
  INDEX `v2_data_source_connections_session_status_idx`(`session_status`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_sync_jobs` (
  `id` VARCHAR(191) NOT NULL, `connection_id` VARCHAR(191) NOT NULL, `module` VARCHAR(191) NOT NULL,
  `business_start_at` DATETIME(3) NOT NULL, `business_end_at` DATETIME(3) NOT NULL,
  `status` ENUM('PENDING','RUNNING','SUCCEEDED','FAILED') NOT NULL DEFAULT 'PENDING', `attempt_count` INTEGER NOT NULL DEFAULT 0,
  `ingest_batch_id` VARCHAR(191) NULL, `error_reason` TEXT NULL, `started_at` DATETIME(3) NULL, `finished_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL, `created_by` VARCHAR(191) NULL,
  INDEX `v2_sync_jobs_connection_id_status_created_at_idx`(`connection_id`, `status`, `created_at`),
  INDEX `v2_sync_jobs_module_business_start_at_business_end_at_idx`(`module`, `business_start_at`, `business_end_at`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `v2_store_shifts` ADD CONSTRAINT `v2_store_shifts_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_store_shifts` ADD CONSTRAINT `v2_store_shifts_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `v2_shift_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `v2_schedule_periods` ADD CONSTRAINT `v2_schedule_periods_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_schedule_assignments` ADD CONSTRAINT `v2_schedule_assignments_period_id_fkey` FOREIGN KEY (`period_id`) REFERENCES `v2_schedule_periods`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `v2_schedule_assignments` ADD CONSTRAINT `v2_schedule_assignments_shift_id_fkey` FOREIGN KEY (`shift_id`) REFERENCES `v2_store_shifts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_schedule_assignments` ADD CONSTRAINT `v2_schedule_assignments_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `v2_employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_schedule_assignments` ADD CONSTRAINT `v2_schedule_assignments_position_id_fkey` FOREIGN KEY (`position_id`) REFERENCES `v2_store_positions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_score_criteria` ADD CONSTRAINT `v2_score_criteria_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `v2_score_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `v2_employee_scores` ADD CONSTRAINT `v2_employee_scores_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `v2_employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_employee_scores` ADD CONSTRAINT `v2_employee_scores_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_employee_scores` ADD CONSTRAINT `v2_employee_scores_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `v2_score_plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_operating_targets` ADD CONSTRAINT `v2_operating_targets_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_target_allocations` ADD CONSTRAINT `v2_target_allocations_target_id_fkey` FOREIGN KEY (`target_id`) REFERENCES `v2_operating_targets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `v2_target_allocations` ADD CONSTRAINT `v2_target_allocations_shift_id_fkey` FOREIGN KEY (`shift_id`) REFERENCES `v2_store_shifts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `v2_data_source_connections` ADD CONSTRAINT `v2_data_source_connections_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_sync_jobs` ADD CONSTRAINT `v2_sync_jobs_connection_id_fkey` FOREIGN KEY (`connection_id`) REFERENCES `v2_data_source_connections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
