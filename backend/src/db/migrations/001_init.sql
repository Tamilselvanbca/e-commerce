-- Schema (MySQL 8.0+ / InnoDB, utf8mb4). Money is stored as integers in the
-- smallest currency unit (paise for INR). Timestamps are UTC (DATETIME(3)).
-- Unique keys are named like PostgreSQL's defaults (<table>_<column>_key); the
-- app relies on these names to explain duplicate values.

-- ---------------------------------------------------------------------------
-- Users & authentication
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            CHAR(36) NOT NULL DEFAULT (UUID()),
  phone         VARCHAR(20) NOT NULL,                 -- E.164, e.g. +919876543210
  name          VARCHAR(120),
  email         VARCHAR(255),
  role          VARCHAR(20) NOT NULL DEFAULT 'customer',
  is_blocked    BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at DATETIME(3),
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY users_phone_key (phone),
  KEY users_email_idx (email),
  KEY users_created_at_idx (created_at),
  CONSTRAINT users_role_check CHECK (role IN ('customer', 'admin'))
);

CREATE TABLE otp_codes (
  id          BIGINT NOT NULL AUTO_INCREMENT,
  phone       VARCHAR(20) NOT NULL,
  code_hash   VARCHAR(128) NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  expires_at  DATETIME(3) NOT NULL,
  consumed_at DATETIME(3),
  ip          VARCHAR(64),
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY otp_codes_phone_idx (phone, created_at)
);

CREATE TABLE sessions (
  token_hash   CHAR(64) NOT NULL,                      -- sha256 of the cookie value
  user_id      CHAR(36) NOT NULL,
  expires_at   DATETIME(3) NOT NULL,
  user_agent   VARCHAR(300),
  ip           VARCHAR(64),
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (token_hash),
  KEY sessions_user_idx (user_id),
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
  id          CHAR(36) NOT NULL DEFAULT (UUID()),
  name        VARCHAR(120) NOT NULL,
  slug        VARCHAR(160) NOT NULL,
  description TEXT,
  image_url   VARCHAR(1000),
  parent_id   CHAR(36),
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY categories_slug_key (slug),
  KEY categories_parent_idx (parent_id),
  CONSTRAINT categories_parent_fk FOREIGN KEY (parent_id) REFERENCES categories (id) ON DELETE SET NULL
);

CREATE TABLE products (
  id          CHAR(36) NOT NULL DEFAULT (UUID()),
  name        VARCHAR(200) NOT NULL,
  slug        VARCHAR(220) NOT NULL,
  description TEXT NOT NULL DEFAULT (''),
  category_id CHAR(36),
  status      VARCHAR(20) NOT NULL DEFAULT 'active',
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY products_slug_key (slug),
  KEY products_category_idx (category_id),
  KEY products_status_idx (status, created_at),
  FULLTEXT KEY products_search_idx (name, description),
  CONSTRAINT products_category_fk FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL,
  CONSTRAINT products_status_check CHECK (status IN ('active', 'draft', 'archived'))
);

