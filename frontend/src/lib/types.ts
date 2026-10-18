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
  canReview: boolean;
  reason: "login" | "not_purchased" | "already_reviewed" | null;
  review: Review | null;
};

export type Product = ProductSummary & {
  description: string;
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
export type Gateway = "razorpay" | "stripe" | "mock";

export type OrderSummary = {
  id: string;
  orderNumber: string;
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
  email: string | null;
  phone: string | null;
  notes: string | null;
  shippingAddress: Omit<Address, "id" | "isDefault">;
  items: OrderItem[];
  statusHistory: { status: string; note: string | null; createdAt: string }[];
  shipment: Shipment | null;
  expiresAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  canPay: boolean;
  canCancel: boolean;
};

export type AdminOrder = Order & {
  customer: User;
  payments: {
    gateway: Gateway;
    gatewayOrderId: string;
    gatewayPaymentId: string | null;
    amount: number;
    status: "created" | "paid" | "failed";
    error: string | null;
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
  | { gateway: "mock"; mockPaymentId: string; amount: number; currency: string };

export type CheckoutSummary = {
  cart: Cart;
  subtotal: number;
  shippingFee: number;
  discount: number;
  total: number;
  /** 0 = no free shipping for this destination. */
  freeShippingThreshold: number;
  /** True when the selected address is outside India. */
  international: boolean;
  gateways: Gateway[];
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
