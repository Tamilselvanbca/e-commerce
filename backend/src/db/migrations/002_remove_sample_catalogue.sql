-- Removes the sample catalogue that earlier versions added on first start, so
-- the store only holds its own data. Runs once per database (schema_migrations).
-- Kept: a sample product given a photo of its own (its images aren't all under
-- seed/), and a sample category that still holds products or sub-categories.
-- Deleting a product also deletes its variants, images and reviews; past orders
-- keep their own copy of the product name.

DELETE FROM products
 WHERE slug IN (
         'motichoor-laddu', 'besan-laddu', 'rava-laddu', 'coconut-laddu', 'kaju-katli', 'milk-barfi',
         'kalakand', 'mysore-pak', 'jalebi', 'gulab-jamun', 'adhirasam', 'badam-halwa', 'kai-murukku',
         'thenkuzhal', 'madras-mixture', 'ribbon-pakoda', 'kara-boondi', 'kerala-banana-chips',
         'diwali-sweet-box', 'festive-snack-hamper', 'wedding-return-gift-box', 'dry-fruit-laddu',
         'ragi-murukku', 'chikki')
   AND NOT EXISTS (
         SELECT 1 FROM product_images i
          WHERE i.product_id = products.id AND (i.storage_key IS NULL OR i.storage_key NOT LIKE 'seed/%'));

-- Sub-categories first, then their parents.
DELETE c FROM categories c
  LEFT JOIN products p ON p.category_id = c.id
 WHERE c.slug IN ('laddus', 'barfi-katli', 'traditional-sweets', 'murukku', 'mixture-namkeen', 'chips')
   AND p.id IS NULL;

DELETE c FROM categories c
  LEFT JOIN products p ON p.category_id = c.id
  LEFT JOIN categories child ON child.parent_id = c.id
 WHERE c.slug IN ('sweets', 'snacks', 'gift-boxes', 'healthy-bites')
   AND p.id IS NULL
   AND child.id IS NULL;
