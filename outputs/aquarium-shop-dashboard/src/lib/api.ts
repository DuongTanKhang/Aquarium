// Keep the browser on the same origin by default (Vite proxies /api to NestJS).
// Set VITE_API_BASE_URL when the frontend is deployed separately from the API.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";
const API_REQUEST_TIMEOUT_MS = 15_000;
const MAX_IDEMPOTENT_RETRIES = 2;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  productCount: number;
}

export interface CreateCategoryInput {
  name: string;
  slug?: string;
  description?: string;
  isActive?: boolean;
}

export type UpdateCategoryInput = Partial<CreateCategoryInput>;

export interface ProductImage {
  id: string;
  url: string;
  altText: string | null;
  position: number;
  isPrimary: boolean;
}

export interface ProductImageInput {
  url: string;
  altText?: string;
  position?: number;
  isPrimary?: boolean;
}

export interface Product {
  id: string;
  categoryId: string;
  sku: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  status: string;
  price: string;
  costPrice: string | null;
  stockQuantity: number;
  lowStockThreshold: number;
  size: string | null;
  careLevel: string | null;
  temperatureRange: string | null;
  category: { id: string; name: string; slug: string };
  images: ProductImage[];
  createdAt: string;
  updatedAt: string;
}

export interface PublicProduct {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  price: string;
  inStock: boolean;
  availableQuantity: number;
  category: { id: string; name: string; slug: string };
  images: ProductImage[];
  createdAt: string;
  updatedAt: string;
}

export interface PageResponse<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface DashboardOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  productSummary: string;
  totalAmount: string;
  status: string;
  createdAt: string;
}

export interface DashboardSummary {
  products: number;
  orders: number;
  customers: number;
  lowStockProducts: number;
  revenue: string;
  revenueChange: number;
  averageOrderValue: string;
  salesTrend: Array<{ date: string; revenue: string; orders: number }>;
  categoryMix: Array<{ name: string; revenue: string; orders: number; percentage: number }>;
  recentOrders: DashboardOrder[];
  topProducts: Array<{ id: string; name: string; type: string; price: string; stockQuantity: number; soldQuantity: number }>;
}

export interface OrderItem {
  id: string;
  productName: string;
  sku: string;
  unitPrice: string;
  quantity: number;
  subtotal: string;
}

export interface AdminOrder extends DashboardOrder {
  customerId: string | null;
  customerPhone: string;
  customerEmail: string | null;
  shippingAddress: string;
  note: string | null;
  subtotal: string;
  shippingFee: string;
  discountAmount: string;
  items: OrderItem[];
  payment: { method: string; status: string; amount: string; transactionCode: string | null; paidAt: string | null } | null;
  customer: { id: string; email: string; fullName: string } | null;
  updatedAt: string;
}

export interface CreateOrderInput {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  note?: string;
  paymentMethod: PaymentMethodId;
  items: Array<{ productId: string; quantity: number }>;
}

export interface CheckoutOrderResponse {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: string;
  shippingFee: string;
  discountAmount: string;
  totalAmount: string;
  payment: { method: string; status: string; amount: string } | null;
  items: Array<{ productName: string; quantity: number; subtotal: string }>;
}

export interface PayPalCheckoutStartResponse {
  order: CheckoutOrderResponse;
  paypalOrderId: string;
  approvalUrl: string;
  expiresIn: number;
}

export interface PayPalCheckoutCaptureResponse {
  order: CheckoutOrderResponse;
  captureId: string | null;
  status: "COMPLETED" | "PENDING";
}

export interface PublicOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  status: string;
  subtotal: string;
  shippingFee: string;
  totalAmount: string;
  items: Array<{ productName: string; quantity: number; subtotal: string }>;
  payment: { method: string; status: string; amount: string; approvalUrl: string | null; checkoutExpiresAt: string | null } | null;
  statusHistory: Array<{ status: string; note: string | null; createdAt: string }>;
  createdAt: string;
  updatedAt: string;
}

