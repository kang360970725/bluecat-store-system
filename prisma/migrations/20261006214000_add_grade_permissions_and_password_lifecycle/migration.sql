ALTER TABLE `v2_accounts` ADD COLUMN `must_change_password` BOOLEAN NOT NULL DEFAULT false AFTER `password_hash`;
ALTER TABLE `v2_accounts` ALTER COLUMN `must_change_password` SET DEFAULT true;

INSERT IGNORE INTO `v2_permissions` (`id`,`code`,`name`,`module`,`description`,`created_at`,`updated_at`) VALUES
('emp_grade_view','employee.grade:view','查看职级与薪资标准','employee','查看P、M职级及对应的基础工资和绩效基数',NOW(3),NOW(3)),
('emp_grade_update','employee.grade:update','维护职级与薪资标准','employee','新增和维护P、M职级薪资标准',NOW(3),NOW(3));

INSERT IGNORE INTO `v2_roles` (`id`,`name`,`code`,`description`,`enabled`,`created_at`,`updated_at`) VALUES
('role_store_manager_default','门店店长','store_manager','仅管理本人任职门店的员工与基础运营数据',true,NOW(3),NOW(3)),
('role_store_staff_default','门店员工','store_staff','门店普通员工基础账号',true,NOW(3),NOW(3));

INSERT IGNORE INTO `v2_role_permissions` (`role_id`,`permission_id`,`created_at`)
SELECT 'role_store_manager_default',`id`,NOW(3) FROM `v2_permissions`
WHERE `code` IN ('store:view','employee:view','employee:create','employee:update','position:view');
