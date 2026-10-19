-- Store settings edited in Admin → Settings. Each row overrides the environment
-- variable of the same name (e.g. STORE_NAME); deleting a row falls back to .env.
-- Secret values are AES-256-GCM encrypted by the API ("enc:v1:..."), never plain text.
CREATE TABLE settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  is_secret  boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
