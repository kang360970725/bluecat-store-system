CREATE TABLE `v2_employee_payroll_profiles` (
  `id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NOT NULL,
  `employee_type` VARCHAR(24) NOT NULL,
  `grade` VARCHAR(12) NULL,
  `category` VARCHAR(12) NULL,
  `probationary` BOOLEAN NOT NULL DEFAULT false,
  `base_salary` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `performance_base` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `social_security_scheme` VARCHAR(24) NULL,
  `social_security_subsidy` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `rank_allowance` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `meal_allowance_rate` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `makeup_allowance` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `employee_insurance` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `employee_provident_fund` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `employer_insurance` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `employer_provident_fund` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NULL,
  `reason` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL,
  `updated_by` VARCHAR(191) NULL,
  INDEX `v2_emp_pay_profile_effective_idx` (`employee_id`,`effective_from`,`effective_to`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `v2_employee_payroll_profiles`
  ADD CONSTRAINT `v2_employee_payroll_profiles_employee_id_fkey`
  FOREIGN KEY (`employee_id`) REFERENCES `v2_employees`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT IGNORE INTO `v2_permissions` (`id`,`code`,`name`,`module`,`description`,`created_at`,`updated_at`) VALUES
('emp_pay_profile_view','employee.payroll:view','查看员工薪资档案','employee','查看员工薪资身份、工资标准和社保公积金参数','2026-10-06 00:00:00','2026-10-06 00:00:00'),
('emp_pay_profile_edit','employee.payroll:update','维护员工薪资档案','employee','新增带生效日期的员工薪资档案版本','2026-10-06 00:00:00','2026-10-06 00:00:00');

INSERT IGNORE INTO `v2_role_permissions` (`role_id`,`permission_id`,`created_at`)
SELECT 'fin_role_operator', `id`, '2026-10-06 00:00:00' FROM `v2_permissions`
WHERE `code` IN ('employee.payroll:view','store:view','employee:view');

INSERT IGNORE INTO `v2_role_permissions` (`role_id`,`permission_id`,`created_at`)
SELECT `role`.`id`, `permission`.`id`, '2026-10-06 00:00:00'
FROM `v2_roles` AS `role`
JOIN `v2_permissions` AS `permission` ON `permission`.`code` IN ('store:view','employee:view')
WHERE `role`.`code` IN ('finance_payroll_reviewer','finance_payroll_approver','finance_payroll_cashier');
