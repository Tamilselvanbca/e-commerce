-- Coupon codes the admin marks "show in offers" are listed to customers (cart,
-- checkout and product pages) with an Apply button. Codes stay private unless
-- marked; automatic offers (no code) are always listed.
ALTER TABLE discounts
  ADD COLUMN show_in_offers BOOLEAN NOT NULL DEFAULT FALSE AFTER first_order_only;
