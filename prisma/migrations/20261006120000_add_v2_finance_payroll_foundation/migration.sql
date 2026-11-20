CREATE TABLE `v2_payroll_batches` (
  `id` VARCHAR(191) NOT NULL, `payroll_month` DATE NOT NULL,
  `status` ENUM('DRAFT','CALCULATED','PENDING_REVIEW','REVIEWED','APPROVED','LOCKED','PAID','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `formula_version` VARCHAR(40) NOT NULL, `calculated_at` DATETIME(3) NULL, `calculated_by` VARCHAR(191) NULL,
  `reviewed_at` DATETIME(3) NULL, `reviewed_by` VARCHAR(191) NULL, `approved_at` DATETIME(3) NULL, `approved_by` VARCHAR(191) NULL,
  `locked_at` DATETIME(3) NULL, `locked_by` VARCHAR(191) NULL, `paid_at` DATETIME(3) NULL, `paid_by` VARCHAR(191) NULL,
  `notes` TEXT NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL, `updated_by` VARCHAR(191) NULL,
  UNIQUE INDEX `v2_payroll_batches_payroll_month_key` (`payroll_month`), INDEX `v2_payroll_batches_status_payroll_month_idx` (`status`,`payroll_month`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_payroll_store_profits` (
  `id` VARCHAR(191) NOT NULL, `batch_id` VARCHAR(191) NOT NULL, `store_id` VARCHAR(191) NOT NULL,
  `target_profit` DECIMAL(14,2) NOT NULL, `actual_profit` DECIMAL(14,2) NOT NULL, `achievement_rate` DECIMAL(10,6) NOT NULL,
  `excess_profit` DECIMAL(14,2) NOT NULL, `bonus_pool` DECIMAL(14,2) NOT NULL, `included_in_head_office` BOOLEAN NOT NULL DEFAULT true,
  `exclusion_reason` VARCHAR(500) NULL, `exclusion_confirmed_by` VARCHAR(191) NULL, `exclusion_confirmed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL, `created_by` VARCHAR(191) NULL, `updated_by` VARCHAR(191) NULL,
  UNIQUE INDEX `v2_payroll_store_profits_batch_id_store_id_key` (`batch_id`,`store_id`), INDEX `v2_payroll_store_profits_store_id_batch_id_idx` (`store_id`,`batch_id`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_payroll_employee_results` (
  `id` VARCHAR(191) NOT NULL, `batch_id` VARCHAR(191) NOT NULL, `employee_id` VARCHAR(191) NOT NULL, `store_id` VARCHAR(191) NULL,
  `employee_type` VARCHAR(24) NOT NULL, `formula_version` VARCHAR(40) NOT NULL, `input_snapshot` JSON NOT NULL, `calculation_breakdown` JSON NOT NULL,
  `gross_pay` DECIMAL(14,2) NOT NULL, `employee_deductions` DECIMAL(14,2) NOT NULL, `net_pay` DECIMAL(14,2) NOT NULL,
  `employer_contributions` DECIMAL(14,2) NOT NULL, `employer_cost` DECIMAL(14,2) NOT NULL,
  `attendance_qualified` BOOLEAN NOT NULL DEFAULT false, `attendance_override` BOOLEAN NULL, `attendance_override_reason` VARCHAR(500) NULL,
  `attendance_override_by` VARCHAR(191) NULL, `attendance_override_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `v2_payroll_employee_results_batch_id_employee_id_key` (`batch_id`,`employee_id`),
  INDEX `v2_payroll_employee_results_batch_id_store_id_idx` (`batch_id`,`store_id`), INDEX `v2_payroll_employee_results_employee_id_batch_id_idx` (`employee_id`,`batch_id`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_payroll_adjustments` (
  `id` VARCHAR(191) NOT NULL, `batch_id` VARCHAR(191) NOT NULL, `employee_id` VARCHAR(191) NOT NULL, `store_id` VARCHAR(191) NULL,
  `item_code` VARCHAR(40) NOT NULL, `item_name` VARCHAR(80) NOT NULL, `direction` ENUM('EARNING','DEDUCTION') NOT NULL,
  `amount` DECIMAL(14,2) NOT NULL, `taxable` BOOLEAN NOT NULL DEFAULT true, `reason` VARCHAR(500) NOT NULL,
  `status` ENUM('DRAFT','APPROVED','REJECTED') NOT NULL DEFAULT 'DRAFT', `approved_at` DATETIME(3) NULL, `approved_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL, `created_by` VARCHAR(191) NULL, `updated_by` VARCHAR(191) NULL,
  INDEX `v2_payroll_adjustments_batch_id_employee_id_status_idx` (`batch_id`,`employee_id`,`status`), INDEX `v2_payroll_adjustments_store_id_batch_id_idx` (`store_id`,`batch_id`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_payroll_audit_logs` (
  `id` VARCHAR(191) NOT NULL, `batch_id` VARCHAR(191) NOT NULL, `action` VARCHAR(60) NOT NULL, `entity_type` VARCHAR(40) NOT NULL,
  `entity_id` VARCHAR(191) NULL, `before_data` JSON NULL, `after_data` JSON NULL, `reason` VARCHAR(500) NULL,
  `actor_id` VARCHAR(191) NOT NULL, `actor_name` VARCHAR(191) NOT NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `v2_payroll_audit_logs_batch_id_created_at_idx` (`batch_id`,`created_at`), INDEX `v2_payroll_audit_logs_actor_id_created_at_idx` (`actor_id`,`created_at`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `v2_payroll_store_profits` ADD CONSTRAINT `v2_payroll_store_profits_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `v2_payroll_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `v2_payroll_store_profits` ADD CONSTRAINT `v2_payroll_store_profits_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_payroll_employee_results` ADD CONSTRAINT `v2_payroll_employee_results_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `v2_payroll_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `v2_payroll_employee_results` ADD CONSTRAINT `v2_payroll_employee_results_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `v2_employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_payroll_adjustments` ADD CONSTRAINT `v2_payroll_adjustments_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `v2_payroll_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `v2_payroll_adjustments` ADD CONSTRAINT `v2_payroll_adjustments_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `v2_employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_payroll_audit_logs` ADD CONSTRAINT `v2_payroll_audit_logs_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `v2_payroll_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

INSERT IGNORE INTO `v2_permissions` (`id`,`code`,`name`,`module`,`description`,`created_at`,`updated_at`) VALUES
('fin_pay_view_sum','finance.payroll:view_summary','查看工资汇总','finance','仅查看授权门店的工资汇总','2026-10-06 00:00:00','2026-10-06 00:00:00'),
('fin_pay_view_sec','finance.payroll:view_sensitive','查看个人工资明细','finance','查看个人工资、扣款和实发明细','2026-10-06 00:00:00','2026-10-06 00:00:00'),
('fin_pay_view_all','finance.payroll:view_all_stores','查看全部门店工资','finance','突破账号门店范围查看全部门店工资','2026-10-06 00:00:00','2026-10-06 00:00:00'),
('fin_pay_manage','finance.payroll:manage','管理工资批次','finance','创建和取消工资批次','2026-10-06 00:00:00','2026-10-06 00:00:00'),
('fin_pay_inputs','finance.payroll:edit_inputs','编辑工资基础数据','finance','编辑利润、考勤和工资输入','2026-10-06 00:00:00','2026-10-06 00:00:00'),
('fin_pay_calc','finance.payroll:calculate','执行工资计算','finance','计算或退回工资批次','2026-10-06 00:00:00','2026-10-06 00:00:00'),
('fin_pay_review','finance.payroll:review','复核工资','finance','提交和完成工资复核','2026-10-06 00:00:00','2026-10-06 00:00:00'),
('fin_pay_approve','finance.payroll:approve','审批工资','finance','最终审批工资批次','2026-10-06 00:00:00','2026-10-06 00:00:00'),
('fin_pay_lock','finance.payroll:lock','锁定工资','finance','锁定已审批工资','2026-10-06 00:00:00','2026-10-06 00:00:00'),
('fin_pay_pay','finance.payroll:pay','确认工资发放','finance','确认工资已经发放','2026-10-06 00:00:00','2026-10-06 00:00:00'),
('fin_pay_export','finance.payroll:export','导出工资','finance','导出敏感工资数据','2026-10-06 00:00:00','2026-10-06 00:00:00'),
('fin_pay_audit','finance.payroll:audit','查看工资审计日志','finance','查看工资数据变更记录','2026-10-06 00:00:00','2026-10-06 00:00:00');
