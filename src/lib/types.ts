// Types mirroring the backend REST API. See docs/API.md for the full contract.
// Money values are integers in paise (₹1 = 100).

export type Role = "customer" | "admin";

export type User = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  role: Role;
  createdAt: string;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type StoreConfig = {
  storeName: string;
  currency: string;
  shippingFee: number;
  freeShippingThreshold: number;
  internationalShippingFee: number;
  /** 0 = international shipping is never free. */
  internationalFreeShippingThreshold: number;
  supportEmail: string | null;
  supportPhone: string | null;
  /** FSSAI food licence number; hidden in the footer when null. */
  fssaiLicenseNo: string | null;
  whatsappNumber: string | null;
  gateways: {
    razorpay: { enabled: boolean; keyId: string | null };
    stripe: { enabled: boolean };
    mock: { enabled: boolean };
  };
  /** Limits for buying gift cards online (paise). */
  giftCardPurchase: { min: number; max: number };
  /** Admin → Settings → Pre-booking: the Pre-book page and menu link. */
  prebookEnabled: boolean;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  parentId: string | null;
  sortOrder: number;
  productCount: number;
  isActive?: boolean; // admin endpoints only
};

export type CategoryRef = { id: string; name: string; slug: string };

export type ProductImage = {
  id: string;
  url: string;
  key?: string | null;
  alt: string | null;
  sortOrder: number;
};

export type Variant = {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  colorHex: string | null;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  isActive: boolean;
};

export type ProductStatus = "active" | "draft" | "archived";

export type ProductSummary = {
  id: string;
  name: string;
  slug: string;
  minPrice: number;
  maxPrice: number;
  compareAtPrice: number | null;
  imageUrl: string | null;
  category: CategoryRef | null;
  inStock: boolean;
  isFeatured: boolean;
  /** null when the product has no published reviews yet. */
  rating: ProductRating | null;
  createdAt: string;
};

export type ProductRating = { average: number; count: number };

export type Review = {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  authorName: string;
  authorCity: string | null;
  /** ISO country code of the delivery address. */
  authorCountry: string | null;
  verified: boolean;
  createdAt: string;
  product?: { id: string; name: string; slug: string; imageUrl: string | null };
  status?: "published" | "hidden"; // admin endpoints only
};

export type RatingSummary = {
  average: number;
  count: number;
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>;
};

export type ReviewList = Paginated<Review> & { summary: RatingSummary };

export type ReviewEligibility = {
  /** Any signed-in customer can review. */
  canReview: boolean;
  reason: "login" | "already_reviewed" | null;
  review: Review | null;
  /** They bought it: the review shows as a verified purchase. */
  verified: boolean;
};

export type Product = ProductSummary & {
  description: string;
  /** Null in the store when the admin hides them. */
  ingredients: string | null;
  showIngredients: boolean;
  status: ProductStatus;
  images: ProductImage[];
  variants: Variant[];
  options: { sizes: string[]; colors: { name: string; hex: string | null }[] };
  updatedAt: string;
};

export type ProductFacets = {
  sizes: string[];
  colors: { name: string; hex: string | null }[];
  priceRange: { min: number; max: number };
};

export type ProductList = Paginated<ProductSummary> & { facets: ProductFacets };

export type ProductSort = "newest" | "price_asc" | "price_desc" | "popular" | "rating" | "relevance";

export type CartItem = {
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  imageUrl: string | null;
  size: string | null;
  color: string | null;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  quantity: number;
  stock: number;
  lineTotal: number;
  isAvailable: boolean;
};

export type Cart = {
  id: string | null;
  items: CartItem[];
  itemCount: number;
  subtotal: number;
};

export type Address = {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isDefault: boolean;
};

export type AddressInput = Omit<Address, "id" | "isDefault"> & { isDefault?: boolean };

export type OrderStatus = "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
/** "gift_card" = paid in full by a gift card (no online payment). */
export type Gateway = "razorpay" | "stripe" | "mock" | "gift_card";
export type OnlineGateway = Exclude<Gateway, "gift_card">;

/** "gift_card" = a gift card bought online (no delivery address, delivered by email). */
export type OrderKind = "goods" | "gift_card";

export type OrderSummary = {
  id: string;
  orderNumber: string;
  kind: OrderKind;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentGateway: Gateway | null;
  total: number;
  itemCount: number;
  previewImage: string | null;
  createdAt: string;
  customer?: { id: string; name: string | null; phone: string };
};

export type OrderItem = {
  id: string;
  productId: string | null;
  productName: string;
  productSlug: string | null;
  sku: string;
  size: string | null;
  color: string | null;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  /** Gift card purchases: who it's for and, once paid, the issued card (masked for customers). */
  giftCard: {
    recipientName: string;
    recipientEmail: string;
    senderName: string | null;
    message: string | null;
    code: string | null;
    id?: string; // admin endpoints only
  } | null;
};

export type Shipment = {
  provider: "manual" | "shiprocket";
  courier: string | null;
  awb: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
};

