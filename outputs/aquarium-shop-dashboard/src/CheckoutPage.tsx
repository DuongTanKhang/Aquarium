import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ApiError,
  cancelPayPalCheckout,
  capturePayPalCheckout,
  createPayPalCheckout,
  createOrder,
  getPublicPaymentMethods,
  type CheckoutOrderResponse,
  type PaymentMethodId,
  type PublicProduct,
} from "./lib/api";
import { CustomerAuthModal, CustomerVerificationPanel } from "./CustomerAuth";
import type { CustomerUser } from "./lib/api";

export interface CheckoutCartItem {
  product: PublicProduct;
  quantity: number;
}

interface CheckoutPageProps {
  cart: CheckoutCartItem[];
  customer: CustomerUser | null;
  onCustomerAuthenticated: (user: CustomerUser) => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onBack: () => void;
  onCompleted: (order: CheckoutOrderResponse, email: string) => void;
}

const FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1707580640921-42d78bfa19cc?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1565393062922-46b4a044cdd6?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1628328879683-257489852765?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1515467699666-4adf84b2fd42?auto=format&fit=crop&w=900&q=85",
];

function imageFor(product: PublicProduct, index: number): string {
  return product.images.find((image) => image.isPrimary)?.url
    ?? product.images[0]?.url
    ?? FALLBACK_IMAGES[index % FALLBACK_IMAGES.length];
}

