import { useEffect, useState } from "react";
import {
  ApiError,
  clearAccessToken,
  getAccessToken,
  listAdminOrders,
  updateAdminOrderStatus,
  type AdminOrder,
} from "./lib/api";
import { Icon } from "./ui";
import GlassSelect from "./GlassSelect";

const statuses = ["PENDING", "CONFIRMED", "PREPARING", "SHIPPING", "COMPLETED", "CANCELLED"];
const statusLabels: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  SHIPPING: "Shipping",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
type DateFilterMode = "all" | "day" | "range";

const demoOrders = [
  { id: "demo-order-1", orderNumber: "#AQ-10842", customerName: "Minh Anh", productSummary: "Neon Tetra · 12 fish", totalAmount: "16.80", status: "COMPLETED", createdAt: "2026-08-28T09:42:00.000Z" },
  { id: "demo-order-2", orderNumber: "#AQ-10841", customerName: "Hoàng Nam", productSummary: "Koi Betta fish · 1 fish", totalAmount: "27.20", status: "PREPARING", createdAt: "2026-08-28T08:15:00.000Z" },
  { id: "demo-order-3", orderNumber: "#AQ-10840", customerName: "Thảo Vy", productSummary: "30L nano aquarium · 1 set", totalAmount: "50.00", status: "PENDING", createdAt: "2026-08-27T22:18:00.000Z" },
] as AdminOrder[];

function displayError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Your session has expired. Please sign in again.";
    return error.message;
  }
  return "Could not connect to the API. Check that the backend is running and try again.";
}

