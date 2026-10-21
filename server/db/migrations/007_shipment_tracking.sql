-- Shiprocket delivery flow: the pickup address used, the courier label, the pickup
-- request, the courier's latest status (picked up, in transit, delivered…) and the
-- error of the last step that failed (e.g. no wallet balance for the courier).
ALTER TABLE shipments
  ADD COLUMN pickup_location     VARCHAR(120) NULL AFTER provider_shipment_id,
  ADD COLUMN label_url           VARCHAR(1000) NULL AFTER pickup_location,
  ADD COLUMN pickup_scheduled    VARCHAR(60) NULL AFTER label_url,
  ADD COLUMN tracking_status     VARCHAR(80) NULL AFTER pickup_scheduled,
  ADD COLUMN tracking_updated_at DATETIME(3) NULL AFTER tracking_status,
  ADD COLUMN expected_delivery   VARCHAR(40) NULL AFTER tracking_updated_at,
  ADD COLUMN last_error          VARCHAR(1000) NULL AFTER expected_delivery;
