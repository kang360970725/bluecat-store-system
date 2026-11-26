CREATE TABLE `v2_payroll_profile_templates` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(60) NOT NULL,
  `employee_type` VARCHAR(24) NOT NULL,
  `position_keyword` VARCHAR(40) NULL,
  `grade` VARCHAR(12) NULL,
  `category` VARCHAR(12) NULL,
  `probationary` BOOLEAN NOT NULL DEFAULT false,
  `is_default` BOOLEAN NOT NULL DEFAULT false,
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
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `sort` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL,
  `updated_by` VARCHAR(191) NULL,
  UNIQUE INDEX `v2_payroll_profile_templates_code_key`(`code`),
  INDEX `v2_pay_template_match_idx`(`employee_type`, `grade`, `category`, `enabled`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `v2_payroll_profile_templates` (`id`,`name`,`code`,`employee_type`,`position_keyword`,`grade`,`category`,`is_default`,`base_salary`,`performance_base`,`sort`,`updated_at`) VALUES
('tpl_staff_front','门店伙伴-前台','STAFF_FRONT','STORE_STAFF','前台',NULL,NULL,true,1500,1200,10,NOW(3)),
('tpl_staff_field','门店伙伴-外场','STAFF_FIELD','STORE_STAFF','外场',NULL,NULL,false,1500,1200,11,NOW(3)),
('tpl_staff_service','门店伙伴-客服','STAFF_SERVICE','STORE_STAFF','客服',NULL,NULL,false,1500,1200,12,NOW(3)),
('tpl_staff_bar','门店伙伴-吧员','STAFF_BAR','STORE_STAFF','吧员',NULL,NULL,false,1800,1200,13,NOW(3)),
('tpl_staff_mobile','门店伙伴-机动岗','STAFF_MOBILE','STORE_STAFF','机动岗',NULL,NULL,false,1800,1200,14,NOW(3)),
('tpl_staff_cook','门店伙伴-厨师','STAFF_COOK','STORE_STAFF','厨师',NULL,NULL,false,1400,1900,15,NOW(3)),
('tpl_staff_cleaner','门店伙伴-保洁','STAFF_CLEANER','STORE_STAFF','保洁',NULL,NULL,false,1400,1900,16,NOW(3)),
('tpl_manager_p0','店长-P0','MANAGER_P0','STORE_MANAGER',NULL,'P0',NULL,true,2000,4000,20,NOW(3)),
('tpl_manager_p1','店长-P1','MANAGER_P1','STORE_MANAGER',NULL,'P1',NULL,false,2400,4600,21,NOW(3)),
('tpl_manager_p2','店长-P2','MANAGER_P2','STORE_MANAGER',NULL,'P2',NULL,false,3000,5200,22,NOW(3)),
('tpl_manager_p3','店长-P3','MANAGER_P3','STORE_MANAGER',NULL,'P3',NULL,false,3400,5700,23,NOW(3)),
('tpl_manager_p4','店长-P4','MANAGER_P4','STORE_MANAGER',NULL,'P4',NULL,false,4100,6750,24,NOW(3));

INSERT INTO `v2_payroll_profile_templates` (`id`,`name`,`code`,`employee_type`,`grade`,`category`,`is_default`,`base_salary`,`performance_base`,`sort`,`updated_at`)
SELECT CONCAT('tpl_hq_',LOWER(g.grade),'_',c.category_code), CONCAT('总部-',g.grade,'-',c.category_name), CONCAT('HQ_',g.grade,'_',c.category_code), 'HEAD_OFFICE', g.grade, c.category_name, IF(g.grade='M0' AND c.category_name='三类',true,false), g.base_salary,
  CASE c.category_name WHEN '一类' THEN g.performance_1 WHEN '二类' THEN g.performance_2 ELSE g.performance_3 END,
  100 + g.sort_no * 3 + c.sort_no, NOW(3)
FROM (
  SELECT 'M0' grade,2000 base_salary,3000 performance_1,2000 performance_2,1680 performance_3,0 sort_no UNION ALL
  SELECT 'M1',2500,3500,2600,2300,1 UNION ALL SELECT 'M2',3000,4500,3700,3150,2 UNION ALL
  SELECT 'M3',3500,6600,6300,5000,3 UNION ALL SELECT 'M4',4000,8200,7700,7000,4 UNION ALL
  SELECT 'M5',5000,10000,9000,8000,5 UNION ALL SELECT 'M6',7000,12000,10000,9000,6
) g CROSS JOIN (
  SELECT '一类' category_name,'C1' category_code,1 sort_no UNION ALL SELECT '二类','C2',2 UNION ALL SELECT '三类','C3',3
) c;
