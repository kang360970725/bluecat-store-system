INSERT IGNORE INTO `v2_roles` (`id`,`name`,`code`,`description`,`enabled`,`created_at`,`updated_at`) VALUES
('fin_role_operator','工资核算岗','finance_payroll_operator','创建批次、维护基础数据并执行工资计算，不含复核审批权限',true,'2026-10-06 00:00:00','2026-10-06 00:00:00'),
('fin_role_reviewer','工资复核岗','finance_payroll_reviewer','复核工资计算结果，不含计算及审批权限',true,'2026-10-06 00:00:00','2026-10-06 00:00:00'),
('fin_role_approver','工资审批岗','finance_payroll_approver','批准并锁定已复核工资，不含计算及复核权限',true,'2026-10-06 00:00:00','2026-10-06 00:00:00'),
('fin_role_cashier','工资出纳岗','finance_payroll_cashier','查看已锁定工资并确认发放，不含计算复核审批权限',true,'2026-10-06 00:00:00','2026-10-06 00:00:00');

INSERT IGNORE INTO `v2_role_permissions` (`role_id`,`permission_id`,`created_at`)
SELECT 'fin_role_operator', `id`, '2026-10-06 00:00:00' FROM `v2_permissions`
WHERE `code` IN ('finance.payroll:view_summary','finance.payroll:view_sensitive','finance.payroll:view_all_stores','finance.payroll:manage','finance.payroll:edit_inputs','finance.payroll:calculate','finance.payroll:export','finance.payroll:audit');

INSERT IGNORE INTO `v2_role_permissions` (`role_id`,`permission_id`,`created_at`)
SELECT 'fin_role_reviewer', `id`, '2026-10-06 00:00:00' FROM `v2_permissions`
WHERE `code` IN ('finance.payroll:view_summary','finance.payroll:view_sensitive','finance.payroll:view_all_stores','finance.payroll:review','finance.payroll:export','finance.payroll:audit');

INSERT IGNORE INTO `v2_role_permissions` (`role_id`,`permission_id`,`created_at`)
SELECT 'fin_role_approver', `id`, '2026-10-06 00:00:00' FROM `v2_permissions`
WHERE `code` IN ('finance.payroll:view_summary','finance.payroll:view_sensitive','finance.payroll:view_all_stores','finance.payroll:approve','finance.payroll:lock','finance.payroll:export','finance.payroll:audit');

INSERT IGNORE INTO `v2_role_permissions` (`role_id`,`permission_id`,`created_at`)
SELECT 'fin_role_cashier', `id`, '2026-10-06 00:00:00' FROM `v2_permissions`
WHERE `code` IN ('finance.payroll:view_summary','finance.payroll:view_sensitive','finance.payroll:view_all_stores','finance.payroll:pay','finance.payroll:export','finance.payroll:audit');
