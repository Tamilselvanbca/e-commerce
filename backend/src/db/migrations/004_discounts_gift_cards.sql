-- Discounts: coupon codes customers type at checkout, and automatic offers
-- (code IS NULL) applied without a code. One discount applies per order.
CREATE TABLE discounts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text,                     -- upper-case; NULL = automatic offer
  title              text NOT NULL,            -- shown to customers, e.g. "Diwali offer"
  description        text,
  type               text NOT NULL CHECK (type IN ('percent', 'fixed', 'free_shipping')),
  value              integer NOT NULL DEFAULT 0 CHECK (value >= 0), -- percent 1-100, or paise for fixed
  max_discount       integer CHECK (max_discount > 0),              -- cap (paise) for percent discounts
  min_subtotal       integer NOT NULL DEFAULT 0 CHECK (min_subtotal >= 0),
  region             text NOT NULL DEFAULT 'all' CHECK (region IN ('all', 'domestic', 'international')),
  starts_at          timestamptz,
  ends_at            timestamptz,
  usage_limit        integer CHECK (usage_limit > 0),               -- orders in total; NULL = unlimited
  per_customer_limit integer CHECK (per_customer_limit > 0),        -- orders per customer; NULL = unlimited
  first_order_only   boolean NOT NULL DEFAULT false,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (type <> 'percent' OR value BETWEEN 1 AND 100),
  CHECK (type <> 'fixed' OR value > 0),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE UNIQUE INDEX discounts_code_key ON discounts (code) WHERE code IS NOT NULL;
CREATE TRIGGER discounts_updated_at BEFORE UPDATE ON discounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Gift cards hold a balance that customers spend at checkout (partly or fully paying an order).
CREATE TABLE gift_cards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,        -- 16 characters, stored without dashes
  initial_balance integer NOT NULL CHECK (initial_balance > 0),
  balance         integer NOT NULL CHECK (balance >= 0),
  currency        text NOT NULL DEFAULT 'INR',
  recipient_name  text,
  recipient_email text,
  sender_name     text,
  message         text,
  expires_at      timestamptz,
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gift_cards_created_idx ON gift_cards (created_at DESC);
CREATE TRIGGER gift_cards_updated_at BEFORE UPDATE ON gift_cards FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Every balance change. Negative amounts are spent; positive ones are issued, refunded or added.
CREATE TABLE gift_card_transactions (
  id           bigserial PRIMARY KEY,
  gift_card_id uuid NOT NULL REFERENCES gift_cards (id) ON DELETE CASCADE,
  order_id     uuid,                           -- no FK: the history outlives deleted orders
  kind         text NOT NULL CHECK (kind IN ('issue', 'redeem', 'refund', 'adjust')),
  amount       integer NOT NULL,
  note         text,
  created_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gift_card_transactions_card_idx ON gift_card_transactions (gift_card_id, created_at);
CREATE INDEX gift_card_transactions_order_idx ON gift_card_transactions (order_id) WHERE order_id IS NOT NULL;

-- Orders: total = subtotal + shipping_fee - discount (unchanged meaning).
-- The gift card pays part of the total; amount_due is what the payment gateway charges.
ALTER TABLE orders
  ADD COLUMN discount_id      uuid REFERENCES discounts (id) ON DELETE SET NULL,
  ADD COLUMN discount_code    text,
  ADD COLUMN discount_title   text,
  ADD COLUMN gift_card_id     uuid REFERENCES gift_cards (id) ON DELETE SET NULL,
  ADD COLUMN gift_card_amount integer NOT NULL DEFAULT 0 CHECK (gift_card_amount >= 0),
  ADD COLUMN amount_due       integer GENERATED ALWAYS AS (total - gift_card_amount) STORED,
  ADD CONSTRAINT orders_gift_card_within_total CHECK (gift_card_amount <= total);
CREATE INDEX orders_discount_idx ON orders (discount_id) WHERE discount_id IS NOT NULL;
