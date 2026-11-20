ALTER TABLE `v2_product_display_categories`
  ADD COLUMN `excluded_from` DATE NULL;

UPDATE `v2_product_display_categories`
SET `excluded_from` = DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')
WHERE `excluded` = TRUE AND `excluded_from` IS NULL;
