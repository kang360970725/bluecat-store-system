-- AlterTable
ALTER TABLE `employee_schedules`
  ADD COLUMN `role` ENUM('CASHIER', 'FLOOR', 'FLEX') NOT NULL DEFAULT 'CASHIER';

ALTER TABLE `employee_schedules`
  ALTER COLUMN `role` DROP DEFAULT;

-- DropIndex
DROP INDEX `employee_schedules_store_id_employee_id_shift_id_work_date_key` ON `employee_schedules`;

-- CreateIndex
CREATE UNIQUE INDEX `employee_schedules_store_id_shift_id_work_date_role_key`
  ON `employee_schedules`(`store_id`, `shift_id`, `work_date`, `role`);
