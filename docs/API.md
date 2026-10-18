# REST API Reference

Base URL: `http://localhost:4000/api` in development. The Next.js frontend proxies
`/api/*` and `/uploads/*` to the backend, so browser code always calls relative
URLs such as `/api/products` and cookies stay first-party.

## Conventions

| Topic | Rule |
| --- | --- |
| Format | JSON request and response bodies, `camelCase` keys. |
| Money | Integers in the smallest currency unit (**paise** for INR). `129900` = ₹1,299.00. |
| Dates | ISO-8601 strings (UTC). |
| Auth | Opaque session token in the `sid` httpOnly cookie, set by `POST /auth/otp/verify`. |
| Guest cart | `cart_id` httpOnly cookie, created on first cart write; merged into the user cart on login. |
| Pagination | Query `page` (1-based) and `pageSize`. Response: `{ items, page, pageSize, total, totalPages }`. |
| CSRF | Non-GET requests must come from an allowed `Origin` (the frontend URL). Webhooks are exempt. |

### Errors

Every error response has this shape:

```json
{ "error": { "code": "OUT_OF_STOCK", "message": "Only 2 left of Classic Tee (M / Black)", "details": {} } }
```

| Status | Typical `code` values |
| --- | --- |
| 400 | `VALIDATION_ERROR` (`details` = list of `{ path, message }`), `BAD_REQUEST`, `OTP_INVALID`, `OTP_EXPIRED` |
| 401 | `UNAUTHORIZED` |
| 403 | `FORBIDDEN`, `ACCOUNT_BLOCKED`, `CSRF_ORIGIN` |
| 404 | `NOT_FOUND` |
| 409 | `OUT_OF_STOCK`, `CART_EMPTY`, `ORDER_NOT_PAYABLE`, `CONFLICT` |
| 429 | `RATE_LIMITED`, `OTP_COOLDOWN` (`details.retryAfter` seconds) |
| 502 | `GATEWAY_ERROR` (payment / shipping provider failed) |

---

## Shared types

```ts
type User = {
  id: string; phone: string; name: string | null; email: string | null;
  role: 'customer' | 'admin'; createdAt: string;
};

type Category = {
  id: string; name: string; slug: string; description: string | null;
  imageUrl: string | null; parentId: string | null; sortOrder: number;
  productCount: number;
};

type ProductImage = { id: string; url: string; alt: string | null; sortOrder: number };

type Variant = {
  id: string; sku: string; size: string | null; color: string | null; colorHex: string | null;
  price: number; compareAtPrice: number | null; stock: number; isActive: boolean;
};

type ProductSummary = {
  id: string; name: string; slug: string;
  minPrice: number; maxPrice: number; compareAtPrice: number | null; // compareAtPrice of the cheapest variant
  imageUrl: string | null; category: { id: string; name: string; slug: string } | null;
  inStock: boolean; isFeatured: boolean; createdAt: string;
  rating: { average: number; count: number } | null;   // null until the product has published reviews
};

// Variant options: `size` is the pack size ("250 g", "1 kg", "Box of 6") and
// `color` the flavour ("Classic", "Kesar"). Pack sizes sort by weight/count.

type Review = {
  id: string; rating: 1 | 2 | 3 | 4 | 5; title: string | null; body: string;
  authorName: string;            // "Priya N."
  authorCity: string | null; authorCountry: string | null;  // from the delivery address (ISO country code)
  verified: boolean; createdAt: string;
  product?: { id: string; name: string; slug: string; imageUrl: string | null };  // store-wide lists
  status?: 'published' | 'hidden';                                                // admin only
};
type RatingSummary = { average: number; count: number; distribution: { '1': number; '2': number; '3': number; '4': number; '5': number } };

type Product = ProductSummary & {
  description: string;
  status: 'active' | 'draft' | 'archived';
  images: ProductImage[];
  variants: Variant[];               // storefront: active variants only
  options: { sizes: string[]; colors: { name: string; hex: string | null }[] };
};

type CartItem = {
  id: string; variantId: string; productId: string; productName: string; productSlug: string;
  imageUrl: string | null; size: string | null; color: string | null; sku: string;
  price: number; compareAtPrice: number | null; quantity: number; stock: number;
  lineTotal: number;
  isAvailable: boolean;              // false if product/variant inactive or stock < quantity
};

type Cart = { id: string | null; items: CartItem[]; itemCount: number; subtotal: number };

type Address = {
  id: string; fullName: string; phone: string; line1: string; line2: string | null;
  landmark: string | null; city: string; state: string; pincode: string; country: string;
  isDefault: boolean;
};

type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
type Gateway = 'razorpay' | 'stripe' | 'mock';

type OrderSummary = {
  id: string; orderNumber: string; status: OrderStatus; paymentStatus: PaymentStatus;
  paymentGateway: Gateway | null; total: number; itemCount: number;
  previewImage: string | null; createdAt: string;
  customer?: { id: string; name: string | null; phone: string }; // admin endpoints only
};

type OrderItem = {
  id: string; productId: string | null; productName: string; productSlug: string | null;
  sku: string; size: string | null; color: string | null; imageUrl: string | null;
  unitPrice: number; quantity: number; lineTotal: number;
};

type Shipment = {
  provider: 'manual' | 'shiprocket'; courier: string | null; awb: string | null;
  trackingUrl: string | null; shippedAt: string | null; deliveredAt: string | null;
};

type Order = OrderSummary & {
  currency: string; subtotal: number; shippingFee: number; discount: number;
  email: string | null; phone: string | null; notes: string | null;
  shippingAddress: Omit<Address, 'id' | 'isDefault'>;
  items: OrderItem[];
  statusHistory: { status: string; note: string | null; createdAt: string }[];
  shipment: Shipment | null;
  expiresAt: string | null; paidAt: string | null; cancelledAt: string | null;
  canPay: boolean;      // pending, unpaid and not expired → show "Pay now"
  canCancel: boolean;   // customer may cancel (only unpaid pending orders)
};

// Returned by checkout and "pay now". The frontend branches on `gateway`.
type PaymentInit =
  | { gateway: 'razorpay'; keyId: string; razorpayOrderId: string; amount: number; currency: string;
      name: string; description: string;
      prefill: { name: string | null; email: string | null; contact: string } }
  | { gateway: 'stripe'; checkoutUrl: string; sessionId: string }
  | { gateway: 'mock'; mockPaymentId: string; amount: number; currency: string };
```

