-- The spot the customer pinned on the map when saving an address (optional),
-- copied into the order's shipping address so the courier can find the door.
ALTER TABLE addresses
  ADD COLUMN latitude  DECIMAL(9, 6) NULL AFTER country,
  ADD COLUMN longitude DECIMAL(9, 6) NULL AFTER latitude;
