import { useState, type FormEvent } from "react";
import {
  ApiError,
  clearAccessToken,
  login,
  logout,
  requestPasswordReset,
  resetPassword,
  saveAccessToken,
  verifyMfaLogin,
  type AuthResult,
  type MfaPendingResult,
} from "./lib/api";
import { Icon } from "./ui";

export default function LoginPage({ onAuthenticated }: { onAuthenticated: (user: AuthResult["user"]) => void }) {
  const initialResetToken = readResetTokenFromHash();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaTicket, setMfaTicket] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(() => Boolean(initialResetToken));
  const [resetCode, setResetCode] = useState(initialResetToken);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await login(email, password);
      if ("mfaRequired" in result) {
        setMfaTicket((result as MfaPendingResult).mfaTicket);
        return;
      }
      if (result.user.role !== "ADMIN") {
        await logout().catch(() => undefined);
        setError("This area is reserved for the ADMIN account.");
        return;
      }
      saveAccessToken(result.accessToken);
      window.localStorage.setItem("aquarium-admin-email", result.user.email);
      onAuthenticated(result.user);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Could not connect to the API. Check that the backend is running.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleMfa = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await verifyMfaLogin(mfaTicket, mfaCode);
      if (result.user.role !== "ADMIN") {
        clearAccessToken();
        await logout().catch(() => undefined);
        setError("This area is reserved for the ADMIN account.");
        setMfaTicket("");
        return;
      }
      saveAccessToken(result.accessToken);
      window.localStorage.setItem("aquarium-admin-email", result.user.email);
      onAuthenticated(result.user);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "The MFA code is invalid or the API did not respond.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Enter your email first to receive a password reset code.");
      return;
    }
    setForgotBusy(true);
    setError("");
    try {
      await requestPasswordReset(email);
      setRecoveryMode(true);
      setResetDone(false);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Could not send the password reset request.",
      );
    } finally {
      setForgotBusy(false);
    }
  };

  const handleResetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = resetCode.trim();
    if (token.length < 6) {
      setError("Enter the verification code from the admin email (at least 6 characters).");
      return;
    }
    if (newPassword.length < 12) {
      setError("The new password must be at least 12 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The confirmation password does not match.");
      return;
    }
    setResetBusy(true);
    setError("");
    try {
      await resetPassword(token, newPassword);
      setRecoveryMode(false);
      setResetDone(true);
      setResetCode("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "The verification code is invalid or has expired.",
      );
    } finally {
      setResetBusy(false);
    }
  };

  const backToLogin = () => {
    setRecoveryMode(false);
    setResetCode("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
  };

  return (
    <main className="login-page">
      <div className="login-glow login-glow-one" />
      <div className="login-glow login-glow-two" />
      <section className="login-hero">
        <div className="login-brand"><span className="login-brand-mark"><Icon name="fish" size={23} /></span><span><strong>AQUARIUM</strong><small>SHOP · SALES OS</small></span></div>
        <div className="login-hero-copy"><span className="panel-kicker">THE CALM WAY TO SELL AQUATICS</span><h1>Sell more.<br /><em>Care deeper.</em></h1><p>Everything your sales team needs to turn a curious visitor into a happy aquarist.</p></div>
        <div className="login-insight"><span className="insight-icon"><Icon name="chart" size={17} /></span><div><strong>Today&apos;s sales pulse</strong><small>Revenue is up 18.4% this month</small></div><span className="insight-value">+18.4%</span></div>
        <div className="login-hero-footer"><span>Trusted by modern aquarium shops</span><div><i>✦</i><i>◌</i><i>◍</i><i>◈</i><b>+240 teams</b></div></div>
      </section>

      <section className="login-card-wrap">
        <div className="login-card">
          {!mfaTicket && !recoveryMode ? <>
            <div className="login-card-heading"><span className="panel-kicker">ADMIN WORKSPACE</span><h2>Sign in as administrator</h2><p>This private workspace is reserved for the aquarium shop administrator.</p></div>
            <form className="login-form" onSubmit={handleLogin}>
              <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setResetDone(false); }} placeholder="admin@aquarium.shop" required /></label>
              <label>Password<div className="password-input"><input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></div></label>
              <div className="login-options"><span className="session-note"><Icon name="check" size={12} /> Session secured in memory</span><button type="button" className="forgot-button" onClick={() => void handleForgotPassword()} disabled={forgotBusy}>{forgotBusy ? "Sending..." : "Forgot password?"}</button></div>
              {resetDone && <div className="login-success" role="status"><Icon name="check" size={15} /><span>Password changed successfully. You can sign in again.</span></div>}
              {error && <ErrorMessage message={error} />}
              <button className="login-submit" type="submit" disabled={loading}>{loading ? <><span className="button-loader" /> Signing in...</> : <>Sign in <span>→</span></>}</button>
            </form>
            <div className="login-divider"><span>secure workspace</span></div><div className="login-security"><Icon name="check" size={14} /><span>Protected by secure sessions and admin-only access.</span></div>
          </> : recoveryMode ? <>
            <div className="login-card-heading"><span className="panel-kicker">ACCOUNT RECOVERY</span><h2>Reset admin password</h2><p>We sent a one-time verification code to the admin email. It expires shortly.</p></div>
            <form className="login-form" onSubmit={handleResetPassword}>
              <label>Verification code<input value={resetCode} onChange={(event) => setResetCode(event.target.value)} placeholder="Enter the code from Gmail" autoComplete="one-time-code" required autoFocus /></label>
              <label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least 12 characters" autoComplete="new-password" required minLength={12} /></label>
              <label>Confirm new password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your new password" autoComplete="new-password" required minLength={12} /></label>
              {error && <ErrorMessage message={error} />}
              <button className="login-submit" type="submit" disabled={resetBusy}>{resetBusy ? <><span className="button-loader" /> Resetting...</> : <>Reset password <span>→</span></>}</button>
              <button type="button" className="back-login" onClick={backToLogin}>← Back to sign in</button>
            </form>
            <div className="login-security"><Icon name="check" size={14} /><span>One-time code, rate-limited and invalidated after use.</span></div>
          </> : <>
            <div className="login-card-heading"><span className="panel-kicker">SECOND STEP</span><h2>Verify your sign in</h2><p>Your account has MFA enabled. Enter a TOTP or recovery code to continue.</p></div>
            <form className="login-form" onSubmit={handleMfa}><label>MFA code<input inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} placeholder="123456 or recovery code" required autoFocus /></label>{error && <ErrorMessage message={error} />}<button className="login-submit" type="submit" disabled={loading}>{loading ? <><span className="button-loader" /> Verifying...</> : <>Verify & enter dashboard <span>→</span></>}</button><button type="button" className="back-login" onClick={() => { setMfaTicket(""); setMfaCode(""); setError(""); }}>← Use another account</button></form><div className="login-security"><Icon name="check" size={14} /><span>Your MFA challenge expires shortly and can only be used once.</span></div>
          </>}
        </div>
        <p className="login-copyright">© 2025 Aquarium Shop · Built for better sales conversations.</p>
      </section>
    </main>
  );
}

function readResetTokenFromHash(): string {
  if (typeof window === "undefined") return "";
  const hash = window.location.hash.replace(/^#/, "");
  return new URLSearchParams(hash).get("token") ?? "";
}

function ErrorMessage({ message }: { message: string }) {
  return <div className="login-error" role="alert"><Icon name="help" size={15} /><span>{message}</span></div>;
}
