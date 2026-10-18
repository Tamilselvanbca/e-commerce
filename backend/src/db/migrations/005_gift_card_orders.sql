-- Gift cards bought online. A purchase is an order of kind 'gift_card': no
-- delivery address and no stock; once paid, the card is created, emailed to the
-- recipient and the order is marked delivered.
ALTER TABLE orders
  ADD COLUMN kind text NOT NULL DEFAULT 'goods' CHECK (kind IN ('goods', 'gift_card')),
  ALTER COLUMN shipping_address DROP NOT NULL,
  ADD CONSTRAINT orders_goods_have_address CHECK (kind <> 'goods' OR shipping_address IS NOT NULL);

-- Who a gift card line is for: { recipientName, recipientEmail, senderName, message }.
ALTER TABLE order_items ADD COLUMN gift_card_details jsonb;

-- The purchase line a card was issued for; UNIQUE so a card is issued only once.
ALTER TABLE gift_cards ADD COLUMN order_item_id uuid UNIQUE REFERENCES order_items (id) ON DELETE SET NULL;
