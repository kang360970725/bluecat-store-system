ALTER TABLE `store_performance_targets`
  ADD COLUMN `drink_target` DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN `meal_target` DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN `other_target` DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN `target_mode` ENUM('MANUAL','ABSOLUTE_PROFIT','HISTORICAL_GROWTH') NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN `target_profit` DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN `profit_growth_rate` DECIMAL(7,4) NULL,
  ADD COLUMN `total_cost_budget` DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN `expected_visits` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `management_fee_rate` DECIMAL(7,4) NOT NULL DEFAULT 0.09;

ALTER TABLE `store_performance_split_plans`
  ADD COLUMN `shift_mode` INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN `last_rebalanced_at` DATETIME(3) NULL;

ALTER TABLE `store_performance_split_items`
  ADD COLUMN `allocation_weight` DECIMAL(7,3) NOT NULL DEFAULT 1,
  ADD COLUMN `locked_at` DATETIME(3) NULL;
