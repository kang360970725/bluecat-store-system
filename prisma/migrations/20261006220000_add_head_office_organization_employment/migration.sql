CREATE TABLE `v2_organization_positions` (
  `id` VARCHAR(191) NOT NULL, `organization_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL, `code` VARCHAR(191) NOT NULL, `description` TEXT NULL,
  `sort` INTEGER NOT NULL DEFAULT 0, `enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL, `updated_by` VARCHAR(191) NULL, `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `v2_organization_positions_organization_id_code_key`(`organization_id`,`code`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_organization_employments` (
  `id` VARCHAR(191) NOT NULL, `employee_id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NOT NULL, `position_id` VARCHAR(191) NOT NULL,
  `started_on` DATE NOT NULL, `ended_on` DATE NULL, `is_primary` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL, `updated_by` VARCHAR(191) NULL, `deleted_at` DATETIME(3) NULL,
  INDEX `v2_org_employment_employee_idx`(`employee_id`,`started_on`,`ended_on`),
  INDEX `v2_org_employment_unit_idx`(`organization_id`,`position_id`,`ended_on`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `v2_organization_positions` ADD CONSTRAINT `v2_org_positions_org_fkey` FOREIGN KEY (`organization_id`) REFERENCES `v2_organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_organization_employments` ADD CONSTRAINT `v2_org_employments_employee_fkey` FOREIGN KEY (`employee_id`) REFERENCES `v2_employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_organization_employments` ADD CONSTRAINT `v2_org_employments_org_fkey` FOREIGN KEY (`organization_id`) REFERENCES `v2_organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_organization_employments` ADD CONSTRAINT `v2_org_employments_position_fkey` FOREIGN KEY (`position_id`) REFERENCES `v2_organization_positions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT IGNORE INTO `v2_organization_positions` (`id`,`organization_id`,`name`,`code`,`description`,`sort`,`enabled`,`created_at`,`updated_at`)
SELECT 'hq_position_function',`id`,'总部职能岗','HEAD_OFFICE_FUNCTION','总部办公室人员通用岗位',10,true,NOW(3),NOW(3)
FROM `v2_organizations` WHERE `code`='BLUECAT_HQ' AND `deleted_at` IS NULL LIMIT 1;
