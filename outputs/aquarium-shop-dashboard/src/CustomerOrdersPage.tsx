import { useEffect, useState, type FormEvent } from "react";
import { ApiError, createReturnRequest, listMyOrders, listMyReturnRequests, lookupPublicOrder, resumePayPalCheckout, type CustomerUser, type PublicOrder, type ReturnRequest, type ReturnRequestType } from "./lib/api";

interface CustomerOrdersPageProps {
  customer?: CustomerUser | null;
  onBack: () => void;
}

interface SavedOrderRef {
  orderNumber: string;
  email: string;
}

const STORAGE_KEY = "aquarium-store-order-refs";
const ORDER_STEPS = ["PENDING", "CONFIRMED", "PREPARING", "SHIPPING", "COMPLETED"];
// Keep customer tracking fresh without requiring a page reload. The orders
// screen is only mounted while it is open, so this stays well below the API
// rate limit while still reflecting admin fulfillment changes quickly.
const ORDER_REFRESH_MS = 5_000;

function readSavedRefs(): SavedOrderRef[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedOrderRef => typeof item === "object" && item !== null && typeof (item as { orderNumber?: unknown }).orderNumber === "string" && typeof (item as { email?: unknown }).email === "string").slice(0, 12);
  } catch {
    return [];
  }
}

function saveRef(ref: SavedOrderRef): SavedOrderRef[] {
  const next = [ref, ...readSavedRefs().filter((item) => !(item.orderNumber.toUpperCase() === ref.orderNumber.toUpperCase() && item.email.toLowerCase() === ref.email.toLowerCase()))].slice(0, 12);
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* keep lookup usable if storage is blocked */ }
  return next;
}