export type Order = OrderSummary & {
  currency: string;
  subtotal: number;
  shippingFee: number;
  discount: number;
  discountCode: string | null;
  discountTitle: string | null;
  /** Paid by gift card; `amountDue` is the rest, charged online. */
  giftCardAmount: number;
  amountDue: number;
  /** Customers see a masked code ("••••-4HNE"); admins see the full code and id. */
  giftCard: { code: string; id?: string } | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  /** null for gift card purchases. */
  shippingAddress: Omit<Address, "id" | "isDefault"> | null;
  items: OrderItem[];
  statusHistory: { status: string; note: string | null; createdAt: string }[];
  shipment: Shipment | null;
  expiresAt: string | null;
  paidAt: string | null;
  /** How it was paid (card, UPI, net banking…), when the gateway said. */
  paymentMethod: PaymentMethodDetails | null;
  cancelledAt: string | null;
  canPay: boolean;
  canCancel: boolean;
};

/** From the gateway: card network and last 4 digits, masked UPI ID, net banking bank, wallet. */
export type PaymentMethodDetails = {
  /** card, upi, netbanking, wallet, emi, paylater, test… */
  method: string;
  network?: string | null;
  /** credit, debit, prepaid */
  cardType?: string | null;
  last4?: string | null;
  /** Issuing bank code, e.g. HDFC */
  issuer?: string | null;
  /** Net banking bank code, e.g. ICIC */
  bank?: string | null;
  wallet?: string | null;
  /** Masked, e.g. ra***@okhdfcbank */
  vpa?: string | null;
};

export type AdminOrder = Order & {
  customer: User;
  payments: {
    gateway: OnlineGateway;
    gatewayOrderId: string;
    gatewayPaymentId: string | null;
    amount: number;
    status: "created" | "paid" | "failed";
    error: string | null;
    methodDetails: PaymentMethodDetails | null;
    createdAt: string;
  }[];
};

export type PaymentInit =
  | {
      gateway: "razorpay";
      keyId: string;
      razorpayOrderId: string;
      amount: number;
      currency: string;
      name: string;
      description: string;
      prefill: { name: string | null; email: string | null; contact: string };
    }
  | { gateway: "stripe"; checkoutUrl: string; sessionId: string }
  | { gateway: "mock"; mockPaymentId: string; amount: number; currency: string }
  | { gateway: "gift_card" };

export type DiscountType = "percent" | "fixed" | "free_shipping";

/** A discount as customers see it. `value` is a percentage or paise. */
export type PublicDiscount = {
  id: string;
  code: string | null;
  title: string;
  description: string | null;
  type: DiscountType;
  value: number;
  maxDiscount: number | null;
  minSubtotal: number;
  automatic: boolean;
};

/** A running offer customers can see: an automatic offer, or a coupon the admin lists. */
export type Offer = PublicDiscount & {
  region: "all" | "domestic" | "international";
  firstOrderOnly: boolean;
  endsAt: string | null;
};

/** An offer checked against the cart at checkout. */
export type CartOffer = Offer & {
  eligible: boolean;
  /** Paise the cart is short of the minimum (0 when eligible). */
  remaining: number;
  /** Paise it would save on this cart (0 when not eligible). */
  saving: number;
};

export type CheckoutSummary = {
  cart: Cart;
  subtotal: number;
  shippingFee: number;
  discount: number;
  total: number;
  giftCardAmount: number;
  /** What the payment gateway charges (total minus gift card). */
  amountDue: number;
  appliedDiscount: (PublicDiscount & { amount: number }) | null;
  /** Result for the code the customer typed. */
  coupon: { code: string; applied: boolean; message: string | null } | null;
  /** An automatic offer the cart is close to unlocking. */
  offerHint: { title: string; remaining: number } | null;
  /** Offers for this cart, eligible ones first. */
  offers: CartOffer[];
  giftCard: { code: string; applied: boolean; balance: number | null; amount: number; message: string | null } | null;
  /** 0 = no free shipping for this destination. */
  freeShippingThreshold: number;
  /** True when the selected address is outside India. */
  international: boolean;
  gateways: OnlineGateway[];
};

export type AdminDiscount = PublicDiscount & {
  region: "all" | "domestic" | "international";
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  firstOrderOnly: boolean;
  /** Coupon codes: listed to customers in "Available offers". */
  showInOffers: boolean;
  isActive: boolean;
  timesUsed: number;
  /** Paise saved on paid orders. */
  totalSaved: number;
  createdAt: string;
  updatedAt: string;
};

export type DiscountInput = {
  code: string | null;
  title: string;
  description: string | null;
  type: DiscountType;
  value: number;
  maxDiscount: number | null;
  minSubtotal: number;
  region: AdminDiscount["region"];
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  firstOrderOnly: boolean;
  showInOffers: boolean;
  isActive: boolean;
};

export type GiftCardStatus = "active" | "used" | "expired" | "disabled";

export type GiftCard = {
  id: string;
  /** Formatted, e.g. K7QM-2XPA-9RTW-4HNE. */
  code: string;
  initialBalance: number;
  balance: number;
  currency: string;
  recipientName: string | null;
  recipientEmail: string | null;
  senderName: string | null;
  message: string | null;
  expiresAt: string | null;
  isActive: boolean;
  status: GiftCardStatus;
  createdAt: string;
  updatedAt: string;
};