export type ReturnRequestType = "REFUND" | "RETURN" | "EXCHANGE";
export type ReturnRequestStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "RECEIVED" | "REFUNDED" | "COMPLETED";
export interface ReturnRequest {
  id: string;
  orderId: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  type: ReturnRequestType;
  status: ReturnRequestStatus;
  reason: string;
  amount: string;
  adminNote: string | null;
  resolutionNote: string | null;
  providerRefundId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  status: string;
  totalOrders: number;
  totalSpent: string;
  lastOrderAt: string | null;
  createdAt: string;
}

export interface LowStockProduct {
  id: string;
  name: string;
  sku: string;
  status: string;
  stockQuantity: number;
  lowStockThreshold: number;
  category: { id: string; name: string; slug: string };
  updatedAt: string;
}

export type PaymentMethodId = "CARD" | "PAYPAL" | "COD";
export interface PaymentMethodConfig {
  id: PaymentMethodId;
  provider: "CARD" | "PAYPAL" | "COD";
  label: string;
  description: string;
  enabled: boolean;
  setupNote: string;
}
export interface PaymentSettings {
  country: "US";
  currency: "USD";
  defaultMethod: PaymentMethodId;
  methods: PaymentMethodConfig[];
  updatedAt: string;
}

export interface PaymentConnections {
  paypal: { configured: boolean; connected: boolean; merchantId: string | null; setupUrl: string; mode: "direct" | "connect" };
}

export interface PayPalConnectionStart {
  url: string;
  expiresIn: number;
}

export interface ProductFilters {
  page: number;
  pageSize: number;
  search: string;
  status: string;
  categoryId: string;
  type: string;
}

export interface CreateProductInput {
  categoryId: string;
  sku: string;
  name: string;
  type: string;
  status: string;
  price: string;
  costPrice?: string;
  stockQuantity?: number;
  lowStockThreshold?: number;
  description?: string;
  images?: ProductImageInput[];
}

export type UpdateProductInput = Partial<Omit<CreateProductInput, "stockQuantity">>;

export interface AuthResult {
  accessToken: string;
  accessTokenExpiresIn: number;
  user: { id: string; email: string; role: string };
}

export interface CustomerUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  address: string | null;
  avatarUrl: string | null;
  role: string;
  status: string;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  createdAt: string;
}

export interface MfaPendingResult {
  mfaRequired: true;
  mfaTicket: string;
  expiresIn: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Access tokens are intentionally memory-only. The long-lived refresh token
// remains in the backend-issued HttpOnly cookie, so JavaScript cannot read it.
// Remove tokens written by older builds to avoid leaving credentials at rest.
let accessTokenMemory: string | null = null;
if (typeof window !== "undefined") {
  window.localStorage.removeItem("aquarium_access_token");
  window.sessionStorage.removeItem("aquarium_access_token");
}

export function getAccessToken(): string | null {
  return accessTokenMemory;
}

export function saveAccessToken(token: string, _remember = false): void {
  accessTokenMemory = token;
  window.localStorage.removeItem("aquarium_access_token");
  window.sessionStorage.removeItem("aquarium_access_token");
}

export function clearAccessToken(): void {
  accessTokenMemory = null;
  window.localStorage.removeItem("aquarium_access_token");
  window.sessionStorage.removeItem("aquarium_access_token");
}

type ApiRequestInit = RequestInit & { skipAuthRefresh?: boolean };

let refreshInFlight: Promise<AuthResult> | null = null;

async function apiRequest<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { skipAuthRefresh = false, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  headers.set("Accept", "application/json");
  if (requestInit.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const method = (requestInit.method ?? "GET").toUpperCase();
  const canRetry = ["GET", "HEAD", "OPTIONS"].includes(method);
  let refreshed = false;

  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      API_REQUEST_TIMEOUT_MS,
    );
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        ...requestInit,
        headers,
        credentials: "include",
        // Catalog polling must always see the latest server state instead of a
        // browser-cached response. Mutating requests keep their normal behavior.
        cache: requestInit.cache ?? (method === "GET" ? "no-store" : undefined),
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const authRefreshAllowed = !skipAuthRefresh && !refreshed && ![
          "/auth/login",
          "/auth/register",
          "/auth/refresh",
          "/auth/mfa/verify-login",
        ].includes(path);
        if (response.status === 401 && authRefreshAllowed) {
          refreshed = true;
          try {
            const result = await refreshAccessToken();
            saveAccessToken(result.accessToken);
            headers.set("Authorization", `Bearer ${result.accessToken}`);
            continue;
          } catch {
            clearAccessToken();
          }
        }
        if (canRetry && RETRYABLE_STATUSES.has(response.status) && attempt < MAX_IDEMPOTENT_RETRIES) {
          const retryAfter = Number(response.headers.get("retry-after"));
          const waitMs = Number.isFinite(retryAfter)
            ? Math.min(Math.max(retryAfter * 1_000, 250), 5_000)
            : 250 * 2 ** attempt;
          await new Promise((resolve) => window.setTimeout(resolve, waitMs));
          continue;
        }
        const message =
          typeof payload === "object" && payload !== null && "message" in payload
            ? (payload as { message?: unknown }).message
            : undefined;
        throw new ApiError(
          Array.isArray(message)
            ? message.join(", ")
            : typeof message === "string"
              ? message
              : `Request failed (${response.status})`,
          response.status,
        );
      }

