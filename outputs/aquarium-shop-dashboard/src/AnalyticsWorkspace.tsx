import { useEffect, useMemo, useState } from "react";
import { ApiError, clearAccessToken, getAccessToken, getDashboardAnalytics, listLowStockProducts, type DashboardSummary, type LowStockProduct } from "./lib/api";
import { Icon } from "./ui";

type AnalyticsData = Pick<DashboardSummary, "salesTrend" | "categoryMix" | "topProducts" | "revenue" | "averageOrderValue" | "revenueChange">;
function money(value: string): string { return `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function displayError(error: unknown): string { if (error instanceof ApiError) { if (error.status === 401) return "Your session has expired. Please sign in again."; return error.message; } return "Could not connect to the API. Check that the backend is running and try again."; }

const demoAnalytics: AnalyticsData = {
  revenue: "184620000", averageOrderValue: "143786", revenueChange: 18.4,
  salesTrend: ["01", "05", "09", "13", "17", "21", "25", "28"].map((day, index) => ({ date: `2026-08-${day}`, revenue: String(42000000 + index * 18000000), orders: 30 + index * 7 })),
  categoryMix: [{ name: "Tropical fish", revenue: "77500000", orders: 540, percentage: 42 }, { name: "Aquariums", revenue: "48000000", orders: 334, percentage: 26 }, { name: "Accessories", revenue: "33200000", orders: 232, percentage: 18 }, { name: "Plants & food", revenue: "25800000", orders: 178, percentage: 14 }],
  topProducts: [{ id: "demo-prod-neon", name: "Neon Tetra Premium", type: "FISH", price: "1.40", stockQuantity: 124, soldQuantity: 920 }, { id: "demo-prod-betta", name: "Betta Koi Galaxy", type: "FISH", price: "27.20", stockQuantity: 18, soldQuantity: 185 }, { id: "demo-prod-anubias", name: "Anubias Nana Petite", type: "PLANT", price: "4.20", stockQuantity: 42, soldQuantity: 138 }],
};
const demoLowStock: LowStockProduct[] = [{ id: "demo-prod-nano", name: "Nano Cube 30L Set", sku: "TANK-NANO-004", status: "DRAFT", stockQuantity: 2, lowStockThreshold: 3, category: { id: "demo-cat-aquarium", name: "Aquariums", slug: "aquariums" }, updatedAt: "2026-08-27T08:00:00.000Z" }];

export default function AnalyticsWorkspace({ onSessionExpired, demoMode = false }: { onSessionExpired: () => void; demoMode?: boolean }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [lowStock, setLowStock] = useState<LowStockProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (showLoading = true) => {
    if (demoMode) { setData(demoAnalytics); setLowStock(demoLowStock); if (showLoading) setLoading(false); return; }
    if (!getAccessToken()) { onSessionExpired(); return; }
    if (showLoading) setLoading(true); setError("");
    try {
      const [analytics, inventory] = await Promise.all([getDashboardAnalytics(30), listLowStockProducts({ page: 1, pageSize: 8 })]);
      setData(analytics); setLowStock(inventory.data);
    } catch (requestError) {
      setError(displayError(requestError));
      if (requestError instanceof ApiError && requestError.status === 401) { clearAccessToken(); onSessionExpired(); }
    } finally { if (showLoading) setLoading(false); }
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

  const maxRevenue = useMemo(() => Math.max(...(data?.salesTrend.map((point) => Number(point.revenue)) ?? [1]), 1), [data]);
  return <section className="data-workspace"><div className="data-heading"><div><span className="panel-kicker">INSIGHTS</span><h1>Analytics</h1><p>Read sales performance, category mix, and the next actions from one clear view.</p></div><button className="catalog-refresh" onClick={() => void load()} disabled={loading}><Icon name="chart" size={15} /> Refresh</button></div>
    {error && <div className="catalog-feedback feedback-error" role="status"><Icon name="help" size={15} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss message"><Icon name="close" size={14} /></button></div>}
    <div className="analytics-kpis"><article className="analytics-kpi"><span>30-day revenue</span><strong>{data ? money(data.revenue) : "—"}</strong><small><b>{data ? `${data.revenueChange >= 0 ? "+" : ""}${data.revenueChange}%` : "—"}</b> vs previous period</small></article><article className="analytics-kpi"><span>Average order value</span><strong>{data ? money(data.averageOrderValue) : "—"}</strong><small>Based on non-cancelled orders</small></article><article className="analytics-kpi"><span>Tracked categories</span><strong>{data?.categoryMix.length ?? 0}</strong><small>Categories with recent sales</small></article></div>
    <div className="analytics-grid"><article className="data-card analytics-panel"><div className="data-card-top"><div><span className="panel-kicker">PERFORMANCE</span><h2>Revenue trend <small>Last 30 days</small></h2></div></div>{loading ? <div className="data-loading"><span /><span /><span /></div> : data?.salesTrend.length ? <div className="trend-chart">{data.salesTrend.map((point) => <div className="trend-bar-wrap" key={point.date} title={`${point.date}: ${money(point.revenue)}`}><div className="trend-bar" style={{ height: `${Math.max(5, (Number(point.revenue) / maxRevenue) * 100)}%` }} /><small>{new Date(point.date).getDate()}</small></div>)}</div> : <div className="data-empty compact"><strong>No revenue data yet</strong><span>Orders will fill this chart.</span></div>}</article>
      <article className="data-card analytics-panel"><div className="data-card-top"><div><span className="panel-kicker">INVENTORY MIX</span><h2>Top categories</h2></div></div>{data?.categoryMix.length ? <div className="analytics-list">{data.categoryMix.map((category) => <div className="analytics-list-row" key={category.name}><span className="mix-dot" /><div><strong>{category.name}</strong><small>{category.orders} orders</small></div><b>{category.percentage}%</b></div>)}</div> : <div className="data-empty compact"><strong>No category mix yet</strong><span>Valid orders will appear here.</span></div>}</article>
      <article className="data-card analytics-panel"><div className="data-card-top"><div><span className="panel-kicker">STOCK & SALES</span><h2>Top products</h2></div></div>{data?.topProducts.length ? <div className="analytics-list">{data.topProducts.map((product) => <div className="analytics-list-row" key={product.id}><span className="product-type-icon type-fish"><Icon name="fish" size={14} /></span><div><strong>{product.name}</strong><small>{product.soldQuantity} sold · {product.stockQuantity} in stock</small></div><b>{money(product.price)}</b></div>)}</div> : <div className="data-empty compact"><strong>No top products yet</strong><span>Data will appear after the first orders.</span></div>}</article>
      <article className="data-card analytics-panel"><div className="data-card-top"><div><span className="panel-kicker">ACTION QUEUE</span><h2>Low stock alerts</h2></div><span className="catalog-source"><span className="source-dot source-dot-warning" /> {lowStock.length}</span></div>{lowStock.length ? <div className="analytics-list">{lowStock.map((product) => <div className="analytics-list-row" key={product.id}><span className="product-type-icon type-accessory"><Icon name="box" size={14} /></span><div><strong>{product.name}</strong><small>{product.category.name} · threshold {product.lowStockThreshold}</small></div><b className="stock-cell-low">{product.stockQuantity}</b></div>)}</div> : <div className="data-empty compact"><strong>Stock is healthy</strong><span>No products are below their threshold.</span></div>}</article>
    </div></section>;
}
