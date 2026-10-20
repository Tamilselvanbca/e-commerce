-- Ingredients, shown under the description on the product page. The admin can
-- hide them per product without deleting the text.
ALTER TABLE products
  ADD COLUMN ingredients TEXT NULL AFTER description,
  ADD COLUMN show_ingredients BOOLEAN NOT NULL DEFAULT TRUE AFTER ingredients;
