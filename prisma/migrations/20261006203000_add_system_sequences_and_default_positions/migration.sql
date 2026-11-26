CREATE TABLE `v2_system_sequences` (
  `key` VARCHAR(80) NOT NULL,
  `current_value` INTEGER NOT NULL DEFAULT 0,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `v2_position_templates` (`id`,`name`,`code`,`description`,`sort`,`enabled`,`created_at`,`updated_at`) VALUES
('sys_pos_store_manager','门店店长','STORE_MANAGER','工资身份：门店店长，适用P0-P4薪资等级及店长绩效公式',10,true,'2026-10-06 00:00:00','2026-10-06 00:00:00'),
('sys_pos_store_partner','门店伙伴','STORE_PARTNER','工资身份：门店普通员工，适用普通员工工资与绩效公式',20,true,'2026-10-06 00:00:00','2026-10-06 00:00:00'),
('sys_pos_head_office','总部职能岗','HEAD_OFFICE','工资身份：总部办公室员工，适用总部薪资结构与绩效公式',30,true,'2026-10-06 00:00:00','2026-10-06 00:00:00');