function formatPrice(value: string): string {
  return `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recently" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function humanStatus(value: string): string {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stepIndex(status: string): number {
  const index = ORDER_STEPS.indexOf(status);
  return index === -1 ? 0 : index;
}

function isPayPalPaymentOpen(order: PublicOrder): boolean {
  if (order.payment?.method !== "PAYPAL" || order.payment.status !== "PENDING" || !order.payment.approvalUrl) return false;
  if (!order.payment.checkoutExpiresAt) return true;
  const expiresAt = new Date(order.payment.checkoutExpiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export default function CustomerOrdersPage({ customer = null, onBack }: CustomerOrdersPageProps) {
  const [savedRefs, setSavedRefs] = useState<SavedOrderRef[]>(readSavedRefs);
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [expandedOrder, setExpandedOrder] = useState("");
  const [form, setForm] = useState({ email: savedRefs[0]?.email ?? "", orderNumber: savedRefs[0]?.orderNumber ?? "" });
  const [loading, setLoading] = useState(Boolean(customer || savedRefs.length));
  const [lookupLoading, setLookupLoading] = useState(false);
  const [payingOrderId, setPayingOrderId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let requestId = 0;
    const load = async (showLoading: boolean) => {
      const currentRequest = ++requestId;
      if (showLoading) setLoading(true);
      try {
        if (customer) {
          const mine = await listMyOrders();
          if (!active || currentRequest !== requestId) return;
          setOrders(mine);
          setError("");
          if (mine.length) setExpandedOrder((current) => current || mine[0].id);
        } else if (savedRefs.length) {
          const results = await Promise.allSettled(savedRefs.map((ref) => lookupPublicOrder(ref.email, ref.orderNumber)));
          if (!active || currentRequest !== requestId) return;
          setOrders(results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []));
        } else {
          setOrders([]);
        }
      } catch (requestError: unknown) {
        if (!active || currentRequest !== requestId) return;
        setError(requestError instanceof ApiError ? requestError.message : "We could not load your orders right now.");
      } finally {
        if (active && currentRequest === requestId) setLoading(false);
      }
    };
    void load(true);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(false);
    }, ORDER_REFRESH_MS);
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") void load(false);
    };
    window.addEventListener("focus", refreshOnReturn);
    window.addEventListener("online", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnReturn);
      window.removeEventListener("online", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [customer, savedRefs]);

  const lookup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLookupLoading(true);
    setError("");
    try {
      const order = await lookupPublicOrder(form.email, form.orderNumber);
      setOrders((current) => [order, ...current.filter((item) => item.id !== order.id)]);
      setSavedRefs(saveRef({ email: form.email.trim(), orderNumber: form.orderNumber.trim().toUpperCase() }));
      setExpandedOrder(order.id);
    } catch (requestError: unknown) {
      setError(requestError instanceof ApiError ? requestError.message : "We could not find that order. Check the email and order number.");
    } finally {
      setLookupLoading(false);
    }
  };

  const payForOrder = async (order: PublicOrder) => {
    if (isPayPalPaymentOpen(order) && order.payment?.approvalUrl) {
      window.location.assign(order.payment.approvalUrl);
      return;
    }
    if (order.payment?.method !== "PAYPAL" || order.payment.status !== "PENDING" || payingOrderId) return;
    setPayingOrderId(order.id);
    setError("");
    try {
      const checkout = await resumePayPalCheckout(order.id);
      window.location.assign(checkout.approvalUrl);
    } catch (requestError: unknown) {
      setError(requestError instanceof ApiError ? requestError.message : "We could not reopen PayPal checkout. Please place a new order.");
    } finally {
      setPayingOrderId("");
    }
  };

  return (
    <main className="store-orders-page">
      <div className="store-orders-shell">
        <div className="store-orders-topbar"><button className="checkout-back" onClick={onBack}><span aria-hidden="true">←</span> Back to collection</button><div className="checkout-wordmark"><span>AQUA</span><small>THE LIVING SHOP</small></div><span className="checkout-secure">⌑ Secure order access</span></div>
        <header className="store-orders-heading"><div><span className="store-kicker">Your little world</span><h1>My <em>orders.</em></h1></div><p>Follow every arrival from the moment it leaves our care to the moment it reaches your tank.</p></header>

        <section className="orders-lookup-card">
          <div><span className="store-kicker">Track an order</span><h2>Find your order anywhere.</h2><p>Use the email and order number from your confirmation. We only show an exact match.</p></div>
          <form className="orders-lookup-form" onSubmit={lookup}><label><span>Email used at checkout</span><input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="alex@example.com" /></label><label><span>Order number</span><input required value={form.orderNumber} onChange={(event) => setForm((current) => ({ ...current, orderNumber: event.target.value }))} placeholder="AQ-MD1AB2CD-7F3K9Q" /></label><button className="store-primary-button" type="submit" disabled={lookupLoading}>{lookupLoading ? "Looking up…" : <>Track order <span aria-hidden="true">→</span></>}</button></form>
          {error && <p className="orders-lookup-error" role="alert">{error}</p>}
        </section>

        <section className="orders-list-section"><div className="orders-list-heading"><div><span className="store-kicker">Order history</span><h2>Arrivals in progress.</h2></div><span>{loading ? "Loading…" : `${orders.length} ${orders.length === 1 ? "order" : "orders"}`}</span></div>
          {loading ? <div className="orders-list-loading"><span /><span /></div> : orders.length ? <div className="orders-list">{orders.map((order) => { const activeStep = stepIndex(order.status); const cancelled = order.status === "CANCELLED"; const isExpanded = expandedOrder === order.id; const pendingPayPal = order.payment?.method === "PAYPAL" && order.payment.status === "PENDING"; const payable = isPayPalPaymentOpen(order); const paymentExpired = pendingPayPal && Boolean(order.payment?.checkoutExpiresAt && new Date(order.payment.checkoutExpiresAt).getTime() <= Date.now()); return <article className={`customer-order-card ${isExpanded ? "customer-order-card-expanded" : ""}`} key={order.id}><button className="customer-order-summary" onClick={() => setExpandedOrder((current) => current === order.id ? "" : order.id)} aria-expanded={isExpanded}><span className="customer-order-number">{order.orderNumber}</span><span><strong>{order.items.length ? order.items.map((item) => `${item.productName} × ${item.quantity}`).join(", ") : "Aquatic collection"}</strong><small>Placed {formatDate(order.createdAt)}</small></span><b>{formatPrice(order.totalAmount)}</b><span className={`customer-order-status ${cancelled ? "customer-order-status-cancelled" : "customer-order-status-active"}`}>{humanStatus(order.status)}</span><span className="customer-order-chevron" aria-hidden="true">⌄</span></button>{isExpanded && <div className="customer-order-detail"><div className="customer-order-detail-head"><span>Delivery journey</span><strong>{cancelled ? "This order was cancelled" : humanStatus(order.status)}</strong></div>{cancelled ? <div className="customer-order-cancelled">This order is no longer moving through delivery. Please contact us if you need help.</div> : <div className="order-tracking-steps">{ORDER_STEPS.map((step, index) => { const historyEntry = order.statusHistory.find((entry) => entry.status === step); const done = index <= activeStep; return <div className={`order-tracking-step ${done ? "order-tracking-step-done" : ""} ${step === order.status ? "order-tracking-step-current" : ""}`} key={step}><span className="order-tracking-dot">{done ? "✓" : index + 1}</span><div><strong>{humanStatus(step)}</strong><small>{historyEntry ? formatDate(historyEntry.createdAt) : index === activeStep ? "In progress" : "Coming next"}</small></div></div>; })}</div>}<div className="customer-order-detail-foot"><span>{order.items.map((item) => `${item.productName} · ${item.quantity}`).join(" / ")}</span><div className="customer-order-payment"><strong>{order.payment ? `${humanStatus(order.payment.method)} · ${humanStatus(order.payment.status)}` : "Payment pending"}</strong>{pendingPayPal && !paymentExpired && <button type="button" className="customer-order-pay-button" disabled={payingOrderId === order.id} onClick={() => void payForOrder(order)}>{payingOrderId === order.id ? "Opening…" : "Pay now"} <span aria-hidden="true">→</span></button>}{paymentExpired && <small className="customer-order-payment-expired">Payment session expired. Please place a new order.</small>}</div></div></div>}</article>; })}</div> : <div className="orders-empty"><span>◎</span><h2>No orders to show yet.</h2><p>After checkout, your orders will appear here automatically on this device.</p></div>}
        </section>
        <CustomerReturnsPanel customer={customer} orders={orders} />
      </div>
    </main>
  );
}

function CustomerReturnsPanel({ customer, orders }: { customer?: CustomerUser | null; orders: PublicOrder[] }) {
  const [requests, setRequests] = useState<ReturnRequest[]>([]);
  const [orderId, setOrderId] = useState("");
  const [type, setType] = useState<ReturnRequestType>("REFUND");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { if (customer) void listMyReturnRequests().then(setRequests).catch(() => undefined); }, [customer]);
  if (!customer) return null;
  const eligible = orders.filter((order) => order.payment?.status === "PAID" && order.status !== "CANCELLED");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!orderId || reason.trim().length < 10) return;
    setBusy(true); setMessage("");
    try { const created = await createReturnRequest({ orderId, type, reason: reason.trim() }); setRequests((current) => [created, ...current]); setReason(""); setMessage("Request submitted. We will email you as soon as it is reviewed."); } catch (error) { setMessage(error instanceof ApiError ? error.message : "Could not submit the request."); } finally { setBusy(false); }
  };
  return <section className="orders-lookup-card customer-returns-panel"><div><span className="store-kicker">Customer care</span><h2>Returns & refunds.</h2><p>Choose a paid order and tell us what happened. Requests are reviewed securely by our team.</p></div>{eligible.length ? <form className="orders-lookup-form" onSubmit={submit}><label><span>Order</span><select required value={orderId} onChange={(event) => setOrderId(event.target.value)}><option value="">Select an order</option>{eligible.map((order) => <option key={order.id} value={order.id}>{order.orderNumber} · {formatPrice(order.totalAmount)}</option>)}</select></label><label><span>Request type</span><select value={type} onChange={(event) => setType(event.target.value as ReturnRequestType)}><option value="REFUND">Refund</option><option value="RETURN">Return</option><option value="EXCHANGE">Exchange</option></select></label><label className="checkout-field-wide"><span>Reason</span><textarea required minLength={10} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Please describe the issue (at least 10 characters)." rows={3} /></label><button className="store-primary-button" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit request →"}</button></form> : <p className="orders-empty"><span>No paid orders are eligible yet.</span></p>}{message && <p className="orders-lookup-error" role="status">{message}</p>}{requests.length > 0 && <div className="customer-return-history"><strong>Request history</strong>{requests.map((request) => <div key={request.id}><span>{request.orderNumber} · {request.type.toLowerCase()}</span><b>{humanStatus(request.status)}</b></div>)}</div>}</section>;
}
