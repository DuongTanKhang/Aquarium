import { useEffect, useState } from "react";
import { ApiError, clearAccessToken, getAccessToken, listAdminReturnRequests, updateAdminReturnRequest, type ReturnRequest, type ReturnRequestStatus } from "./lib/api";
import { Icon } from "./ui";
import GlassSelect from "./GlassSelect";

const statuses: ReturnRequestStatus[] = ["REQUESTED", "APPROVED", "REJECTED", "RECEIVED", "REFUNDED", "COMPLETED"];
const labels: Record<string, string> = { REQUESTED: "Requested", APPROVED: "Approved", REJECTED: "Rejected", RECEIVED: "Received", REFUNDED: "Refunded", COMPLETED: "Completed" };
const typeLabels: Record<string, string> = { REFUND: "Refund", RETURN: "Return", EXCHANGE: "Exchange" };

function formatMoney(value: string) { return `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function displayError(error: unknown) { return error instanceof ApiError ? error.message : "Could not connect to the API."; }

export default function ReturnsWorkspace({ onSessionExpired }: { onSessionExpired: () => void }) {
  const [rows, setRows] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = async (showLoading = true) => {
    if (!getAccessToken()) { onSessionExpired(); return; }
    if (showLoading) setLoading(true); setError("");
    try { setRows(await listAdminReturnRequests()); } catch (requestError) { setError(displayError(requestError)); if (requestError instanceof ApiError && requestError.status === 401) { clearAccessToken(); onSessionExpired(); } } finally { if (showLoading) setLoading(false); }
  };
  useEffect(() => {
    void load(true);
    const refresh = () => { if (document.visibilityState === "visible") void load(false); };
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  const changeStatus = async (row: ReturnRequest, status: string) => {
    if (status === row.status) return;
    setUpdating(row.id); setError(""); setNotice("");
    try {
      // PayPal refunds are initiated and verified by the API. The dashboard
      // never asks an operator to paste a transaction ID or handle money data.
      const updated = await updateAdminReturnRequest(row.id, { status: status as ReturnRequestStatus });
      setRows((current) => current.map((item) => item.id === row.id ? updated : item));
      setNotice(`${row.orderNumber} moved to ${labels[status]}.`);
    } catch (requestError) { setError(displayError(requestError)); } finally { setUpdating(""); }
  };
  return <section className="data-workspace"><div className="data-heading"><div><span className="panel-kicker">CUSTOMER CARE</span><h1>Returns & refunds</h1><p>Review every request, keep a clear audit trail, and only mark money refunded after the payment processor confirms it.</p></div><button className="catalog-refresh" onClick={() => void load()} disabled={loading}><Icon name="clock" size={15} /> Refresh</button></div>{(error || notice) && <div className={`catalog-feedback ${error ? "feedback-error" : "feedback-success"}`} role="status"><Icon name={error ? "help" : "check"} size={15} /><span>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }} aria-label="Dismiss message"><Icon name="close" size={14} /></button></div>}<div className="data-card"><div className="data-card-top"><div><span className="panel-kicker">REVIEW QUEUE</span><h2>Customer requests <small>{loading ? "Loading…" : `${rows.length} total`}</small></h2></div><span className="catalog-source"><span className="source-dot" /> Live API</span></div>{loading ? <div className="data-loading"><span /><span /><span /></div> : rows.length === 0 ? <div className="data-empty"><span className="empty-icon"><Icon name="check" size={20} /></span><strong>No return requests</strong><span>Requests submitted by customers will appear here.</span></div> : <div className="data-table-wrap"><table className="data-table"><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>TYPE</th><th>AMOUNT</th><th>REASON</th><th>STATUS</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong className="data-primary">{row.orderNumber}</strong><small>{new Date(row.createdAt).toLocaleDateString("en-US")}</small></td><td><strong className="data-primary">{row.customerName}</strong><small>{row.customerEmail}</small></td><td><span className="data-secondary">{typeLabels[row.type]}</span></td><td><strong className="data-primary">{formatMoney(row.amount)}</strong></td><td><span className="data-secondary" title={row.reason}>{row.reason.length > 45 ? `${row.reason.slice(0, 45)}…` : row.reason}</span></td><td><GlassSelect disabled={updating === row.id || row.status === "COMPLETED" || row.status === "REJECTED"} className={`status-select status-${row.status.toLowerCase()}`} value={row.status} ariaLabel={`Status for ${row.orderNumber}`} options={statuses.filter((value) => value === row.status || (row.status === "REQUESTED" ? ["APPROVED", "REJECTED"].includes(value) : row.status === "APPROVED" ? ["RECEIVED", "REFUNDED", "COMPLETED"].includes(value) : row.status === "RECEIVED" ? ["REFUNDED", "COMPLETED"].includes(value) : value === "COMPLETED")).map((value) => ({ value, label: labels[value] }))} onChange={(value) => void changeStatus(row, value)} /></td></tr>)}</tbody></table></div>}<div className="data-pagination"><span>All requests are retained for audit</span></div></div></section>;
}
