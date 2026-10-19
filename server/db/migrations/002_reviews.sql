-- Product reviews. Customers can review products from their paid orders
-- ("verified purchase"); reviews publish immediately and admins can hide them.
CREATE TABLE reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  user_id        uuid REFERENCES users (id) ON DELETE SET NULL,
  order_id       uuid REFERENCES orders (id) ON DELETE SET NULL,
  author_name    text NOT NULL,
  author_city    text,
  author_country text,                       -- ISO 3166-1 alpha-2
  rating         smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title          text,
  body           text NOT NULL,
  verified       boolean NOT NULL DEFAULT false,
  status         text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
-- One review per customer per product (editing replaces it).
CREATE UNIQUE INDEX reviews_one_per_customer ON reviews (product_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX reviews_product_idx ON reviews (product_id, created_at DESC) WHERE status = 'published';
CREATE INDEX reviews_created_idx ON reviews (created_at DESC);
CREATE TRIGGER reviews_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();
