-- Initial schema. All money values are stored as integers in the smallest
-- currency unit (paise for INR) to avoid floating point rounding issues.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Users & authentication
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         text NOT NULL UNIQUE,              -- E.164, e.g. +919876543210
  name          text,
  email         text,
  role          text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  is_blocked    boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_email_idx ON users (lower(email));
CREATE INDEX users_created_at_idx ON users (created_at DESC);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE otp_codes (
  id          bigserial PRIMARY KEY,
  phone       text NOT NULL,
  code_hash   text NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_codes_phone_idx ON otp_codes (phone, created_at DESC);

CREATE TABLE sessions (
  token_hash   text PRIMARY KEY,                    -- sha256 of the cookie value
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL,
  user_agent   text,
  ip           text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  description text,
  image_url   text,
  parent_id   uuid REFERENCES categories (id) ON DELETE SET NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX categories_parent_idx ON categories (parent_id);
CREATE TRIGGER categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  category_id uuid REFERENCES categories (id) ON DELETE SET NULL,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  is_featured boolean NOT NULL DEFAULT false,
  search      tsvector GENERATED ALWAYS AS (
                setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
                setweight(to_tsvector('english', coalesce(description, '')), 'B')
              ) STORED,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_category_idx ON products (category_id);
CREATE INDEX products_status_idx ON products (status, created_at DESC);
CREATE INDEX products_search_idx ON products USING gin (search);
CREATE TRIGGER products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE product_variants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  sku              text NOT NULL UNIQUE,
  size             text,
  color            text,
  color_hex        text,
  price            integer NOT NULL CHECK (price > 0),
  compare_at_price integer CHECK (compare_at_price IS NULL OR compare_at_price > 0),
  stock            integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_active        boolean NOT NULL DEFAULT true,
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_variants_product_idx ON product_variants (product_id);
-- One active variant per size/colour combination (retired variants are kept for order history).
CREATE UNIQUE INDEX product_variants_option_uniq
  ON product_variants (product_id, coalesce(size, ''), coalesce(color, '')) WHERE is_active;
CREATE TRIGGER product_variants_updated_at BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE product_images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  url         text NOT NULL,
  storage_key text,
  alt         text,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_images_product_idx ON product_images (product_id, sort_order);

-- ---------------------------------------------------------------------------
-- Cart & addresses
-- ---------------------------------------------------------------------------
CREATE TABLE carts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid UNIQUE REFERENCES users (id) ON DELETE CASCADE,  -- NULL for guest carts
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER carts_updated_at BEFORE UPDATE ON carts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE cart_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id    uuid NOT NULL REFERENCES carts (id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variants (id) ON DELETE CASCADE,
  quantity   integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, variant_id)
);

CREATE TABLE addresses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  full_name  text NOT NULL,
  phone      text NOT NULL,
  line1      text NOT NULL,
  line2      text,
  landmark   text,
  city       text NOT NULL,
  state      text NOT NULL,
  pincode    text NOT NULL,
  country    text NOT NULL DEFAULT 'IN',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX addresses_user_idx ON addresses (user_id);
CREATE UNIQUE INDEX addresses_one_default ON addresses (user_id) WHERE is_default;
CREATE TRIGGER addresses_updated_at BEFORE UPDATE ON addresses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Orders, payments, shipments
-- ---------------------------------------------------------------------------
CREATE TABLE orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number     text NOT NULL UNIQUE,
  user_id          uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  payment_status   text NOT NULL DEFAULT 'pending'
                     CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  payment_gateway  text,
  currency         text NOT NULL DEFAULT 'INR',
  subtotal         integer NOT NULL CHECK (subtotal >= 0),
  shipping_fee     integer NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0),
  discount         integer NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total            integer NOT NULL CHECK (total >= 0),
  email            text,
  phone            text,
  shipping_address jsonb NOT NULL,
  notes            text,
  expires_at       timestamptz,             -- unpaid orders are cancelled after this
  paid_at          timestamptz,
  cancelled_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_user_idx ON orders (user_id, created_at DESC);
CREATE INDEX orders_status_idx ON orders (status, created_at DESC);
CREATE INDEX orders_created_at_idx ON orders (created_at DESC);
CREATE INDEX orders_pending_expiry_idx ON orders (expires_at) WHERE status = 'pending';
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE order_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id   uuid REFERENCES products (id) ON DELETE SET NULL,
  variant_id   uuid REFERENCES product_variants (id) ON DELETE SET NULL,
  product_name text NOT NULL,
  product_slug text,
  sku          text NOT NULL,
  size         text,
  color        text,
  image_url    text,
  unit_price   integer NOT NULL CHECK (unit_price >= 0),
  quantity     integer NOT NULL CHECK (quantity > 0),
  line_total   integer NOT NULL CHECK (line_total >= 0)
);
CREATE INDEX order_items_order_idx ON order_items (order_id);
CREATE INDEX order_items_product_idx ON order_items (product_id);

CREATE TABLE order_status_history (
  id         bigserial PRIMARY KEY,
  order_id   uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  status     text NOT NULL,
  note       text,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_status_history_order_idx ON order_status_history (order_id, created_at);

CREATE TABLE payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  gateway            text NOT NULL CHECK (gateway IN ('razorpay', 'stripe', 'mock')),
  gateway_order_id   text NOT NULL,          -- Razorpay order id / Stripe Checkout Session id
  gateway_payment_id text,                   -- Razorpay payment id / Stripe PaymentIntent id
  amount             integer NOT NULL,
  currency           text NOT NULL,
  status             text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed')),
  error              text,
  raw                jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway, gateway_order_id)
);
CREATE INDEX payments_order_idx ON payments (order_id);
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE shipments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             uuid NOT NULL UNIQUE REFERENCES orders (id) ON DELETE CASCADE,
  provider             text NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual', 'shiprocket')),
  courier              text,
  awb                  text,
  tracking_url         text,
  provider_order_id    text,
  provider_shipment_id text,
  shipped_at           timestamptz,
  delivered_at         timestamptz,
  raw                  jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER shipments_updated_at BEFORE UPDATE ON shipments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Webhook idempotency: each gateway event is processed at most once.
CREATE TABLE webhook_events (
  id          bigserial PRIMARY KEY,
  gateway     text NOT NULL,
  event_id    text NOT NULL,
  type        text,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway, event_id)
);

-- ---------------------------------------------------------------------------
-- Bulk (WhatsApp) enquiries
-- ---------------------------------------------------------------------------
CREATE TABLE bulk_enquiries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  name        text NOT NULL,
  phone       text NOT NULL,
  email       text,
  company     text,
  message     text,
  items       jsonb NOT NULL DEFAULT '[]'::jsonb,
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'closed')),
  admin_notes text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bulk_enquiries_status_idx ON bulk_enquiries (status, created_at DESC);
CREATE TRIGGER bulk_enquiries_updated_at BEFORE UPDATE ON bulk_enquiries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