function price(value: string | number): string {
  return `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function methodLabel(id: PaymentMethodId): string {
  return {
    CARD: "Credit or debit card",
    PAYPAL: "PayPal",
  }[id];
}

function CheckoutIcon({ kind }: { kind: "arrow" | "lock" | "check" | "close" }) {
  if (kind === "arrow") return <span aria-hidden="true">→</span>;
  if (kind === "check") return <span aria-hidden="true">✓</span>;
  if (kind === "close") return <span aria-hidden="true">×</span>;
  return <span className="checkout-lock" aria-hidden="true">⌑</span>;
}

export default function CheckoutPage({ cart, customer, onCustomerAuthenticated, onUpdateQuantity, onBack, onCompleted }: CheckoutPageProps) {
  const [methods, setMethods] = useState<Array<{ id: PaymentMethodId; label: string; description: string }>>([]);
  const [methodsLoading, setMethodsLoading] = useState(true);
  const [methodsError, setMethodsError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>("PAYPAL");
  const [form, setForm] = useState({ customerName: "", customerEmail: "", customerPhone: "", shippingAddress: "", note: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [completedOrder, setCompletedOrder] = useState<CheckoutOrderResponse | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [paypalProcessing, setPaypalProcessing] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  const subtotal = useMemo(() => cart.reduce((total, item) => total + Number(item.product.price) * item.quantity, 0), [cart]);
  const shipping = subtotal >= 80 ? 0 : 6;
  const total = subtotal + shipping;

  useEffect(() => {
    let active = true;
    setMethodsLoading(true);
    void getPublicPaymentMethods()
      .then((settings) => {
        if (!active) return;
        const next = settings.methods
          .filter((method) => method.id === "CARD" || method.id === "PAYPAL")
          .map(({ id, label, description }) => ({ id, label, description }));
        setMethods(next);
        if (next.length && !next.some((method) => method.id === paymentMethod)) {
          const preferred = settings.defaultMethod === "CARD" || settings.defaultMethod === "PAYPAL" ? settings.defaultMethod : "CARD";
          setPaymentMethod(next.some((method) => method.id === preferred) ? preferred : next[0].id);
        }
        setMethodsError("");
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setMethodsError(requestError instanceof ApiError ? requestError.message : "Payment methods are temporarily unavailable.");
      })
      .finally(() => { if (active) setMethodsLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!customer) return;
    setForm((current) => ({
      ...current,
      customerName: current.customerName || customer.fullName,
      customerEmail: current.customerEmail || customer.email,
      customerPhone: current.customerPhone || customer.phone || "",
      shippingAddress: current.shippingAddress || customer.address || "",
    }));
  }, [customer]);

  // PayPal returns to this page after approval. The browser only carries the
  // local order reference; the API looks up the PayPal order ID server-side
  // and performs the capture, so a client cannot substitute an amount/order.
  useEffect(() => {
    if (!customer || paypalProcessing || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const flow = params.get("paypal");
    const orderId = params.get("orderId");
    if (!orderId || (flow !== "return" && flow !== "cancel")) return;
    let active = true;
    setPaypalProcessing(true);
    const clearPayPalQuery = () => {
      const next = new URLSearchParams(window.location.search);
      next.delete("paypal");
      next.delete("orderId");
      const suffix = next.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${suffix ? `?${suffix}` : ""}${window.location.hash}`);
    };
    const complete = flow === "cancel"
      ? cancelPayPalCheckout(orderId).then(() => {
        if (active) setError("PayPal checkout was cancelled. Your reserved stock has been released.");
      })
      : capturePayPalCheckout(orderId).then((result) => {
        if (!active) return;
        if (result.status === "COMPLETED") {
          setCompletedOrder(result.order);
          onCompleted(result.order, customer.email);
        } else {
          setError("PayPal is still processing this payment. We will update your order when PayPal confirms it.");
        }
      });
    void complete.catch((requestError: unknown) => {
      if (active) setError(requestError instanceof ApiError ? requestError.message : "PayPal could not confirm this payment yet.");
    }).finally(() => {
      if (!active) return;
      clearPayPalQuery();
      setPaypalProcessing(false);
    });
    return () => { active = false; };
  }, [customer, paypalProcessing, onCompleted]);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!customer) {
      setAuthOpen(true);
      return;
    }
    if (!customer.emailVerifiedAt || !customer.phoneVerifiedAt) {
      setError("Please verify your email and US phone before checkout.");
      setVerificationOpen(true);
      return;
    }
    if (!cart.length || !methods.length || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      if (!idempotencyKey.current) {
        idempotencyKey.current = typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-checkout`;
      }
      const input = {
        ...form,
        paymentMethod,
        items: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
      };
      if (paymentMethod === "PAYPAL") {
        const checkout = await createPayPalCheckout(input, idempotencyKey.current);
        window.location.assign(checkout.approvalUrl);
        return;
      }
      const order = await createOrder(input, idempotencyKey.current);
      setCompletedOrder(order);
      onCompleted(order, form.customerEmail);
    } catch (requestError: unknown) {
      setError(requestError instanceof ApiError ? requestError.message : "We could not place your order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (completedOrder) {
    return (
      <main className="store-checkout-page store-checkout-confirmation">
        <div className="store-checkout-confirmation-card">
          <span className="checkout-confirmation-icon"><CheckoutIcon kind="check" /></span>
          <span className="store-kicker">Thank you for choosing Aqua</span>
          <h1>Your order is in good hands.</h1>
          <p>We received <strong>{completedOrder.orderNumber}</strong>. We will email you when your payment and healthy-arrival review are confirmed.</p>
          <div className="checkout-confirmation-meta"><span>Order total</span><strong>{price(completedOrder.totalAmount)}</strong></div>
          <button className="store-primary-button" onClick={onBack}>Continue exploring <CheckoutIcon kind="arrow" /></button>
        </div>
      </main>
    );
  }

  return (
    <main className="store-checkout-page">
      <div className="store-checkout-shell">
        <div className="store-checkout-topbar">
          <button className="checkout-back" onClick={onBack}><CheckoutIcon kind="arrow" /> Back to collection</button>
          <div className="checkout-wordmark"><span>AQUA</span><small>SECURE CHECKOUT</small></div>
          <span className="checkout-secure"><CheckoutIcon kind="lock" /> Encrypted checkout</span>
        </div>

        <div className="checkout-progress" aria-label="Checkout progress">
          <span className="checkout-progress-done"><b>1</b> Your bag</span><i />
          <span className="checkout-progress-current"><b>2</b> Details & payment</span><i />
          <span><b>3</b> Confirmation</span>
        </div>

        <header className="store-checkout-heading">
          <div><span className="store-kicker">A considered checkout</span><h1>Bring your little<br /><em>world home.</em></h1></div>
          <p>Tell us where to send your aquatic pieces. Every order is packed with the same care we give our own tanks.</p>
        </header>

        {!cart.length ? (
          <div className="checkout-empty"><span className="checkout-confirmation-icon"><CheckoutIcon kind="close" /></span><h2>Your bag is empty.</h2><p>Add something lovely before you check out.</p><button className="store-text-link" onClick={onBack}>Explore the collection <CheckoutIcon kind="arrow" /></button></div>
        ) : (
          <form className="checkout-grid" onSubmit={submit}>
            <div className="checkout-form-column">
              <section className="checkout-card">
                <div className="checkout-card-heading"><span>01</span><div><h2>Your details</h2><p>So we know where to send your order.</p></div></div>
                <div className="checkout-fields">
                  <label><span>Full name</span><input required autoComplete="name" value={form.customerName} onChange={(event) => updateField("customerName", event.target.value)} placeholder="Alex Morgan" /></label>
                  <label><span>Email address</span><input required type="email" autoComplete="email" value={form.customerEmail} onChange={(event) => updateField("customerEmail", event.target.value)} placeholder="alex@example.com" /></label>
                  <label><span>Phone number</span><input required type="tel" autoComplete="tel" value={form.customerPhone} onChange={(event) => updateField("customerPhone", event.target.value)} placeholder="+1 415 555 0123" /></label>
                  <label className="checkout-field-wide"><span>Delivery address</span><input required autoComplete="street-address" value={form.shippingAddress} onChange={(event) => updateField("shippingAddress", event.target.value)} placeholder="120 Ocean Avenue, Miami, FL 33101" /></label>
                  <label className="checkout-field-wide"><span>Note <small>Optional</small></span><textarea value={form.note} onChange={(event) => updateField("note", event.target.value)} placeholder="Anything we should know about your delivery?" rows={3} /></label>
                </div>
              </section>

              <section className="checkout-card">
                <div className="checkout-card-heading"><span>02</span><div><h2>Payment method</h2><p>Choose an enabled method from the store.</p></div></div>
                {methodsLoading ? <div className="checkout-method-loading"><span /><span /><span /></div> : methodsError ? <div className="checkout-inline-error">{methodsError}</div> : <div className="checkout-methods">{methods.map((method) => <label className={`checkout-method ${paymentMethod === method.id ? "checkout-method-selected" : ""}`} key={method.id}><input type="radio" name="paymentMethod" value={method.id} checked={paymentMethod === method.id} onChange={() => setPaymentMethod(method.id)} /><span className="checkout-radio" /><span><strong>{method.label || methodLabel(method.id)}</strong><small>{method.description}</small></span><b>{method.id === "CARD" ? "VISA · MC · AMEX" : method.id.replace("_", " ")}</b></label>)}</div>}
                <p className="checkout-payment-note"><CheckoutIcon kind="lock" /> Your payment details are handled by the selected provider. This store never asks for card numbers or bank passwords here.</p>
              </section>
              {error && <div className="checkout-submit-error" role="alert"><CheckoutIcon kind="close" />{error}</div>}
              <button className="store-primary-button checkout-place-order" type="submit" onClick={(event) => { if (!customer) { event.preventDefault(); setAuthOpen(true); } }} disabled={submitting || paypalProcessing || methodsLoading || Boolean(methodsError) || !methods.length}>{paypalProcessing ? "Confirming PayPal payment…" : submitting ? (paymentMethod === "PAYPAL" ? "Opening PayPal…" : "Placing your order…") : <>Place order <CheckoutIcon kind="arrow" /></>}</button>
              <p className="checkout-legal">By placing your order, you agree to our care, delivery and returns guidance.</p>
            </div>

            <aside className="checkout-summary checkout-card">
              <div className="checkout-card-heading"><span>03</span><div><h2>Your collection</h2><p>{cart.length} {cart.length === 1 ? "piece" : "pieces"} waiting for you.</p></div></div>
              <div className="checkout-items">{cart.map((item, index) => <div className="checkout-item" key={item.product.id}><img src={imageFor(item.product, index)} alt="" /><div><strong>{item.product.name}</strong><small>{item.product.category.name}</small><div className="checkout-item-controls"><button type="button" onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)} aria-label={`Decrease ${item.product.name}`}>−</button><span>{item.quantity}</span><button type="button" onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)} aria-label={`Increase ${item.product.name}`}>+</button></div></div><b>{price(Number(item.product.price) * item.quantity)}</b></div>)}</div>
              <div className="checkout-totals"><div><span>Subtotal</span><b>{price(subtotal)}</b></div><div><span>Careful delivery</span><b>{shipping ? price(shipping) : "Complimentary"}</b></div><div className="checkout-total"><span>Total</span><b>{price(total)}</b></div></div>
              <div className="checkout-trust"><span><CheckoutIcon kind="check" /></span><div><strong>Healthy arrival promise</strong><small>We pack every order for a calm, safe journey.</small></div></div>
            </aside>
          </form>
        )}
      </div>
      {authOpen && <CustomerAuthModal onAuthenticated={(user) => { onCustomerAuthenticated(user); setAuthOpen(false); }} onClose={() => setAuthOpen(false)} />}
      {verificationOpen && customer && <div className="customer-verification-layer" role="presentation" onClick={() => setVerificationOpen(false)}><div className="customer-verification-modal" role="dialog" aria-modal="true" aria-label="Verify contact details" onClick={(event) => event.stopPropagation()}><button className="customer-auth-close" onClick={() => setVerificationOpen(false)} aria-label="Close verification">×</button><CustomerVerificationPanel user={customer} onUpdated={(user) => { onCustomerAuthenticated(user); if (user.emailVerifiedAt && user.phoneVerifiedAt) setVerificationOpen(false); }} /></div></div>}
    </main>
  );
}
