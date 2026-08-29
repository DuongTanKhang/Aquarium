import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  ApiError,
  clearAccessToken,
  getCurrentUser,
  login,
  logout,
  registerCustomer,
  saveAccessToken,
  sendEmailVerification,
  sendPhoneVerification,
  updateCustomerProfile,
  verifyEmail,
  verifyPhone,
  type CustomerUser,
} from "./lib/api";

interface CustomerAuthFormProps {
  onAuthenticated: (user: CustomerUser) => void;
  onCancel?: () => void;
  embedded?: boolean;
}

export function CustomerAuthForm({ onAuthenticated, onCancel, embedded = false }: CustomerAuthFormProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ email: "", password: "", fullName: "", phone: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = mode === "login"
        ? await login(form.email, form.password)
        : await registerCustomer({ email: form.email, password: form.password, fullName: form.fullName, phone: form.phone });
      if ("mfaRequired" in result) {
        setError("This account requires MFA. Please sign in from the secure admin portal.");
        return;
      }
      if (result.user.role !== "CUSTOMER") {
        setError("This sign-in belongs to the admin portal. Customer accounts use a separate profile.");
        return;
      }
      saveAccessToken(result.accessToken);
      const user = await getCurrentUser();
      if (user.role !== "CUSTOMER") throw new ApiError("Only customer accounts can use this portal.", 403);
      onAuthenticated(user);
    } catch (requestError: unknown) {
      setError(requestError instanceof ApiError ? requestError.message : "We could not complete sign in right now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`customer-auth-card ${embedded ? "customer-auth-card-embedded" : ""}`}>
      <span className="store-kicker">Aqua account</span>
      <h2>{mode === "login" ? "Welcome back." : "Make room for more life."}</h2>
      <p>{mode === "login" ? "Sign in to checkout faster and follow every arrival." : "Create a customer account to save your orders and delivery details."}</p>
      <form onSubmit={submit} className="customer-auth-form">
        {mode === "register" && <>
          <label><span>Full name</span><input required minLength={2} maxLength={100} autoComplete="name" value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="Alex Morgan" /></label>
          <label><span>US phone number</span><input required type="tel" autoComplete="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="+1 415 555 0123" /></label>
        </>}
        <label><span>Email address</span><input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="alex@example.com" /></label>
        <label><span>Password</span><input required type="password" minLength={12} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder="At least 12 characters" /></label>
        {error && <p className="customer-auth-error" role="alert">{error}</p>}
        <button className="store-primary-button customer-auth-submit" type="submit" disabled={busy}>{busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}<span aria-hidden="true">→</span></button>
      </form>
      <div className="customer-auth-switch">{mode === "login" ? <><span>New to Aqua?</span><button type="button" onClick={() => { setMode("register"); setError(""); }}>Create an account</button></> : <><span>Already have an account?</span><button type="button" onClick={() => { setMode("login"); setError(""); }}>Sign in</button></>}</div>
      {onCancel && <button className="customer-auth-cancel" type="button" onClick={onCancel}>Continue as guest</button>}
    </section>
  );
}

export function CustomerAuthModal({ onAuthenticated, onClose }: { onAuthenticated: (user: CustomerUser) => void; onClose: () => void }) {
  return <div className="customer-auth-layer" role="presentation" onClick={onClose}><div className="customer-auth-modal" role="dialog" aria-modal="true" aria-label="Customer sign in" onClick={(event) => event.stopPropagation()}><button className="customer-auth-close" onClick={onClose} aria-label="Close sign in">×</button><CustomerAuthForm onAuthenticated={onAuthenticated} onCancel={onClose} /></div></div>;
}

export function CustomerAuthPage({ onAuthenticated, onBack }: { onAuthenticated: (user: CustomerUser) => void; onBack: () => void }) {
  return <main className="store-account-page"><div className="store-account-shell"><div className="store-orders-topbar"><button className="checkout-back" onClick={onBack}><span aria-hidden="true">←</span> Back to collection</button><div className="checkout-wordmark"><span>AQUA</span><small>THE LIVING SHOP</small></div><span className="checkout-secure">⌑ Customer account</span></div><div className="store-account-auth-layout"><div><span className="store-kicker">A little more life, together</span><h1>Your aquatic<br /><em>home base.</em></h1><p>Save your details, checkout securely and keep an eye on every healthy arrival.</p></div><CustomerAuthForm onAuthenticated={onAuthenticated} /></div></div></main>;
}