      return payload as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (canRetry && attempt < MAX_IDEMPOTENT_RETRIES) {
        await new Promise((resolve) => window.setTimeout(resolve, 250 * 2 ** attempt));
        continue;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiError("The request timed out. Please try again.", 408);
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
}

function queryString(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export function listAdminCategories(): Promise<PageResponse<Category>> {
  return apiRequest<PageResponse<Category>>(
    "/admin/categories?page=1&pageSize=100&isActive=true",
  );
}

export function listManageCategories(search = ""): Promise<PageResponse<Category>> {
  return apiRequest<PageResponse<Category>>(
    `/admin/categories${queryString({ page: 1, pageSize: 100, search })}`,
  );
}

export function getDashboardSummary(): Promise<DashboardSummary> {
  return apiRequest<DashboardSummary>("/admin/dashboard/summary");
}

export function getDashboardAnalytics(days = 30): Promise<Pick<DashboardSummary, "salesTrend" | "categoryMix" | "topProducts" | "revenue" | "averageOrderValue" | "revenueChange">> {
  return apiRequest(`/admin/dashboard/analytics?days=${encodeURIComponent(days)}`);
}

export function listAdminOrders(query: { page?: number; pageSize?: number; search?: string; status?: string; fromDate?: string; toDate?: string } = {}): Promise<PageResponse<AdminOrder>> {
  return apiRequest<PageResponse<AdminOrder>>(`/admin/orders${queryString({ page: query.page ?? 1, pageSize: query.pageSize ?? 20, search: query.search, status: query.status, fromDate: query.fromDate, toDate: query.toDate })}`);
}

export function getAdminOrder(id: string): Promise<AdminOrder> {
  return apiRequest<AdminOrder>(`/admin/orders/${id}`);
}

export function updateAdminOrderStatus(id: string, status: string, note?: string): Promise<AdminOrder> {
  return apiRequest<AdminOrder>(`/admin/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, note }) });
}

export function createOrder(input: CreateOrderInput, idempotencyKey?: string): Promise<CheckoutOrderResponse> {
  return apiRequest<CheckoutOrderResponse>("/orders", {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    body: JSON.stringify(input),
  });
}

export function createPayPalCheckout(input: CreateOrderInput, idempotencyKey?: string): Promise<PayPalCheckoutStartResponse> {
  return apiRequest<PayPalCheckoutStartResponse>("/payments/paypal/orders", {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    body: JSON.stringify(input),
  });
}

export function resumePayPalCheckout(orderId: string): Promise<PayPalCheckoutStartResponse> {
  return apiRequest<PayPalCheckoutStartResponse>(`/payments/paypal/orders/${encodeURIComponent(orderId)}/resume`, {
    method: "POST",
  });
}

export function capturePayPalCheckout(orderId: string): Promise<PayPalCheckoutCaptureResponse> {
  return apiRequest<PayPalCheckoutCaptureResponse>(`/payments/paypal/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    body: "{}",
  });
}

export function cancelPayPalCheckout(orderId: string): Promise<CheckoutOrderResponse> {
  return apiRequest<CheckoutOrderResponse>(`/payments/paypal/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: "POST",
    body: "{}",
  });
}

export function lookupPublicOrder(email: string, orderNumber: string): Promise<PublicOrder> {
  return apiRequest<PublicOrder>("/orders/lookup", {
    method: "POST",
    body: JSON.stringify({ email, orderNumber }),
  });
}

export function listMyOrders(): Promise<PublicOrder[]> {
  return apiRequest<PublicOrder[]>("/orders/mine");
}

export function listMyReturnRequests(): Promise<ReturnRequest[]> {
  return apiRequest<ReturnRequest[]>("/returns/mine");
}

export function createReturnRequest(input: { orderId: string; type: ReturnRequestType; reason: string }): Promise<ReturnRequest> {
  return apiRequest<ReturnRequest>("/returns", { method: "POST", body: JSON.stringify(input) });
}

export function listAdminReturnRequests(): Promise<ReturnRequest[]> {
  return apiRequest<ReturnRequest[]>("/admin/returns");
}

export function updateAdminReturnRequest(id: string, input: { status: ReturnRequestStatus; adminNote?: string; resolutionNote?: string; providerRefundId?: string }): Promise<ReturnRequest> {
  return apiRequest<ReturnRequest>(`/admin/returns/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function registerCustomer(input: { email: string; password: string; fullName: string; phone: string }): Promise<AuthResult> {
  return apiRequest<AuthResult>("/auth/register", { method: "POST", body: JSON.stringify(input) });
}

export function getCurrentUser(): Promise<CustomerUser> {
  return apiRequest<CustomerUser>("/auth/me");
}

export function updateCustomerProfile(input: { fullName: string; phone?: string; address?: string; avatarUrl?: string | null }): Promise<CustomerUser> {
  return apiRequest<CustomerUser>("/account/profile", { method: "PATCH", body: JSON.stringify(input) });
}

export function sendEmailVerification(): Promise<{ message: string }> {
  return apiRequest<{ message: string }>("/auth/email/send-verification", { method: "POST" });
}

export function verifyEmail(token: string): Promise<AuthResult> {
  return apiRequest<AuthResult>("/auth/email/verify", { method: "POST", body: JSON.stringify({ token }) });
}

export function sendPhoneVerification(): Promise<{ message: string }> {
  return apiRequest<{ message: string }>("/auth/phone/send-verification", { method: "POST" });
}

export function verifyPhone(code: string): Promise<CustomerUser> {
  return apiRequest<CustomerUser>("/auth/phone/verify", { method: "POST", body: JSON.stringify({ code }) });
}

export function listAdminCustomers(query: { page?: number; pageSize?: number; search?: string } = {}): Promise<PageResponse<Customer>> {
  return apiRequest<PageResponse<Customer>>(`/admin/customers${queryString({ page: query.page ?? 1, pageSize: query.pageSize ?? 20, search: query.search })}`);
}

export function getAdminCustomer(id: string): Promise<Customer> {
  return apiRequest<Customer>(`/admin/customers/${id}`);
}

export function listLowStockProducts(query: { page?: number; pageSize?: number; search?: string; threshold?: number } = {}): Promise<PageResponse<LowStockProduct>> {
  return apiRequest<PageResponse<LowStockProduct>>(`/admin/inventory/low-stock${queryString({ page: query.page ?? 1, pageSize: query.pageSize ?? 20, search: query.search, threshold: query.threshold })}`);
}

export function adjustInventory(productId: string, type: string, quantity: number, note?: string): Promise<Product> {
  return apiRequest<Product>(`/admin/inventory/${productId}/adjust`, { method: "POST", body: JSON.stringify({ type, quantity, note }) });
}

export function getPaymentSettings(): Promise<PaymentSettings> {
  return apiRequest<PaymentSettings>("/admin/payment-settings");
}

export function getPaymentConnections(): Promise<PaymentConnections> {
  return apiRequest<PaymentConnections>("/admin/payment-settings/connections");
}

export function startPayPalConnection(): Promise<PayPalConnectionStart> {
  return apiRequest<PayPalConnectionStart>("/admin/payment-settings/paypal/connect");
}

export function updatePaymentSettings(settings: { currency: PaymentSettings["currency"]; defaultMethod: PaymentSettings["defaultMethod"]; methods: Array<Pick<PaymentMethodConfig, "id" | "enabled">> }): Promise<PaymentSettings> {
  return apiRequest<PaymentSettings>("/admin/payment-settings", { method: "PATCH", body: JSON.stringify(settings) });
}

export function getPublicPaymentMethods(): Promise<{ country: "US"; currency: "USD"; defaultMethod: PaymentMethodId; methods: Array<Pick<PaymentMethodConfig, "id" | "provider" | "label" | "description">> }> {
  return apiRequest("/admin/payment-settings/public");
}

export function createCategory(input: CreateCategoryInput): Promise<Category> {
  return apiRequest<Category>("/admin/categories", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCategory(
  id: string,
  input: UpdateCategoryInput,
): Promise<Category> {
  return apiRequest<Category>(`/admin/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteCategory(id: string, cascade = false): Promise<void> {
  return apiRequest<void>(`/admin/categories/${id}${cascade ? "?cascade=true" : ""}`, { method: "DELETE" });
}

export function listAdminProducts(
  filters: ProductFilters,
): Promise<PageResponse<Product>> {
  return apiRequest<PageResponse<Product>>(
    `/admin/products${queryString({
      page: filters.page,
      pageSize: filters.pageSize,
      search: filters.search,
      status: filters.status,
      categoryId: filters.categoryId,
      type: filters.type,
    })}`,
  );
}

export function listPublicProducts(query: {
  page?: number;
  pageSize?: number;
  search?: string;
  categorySlug?: string;
  type?: string;
  sort?: string;
} = {}): Promise<PageResponse<PublicProduct>> {
  return apiRequest<PageResponse<PublicProduct>>(`/products${queryString({
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 24,
    search: query.search,
    categorySlug: query.categorySlug,
    type: query.type,
    sort: query.sort ?? "newest",
  })}`);
}

export function listPublicCategories(query: { page?: number; pageSize?: number; search?: string } = {}): Promise<PageResponse<Category>> {
  return apiRequest<PageResponse<Category>>(`/categories${queryString({
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 24,
    search: query.search,
  })}`);
}

export function createProduct(input: CreateProductInput): Promise<Product> {
  return apiRequest<Product>("/admin/products", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateProduct(
  id: string,
  input: UpdateProductInput,
): Promise<Product> {
  return apiRequest<Product>(`/admin/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteProduct(id: string): Promise<void> {
  return apiRequest<void>(`/admin/products/${id}`, { method: "DELETE" });
}

export function login(
  email: string,
  password: string,
): Promise<AuthResult | MfaPendingResult> {
  return apiRequest<AuthResult | MfaPendingResult>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function verifyMfaLogin(
  mfaTicket: string,
  code: string,
): Promise<AuthResult> {
  return apiRequest<AuthResult>("/auth/mfa/verify-login", {
    method: "POST",
    body: JSON.stringify({ mfaTicket, code }),
  });
}

export function requestPasswordReset(email: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>("/auth/password/forgot", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token: string, newPassword: string): Promise<void> {
  return apiRequest<void>("/auth/password/reset", {
    method: "POST",
    body: JSON.stringify({ token, newPassword }),
  });
}

export function refreshAccessToken(): Promise<AuthResult> {
  if (!refreshInFlight) {
    refreshInFlight = apiRequest<AuthResult>("/auth/refresh", { method: "POST", skipAuthRefresh: true })
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export function logout(): Promise<void> {
  return apiRequest<void>("/auth/logout", { method: "POST" });
}

export function submitContactMessage(input: { name: string; email: string; topic: string; message: string }): Promise<{ message: string }> {
  return apiRequest<{ message: string }>("/contact", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function subscribeNewsletter(email: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>("/contact/newsletter", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function listFavorites(): Promise<PublicProduct[]> {
  return apiRequest<PublicProduct[]>("/favorites");
}

export function addFavorite(productId: string): Promise<PublicProduct> {
  return apiRequest<PublicProduct>(`/favorites/${encodeURIComponent(productId)}`, { method: "POST" });
}

export function removeFavorite(productId: string): Promise<{ removed: boolean }> {
  return apiRequest<{ removed: boolean }>(`/favorites/${encodeURIComponent(productId)}`, { method: "DELETE" });
}
