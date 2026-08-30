import { useEffect, useState } from "react";
import { ApiError, clearAccessToken, getAccessToken, listAdminCustomers, type Customer } from "./lib/api";
import { Icon } from "./ui";

function displayError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Your session has expired. Please sign in again.";
    return error.message;
  }
  return "Could not connect to the API. Check that the backend is running and try again.";
}

function money(value: string): string { return `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function date(value: string | null): string { return value ? new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—"; }
function initials(name: string): string { return name.trim().split(/\s+/).slice(-2).map((word) => word[0]).join("").toUpperCase() || "CU"; }

const demoCustomers: Customer[] = [
  { id: "demo-customer-1", fullName: "Minh Anh", email: "minhanh@example.com", phone: "+84 912 345 678", status: "ACTIVE", totalOrders: 18, totalSpent: "12450000", lastOrderAt: "2026-08-28T09:42:00.000Z", createdAt: "2026-03-10T08:00:00.000Z" },
  { id: "demo-customer-2", fullName: "Hoàng Nam", email: "hoangnam@example.com", phone: "+84 903 222 111", status: "ACTIVE", totalOrders: 11, totalSpent: "8360000", lastOrderAt: "2026-08-28T08:15:00.000Z", createdAt: "2026-04-02T08:00:00.000Z" },
  { id: "demo-customer-3", fullName: "Thảo Vy", email: "thaovy@example.com", phone: null, status: "ACTIVE", totalOrders: 7, totalSpent: "4250000", lastOrderAt: "2026-08-27T22:18:00.000Z", createdAt: "2026-05-18T08:00:00.000Z" },
];

export default function CustomersWorkspace({ onSessionExpired, demoMode = false }: { onSessionExpired: () => void; demoMode?: boolean }) {
  const [rows, setRows] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [meta, setMeta] = useState({ totalItems: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (showLoading = true) => {
    if (demoMode) {
      const query = search.trim().toLowerCase();
      const filtered = demoCustomers.filter((customer) => !query || [customer.fullName, customer.email, customer.phone ?? ""].some((value) => value.toLowerCase().includes(query)));
      setRows(filtered); setMeta({ totalItems: filtered.length }); setLoading(false); return;
    }
    if (!getAccessToken()) { onSessionExpired(); return; }
    if (showLoading) setLoading(true);
    setError("");
    try {
      const result = await listAdminCustomers({ page: 1, pageSize: 50, search });
      setRows(result.data); setMeta({ totalItems: result.meta.totalItems });
    } catch (requestError) {
      setError(displayError(requestError));
      if (requestError instanceof ApiError && requestError.status === 401) { clearAccessToken(); onSessionExpired(); }
    } finally { if (showLoading) setLoading(false); }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void load(true), search ? 220 : 0);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void load(false); }, 15_000);
    const refreshOnReturn = () => { if (document.visibilityState === "visible") void load(false); };
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [search, demoMode]);

  return <section className="data-workspace"><div className="data-heading"><div><span className="panel-kicker">RELATIONSHIPS</span><h1>Customers</h1><p>See customer value at a glance so sales can follow up at the right time.</p></div><button className="catalog-refresh" onClick={() => void load()} disabled={loading}><Icon name="chart" size={15} /> Refresh</button></div>
    {error && <div className="catalog-feedback feedback-error" role="status"><Icon name="help" size={15} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss message"><Icon name="close" size={14} /></button></div>}
    <div className="data-toolbar"><label className="product-search"><Icon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, phone..." /></label><span className="data-count"><Icon name="users" size={14} /> {meta.totalItems} customers</span></div>
    <div className="data-card"><div className="data-card-top"><div><span className="panel-kicker">CUSTOMER DIRECTORY</span><h2>Customer list <small>{loading ? "Loading…" : `${rows.length} shown`}</small></h2></div><span className="catalog-source"><span className="source-dot" /> Live API</span></div>
      {loading ? <div className="data-loading"><span /><span /><span /></div> : rows.length === 0 ? <div className="data-empty"><span className="empty-icon"><Icon name="users" size={20} /></span><strong>No customers yet</strong><span>Customers from the storefront will be collected here.</span></div> : <div className="data-table-wrap"><table className="data-table"><thead><tr><th>CUSTOMER</th><th>CONTACT</th><th>ORDERS</th><th>TOTAL SPENT</th><th>LAST ORDER</th><th>STATUS</th></tr></thead><tbody>{rows.map((customer) => <tr key={customer.id}><td><div className="customer-cell"><span className="customer-avatar">{initials(customer.fullName)}</span><div><strong className="data-primary">{customer.fullName}</strong><small>Joined {date(customer.createdAt)}</small></div></div></td><td><span className="data-secondary">{customer.email}</span><small>{customer.phone || "No phone"}</small></td><td><strong className="data-primary">{customer.totalOrders}</strong></td><td><strong className="data-primary">{money(customer.totalSpent)}</strong></td><td><span className="data-secondary">{date(customer.lastOrderAt)}</span></td><td><span className={`catalog-status status-${customer.status.toLowerCase()}`}><i />{customer.status}</span></td></tr>)}</tbody></table></div>}
      <div className="data-pagination"><span>Showing {rows.length} of {meta.totalItems}</span><span>Customer value is calculated from completed order flow.</span></div>
    </div></section>;
}