async function compressAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 8_000_000) throw new Error("Please choose an image smaller than 8 MB.");
  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This image could not be read.")); };
    image.src = url;
  });
  const edge = 480;
  const scale = Math.min(1, edge / Math.max(source.naturalWidth, source.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image processing is unavailable in this browser.");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function CustomerVerificationPanel({ user, onUpdated }: { user: CustomerUser; onUpdated: (user: CustomerUser) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"email" | "phone" | "verify" | "">("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const run = async (kind: "email" | "phone") => {
    setBusy(kind); setNotice(""); setError("");
    try {
      const result = kind === "email" ? await sendEmailVerification() : await sendPhoneVerification();
      setNotice(result.message);
    } catch (requestError: unknown) {
      setError(requestError instanceof ApiError ? requestError.message : "We could not send the verification message.");
    } finally { setBusy(""); }
  };

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy("verify"); setNotice(""); setError("");
    try {
      const updated = await verifyPhone(code);
      setCode(""); onUpdated(updated); setNotice("Phone number verified.");
    } catch (requestError: unknown) {
      setError(requestError instanceof ApiError ? requestError.message : "That verification code is not valid.");
    } finally { setBusy(""); }
  };

  return <section className="customer-verification-card"><div className="customer-verification-heading"><div><span className="store-kicker">Secure checkout</span><h2>Verify your contact details</h2></div><span className="customer-verification-shield">✓</span></div><p className="customer-verification-copy">We verify both channels before accepting an order, so delivery updates reach the right person.</p>{!user.emailVerifiedAt && <p className="customer-verification-alert" role="alert">Your email still needs verification. We will send the link to your inbox.</p>}{!user.phoneVerifiedAt && <p className="customer-verification-alert" role="alert">Your US phone is not verified yet. Verify it before placing an order.</p>}<div className="customer-verification-row"><div><strong>Email address</strong><small>{user.email}</small></div>{user.emailVerifiedAt ? <span className="verification-state verification-state-ok">Verified</span> : <button type="button" className="store-text-link" onClick={() => void run("email")} disabled={busy !== ""}>{busy === "email" ? "Sending…" : "Send email link →"}</button>}</div><div className="customer-verification-row"><div><strong>US phone</strong><small>{user.phone || "Add a phone number in your profile first"}</small></div>{user.phoneVerifiedAt ? <span className="verification-state verification-state-ok">Verified</span> : <button type="button" className="store-text-link" onClick={() => void run("phone")} disabled={busy !== "" || !user.phone}>{busy === "phone" ? "Sending…" : "Send SMS code →"}</button>}</div>{!user.phoneVerifiedAt && user.phone && <form className="customer-verification-code" onSubmit={verify}><input required inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" aria-label="Phone verification code" /><button className="store-primary-button" type="submit" disabled={busy !== "" || code.length !== 6}>{busy === "verify" ? "Checking…" : "Verify phone"}</button></form>}{error && <p className="customer-auth-error" role="alert">{error}</p>}{notice && <p className="customer-verification-notice" role="status">{notice}</p>}</section>;
}

export function CustomerEmailVerificationPage({ onBack, onAuthenticated }: { onBack: () => void; onAuthenticated: (user: CustomerUser) => void }) {
  const [state, setState] = useState<"checking" | "success" | "error">("checking");
  const [message, setMessage] = useState("Verifying your email link…");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token");
    if (!token) { setState("error"); setMessage("This verification link is missing its token."); return; }
    void verifyEmail(token).then(async (session) => {
      setState("success");
      try {
        saveAccessToken(session.accessToken);
        const user = await getCurrentUser();
        if (user.role === "CUSTOMER") onAuthenticated(user);
      } catch {
        // Verification still succeeded; a later sign-in can create a session.
      }
      setMessage("Your email is verified. Signing you in and returning to Aqua…");
      window.setTimeout(() => { window.location.href = "/shop"; }, 1400);
    }).catch((requestError: unknown) => { setState("error"); setMessage(requestError instanceof ApiError ? requestError.message : "This verification link is invalid or expired."); });
  }, []);

  return <main className="store-account-page"><div className="store-account-shell customer-email-verification-page"><span className="store-kicker">Aqua account</span><div className={`customer-email-verification-icon ${state}`}>{state === "success" ? "✓" : state === "error" ? "!" : "…"}</div><h1>{state === "success" ? "Email verified." : state === "error" ? "Verification unavailable." : "One moment."}</h1><p>{message}</p><button className="store-primary-button" onClick={onBack}>Back to Aqua <span aria-hidden="true">→</span></button></div></main>;
}

