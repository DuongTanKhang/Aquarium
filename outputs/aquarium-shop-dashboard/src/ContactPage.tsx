import { useState, type FormEvent } from "react";
import { ApiError, submitContactMessage } from "./lib/api";

interface ContactPageProps {
  onBack: () => void;
}

export default function ContactPage({ onBack }: ContactPageProps) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await submitContactMessage({
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        topic: String(form.get("topic") ?? "other"),
        message: String(form.get("message") ?? ""),
      });
      setSent(true);
    } catch (requestError: unknown) {
      setError(requestError instanceof ApiError ? requestError.message : "We could not send your message right now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="store-contact-page">
      <div className="store-contact-breadcrumb"><button type="button" onClick={onBack}>Home</button><span>→</span><strong>Contact</strong></div>
      <section className="store-contact-hero">
        <div className="store-contact-copy">
          <span className="store-kicker">We are here for you</span>
          <h1>Let&apos;s talk about<br /><em>your little world.</em></h1>
          <p>Whether you are choosing your first fish or fine-tuning a thriving habitat, our team is always happy to help.</p>
          <div className="store-contact-details">
            <a href="mailto:hello@aquashop.example"><span>Email us</span><strong>hello@aquashop.example</strong></a>
            <a href="tel:+13055550123"><span>Call our aquarists</span><strong>+1 (305) 555-0123</strong></a>
            <div><span>Studio hours</span><strong>Mon–Fri · 9am–6pm ET</strong></div>
          </div>
        </div>
        <div className="store-contact-art" aria-hidden="true"><div className="store-contact-art-circle" /><span>Small<br />wonders,<br /><em>well cared for.</em></span></div>
      </section>
      <section className="store-contact-form-section">
        <div><span className="store-kicker">Send a note</span><h2>We&apos;d love<br /><em>to hear from you.</em></h2><p>Tell us a little about what you need and we&apos;ll get back to you within one working day.</p></div>
        {sent ? <div className="store-contact-success"><span>✓</span><h3>Thank you for reaching out.</h3><p>Your note is with our aquarists. We&apos;ll be in touch soon.</p><button type="button" className="store-text-link" onClick={() => { setSent(false); setError(""); }}>Send another note <span>→</span></button></div> : <form className="store-contact-form" onSubmit={submit}>
          <div className="store-contact-form-row"><label><span>Your name</span><input required name="name" autoComplete="name" placeholder="Alex Morgan" /></label><label><span>Email address</span><input required name="email" type="email" autoComplete="email" placeholder="alex@example.com" /></label></div>
          <label><span>What can we help with?</span><select name="topic" defaultValue="care"><option value="care">Fish &amp; habitat care</option><option value="order">An order or delivery</option><option value="product">Choosing a product</option><option value="other">Something else</option></select></label>
          <label><span>Your message</span><textarea required name="message" rows={5} placeholder="Tell us what is on your mind..." /></label>
          {error && <p className="store-contact-error" role="alert">{error}</p>}
          <button className="store-primary-button" type="submit" disabled={busy}>{busy ? "Sending…" : "Send message"} <span>→</span></button>
        </form>}
      </section>
    </main>
  );
}