export type GiftCardTransaction = {
  id: number;
  kind: "issue" | "redeem" | "refund" | "adjust";
  /** Negative = spent. */
  amount: number;
  note: string | null;
  createdAt: string;
  orderNumber: string | null;
  createdByName: string | null;
};

export type GiftCardDetail = GiftCard & { transactions: GiftCardTransaction[] };

export type GiftCardList = Paginated<GiftCard> & { summary: { outstanding: number; cards: number } };

export type GiftCardBalance = {
  code: string;
  balance: number;
  currency: string;
  expiresAt: string | null;
  usable: boolean;
  message: string | null;
};

export type TrackingEvent = { date: string; status: string; location: string | null; activity: string | null };

export type BulkEnquiryItem = {
  productId?: string | null;
  variantId?: string | null;
  productName: string;
  variantLabel?: string | null;
  quantity: number;
};

export type BulkEnquiryStatus = "new" | "contacted" | "converted" | "closed";

export type BulkEnquiry = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
  message: string | null;
  items: BulkEnquiryItem[];
  status: BulkEnquiryStatus;
  adminNotes: string | null;
  createdAt: string;
  whatsappUrl: string | null;
};

/** A product on the Pre-book form (all active products, in stock or not). */
export type PrebookProduct = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  category: { name: string; slug: string } | null;
  variants: { id: string; label: string | null; price: number }[];
};

export type PrebookingItem = {
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type PrebookingStatus = "new" | "confirmed" | "ready" | "completed" | "cancelled";

export type Prebooking = {
  id: string;
  reference: string;
  name: string;
  phone: string;
  email: string | null;
  /** YYYY-MM-DD */
  deliveryDate: string;
  address: string | null;
  notes: string | null;
  items: PrebookingItem[];
  estimatedTotal: number;
  status: PrebookingStatus;
  adminNotes: string | null;
  createdAt: string;
  whatsappUrl: string | null;
};

export type AdminProductRow = {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  isFeatured: boolean;
  category: CategoryRef | null;
  imageUrl: string | null;
  minPrice: number;
  maxPrice: number;
  totalStock: number;
  variantCount: number;
  updatedAt: string;
};

export type ProductInput = {
  name: string;
  slug?: string;
  description: string;
  ingredients: string | null;
  showIngredients: boolean;
  categoryId: string | null;
  status: ProductStatus;
  isFeatured: boolean;
  variants: {
    id?: string;
    sku: string;
    size: string | null;
    color: string | null;
    colorHex: string | null;
    price: number;
    compareAtPrice: number | null;
    stock: number;
    isActive: boolean;
  }[];
  images: { id?: string; url: string; key?: string | null; alt?: string | null }[];
};

export type AdminUserRow = User & {
  isBlocked: boolean;
  orderCount: number;
  totalSpent: number;
  lastLoginAt: string | null;
};

export type SettingSource = "admin" | "env" | "default";

export type SettingField = {
  /** Environment variable name, e.g. STORE_NAME. */
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "url" | "number" | "money" | "select" | "boolean" | "secret";
  help?: string;
  placeholder?: string;
  /** Starts a sub-heading within the group. */
  section?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  required?: boolean;
  checkboxLabel?: string;
  lookup?: "twilioVerifyTemplates";
  webhook?: "razorpay" | "stripe";
  source: SettingSource;
  /** Raw value (money in paise, booleans "true"/"false"); always null for secrets. */
  value: string | null;
  secret?: { set: boolean; hint: string | null };
  /** What the setting falls back to when the saved value is removed. */
  fallback: { value: string | null; set?: boolean };
};

export type SettingsGroup = { id: string; title: string; description?: string; fields: SettingField[] };

export type AdminSettings = {
  groups: SettingsGroup[];
  webhooks: { razorpay: string; stripe: string };
  server: {
    environment: string;
    frontendUrl: string;
    currency: string;
    mockPayments: boolean;
    otpCodesInResponse: boolean;
    adminPhones: number;
    dedicatedEncryptionKey: boolean;
    /** "godaddy" = GoDaddy's mail gateway; the SMTP settings are then not used. */
    emailTransport: "smtp" | "godaddy";
  };
};

export type VerifyTemplate = { sid: string; name: string; channels: string[]; text: string | null };

export type Dashboard = {
  range: { from: string; to: string; days: number };
  totals: {
    revenue: number;
    orders: number;
    paidOrders: number;
    avgOrderValue: number;
    newCustomers: number;
    pendingFulfilment: number;
    previousRevenue: number;
    previousOrders: number;
  };
  revenueByDay: { date: string; revenue: number; orders: number }[];
  ordersByStatus: { status: OrderStatus; count: number }[];
  topProducts: { productId: string; name: string; quantity: number; revenue: number }[];
  lowStock: {
    variantId: string;
    productId: string;
    productName: string;
    sku: string;
    size: string | null;
    color: string | null;
    stock: number;
  }[];
  recentOrders: OrderSummary[];
  gatewaySplit: { gateway: Gateway; orders: number; revenue: number }[];
};