---

## Public config

### `GET /config`
```json
{
  "storeName": "My Store", "currency": "INR",
  "shippingFee": 4900, "freeShippingThreshold": 99900,
  "internationalShippingFee": 199900, "internationalFreeShippingThreshold": 1499900,
  "supportEmail": "help@example.com", "supportPhone": "+91 98765 43210", "fssaiLicenseNo": "12345678901234",
  "whatsappNumber": "919876543210",
  "gateways": {
    "razorpay": { "enabled": true, "keyId": "rzp_test_xxx" },
    "stripe": { "enabled": true },
    "mock": { "enabled": false }
  }
}
```
`whatsappNumber` may be `null`; hide WhatsApp buttons when it is. Shipping is charged per destination:
India uses `shippingFee` / `freeShippingThreshold`; any other country uses the international values
(`internationalFreeShippingThreshold: 0` means international shipping is never free).

### `GET /health` → `{ "status": "ok" }`

---

## Auth (OTP)

### `POST /auth/otp/request`
Body `{ "phone": "9876543210" }`. A 10-digit number gets the default country code (+91);
international numbers are sent in E.164 form, e.g. `+14155550123`.
Response `{ "phone": "+919876543210", "expiresIn": 300, "resendIn": 60, "devCode": "123456" }`
(`devCode` only when `OTP_EXPOSE_IN_RESPONSE=true` in development).
Errors: `429 OTP_COOLDOWN` with `details.retryAfter`.

### `POST /auth/otp/verify`
Body `{ "phone": "9876543210", "code": "123456", "name": "Asha" }`. `name` is optional and only saved for new users.
Response `{ "user": User, "isNewUser": boolean }` and sets the `sid` cookie. The guest cart is merged.
Errors: `400 OTP_INVALID` (`details.attemptsLeft`), `400 OTP_EXPIRED`, `403 ACCOUNT_BLOCKED`.

### `GET /auth/me` → `{ "user": User }`, or `{ "user": null }` when not logged in.
### `PATCH /auth/me` body `{ "name"?: string, "email"?: string | null }` → `{ "user": User }`.
### `POST /auth/logout` → `204`, clears the cookie.

---

## Catalog

### `GET /categories` → `{ "items": Category[] }`
Active categories, flat list ordered by `sortOrder`; build the tree from `parentId`.

