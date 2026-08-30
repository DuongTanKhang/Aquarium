import { useEffect, useState } from "react";
import GlassSelect from "./GlassSelect";
import {
  ApiError,
  clearAccessToken,
  getAccessToken,
  getPaymentConnections,
  getPaymentSettings,
  startPayPalConnection,
  updatePaymentSettings,
  type PaymentConnections,
  type PaymentMethodConfig,
  type PaymentMethodId,
  type PaymentSettings,
} from "./lib/api";
import { Icon } from "./ui";

function displayError(error: unknown): string { if (error instanceof ApiError) { if (error.status === 401) return "Your session has expired. Please sign in again."; return error.message; } return "Could not connect to the API. Check that the backend is running and try again."; }

export default function PaymentWorkspace({ onSessionExpired, demoMode = false }: { onSessionExpired: () => void; demoMode?: boolean }) {
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [connections, setConnections] = useState<PaymentConnections | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("paypal");
    if (!result) return;
    if (result === "connected") setNotice("PayPal was verified and connected. The merchant ID is stored securely on the server.");
    else if (result === "incomplete") setError("PayPal returned without granting all payment permissions. Finish consent in PayPal and try again.");
    else if (result === "error") setError("PayPal connection could not be completed. Check partner approval, return URL, and try again.");
    const params = new URLSearchParams(window.location.search);
    params.delete("paypal");
    const next = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`);
  }, []);

  const load = async (showLoading = true) => {
    if (demoMode) { setSettings(null); setConnections(null); if (showLoading) setLoading(false); return; }
    if (!getAccessToken()) { onSessionExpired(); return; }
    if (showLoading) setLoading(true); setError("");
    try {
      const [paymentSettings, paymentConnections] = await Promise.all([getPaymentSettings(), getPaymentConnections()]);
      const methods = paymentSettings.methods.filter((method) => method.id === "CARD" || method.id === "PAYPAL" || method.id === "COD");
      const defaultMethod = methods.some((method) => method.id === paymentSettings.defaultMethod && method.enabled)
        ? paymentSettings.defaultMethod
        : methods.find((method) => method.enabled)?.id ?? "CARD";
      setSettings({ ...paymentSettings, methods, defaultMethod });
      setConnections(paymentConnections);
    }
    catch (requestError) { setError(displayError(requestError)); if (requestError instanceof ApiError && requestError.status === 401) { clearAccessToken(); onSessionExpired(); } }
    finally { if (showLoading) setLoading(false); }
  };
  useEffect(() => {
    void load(true);
    if (demoMode) return undefined;
    const refresh = () => { if (document.visibilityState === "visible") void load(false); };
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [demoMode]);

  const toggle = (id: PaymentMethodId) => setSettings((current) => current ? { ...current, methods: current.methods.map((method) => method.id === id ? { ...method, enabled: !method.enabled } : method) } : current);
  const openProviderSetup = async () => {
    const url = connections?.paypal.setupUrl;
    if (!url) { setError("This provider is not configured on the server."); return; }
    if (demoMode) { setNotice("Demo: opened the PayPal connection flow."); return; }

    // A single-admin shop uses the store's own PayPal REST app. There is no
    // OAuth callback in this mode: PayPal credentials stay in the server env,
    // while this button only opens the provider's hosted dashboard.
    if (connections.paypal.mode === "direct") {
      setError("");
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    // Do not send an incomplete Partner Referrals request to PayPal. It used
    // to surface a confusing 503 after the user had already signed in.
    if (!connections.paypal.configured) {
      window.open(url, "_blank", "noopener,noreferrer");
      setNotice("PayPal Connect needs partner approval and server-side setup (CLIENT_ID, CLIENT_SECRET, PARTNER_MERCHANT_ID, RETURN_URL). The setup page is open for you to finish.");
      return;
    }

    const popup = window.open("about:blank", "paypal-connect", "noopener,noreferrer");
    setError(""); setNotice("");
    try {
      const result = await startPayPalConnection();
      if (popup && !popup.closed) popup.location.href = result.url;
      else window.location.assign(result.url);
    } catch (requestError) {
      popup?.close();
      setError(displayError(requestError));
    }
  };
  const save = async () => {
    if (!settings) return;
    if (!settings.methods.some((method) => method.id === settings.defaultMethod && method.enabled)) { setError("The default method must be enabled."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const methods = settings.methods.filter((method) => method.id === "CARD" || method.id === "PAYPAL" || method.id === "COD");
      const saved = demoMode ? { ...settings, methods } : await updatePaymentSettings({ currency: settings.currency, defaultMethod: settings.defaultMethod, methods: methods.map(({ id, enabled }) => ({ id, enabled })) });
      setSettings(saved); if (demoMode) window.localStorage.setItem("aquarium-demo-payment-settings", JSON.stringify(saved)); setNotice("Payment settings saved.");
    } catch (requestError) { setError(displayError(requestError)); if (requestError instanceof ApiError && requestError.status === 401) { clearAccessToken(); onSessionExpired(); } }
    finally { setSaving(false); }
  };

  return <section className="data-workspace payment-workspace"><div className="data-heading"><div><span className="panel-kicker">CHECKOUT CONTROL</span><h1>Payment settings</h1><p>Configure how customers in the United States pay and choose the default checkout method.</p></div><div className="payment-region-badge"><span>US</span><b>USD</b></div></div>
    {(error || notice) && <div className={`catalog-feedback ${error ? "feedback-error" : "feedback-success"}`} role="status"><Icon name={error ? "help" : "check"} size={15} /><span>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }} aria-label="Dismiss message"><Icon name="close" size={14} /></button></div>}
    {demoMode ? <div className="data-card payment-live-only"><div className="payment-live-only-icon"><Icon name="settings" size={20} /></div><span className="panel-kicker">LIVE ONLY</span><h2>Payment configuration is hidden in demo</h2><p>Provider connections, payout accounts and checkout methods are loaded only from the authenticated host API. Open the main host and sign in as admin to view or change real payment settings.</p></div> : loading || !settings || !connections ? <div className="data-card"><div className="data-loading"><span /><span /><span /></div></div> : <><ProviderConnections connections={connections} onOpen={openProviderSetup} /><div className="data-card"><div className="data-card-top"><div><span className="panel-kicker">PAYMENT METHODS</span><h2>Checkout options <small>Live API</small></h2></div><span className="catalog-source"><span className="source-dot" /> Configuration</span></div><div className="payment-method-list">{settings.methods.map((method) => <PaymentMethodRow key={method.id} method={method} onToggle={() => toggle(method.id)} />)}</div><div className="payment-default"><div><span className="panel-kicker">DEFAULT METHOD</span><strong>Use this method first at checkout</strong></div><GlassSelect value={settings.defaultMethod} onChange={(value) => setSettings((current) => current ? { ...current, defaultMethod: value as PaymentMethodId } : current)} ariaLabel="Default payment method" options={settings.methods.filter((method) => method.enabled).map((method) => ({ value: method.id, label: method.label }))} /></div><div className="payment-foot"><button className="modal-submit" onClick={() => void save()} disabled={saving}>{saving ? "Saving..." : "Save payment settings"}</button></div></div></>}
  </section>;
}

function ProviderConnections({ connections, onOpen }: { connections: PaymentConnections; onOpen: () => void }) {
  const rows = [
    { id: "paypal" as const, name: "PayPal merchant account", detail: connections.paypal.merchantId ? `Merchant ID · ${connections.paypal.merchantId}` : connections.paypal.mode === "direct" ? connections.paypal.configured ? "PayPal REST app configured on server" : "Create a PayPal REST app and configure server credentials" : connections.paypal.configured ? "PayPal partner app ready · complete secure consent" : "Configure PayPal Connect on the server", status: connections.paypal.connected ? "Connected" : connections.paypal.configured ? "Ready" : "Needs setup", action: connections.paypal.connected || connections.paypal.mode === "direct" ? "Manage" : "Connect PayPal", icon: "P" },
  ];
  return <div className="payment-connections data-card"><div className="data-card-top"><div><span className="panel-kicker">PAYOUT & PROVIDERS</span><h2>Secure provider connections <small>Bank details stay with the provider</small></h2></div><span className="catalog-source"><span className="source-dot" /> Protected setup</span></div><div className="payment-security-note"><Icon name="help" size={15} /><span>Never enter card numbers, CVV, or bank passwords in the dashboard. Card payments are tokenized by the secure checkout processor and PayPal uses its hosted consent flow.</span></div><div className="payment-connection-grid">{rows.map((row) => <article className="payment-connection" key={row.id}><span className="payment-method-icon payment-paypal">{row.icon}</span><div><strong>{row.name}</strong><small>{row.detail}</small><em className={row.status === "Connected" || row.status === "Ready" ? "connection-ready" : "connection-pending"}>{row.status}</em></div><button className="connection-action" onClick={onOpen}>{row.action}</button></article>)}</div></div>;
}

function PaymentMethodRow({ method, onToggle }: { method: PaymentMethodConfig; onToggle: () => void }) {
  return <div className={`payment-method-row ${method.enabled ? "payment-method-enabled" : ""}`}><span className={`payment-method-icon payment-${method.provider.toLowerCase()}`}>{method.id === "PAYPAL" ? "P" : method.id === "COD" ? "$" : "▣"}</span><div className="payment-method-copy"><strong>{method.label}</strong><span>{method.description}</span><small>{method.setupNote}</small></div><button type="button" className={`toggle-switch ${method.enabled ? "toggle-on" : ""}`} onClick={onToggle} aria-pressed={method.enabled}><i /></button></div>;
}
