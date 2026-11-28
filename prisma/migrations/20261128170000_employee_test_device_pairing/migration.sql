ALTER TABLE `v2_employee_test_access`
  ADD COLUMN `pairing_digest` CHAR(64) NULL,
  ADD COLUMN `pairing_expires_at` DATETIME(3) NULL,
  ADD COLUMN `device_digest` CHAR(64) NULL,
  ADD COLUMN `device_expires_at` DATETIME(3) NULL;
