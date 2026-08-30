import { useEffect, useState } from "react";
import { ApiError, clearAccessToken, getAccessToken, listAdminReturnRequests, updateAdminReturnRequest, type ReturnRequest, type ReturnRequestStatus } from "./lib/api";
import { Icon } from "./ui";
import GlassSelect from "./GlassSelect";

const statuses: ReturnRequestStatus[] = ["REQUESTED", "APPROVED", "REJECTED", "RECEIVED", "REFUNDED", "COMPLETED"];
const labels: Record<string, string> = { REQUESTED: "Requested", APPROVED: "Approved", REJECTED: "Rejected", RECEIVED: "Received", REFUNDED: "Refunded", COMPLETED: "Completed", PAID: "Paid", PENDING: "Pending" };
const typeLabels: Record<string, string> = { REFUND: "Refund", RETURN: "Return", EXCHANGE: "Exchange" };

function formatMoney(value: string) { return `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function displayError(error: unknown) { return error instanceof ApiError ? error.message : "Could not connect to the API."; }

function nextStatuses(row: ReturnRequest): ReturnRequestStatus[] {
  return statuses.filter((value) => value === row.status || (row.status === "REQUESTED"
    ? ["APPROVED", "REJECTED"].includes(value)
    : row.status === "APPROVED"
      ? ["RECEIVED", "REFUNDED", "COMPLETED"].includes(value)
      : row.status === "RECEIVED"
        ? ["REFUNDED", "COMPLETED"].includes(value)
        : value === "COMPLETED"));
}

function paymentLabel(row: ReturnRequest): string {
  const method = row.payment?.method ?? "MANUAL";
  return method === "PAYPAL" ? "PayPal" : method === "CARD" ? "Card" : method.replaceAll("_", " ");
}

export default function ReturnsWorkspace({ onSessionExpired }: { onSessionExpired: () => void }) {
  const [rows, setRows] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refundRow, setRefundRow] = useState<ReturnRequest | null>(null);
  const [refundReference, setRefundReference] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");

  const load = async (showLoading = true) => {
    if (!getAccessToken()) { onSessionExpired(); return; }
    if (showLoading) setLoading(true);
    setError("");
    try {
      setRows(await listAdminReturnRequests());
    } catch (requestError) {
      setError(displayError(requestError));
      if (requestError instanceof ApiError && requestError.status === 401) {
        clearAccessToken();
        onSessionExpired();
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    void load(true);
    const refresh = () => { if (document.visibilityState === "visible") void load(false); };
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const commitStatus = async (row: ReturnRequest, status: ReturnRequestStatus, providerRefundId?: string) => {
    setUpdating(row.id);
    setError("");
    setNotice("");
    try {
      // The API performs the PayPal refund server-side and verifies the provider
      // response before moving the request to REFUNDED. Manual methods require
      // the operator's processor/cash reference for a complete audit trail.
      const updated = await updateAdminReturnRequest(row.id, {
        status,
        providerRefundId: providerRefundId?.trim() || undefined,
        resolutionNote: resolutionNote.trim() || undefined,
      });
      setRows((current) => current.map((item) => item.id === row.id ? updated : item));
      setNotice(status === "REFUNDED"
        ? `${row.orderNumber} refunded ${formatMoney(row.amount)} via ${paymentLabel(row)}.`
        : `${row.orderNumber} moved to ${labels[status]}.`);
      setRefundRow(null);
      setRefundReference("");
      setResolutionNote("");
    } catch (requestError) {
      setError(displayError(requestError));
    } finally {
      setUpdating("");
    }
  };

  const changeStatus = (row: ReturnRequest, status: string) => {
    if (status === row.status || updating) return;
    const next = status as ReturnRequestStatus;
    if (next === "REFUNDED") {
      setRefundRow(row);
      setRefundReference("");
      setResolutionNote("");
      setError("");
      setNotice("");
      return;
    }
    void commitStatus(row, next);
  };

  const refundIsAutomatic = refundRow?.payment?.method === "PAYPAL";
  const refundNeedsReference = Boolean(refundRow && !refundIsAutomatic);

  return <>
    <section className="data-workspace">
      <div className="data-heading">
        <div><span className="panel-kicker">CUSTOMER CARE</span><h1>Returns & refunds</h1><p>Review every request, keep a clear audit trail, and only mark money refunded after the payment processor confirms it.</p></div>
        <button className="catalog-refresh" onClick={() => void load()} disabled={loading}><Icon name="clock" size={15} /> Refresh</button>
      </div>
      {(error || notice) && <div className={`catalog-feedback ${error ? "feedback-error" : "feedback-success"}`} role="status"><Icon name={error ? "help" : "check"} size={15} /><span>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }} aria-label="Dismiss message"><Icon name="close" size={14} /></button></div>}
      <div className="data-card">
        <div className="data-card-top"><div><span className="panel-kicker">REVIEW QUEUE</span><h2>Customer requests <small>{loading ? "Loading…" : `${rows.length} total`}</small></h2></div><span className="catalog-source"><span className="source-dot" /> Live API</span></div>
        {loading ? <div className="data-loading"><span /><span /><span /></div> : rows.length === 0 ? <div className="data-empty"><span className="empty-icon"><Icon name="check" size={20} /></span><strong>No return requests</strong><span>Requests submitted by customers will appear here.</span></div> : <div className="data-table-wrap"><table className="data-table returns-admin-table"><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>TYPE</th><th>AMOUNT</th><th>REASON</th><th>PAYMENT</th><th>STATUS</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong className="data-primary">{row.orderNumber}</strong><small>{new Date(row.createdAt).toLocaleDateString("en-US")}</small></td><td><strong className="data-primary">{row.customerName}</strong><small>{row.customerEmail}</small></td><td><span className="data-secondary">{typeLabels[row.type]}</span></td><td><strong className="data-primary">{formatMoney(row.amount)}</strong></td><td><span className="data-secondary" title={row.reason}>{row.reason.length > 45 ? `${row.reason.slice(0, 45)}…` : row.reason}</span></td><td><span className={`return-payment return-payment-${(row.payment?.method ?? "manual").toLowerCase()}`}>{paymentLabel(row)}<small>{row.payment?.status ? labels[row.payment.status] ?? row.payment.status : "Manual"}</small></span></td><td><GlassSelect disabled={updating === row.id || row.status === "COMPLETED" || row.status === "REJECTED"} className={`status-select status-${row.status.toLowerCase()}`} value={row.status} ariaLabel={`Status for ${row.orderNumber}`} options={nextStatuses(row).map((value) => ({ value, label: labels[value] }))} onChange={(value) => changeStatus(row, value)} /></td></tr>)}</tbody></table></div>}
        <div className="data-pagination"><span>All requests are retained for audit</span></div>
      </div>
    </section>
    {refundRow && <div className="modal-layer refund-confirm-layer"><button type="button" className="modal-scrim" onClick={() => { if (!updating) setRefundRow(null); }} aria-label="Close refund confirmation" /><section className="refund-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="refund-confirm-title">
      <div className="refund-confirm-heading"><div><span className="panel-kicker">REFUND WORKFLOW</span><h2 id="refund-confirm-title">Confirm refund</h2><p>Complete the payment step before marking this request as refunded.</p></div><button type="button" className="ghost-icon" onClick={() => setRefundRow(null)} disabled={Boolean(updating)} aria-label="Close"><Icon name="close" /></button></div>
      <div className="refund-summary"><div><span>Order</span><strong>{refundRow.orderNumber}</strong></div><div><span>Customer</span><strong>{refundRow.customerEmail}</strong></div><div><span>Amount</span><strong>{formatMoney(refundRow.amount)}</strong></div><div><span>Payment</span><strong>{paymentLabel(refundRow)}</strong></div></div>
      <ol className="refund-steps"><li><span>1</span><div><strong>Review the request</strong><small>{typeLabels[refundRow.type]} · {refundRow.reason}</small></div></li><li><span>2</span><div><strong>{refundIsAutomatic ? "Issue the PayPal refund" : "Refund through the payment provider"}</strong><small>{refundIsAutomatic ? "The server will refund the original PayPal capture. No customer credentials are handled here." : "Process the refund in your card, cash, or bank provider, then record its reference below."}</small></div></li><li><span>3</span><div><strong>Notify the customer</strong><small>An email is sent automatically after the refund is recorded.</small></div></li></ol>
      {!refundIsAutomatic && <label className="refund-modal-field"><span>Refund reference <b>*</b></span><input autoFocus value={refundReference} onChange={(event) => setRefundReference(event.target.value)} placeholder="Provider or cash receipt reference" maxLength={200} required /></label>}
      <label className="refund-modal-field"><span>Resolution note <small>(optional)</small></span><textarea value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} placeholder="What was refunded and why?" maxLength={1000} rows={3} /></label>
      <div className="refund-confirm-actions"><button type="button" className="modal-cancel" onClick={() => setRefundRow(null)} disabled={Boolean(updating)}>Cancel</button><button type="button" className="modal-submit" disabled={Boolean(updating) || (refundNeedsReference && !refundReference.trim())} onClick={() => void commitStatus(refundRow, "REFUNDED", refundReference)}>{updating ? "Processing…" : refundIsAutomatic ? `Refund ${formatMoney(refundRow.amount)}` : "Confirm refund"}</button></div>
    </section></div>}
  </>;
}