### `GET /products`
| Query | Example | Notes |
| --- | --- | --- |
| `q` | `cotton shirt` | full-text search on name and description |
| `category` | `men` | category slug; includes child categories |
| `minPrice`, `maxPrice` | `50000` | paise |
| `sizes` | `M,L` | comma separated |
| `colors` | `Black,White` | comma separated |
| `inStock` | `true` | |
| `featured` | `true` | |
| `sort` | `newest` | `newest` (default), `price_asc`, `price_desc`, `popular`, `rating`, `relevance` (default when `q` set) |
| `page`, `pageSize` | `1`, `24` | `pageSize` max 60 |

Response: paginated `ProductSummary` plus facets computed over the category/search scope:
```json
{ "items": [], "page": 1, "pageSize": 24, "total": 0, "totalPages": 0,
  "facets": { "sizes": ["S", "M"], "colors": [{ "name": "Black", "hex": "#111111" }],
              "priceRange": { "min": 49900, "max": 299900 } } }
```

### `GET /products/:slug` → `Product` (404 if not active).
### `GET /products/:slug/related` → `{ "items": ProductSummary[] }` (up to 8, same category).

---

## Reviews

Customers can review any product from one of their **paid, non-cancelled orders** (marked "verified
purchase"). Reviews publish immediately; admins can hide or delete them. One review per customer per
product: posting again replaces it.

| Method & path | Notes |
| --- | --- |
| `GET /reviews?rating=&sort=&page=&pageSize=` | All published reviews (with `product`), plus the store-wide `summary`. `sort`: `newest` (default), `highest`, `lowest`. |
| `GET /products/:slug/reviews?rating=&sort=&page=&pageSize=` | → `Paginated<Review> & { summary: RatingSummary }` |
| `GET /products/:slug/reviews/eligibility` | → `{ canReview, reason: 'login' \| 'not_purchased' \| 'already_reviewed' \| null, review: Review \| null }` |
| `POST /products/:slug/reviews` (auth) | Body `{ rating: 1–5, title?: string (≤120), body: string (10–2000) }` → `201 Review`. `400` if the customer hasn't bought it. |

---

## Cart (guest or logged in)

All cart endpoints return the full `Cart`.

| Method & path | Body |
| --- | --- |
| `GET /cart` | |
| `POST /cart/items` | `{ "variantId": string, "quantity": number }` adds to the existing quantity |
| `PATCH /cart/items/:itemId` | `{ "quantity": number }` (1–100) |
| `DELETE /cart/items/:itemId` | |
| `DELETE /cart` | clears the cart |

`409 OUT_OF_STOCK` when the requested quantity exceeds stock (`details.available`).

---

## Addresses (auth)

| Method & path | Body / response |
| --- | --- |
| `GET /addresses` | `{ "items": Address[] }` (default first) |
| `POST /addresses` | address fields (no `id`) → `Address`. First address becomes default. |
| `PATCH /addresses/:id` | partial address fields → `Address` |
| `DELETE /addresses/:id` | `204` |
| `POST /addresses/:id/default` | → `Address` |

Validation: `fullName` 2–80, `phone` 10-digit Indian mobile or E.164, `line1` 3–200,
`city`, `state` required, `pincode` 6 digits for `country = IN` (any postal / ZIP code elsewhere),
`country` ISO 3166-1 alpha-2 (default `IN`).

---

## Checkout (auth)

### `GET /checkout/summary?addressId=`
→ `{ "cart": Cart, "subtotal": number, "shippingFee": number, "discount": 0, "total": number,
     "freeShippingThreshold": number, "international": boolean, "gateways": ["razorpay", "stripe", "mock"] }`
(`gateways` lists only enabled ones.) Pass `addressId` to price shipping for that address's country;
without it, domestic shipping is assumed.

### `POST /checkout`
Body `{ "addressId": string, "gateway": "razorpay" | "stripe" | "mock", "email"?: string, "notes"?: string }`.
Validates the cart, **reserves stock**, creates the order (`status: pending`) and the gateway payment.
Earlier unpaid orders from the same user are cancelled and their stock released.
If `email` is given and the user has none, it is saved to the profile.
Response `201 { "order": Order, "payment": PaymentInit }`.
Errors: `409 CART_EMPTY`, `409 OUT_OF_STOCK` (`details.items: [{ variantId, available }]`), `502 GATEWAY_ERROR`.

The cart is **cleared once payment succeeds**, not at order creation.

---

## Payments

### Razorpay (domestic: UPI, cards, net banking, wallets)
1. Frontend loads `https://checkout.razorpay.com/v1/checkout.js` and opens
   `new Razorpay({ key: keyId, order_id: razorpayOrderId, amount, currency, name, description, prefill, handler })`.
2. In `handler(response)` call:

`POST /payments/razorpay/verify`
Body `{ "orderNumber", "razorpayOrderId", "razorpayPaymentId", "razorpaySignature" }` → `{ "order": Order }`.
The signature is checked with HMAC-SHA256 against the key secret.

`POST /payments/razorpay/failed` body `{ "orderNumber", "razorpayOrderId", "error": { "code"?, "description"?, "reason"? } }`
→ `{ "order": Order }`. Records the failure; the order stays payable until it expires.

### Stripe (international cards)
1. Redirect the browser to `checkoutUrl`.
2. Stripe returns to `FRONTEND_URL/checkout/success?order=<orderNumber>&session_id=<id>`
   (cancel → `FRONTEND_URL/checkout/cancelled?order=<orderNumber>`).
3. The success page calls:

`POST /payments/stripe/verify` body `{ "sessionId" }` → `{ "order": Order }`.

### Mock gateway (development only, `ENABLE_MOCK_PAYMENTS=true`)
`POST /payments/mock/complete` body `{ "orderNumber", "mockPaymentId", "outcome": "success" | "failure" }` → `{ "order": Order }`.

### Webhooks (server to server, raw body, no cookies)
- `POST /webhooks/razorpay`: header `X-Razorpay-Signature`; handles `payment.captured`, `order.paid`, `payment.failed`.
- `POST /webhooks/stripe`: header `Stripe-Signature`; handles `checkout.session.completed`,
  `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`.

Marking an order paid is idempotent, so the verify call and the webhook can both fire safely.

---

## Orders (auth)

| Method & path | Response |
| --- | --- |
| `GET /orders?page=` | paginated `OrderSummary` |
| `GET /orders/:orderNumber` | `Order` |
| `POST /orders/:orderNumber/pay` body `{ "gateway" }` | `{ "order": Order, "payment": PaymentInit }`, retries payment for a payable order |
| `POST /orders/:orderNumber/cancel` | `{ "order": Order }` (unpaid pending orders only) |
| `GET /orders/:orderNumber/tracking` | `{ "shipment": Shipment \| null, "events": { "date": string, "status": string, "location": string \| null, "activity": string \| null }[] }` |

---

## Bulk orders / WhatsApp

### `POST /bulk-enquiries` (public, rate limited)
Body:
```json
{ "name": "Ravi", "phone": "9876543210", "email": "ravi@example.com", "company": "Acme",
  "message": "Need 200 tees for an event",
  "items": [{ "productId": "uuid", "variantId": "uuid", "productName": "Classic Tee", "variantLabel": "M / Black", "quantity": 200 }] }
```
`items` is optional (0–50 entries). Response `201 { "id": string, "whatsappUrl": string | null }`.
`whatsappUrl` is a `https://wa.me/<number>?text=...` deep link with the enquiry pre-filled, so the
customer can continue the conversation on WhatsApp. If WATI is configured, the business also
gets a WhatsApp template notification.

---

## Admin (role `admin`)

All paths are prefixed with `/admin`. Non-admins get `403`.

### Dashboard
`GET /admin/dashboard?days=30` (7–365)
```json
{
  "range": { "from": "...", "to": "...", "days": 30 },
  "totals": { "revenue": 0, "orders": 0, "paidOrders": 0, "avgOrderValue": 0, "newCustomers": 0,
              "pendingFulfilment": 0, "previousRevenue": 0, "previousOrders": 0 },
  "revenueByDay": [{ "date": "2026-10-01", "revenue": 0, "orders": 0 }],
  "ordersByStatus": [{ "status": "confirmed", "count": 0 }],
  "topProducts": [{ "productId": "uuid", "name": "Classic Tee", "quantity": 0, "revenue": 0 }],
  "lowStock": [{ "variantId": "uuid", "productId": "uuid", "productName": "...", "sku": "...", "size": "M", "color": "Black", "stock": 2 }],
  "recentOrders": ["OrderSummary"],
  "gatewaySplit": [{ "gateway": "razorpay", "orders": 0, "revenue": 0 }]
}
```
`revenue` counts paid orders only; `orders` counts all orders placed. `previousRevenue` and `previousOrders` cover the
preceding period of the same length, and `previousOrders` counts *paid* orders, so it's comparable with `paidOrders`.
`revenueByDay` has every day in the range, with zeros where there were no orders.

### Uploads
`POST /admin/uploads` multipart field `file` (jpeg/png/webp/gif/avif, max 5 MB) → `{ "url": string, "key": string }`.

### Categories
| | |
| --- | --- |
| `GET /admin/categories` | `{ "items": (Category & { isActive: boolean })[] }` including inactive |
| `POST /admin/categories` | `{ name, slug?, description?, imageUrl?, parentId?, sortOrder?, isActive? }` → Category |
| `PUT /admin/categories/:id` | same body → Category |
| `DELETE /admin/categories/:id` | `204`; products in it become uncategorised |

### Products
`GET /admin/products?q=&category=&status=&page=&pageSize=` (`category` = id or slug; without `status`, archived products are hidden) → paginated:
```ts
{ id, name, slug, status, isFeatured, category: {id,name,slug} | null, imageUrl, minPrice, maxPrice,
  totalStock, variantCount, updatedAt }
```
`GET /admin/products/:id` → `Product` (all variants, including inactive).

`POST /admin/products` and `PUT /admin/products/:id` body:
```ts
{
  name: string; slug?: string; description: string; categoryId: string | null;
  status: 'active' | 'draft' | 'archived'; isFeatured: boolean;
  variants: { id?: string; sku: string; size: string | null; color: string | null; colorHex: string | null;
              price: number; compareAtPrice: number | null; stock: number; isActive: boolean }[]; // ≥ 1
  images: { id?: string; url: string; key?: string | null; alt?: string | null }[]; // array order = display order
}
```
→ `Product`. On `PUT`, variants with an `id` are updated, those without are created, and missing
ones are deleted (or deactivated if they appear in past orders). `slug` is generated from `name` if omitted.

`DELETE /admin/products/:id` → `204` (archives the product).

### Orders
`GET /admin/orders?status=&paymentStatus=&q=&from=&to=&page=` (`q` matches order number, customer phone or name)
→ paginated `OrderSummary` with `customer`.

`GET /admin/orders/:orderNumber` → `Order & { customer: User, payments: { gateway, gatewayOrderId, gatewayPaymentId, amount, status, error, createdAt }[] }`.

`PATCH /admin/orders/:orderNumber/status` body `{ "status": OrderStatus, "note"?: string }` → `Order`.
Allowed transitions: `confirmed → processing → shipped → delivered`; `pending | confirmed | processing → cancelled`
(cancelling releases stock; a paid order cancelled here should be refunded in the gateway dashboard and
then marked with `PATCH /admin/orders/:orderNumber/payment` body `{ "paymentStatus": "refunded" }`).
Customers get an email for `shipped`, `delivered` and `cancelled`.

`POST /admin/orders/:orderNumber/shipment` body `{ "courier", "awb", "trackingUrl"? }` → `Order` (manual shipment; status becomes `shipped`).

`POST /admin/orders/:orderNumber/shiprocket` body `{ "weight"?, "length"?, "breadth"?, "height"? }` → `Order`
(creates the Shiprocket order and assigns an AWB; requires `SHIPPING_PROVIDER=shiprocket`; Indian addresses
only, so international orders use the manual shipment endpoint).

### Reviews
`GET /admin/reviews?status=&rating=&q=&page=` → `Paginated<Review & { status }> & { summary }` (includes hidden reviews).
`PATCH /admin/reviews/:id` body `{ "status": "published" | "hidden" }`.
`DELETE /admin/reviews/:id` → `204`.

### Users
`GET /admin/users?q=&role=&page=` → paginated `User & { isBlocked, orderCount, totalSpent, lastLoginAt }`.
`GET /admin/users/:id` → `{ user, addresses: Address[], orders: OrderSummary[] }`.
`PATCH /admin/users/:id` body `{ "role"?: "customer" | "admin", "isBlocked"?: boolean }` → user. Admins cannot block or demote themselves.

### Bulk enquiries
`GET /admin/bulk-enquiries?status=&page=` → paginated
`{ id, name, phone, email, company, message, items, status, adminNotes, createdAt, whatsappUrl }`
(`whatsappUrl` opens a chat with the customer).
`PATCH /admin/bulk-enquiries/:id` body `{ "status"?: "new" | "contacted" | "converted" | "closed", "adminNotes"?: string }`.