function money(value: string): string {
  return `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function OrdersWorkspace({ onSessionExpired, demoMode = false }: { onSessionExpired: () => void; demoMode?: boolean }) {
  const [rows, setRows] = useState<AdminOrder[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [dateMode, setDateMode] = useState<DateFilterMode>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, totalItems: 0 });
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dateError = dateMode === "range" && dateFrom && dateTo && dateFrom > dateTo ? "Start date must be on or before the end date." : "";

  const changeDateMode = (value: string) => {
    const nextMode = value as DateFilterMode;
    setDateMode(nextMode);
    if (nextMode === "all") { setDateFrom(""); setDateTo(""); }
    if (nextMode === "day") { setDateTo(""); }
    if (nextMode === "range" && dateFrom === dateTo) { setDateTo(""); }
  };

  const clearDateFilter = () => { setDateMode("all"); setDateFrom(""); setDateTo(""); };

  const load = async (showLoading = true) => {
    if (dateError) { setRows([]); setMeta({ page: 1, totalPages: 1, totalItems: 0 }); return; }
    const fromDate = dateMode === "all" ? undefined : dateFrom || undefined;
    const toDate = dateMode === "day" ? dateFrom || undefined : dateMode === "range" ? dateTo || undefined : undefined;
    if (demoMode) {
      const query = search.trim().toLowerCase();
      const filtered = demoOrders.filter((order) => !query || [order.orderNumber, order.customerName, order.productSummary].some((value) => value.toLowerCase().includes(query))).filter((order) => !status || order.status === status).filter((order) => {
        const orderDay = order.createdAt.slice(0, 10);
        return (!fromDate || orderDay >= fromDate) && (!toDate || orderDay <= toDate);
      });
      setRows(filtered); setMeta({ page: 1, totalPages: 1, totalItems: filtered.length }); if (showLoading) setLoading(false); return;
    }
    if (!getAccessToken()) { onSessionExpired(); return; }
    if (showLoading) setLoading(true); setError("");
    try {
      const result = await listAdminOrders({ page: 1, pageSize: 50, search, status, fromDate, toDate });
      setRows(result.data);
      setMeta({ page: result.meta.page, totalPages: result.meta.totalPages, totalItems: result.meta.totalItems });
    } catch (requestError) {
      setError(displayError(requestError));
      if (requestError instanceof ApiError && requestError.status === 401) { clearAccessToken(); onSessionExpired(); }
    } finally { if (showLoading) setLoading(false); }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void load(true), search ? 220 : 0);
    if (demoMode) return () => window.clearTimeout(timer);
    const refresh = () => { if (document.visibilityState === "visible") void load(false); };
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [search, status, demoMode, dateMode, dateFrom, dateTo]);

  const changeStatus = async (order: AdminOrder, nextStatus: string) => {
    if (nextStatus === order.status) return;
    if (demoMode) { setRows((current) => current.map((item) => item.id === order.id ? { ...item, status: nextStatus } : item)); setNotice(`${order.orderNumber} updated in demo.`); return; }
    setUpdating(order.id); setError(""); setNotice("");
    try {
      const updated = await updateAdminOrderStatus(order.id, nextStatus);
      setRows((current) => current.map((item) => item.id === order.id ? updated : item));
      setNotice(`${order.orderNumber} updated to ${statusLabels[nextStatus] ?? nextStatus}.`);
    } catch (requestError) {
      setError(displayError(requestError));
      if (requestError instanceof ApiError && requestError.status === 401) { clearAccessToken(); onSessionExpired(); }
    } finally { setUpdating(""); }
  };

  return (
    <section className="data-workspace">
      <div className="data-heading">
        <div><span className="panel-kicker">FULFILLMENT</span><h1>Orders</h1><p>Keep order status clear so sales and fulfillment can move quickly.</p></div>
        <button className="catalog-refresh" onClick={() => void load()} disabled={loading}><Icon name="chart" size={15} /> Refresh</button>
      </div>
      {(error || notice) && <div className={`catalog-feedback ${error ? "feedback-error" : "feedback-success"}`} role="status"><Icon name={error ? "help" : "check"} size={15} /><span>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }} aria-label="Dismiss message"><Icon name="close" size={14} /></button></div>}
      <div className="data-toolbar"><label className="product-search"><Icon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order, customer, phone..." /></label><GlassSelect className="orders-filter-select" value={status} onChange={setStatus} ariaLabel="Filter by order status" options={[{ value: "", label: "All statuses" }, ...statuses.map((value) => ({ value, label: statusLabels[value] }))]} /><div className="orders-date-filter"><Icon name="calendar" size={14} /><GlassSelect className="orders-date-mode" value={dateMode} onChange={changeDateMode} ariaLabel="Filter orders by date" options={[{ value: "all", label: "All dates" }, { value: "day", label: "Specific day" }, { value: "range", label: "Date range" }]} />{dateMode === "day" && <input className="glass-date-input" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="Order date" />}{dateMode === "range" && <><span className="date-filter-label">From</span><input className="glass-date-input" type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} aria-label="Order date from" /><span className="date-filter-label">to</span><input className="glass-date-input" type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} aria-label="Order date to" /></>}{dateMode !== "all" && <button className="date-filter-clear" type="button" onClick={clearDateFilter}>Clear</button>}</div><span className="data-count"><Icon name="shopping" size={14} /> {meta.totalItems} orders</span></div>
      {dateError && <div className="date-filter-error" role="alert"><Icon name="help" size={13} /> {dateError}</div>}
      <div className="data-card"><div className="data-card-top"><div><span className="panel-kicker">LIVE FULFILLMENT</span><h2>Order queue <small>{loading ? "Loading…" : `${rows.length} shown`}</small></h2></div><span className="catalog-source"><span className="source-dot" /> Live API</span></div>
        {loading ? <div className="data-loading"><span /><span /><span /></div> : rows.length === 0 ? <div className="data-empty"><span className="empty-icon"><Icon name="shopping" size={20} /></span><strong>No orders yet</strong><span>Orders from the customer storefront will appear here.</span></div> : <div className="data-table-wrap"><table className="data-table orders-admin-table"><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>ITEMS</th><th>TOTAL</th><th>STATUS</th><th>CREATED</th></tr></thead><tbody>{rows.map((order) => <tr key={order.id}><td><strong className="data-primary">{order.orderNumber}</strong></td><td><strong className="data-primary">{order.customerName}</strong><small>{order.customerEmail || order.customerPhone}</small></td><td><span className="data-secondary">{order.productSummary}</span></td><td><strong className="data-primary">{money(order.totalAmount)}</strong></td><td><GlassSelect disabled={updating === order.id || order.status === "CANCELLED"} className={`status-select status-${order.status.toLowerCase()}`} value={order.status} ariaLabel={`Status for ${order.orderNumber}`} options={statuses.map((value) => ({ value, label: statusLabels[value] }))} onChange={(value) => void changeStatus(order, value)} /></td><td><span className="data-secondary">{dateTime(order.createdAt)}</span></td></tr>)}</tbody></table></div>}
        <div className="data-pagination"><span>Showing {rows.length} of {meta.totalItems}</span><button disabled>Page {meta.page} / {meta.totalPages}</button></div>
      </div>
    </section>
  );
}