CREATE TABLE product_variants (
  id               CHAR(36) NOT NULL DEFAULT (UUID()),
  product_id       CHAR(36) NOT NULL,
  sku              VARCHAR(100) NOT NULL,                -- up to 64 + "-removed-…" when retired
  size             VARCHAR(100),
  color            VARCHAR(100),
  color_hex        VARCHAR(9),
  price            INT NOT NULL,
  compare_at_price INT,
  stock            INT NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order       INT NOT NULL DEFAULT 0,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  -- One active variant per size/colour combination (retired variants are kept for order history):
  -- `active_flag` is NULL for inactive rows, and a unique key ignores rows containing NULL.
  size_key         VARCHAR(100) GENERATED ALWAYS AS (COALESCE(size, '')) STORED,
  color_key        VARCHAR(100) GENERATED ALWAYS AS (COALESCE(color, '')) STORED,
  active_flag      TINYINT GENERATED ALWAYS AS (CASE WHEN is_active THEN 1 END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY product_variants_sku_key (sku),
  UNIQUE KEY product_variants_option_uniq (product_id, size_key, color_key, active_flag),
  KEY product_variants_product_idx (product_id),
  CONSTRAINT product_variants_product_fk FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT product_variants_price_check CHECK (price > 0),
  CONSTRAINT product_variants_compare_check CHECK (compare_at_price IS NULL OR compare_at_price > 0),
  CONSTRAINT product_variants_stock_check CHECK (stock >= 0)
);

CREATE TABLE product_images (
  id          CHAR(36) NOT NULL DEFAULT (UUID()),
  product_id  CHAR(36) NOT NULL,
  url         VARCHAR(1000) NOT NULL,
  storage_key VARCHAR(500),
  alt         VARCHAR(300),
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY product_images_product_idx (product_id, sort_order),
  CONSTRAINT product_images_product_fk FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Cart & addresses
-- ---------------------------------------------------------------------------
CREATE TABLE carts (
  id         CHAR(36) NOT NULL DEFAULT (UUID()),
  user_id    CHAR(36),                                  -- NULL for guest carts
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY carts_user_id_key (user_id),
  CONSTRAINT carts_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE cart_items (
  id         CHAR(36) NOT NULL DEFAULT (UUID()),
  cart_id    CHAR(36) NOT NULL,
  variant_id CHAR(36) NOT NULL,
  quantity   INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY cart_items_cart_id_variant_id_key (cart_id, variant_id),
  KEY cart_items_variant_idx (variant_id),
  CONSTRAINT cart_items_cart_fk FOREIGN KEY (cart_id) REFERENCES carts (id) ON DELETE CASCADE,
  CONSTRAINT cart_items_variant_fk FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE CASCADE,
  CONSTRAINT cart_items_quantity_check CHECK (quantity > 0)
);

CREATE TABLE addresses (
  id           CHAR(36) NOT NULL DEFAULT (UUID()),
  user_id      CHAR(36) NOT NULL,
  full_name    VARCHAR(120) NOT NULL,
  phone        VARCHAR(20) NOT NULL,
  line1        VARCHAR(255) NOT NULL,
  line2        VARCHAR(255),
  landmark     VARCHAR(255),
  city         VARCHAR(120) NOT NULL,
  state        VARCHAR(120) NOT NULL,
  pincode      VARCHAR(20) NOT NULL,
  country      CHAR(2) NOT NULL DEFAULT 'IN',
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  -- At most one default address per customer (NULL when not the default).
  default_flag TINYINT GENERATED ALWAYS AS (CASE WHEN is_default THEN 1 END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY addresses_one_default (user_id, default_flag),
  CONSTRAINT addresses_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Discounts & gift cards
-- ---------------------------------------------------------------------------
-- Coupon codes customers type at checkout, and automatic offers (code IS NULL)
-- applied without a code. One discount applies per order.
CREATE TABLE discounts (
  id                 CHAR(36) NOT NULL DEFAULT (UUID()),
  code               VARCHAR(40),                      -- upper-case; NULL = automatic offer
  title              VARCHAR(120) NOT NULL,            -- shown to customers, e.g. "Diwali offer"
  description        VARCHAR(500),
  type               VARCHAR(20) NOT NULL,
  value              INT NOT NULL DEFAULT 0,           -- percent 1-100, or paise for fixed
  max_discount       INT,                              -- cap (paise) for percent discounts
  min_subtotal       INT NOT NULL DEFAULT 0,
  region             VARCHAR(20) NOT NULL DEFAULT 'all',
  starts_at          DATETIME(3),
  ends_at            DATETIME(3),
  usage_limit        INT,                              -- orders in total; NULL = unlimited
  per_customer_limit INT,                              -- orders per customer; NULL = unlimited
  first_order_only   BOOLEAN NOT NULL DEFAULT FALSE,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY discounts_code_key (code),
  CONSTRAINT discounts_type_check CHECK (type IN ('percent', 'fixed', 'free_shipping')),
  CONSTRAINT discounts_region_check CHECK (region IN ('all', 'domestic', 'international')),
  CONSTRAINT discounts_value_check CHECK (value >= 0),
  CONSTRAINT discounts_percent_check CHECK (type <> 'percent' OR value BETWEEN 1 AND 100),
  CONSTRAINT discounts_fixed_check CHECK (type <> 'fixed' OR value > 0),
  CONSTRAINT discounts_max_check CHECK (max_discount IS NULL OR max_discount > 0),
  CONSTRAINT discounts_min_check CHECK (min_subtotal >= 0),
  CONSTRAINT discounts_limits_check CHECK ((usage_limit IS NULL OR usage_limit > 0) AND (per_customer_limit IS NULL OR per_customer_limit > 0)),
  CONSTRAINT discounts_dates_check CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

-- Gift cards hold a balance that customers spend at checkout (partly or fully paying an order).
CREATE TABLE gift_cards (
  id              CHAR(36) NOT NULL DEFAULT (UUID()),
  code            CHAR(16) NOT NULL,                   -- stored without dashes
  initial_balance INT NOT NULL,
  balance         INT NOT NULL,
  currency        CHAR(3) NOT NULL DEFAULT 'INR',
  recipient_name  VARCHAR(100),
  recipient_email VARCHAR(255),
  sender_name     VARCHAR(100),
  message         VARCHAR(500),
  expires_at      DATETIME(3),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      CHAR(36),
  order_item_id   CHAR(36),                            -- the online purchase it was issued for
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY gift_cards_code_key (code),
  UNIQUE KEY gift_cards_order_item_id_key (order_item_id),
  KEY gift_cards_created_idx (created_at),
  CONSTRAINT gift_cards_created_by_fk FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT gift_cards_initial_check CHECK (initial_balance > 0),
  CONSTRAINT gift_cards_balance_check CHECK (balance >= 0)
);

-- Every balance change. Negative amounts are spent; positive ones are issued, refunded or added.
CREATE TABLE gift_card_transactions (
  id           BIGINT NOT NULL AUTO_INCREMENT,
  gift_card_id CHAR(36) NOT NULL,
  order_id     CHAR(36),                               -- no FK: the history outlives deleted orders
  kind         VARCHAR(10) NOT NULL,
  amount       INT NOT NULL,
  note         VARCHAR(300),
  created_by   CHAR(36),
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY gift_card_transactions_card_idx (gift_card_id, created_at),
  KEY gift_card_transactions_order_idx (order_id),
  CONSTRAINT gift_card_transactions_card_fk FOREIGN KEY (gift_card_id) REFERENCES gift_cards (id) ON DELETE CASCADE,
  CONSTRAINT gift_card_transactions_user_fk FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT gift_card_transactions_kind_check CHECK (kind IN ('issue', 'redeem', 'refund', 'adjust'))
);

-- ---------------------------------------------------------------------------
-- Orders, payments, shipments
-- ---------------------------------------------------------------------------
-- kind 'gift_card' = a gift card bought online: no address, no stock; delivered by email.
-- total = subtotal + shipping_fee - discount; the gift card pays part of the total and
-- amount_due is what the payment gateway charges.
CREATE TABLE orders (
  id               CHAR(36) NOT NULL DEFAULT (UUID()),
  order_number     VARCHAR(32) NOT NULL,
  user_id          CHAR(36) NOT NULL,
  kind             VARCHAR(10) NOT NULL DEFAULT 'goods',
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_status   VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_gateway  VARCHAR(20),
  currency         CHAR(3) NOT NULL DEFAULT 'INR',
  subtotal         INT NOT NULL,
  shipping_fee     INT NOT NULL DEFAULT 0,
  discount         INT NOT NULL DEFAULT 0,
  total            INT NOT NULL,
  discount_id      CHAR(36),
  discount_code    VARCHAR(40),
  discount_title   VARCHAR(120),
  gift_card_id     CHAR(36),
  gift_card_amount INT NOT NULL DEFAULT 0,
  amount_due       INT GENERATED ALWAYS AS (total - gift_card_amount) STORED,
  email            VARCHAR(255),
  phone            VARCHAR(20),
  shipping_address JSON,
  notes            VARCHAR(1000),
  expires_at       DATETIME(3),                        -- unpaid orders are cancelled after this
  paid_at          DATETIME(3),
  cancelled_at     DATETIME(3),
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY orders_order_number_key (order_number),
  KEY orders_user_idx (user_id, created_at),
  KEY orders_status_idx (status, created_at),
  KEY orders_created_at_idx (created_at),
  KEY orders_pending_expiry_idx (status, expires_at),
  KEY orders_discount_idx (discount_id),
  CONSTRAINT orders_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT orders_discount_fk FOREIGN KEY (discount_id) REFERENCES discounts (id) ON DELETE SET NULL,
  CONSTRAINT orders_gift_card_fk FOREIGN KEY (gift_card_id) REFERENCES gift_cards (id) ON DELETE SET NULL,
  CONSTRAINT orders_kind_check CHECK (kind IN ('goods', 'gift_card')),
  CONSTRAINT orders_status_check CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  CONSTRAINT orders_payment_status_check CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  CONSTRAINT orders_amounts_check CHECK (subtotal >= 0 AND shipping_fee >= 0 AND discount >= 0 AND total >= 0 AND gift_card_amount >= 0),
  CONSTRAINT orders_gift_card_within_total CHECK (gift_card_amount <= total),
  CONSTRAINT orders_goods_have_address CHECK (kind <> 'goods' OR shipping_address IS NOT NULL)
);

CREATE TABLE order_items (
  id                CHAR(36) NOT NULL DEFAULT (UUID()),
  order_id          CHAR(36) NOT NULL,
  product_id        CHAR(36),
  variant_id        CHAR(36),
  product_name      VARCHAR(300) NOT NULL,
  product_slug      VARCHAR(220),
  sku               VARCHAR(64) NOT NULL,
  size              VARCHAR(100),
  color             VARCHAR(100),
  image_url         VARCHAR(1000),
  unit_price        INT NOT NULL,
  quantity          INT NOT NULL,
  line_total        INT NOT NULL,
  -- Who a gift card line is for: { recipientName, recipientEmail, senderName, message }.
  gift_card_details JSON,
  PRIMARY KEY (id),
  KEY order_items_order_idx (order_id),
  KEY order_items_product_idx (product_id),
  KEY order_items_variant_idx (variant_id),
  CONSTRAINT order_items_order_fk FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT order_items_product_fk FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL,
  CONSTRAINT order_items_variant_fk FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE SET NULL,
  CONSTRAINT order_items_amounts_check CHECK (unit_price >= 0 AND quantity > 0 AND line_total >= 0)
);

-- A gift card bought online points at its purchase line (added after order_items exists).
ALTER TABLE gift_cards
  ADD CONSTRAINT gift_cards_order_item_fk FOREIGN KEY (order_item_id) REFERENCES order_items (id) ON DELETE SET NULL;

CREATE TABLE order_status_history (
  id         BIGINT NOT NULL AUTO_INCREMENT,
  order_id   CHAR(36) NOT NULL,
  status     VARCHAR(20) NOT NULL,
  note       VARCHAR(1000),
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY order_status_history_order_idx (order_id, created_at),
  CONSTRAINT order_status_history_order_fk FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT order_status_history_user_fk FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE payments (
  id                 CHAR(36) NOT NULL DEFAULT (UUID()),
  order_id           CHAR(36) NOT NULL,
  gateway            VARCHAR(20) NOT NULL,
  gateway_order_id   VARCHAR(255) NOT NULL,            -- Razorpay order id / Stripe Checkout Session id
  gateway_payment_id VARCHAR(255),                     -- Razorpay payment id / Stripe PaymentIntent id
  amount             INT NOT NULL,
  currency           CHAR(3) NOT NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'created',
  error              VARCHAR(1000),
  raw                JSON,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY payments_gateway_gateway_order_id_key (gateway, gateway_order_id),
  KEY payments_order_idx (order_id),
  CONSTRAINT payments_order_fk FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT payments_gateway_check CHECK (gateway IN ('razorpay', 'stripe', 'mock')),
  CONSTRAINT payments_status_check CHECK (status IN ('created', 'paid', 'failed'))
);

CREATE TABLE shipments (
  id                   CHAR(36) NOT NULL DEFAULT (UUID()),
  order_id             CHAR(36) NOT NULL,
  provider             VARCHAR(20) NOT NULL DEFAULT 'manual',
  courier              VARCHAR(120),
  awb                  VARCHAR(120),
  tracking_url         VARCHAR(1000),
  provider_order_id    VARCHAR(120),
  provider_shipment_id VARCHAR(120),
  shipped_at           DATETIME(3),
  delivered_at         DATETIME(3),
  raw                  JSON,
  created_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY shipments_order_id_key (order_id),
  CONSTRAINT shipments_order_fk FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT shipments_provider_check CHECK (provider IN ('manual', 'shiprocket'))
);

-- Webhook idempotency: each gateway event is processed at most once.
CREATE TABLE webhook_events (
  id          BIGINT NOT NULL AUTO_INCREMENT,
  gateway     VARCHAR(20) NOT NULL,
  event_id    VARCHAR(255) NOT NULL,
  type        VARCHAR(120),
  received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY webhook_events_gateway_event_id_key (gateway, event_id)
);

-- ---------------------------------------------------------------------------
-- Bulk (WhatsApp) enquiries
-- ---------------------------------------------------------------------------
CREATE TABLE bulk_enquiries (
  id          CHAR(36) NOT NULL DEFAULT (UUID()),
  user_id     CHAR(36),
  name        VARCHAR(120) NOT NULL,
  phone       VARCHAR(20) NOT NULL,
  email       VARCHAR(255),
  company     VARCHAR(200),
  message     TEXT,
  items       JSON NOT NULL DEFAULT (JSON_ARRAY()),
  status      VARCHAR(20) NOT NULL DEFAULT 'new',
  admin_notes TEXT,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY bulk_enquiries_status_idx (status, created_at),
  CONSTRAINT bulk_enquiries_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT bulk_enquiries_status_check CHECK (status IN ('new', 'contacted', 'converted', 'closed'))
);

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
-- Customers can review products from their paid orders ("verified purchase");
-- reviews publish immediately and admins can hide them.
CREATE TABLE reviews (
  id             CHAR(36) NOT NULL DEFAULT (UUID()),
  product_id     CHAR(36) NOT NULL,
  user_id        CHAR(36),
  order_id       CHAR(36),
  author_name    VARCHAR(120) NOT NULL,
  author_city    VARCHAR(120),
  author_country CHAR(2),                              -- ISO 3166-1 alpha-2
  rating         SMALLINT NOT NULL,
  title          VARCHAR(200),
  body           TEXT NOT NULL,
  verified       BOOLEAN NOT NULL DEFAULT FALSE,
  status         VARCHAR(20) NOT NULL DEFAULT 'published',
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  -- One review per customer per product (editing replaces it); guest/demo rows have no user.
  UNIQUE KEY reviews_one_per_customer (product_id, user_id),
  KEY reviews_product_idx (product_id, status, created_at),
  KEY reviews_created_idx (created_at),
  CONSTRAINT reviews_product_fk FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT reviews_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT reviews_order_fk FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE SET NULL,
  CONSTRAINT reviews_rating_check CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT reviews_status_check CHECK (status IN ('published', 'hidden'))
);

-- ---------------------------------------------------------------------------
-- Store settings (Admin -> Settings)
-- ---------------------------------------------------------------------------
-- Each row overrides the environment variable of the same name (e.g. STORE_NAME);
-- deleting a row falls back to the environment. Secret values are AES-256-GCM
-- encrypted by the API ("enc:v1:..."), never plain text.
CREATE TABLE settings (
  `key`      VARCHAR(64) NOT NULL,
  value      TEXT NOT NULL,
  is_secret  BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by CHAR(36),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`key`),
  CONSTRAINT settings_user_fk FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
);