export default function CustomerAccountPage({ user, onUpdated, onLogout, onBack, onOpenOrders }: { user: CustomerUser; onUpdated: (user: CustomerUser) => void; onLogout: () => void; onBack: () => void; onOpenOrders: () => void }) {
  const [form, setForm] = useState({ fullName: user.fullName, phone: user.phone ?? "", address: user.address ?? "", avatarUrl: user.avatarUrl ?? "" });
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setNotice(""); setError("");
    try {
      const updated = await updateCustomerProfile({ fullName: form.fullName, phone: form.phone || undefined, address: form.address || undefined, ...(avatarChanged ? { avatarUrl: form.avatarUrl || null } : {}) });
      onUpdated(updated); setAvatarChanged(false); setNotice("Your profile and delivery address are up to date.");
    } catch (requestError: unknown) {
      setError(requestError instanceof ApiError ? requestError.message : "We could not save your profile.");
    } finally { setBusy(false); }
  };

  const chooseAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    setError("");
    try { const avatarUrl = await compressAvatar(file); setForm((current) => ({ ...current, avatarUrl })); setAvatarChanged(true); }
    catch (requestError: unknown) { setError(requestError instanceof Error ? requestError.message : "We could not use that image."); }
    finally { event.target.value = ""; }
  };

  const initials = user.fullName.split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase();
  return <main className="store-account-page"><div className="store-account-shell"><div className="store-orders-topbar"><button className="checkout-back" onClick={onBack}><span aria-hidden="true">←</span> Back to collection</button><div className="checkout-wordmark"><span>AQUA</span><small>THE LIVING SHOP</small></div><button className="checkout-secure account-signout" onClick={() => { void logout().catch(() => undefined); clearAccessToken(); onLogout(); }}>Sign out</button></div><header className="store-orders-heading"><div><span className="store-kicker">Your customer profile</span><h1>Welcome, <em>{user.fullName.split(" ")[0]}.</em></h1></div><p>Your profile belongs to you. Only you can change these details.</p></header><div className="account-layout"><section className="account-profile-card"><div className="account-avatar account-avatar-photo">{form.avatarUrl ? <img src={form.avatarUrl} alt="" /> : initials}</div><label className="account-photo-button">{form.avatarUrl ? "Change photo" : "Add a photo"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void chooseAvatar(event)} /></label>{form.avatarUrl && <button className="account-remove-photo" type="button" onClick={() => { setForm((current) => ({ ...current, avatarUrl: "" })); setAvatarChanged(true); }}>Remove photo</button>}<span className="store-kicker">Customer account</span><h2>{user.fullName}</h2><p>Member since {new Date(user.createdAt).getFullYear()}</p><button className="store-text-link" onClick={onOpenOrders}>View my orders <span aria-hidden="true">→</span></button></section><section className="account-edit-card"><div className="checkout-card-heading"><span>01</span><div><h2>Personal details</h2><p>Keep your delivery details current.</p></div></div><form className="account-edit-form" onSubmit={save}><label><span>Full name</span><input required minLength={2} maxLength={100} value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} /></label><label><span>Email address <small>Read-only</small></span><input value={user.email} readOnly /></label><label><span>US phone number</span><input required type="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="+1 415 555 0123" /></label><label><span>Delivery address</span><textarea required minLength={5} maxLength={240} rows={3} value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} placeholder="120 Ocean Avenue, Miami, FL 33101" /></label>{error && <p className="account-form-error" role="alert">{error}</p>}{notice && <p className="account-form-success">{notice}</p>}<button className="store-primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}<span aria-hidden="true">→</span></button></form></section></div><CustomerVerificationPanel user={user} onUpdated={onUpdated} /></div></main>;
}
