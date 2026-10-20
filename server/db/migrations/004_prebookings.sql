-- Pre-bookings: from the Pre-book page customers book products (also ones that
-- are out of stock) for a future date. No online payment; the admin confirms
-- the booking and follows up. `items` keeps a copy of each line (name, pack,
-- unit price at booking time), so later product changes don't alter it.
CREATE TABLE prebookings (
  id              CHAR(36) NOT NULL DEFAULT (UUID()),
  reference       VARCHAR(12) NOT NULL,
  user_id         CHAR(36),
  name            VARCHAR(120) NOT NULL,
  phone           VARCHAR(20) NOT NULL,
  email           VARCHAR(255),
  delivery_date   DATE NOT NULL,
  address         TEXT,
  notes           TEXT,
  items           JSON NOT NULL,
  estimated_total INT NOT NULL DEFAULT 0,
  status          VARCHAR(20) NOT NULL DEFAULT 'new',
  admin_notes     TEXT,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY prebookings_reference_key (reference),
  KEY prebookings_status_idx (status, delivery_date),
  CONSTRAINT prebookings_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT prebookings_status_check CHECK (status IN ('new', 'confirmed', 'ready', 'completed', 'cancelled'))
);
