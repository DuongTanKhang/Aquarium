import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import ProductWorkspace from "./ProductWorkspace";
import CategoryWorkspace from "./CategoryWorkspace";
import LoginPage from "./LoginPage";
import ProfileWorkspace, {
  DEFAULT_ADMIN_PROFILE,
  type AdminProfile,
} from "./ProfileWorkspace";
import AnalyticsWorkspace from "./AnalyticsWorkspace";
import CustomersWorkspace from "./CustomersWorkspace";
import OrdersWorkspace from "./OrdersWorkspace";
import PaymentWorkspace from "./PaymentWorkspace";
import ReturnsWorkspace from "./ReturnsWorkspace";
import Storefront from "./Storefront";
import { ApiError, clearAccessToken, getAccessToken, getDashboardSummary, logout, refreshAccessToken, saveAccessToken, type DashboardSummary } from "./lib/api";

type IconName =
  | "grid"
  | "box"
  | "shopping"
  | "users"
  | "chart"
  | "settings"
  | "help"
  | "search"
  | "bell"
  | "chevron"
  | "arrowUp"
  | "arrowDown"
  | "fish"
  | "clock"
  | "dots"
  | "close"
  | "upload"
  | "check"
  | "menu"
  | "sparkle";

type View = "overview" | "products" | "categories" | "orders" | "customers" | "analytics" | "payments" | "returns";

interface Summary {
  revenue: string;
  revenueChange: string;
  orders: string;
  ordersChange: string;
  customers: string;
  customersChange: string;
  lowStock: string;
  live?: DashboardSummary;
}

interface Order {
  id: string;
  customer: string;
  initials: string;
  product: string;
  amount: string;
  status: "Completed" | "Processing" | "Pending";
  date: string;
  tone: string;
}

interface Product {
  name: string;
  type: string;
  price: string;
  stock: number;
  image: string;
  tone: string;
}

const DEFAULT_ACCENT = "#4318ff";
const DEFAULT_BACKGROUND = "aurora";
const DASHBOARD_REFRESH_MS = 30_000;

const summaryFallback: Summary = {
  revenue: "$7.4K",
  revenueChange: "+18.4%",
  orders: "1,284",
  ordersChange: "+12.8%",
  customers: "8,642",
  customersChange: "+9.6%",
  lowStock: "24",
};

const orders: Order[] = [
  {
    id: "#AQ-10842",
    customer: "Minh Anh",
    initials: "MA",
    product: "Neon Tetra · 12 fish",
    amount: "$16.80",
    status: "Completed",
    date: "Today, 09:42",
    tone: "purple",
  },
  {
    id: "#AQ-10841",
    customer: "Hoàng Nam",
    initials: "HN",
    product: "Koi Betta fish · 1 fish",
    amount: "$27.20",
    status: "Processing",
    date: "Today, 08:15",
    tone: "blue",
  },
  {
    id: "#AQ-10840",
    customer: "Thảo Vy",
    initials: "TV",
    product: "30L nano aquarium · 1 set",
    amount: "$50.00",
    status: "Pending",
    date: "Yesterday, 22:18",
    tone: "pink",
  },
  {
    id: "#AQ-10839",
    customer: "Gia Huy",
    initials: "GH",
    product: "Anubias plants · 3 pots",
    amount: "$12.60",
    status: "Completed",
    date: "Yesterday, 19:06",
    tone: "green",
  },
];

const products: Product[] = [
  {
    name: "Neon Tetra Premium",
    type: "Tropical fish",
    price: "$1.40",
    stock: 124,
    image: "🐟",
    tone: "aqua",
  },
  {
    name: "Betta Koi Galaxy",
    type: "Betta fish",
    price: "$27.20",
    stock: 18,
    image: "🐠",
    tone: "coral",
  },
  {
    name: "Anubias Nana Petite",
    type: "Aquatic plant",
    price: "$4.20",
    stock: 42,
    image: "🌿",
    tone: "mint",
  },
];

const navItems: Array<{ id: View; label: string; icon: IconName }> = [
  { id: "overview", label: "Overview", icon: "grid" },
  { id: "products", label: "Products", icon: "box" },
  { id: "categories", label: "Categories", icon: "grid" },
  { id: "orders", label: "Orders", icon: "shopping" },
  { id: "customers", label: "Customers", icon: "users" },
  { id: "analytics", label: "Analytics", icon: "chart" },
  { id: "payments", label: "Payments", icon: "shopping" },
  { id: "returns", label: "Returns", icon: "clock" },
];

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const paths: Record<IconName, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    box: (
      <>
        <path d="m4 7 8-4 8 4-8 4-8-4Z" />
        <path d="M4 7v10l8 4 8-4V7M12 11v10" />
      </>
    ),
    shopping: (
      <>
        <path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.5L20.5 8H6" />
        <circle cx="9" cy="20" r="1" />
        <circle cx="17" cy="20" r="1" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.8M18 14a5 5 0 0 1 3 4.5" />
      </>
    ),
    chart: (
      <>
        <path d="M4 19V5M4 19h17" />
        <path d="m7 15 3-4 3 2 5-7" />
        <path d="M16 6h2v2" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 1.7-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.1h-2.4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.7-1.7.1-.1A1.7 1.7 0 0 0 8.4 15a1.7 1.7 0 0 0-1.6-1H6.7v-2.4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L8 8.6l1.7-1.7.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.1h2.4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.7 1.7-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1V14h-.1a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.7 9a2.5 2.5 0 1 1 4.1 1.9c-1.2.9-1.8 1.4-1.8 2.8M12 17h.01" />
      </>
    ),
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="6.8" />
        <path d="m16 16 5 5" />
      </>
    ),
    bell: (
      <>
        <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </>
    ),
    chevron: <path d="m8 10 4 4 4-4" />,
    arrowUp: <path d="m6 15 6-6 6 6" />,
    arrowDown: <path d="m6 9 6 6 6-6" />,
    fish: (
      <>
        <path d="M5 12c2.5-4 7-5 12-2l3-2v8l-3-2c-5 3-9.5 2-12-2Z" />
        <circle cx="9" cy="10.5" r=".8" fill="currentColor" stroke="none" />
        <path d="M5 12H2M4 9 2.5 7.5M4 15l-1.5 1.5" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    dots: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    upload: (
      <>
        <path d="M12 16V4M8 8l4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    sparkle: (
      <>
        <path d="m12 3 1.2 5.8L19 10l-5.8 1.2L12 17l-1.2-5.8L5 10l5.8-1.2L12 3ZM19 16l.6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6L19 16Z" />
      </>
    ),
  };

  return <svg {...common}>{paths[name]}</svg>;
}

function readSetting(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function readAdminProfile(): AdminProfile {
  const fallbackEmail = readSetting("aquarium-admin-email", DEFAULT_ADMIN_PROFILE.email);
  try {
    const stored = window.localStorage.getItem("aquarium-admin-profile");
    if (!stored) return { ...DEFAULT_ADMIN_PROFILE, email: fallbackEmail };
    const parsed = JSON.parse(stored) as Partial<AdminProfile>;
    return {
      ...DEFAULT_ADMIN_PROFILE,
      ...parsed,
      email: parsed.email || fallbackEmail,
    };
  } catch {
    return { ...DEFAULT_ADMIN_PROFILE, email: fallbackEmail };
  }
}

function profileInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "AL";
  return words.slice(-2).map((word) => word[0]).join("").toUpperCase();
}

async function getSummary(): Promise<{ value: Summary | null; unauthorized: boolean }> {
  const token = getAccessToken();
  if (!token) return { value: null, unauthorized: true };

  try {
    const data = await getDashboardSummary();
    const revenue = Number(data.revenue);
    const compactRevenue = revenue >= 1_000_000 ? `$${(revenue / 1_000_000).toFixed(1)}M` : revenue >= 1_000 ? `$${(revenue / 1_000).toFixed(1)}K` : `$${revenue.toFixed(2)}`;
    return { value: {
      revenue: compactRevenue,
      revenueChange: `${data.revenueChange >= 0 ? "+" : ""}${data.revenueChange}%`,
      orders: data.orders.toLocaleString("vi-VN"),
      ordersChange: "live API",
      customers: data.customers.toLocaleString("vi-VN"),
      customersChange: "live API",
      lowStock: data.lowStockProducts.toLocaleString("vi-VN"),
      live: data,
    }, unauthorized: false };
  } catch (error) {
    return { value: null, unauthorized: error instanceof ApiError && error.status === 401 };
  }
}

function App() {
  const storefrontMode = typeof window !== "undefined" && (
    window.location.pathname === "/shop" ||
    window.location.pathname.startsWith("/shop/") ||
    window.location.pathname === "/verify-email" ||
    new URLSearchParams(window.location.search).get("store") === "1"
  );
  return storefrontMode ? <Storefront /> : <AdminApp />;
}

function AdminApp() {
  const [demoMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("demo") === "1" || window.location.hash === "#demo";
  });
  const [isAuthenticated, setIsAuthenticated] = useState(() => demoMode || Boolean(getAccessToken()));
  const [authChecking, setAuthChecking] = useState(() => !demoMode && !getAccessToken());
  const refreshInFlight = useRef<Promise<Awaited<ReturnType<typeof refreshAccessToken>> | null> | null>(null);
  const [activeView, setActiveView] = useState<View>(() => {
    if (typeof window === "undefined") return "overview";
    const requested = new URLSearchParams(window.location.search).get("view");
    return navItems.some((item) => item.id === requested) ? requested as View : "overview";
  });
  const [accent, setAccent] = useState(() => readSetting("aquarium-accent", DEFAULT_ACCENT));
  const [background, setBackground] = useState(() =>
    readSetting("aquarium-background", DEFAULT_BACKGROUND),
  );
  const [customImage, setCustomImage] = useState(() =>
    readSetting("aquarium-background-image", ""),
  );
  const [isPersonalizeOpen, setPersonalizeOpen] = useState(false);
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [summary, setSummary] = useState<Summary>(summaryFallback);
  const [profile, setProfile] = useState<AdminProfile>(readAdminProfile);

  useEffect(() => {
    if (demoMode) return;
    if (getAccessToken()) {
      setAuthChecking(false);
      return;
    }
    let cancelled = false;
    const request = refreshInFlight.current ?? (refreshInFlight.current = refreshAccessToken()
      .then((result) => {
        saveAccessToken(result.accessToken);
        return result;
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight.current = null;
      }));
    void request.then((result) => {
      if (cancelled) return;
      setAuthChecking(false);
      if (!result || result.user.role !== "ADMIN") return;
      setProfile((current) => ({ ...current, email: result.user.email }));
      setIsAuthenticated(true);
    });
    return () => { cancelled = true; };
  }, [demoMode]);

  useEffect(() => {
    if (!isAuthenticated || demoMode) return;
    let disposed = false;
    let initialLoad = true;
    const syncSummary = async () => {
      if (!getAccessToken()) {
        if (!disposed) {
          clearAccessToken();
          setIsAuthenticated(false);
        }
        return;
      }
      const result = await getSummary();
      if (disposed) return;
      if (result.unauthorized || (initialLoad && !result.value)) {
        // Never leave the live host showing design-time fallback numbers when
        // the access token is missing or expired. A later transient network
        // failure keeps the last known server snapshot until the next retry.
        clearAccessToken();
        setIsAuthenticated(false);
        return;
      }
      if (result.value) setSummary((current) => ({ ...current, ...result.value }));
      initialLoad = false;
    };
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void syncSummary();
    };
    void syncSummary();
    const intervalId = window.setInterval(refreshIfVisible, DASHBOARD_REFRESH_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);
    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, [isAuthenticated, demoMode]);

  useEffect(() => {
    window.localStorage.setItem("aquarium-accent", accent);
  }, [accent]);

  useEffect(() => {
    window.localStorage.setItem("aquarium-background", background);
  }, [background]);

  useEffect(() => {
    try {
      window.localStorage.setItem("aquarium-admin-profile", JSON.stringify(profile));
      window.localStorage.setItem("aquarium-admin-email", profile.email);
    } catch {
      // Keep the profile usable if local storage is unavailable or full.
    }
  }, [profile]);

  const appStyle = useMemo(() => {
    const style: CSSProperties & Record<`--${string}`, string> = {
      "--accent": accent,
      "--accent-soft": `color-mix(in srgb, ${accent} 16%, transparent)`,
      "--accent-faint": `color-mix(in srgb, ${accent} 7%, transparent)`,
    };

    if (background === "custom" && customImage) {
      style.backgroundImage = `linear-gradient(135deg, rgba(11, 20, 55, .96), rgba(14, 27, 72, .88)), url(${customImage})`;
    } else if (background === "midnight") {
      style.backgroundImage = "linear-gradient(135deg, #0b1437 0%, #17295c 100%)";
    } else if (background === "ocean") {
      style.backgroundImage = "linear-gradient(135deg, #061b32 0%, #096c8a 53%, #20176f 100%)";
    } else {
      style.backgroundImage = "radial-gradient(circle at 8% 0%, rgba(67, 24, 255, .35), transparent 35%), radial-gradient(circle at 90% 10%, rgba(0, 197, 255, .18), transparent 30%), linear-gradient(135deg, #0b1437 0%, #101e4b 100%)";
    }
    return style;
  }, [accent, background, customImage]);

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") return;
      setCustomImage(reader.result);
      setBackground("custom");
      try {
        window.localStorage.setItem("aquarium-background-image", reader.result);
      } catch {
        // Keep the current session working when local storage quota is reached.
      }
    });
    reader.readAsDataURL(file);
  };

  const resetPersonalize = () => {
    setAccent(DEFAULT_ACCENT);
    setBackground(DEFAULT_BACKGROUND);
    setCustomImage("");
    window.localStorage.removeItem("aquarium-background-image");
  };

  if (authChecking) {
    return <main className="login-page"><section className="login-card-wrap"><div className="login-card"><div className="login-card-heading"><span className="panel-kicker">SECURE SESSION</span><h2>Checking your session</h2><p>Verifying the protected administrator session…</p></div></div></section></main>;
  }

  if (!isAuthenticated) {
    return <LoginPage onAuthenticated={(user) => {
      setProfile((current) => ({ ...current, email: user.email }));
      setIsAuthenticated(true);
    }} />;
  }

  return (
    <div className="app-shell" style={appStyle}>
      <Sidebar
        activeView={activeView}
        isOpen={isSidebarOpen}
        profile={profile}
        orderCount={demoMode ? "3" : summary.orders}
        onOpenProfile={() => {
          setProfileOpen(true);
          setSidebarOpen(false);
        }}
        onNavigate={(view) => {
          setActiveView(view);
          setProfileOpen(false);
          setSidebarOpen(false);
        }}
      />

      <main className="main-area">
        <Topbar
          activeView={activeView}
          profile={profile}
          profileOpen={isProfileOpen}
          demoMode={demoMode}
          onOpenPersonalize={() => setPersonalizeOpen(true)}
          onOpenProfile={() => setProfileOpen(true)}
          onOpenSidebar={() => setSidebarOpen(true)}
        />
        <div className="page-content">
          {isProfileOpen ? (
            <ProfileWorkspace
              profile={profile}
              onSave={setProfile}
              onBack={() => setProfileOpen(false)}
              onLogout={() => {
                void logout().catch(() => undefined);
                clearAccessToken();
                setIsAuthenticated(false);
              }}
            />
          ) : activeView === "overview" ? (
            <Overview summary={summary} profile={profile} onNavigate={setActiveView} />
          ) : activeView === "products" ? (
            <ProductWorkspace demoMode={demoMode} onSessionExpired={() => setIsAuthenticated(false)} />
          ) : activeView === "categories" ? (
            <CategoryWorkspace demoMode={demoMode} onSessionExpired={() => setIsAuthenticated(false)} />
          ) : activeView === "orders" ? (
            <OrdersWorkspace demoMode={demoMode} onSessionExpired={() => setIsAuthenticated(false)} />
          ) : activeView === "customers" ? (
            <CustomersWorkspace demoMode={demoMode} onSessionExpired={() => setIsAuthenticated(false)} />
          ) : activeView === "analytics" ? (
            <AnalyticsWorkspace demoMode={demoMode} onSessionExpired={() => setIsAuthenticated(false)} />
          ) : activeView === "payments" ? (
            <PaymentWorkspace demoMode={demoMode} onSessionExpired={() => setIsAuthenticated(false)} />
          ) : activeView === "returns" ? (
            <ReturnsWorkspace onSessionExpired={() => setIsAuthenticated(false)} />
          ) : (
            <SectionPlaceholder view={activeView} />
          )}
        </div>
      </main>

      {isPersonalizeOpen && (
        <PersonalizeDrawer
          accent={accent}
          background={background}
          customImage={customImage}
          onAccentChange={setAccent}
          onBackgroundChange={setBackground}
          onImageChange={handleImageChange}
          onReset={resetPersonalize}
          onClose={() => setPersonalizeOpen(false)}
        />
      )}
    </div>
  );
}

function Sidebar({
  activeView,
  isOpen,
  profile,
  orderCount,
  onOpenProfile,
  onNavigate,
}: {
  activeView: View;
  isOpen: boolean;
  profile: AdminProfile;
  orderCount: string;
  onOpenProfile: () => void;
  onNavigate: (view: View) => void;
}) {
  return (
    <>
      {isOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => onNavigate(activeView)} />}
      <aside className={`sidebar ${isOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><Icon name="fish" size={22} /></div>
          <div>
            <strong>AQUARIUM</strong>
            <span>SHOP · ADMIN</span>
          </div>
        </div>

        <div className="nav-label">MAIN MENU</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              className={`nav-item ${activeView === item.id ? "nav-item-active" : ""}`}
              key={item.id}
              onClick={() => onNavigate(item.id)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === "orders" && <em>{orderCount}</em>}
            </button>
          ))}
        </nav>

        <div className="nav-label nav-label-spaced">SYSTEM</div>
        <nav className="side-nav">
          <button className="nav-item" onClick={() => onNavigate("overview")}><Icon name="settings" /><span>Settings</span></button>
        </nav>

        <div className="sidebar-bottom">
          <button className="profile-mini" type="button" onClick={onOpenProfile} aria-label="Open admin profile">
            <div className="avatar avatar-admin">{profile.avatar ? <img src={profile.avatar} alt="" /> : profileInitials(profile.name)}</div>
            <div><strong>{profile.name}</strong><span>{profile.role}</span></div>
            <Icon name="dots" size={20} />
          </button>
        </div>
      </aside>
    </>
  );
}

function Topbar({
  activeView,
  profile,
  profileOpen,
  demoMode,
  onOpenPersonalize,
  onOpenProfile,
  onOpenSidebar,
}: {
  activeView: View;
  profile: AdminProfile;
  profileOpen: boolean;
  demoMode: boolean;
  onOpenPersonalize: () => void;
  onOpenProfile: () => void;
  onOpenSidebar: () => void;
}) {
  const title = profileOpen ? "Profile" : navItems.find((item) => item.id === activeView)?.label ?? "Overview";
  return (
    <header className="topbar">
      <button className="mobile-menu" aria-label="Open navigation" onClick={onOpenSidebar}><Icon name="menu" /></button>
      <div className="breadcrumbs"><span>Pages</span><b>/</b><strong>{title}</strong></div>
      <div className="topbar-actions">
        {demoMode && <span className="demo-badge">Demo mode</span>}
        <label className="search-box">
          <Icon name="search" size={17} />
          <input placeholder="Search anything..." aria-label="Search" />
          <kbd>⌘ K</kbd>
        </label>
        <button className="icon-button notification-button" aria-label="Notifications"><Icon name="bell" size={18} /><i /></button>
        <button className="personalize-button" onClick={onOpenPersonalize}><Icon name="sparkle" size={16} /><span>Personalize</span></button>
        <button className={`top-avatar ${profileOpen ? "top-avatar-active" : ""}`} aria-label="Open admin profile" title="Admin profile" onClick={onOpenProfile}>
          {profile.avatar ? <img src={profile.avatar} alt="Admin avatar" /> : profileInitials(profile.name)}
        </button>
      </div>
    </header>
  );
}

function Overview({ summary, profile, onNavigate }: { summary: Summary; profile: AdminProfile; onNavigate: (view: View) => void }) {
  const today = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date());
  const firstName = profile.name.trim().split(/\s+/)[0] || "Admin";
  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">{today}</span>
          <h1>Good morning, {firstName} <span>✦</span></h1>
          <p>Here&apos;s what&apos;s happening with your aquarium shop today.</p>
        </div>
        <button className="date-button"><Icon name="clock" size={16} /> Last 30 days <Icon name="chevron" size={15} /></button>
      </section>

      <section className="stat-grid" aria-label="Store summary">
        <StatCard icon="chart" label="Total revenue" value={summary.revenue} change={summary.revenueChange} helper="vs. previous period" tone="purple" />
        <StatCard icon="shopping" label="Total orders" value={summary.orders} change={summary.ordersChange} helper="vs. previous period" tone="blue" />
        <StatCard icon="users" label="New customers" value={summary.customers} change={summary.customersChange} helper="vs. previous period" tone="cyan" />
        <StatCard icon="fish" label="Low stock alerts" value={summary.lowStock} change="Needs attention" helper="active products" tone="orange" warning />
      </section>

      <section className="dashboard-grid dashboard-grid-main">
        <SalesChart data={summary.live} />
        <CategoryCard data={summary.live} />
      </section>

      <section className="dashboard-grid dashboard-grid-bottom">
        <RecentOrders data={summary.live} onViewAll={() => onNavigate("orders")} />
        <TopProducts data={summary.live} onManage={() => onNavigate("products")} />
      </section>
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  change,
  helper,
  tone,
  warning = false,
}: {
  icon: IconName;
  label: string;
  value: string;
  change: string;
  helper: string;
  tone: string;
  warning?: boolean;
}) {
  return (
    <article className={`stat-card stat-${tone}`}>
      <div className="stat-card-top"><span className="stat-icon"><Icon name={icon} size={19} /></span><button aria-label={`${label} options`} className="ghost-icon"><Icon name="dots" /></button></div>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <div className={`stat-change ${warning ? "stat-change-warning" : ""}`}>
        {!warning && <Icon name="arrowUp" size={13} />}
        <b>{change}</b><span>{helper}</span>
      </div>
    </article>
  );
}

function SalesChart({ data }: { data?: DashboardSummary }) {
  const trend = data?.salesTrend ?? [];
  const max = Math.max(...trend.map((point) => Number(point.revenue)), 1);
  const dynamicPath = trend.length > 1
    ? trend.map((point, index) => `${(index / (trend.length - 1)) * 720} ${218 - (Number(point.revenue) / max) * 205}`).join(" L ")
    : "M 0 218 L 720 218";
  const dynamicArea = trend.length > 1 ? `${dynamicPath} V220 H0Z` : "M0 218 L720 218 V220 H0Z";
  return (
    <article className="panel sales-panel">
      <div className="panel-heading">
        <div><span className="panel-kicker">PERFORMANCE</span><h2>Sales overview</h2></div>
        <div className="chart-controls"><button className="chart-control-active">Revenue</button><button>Orders</button><button className="ghost-icon" aria-label="Sales options"><Icon name="dots" /></button></div>
      </div>
      <div className="sales-summary"><strong>{data ? `$${Number(data.revenue).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$7,384.80"}</strong><span><Icon name="arrowUp" size={13} /> {data ? `${data.revenueChange >= 0 ? "+" : ""}${data.revenueChange}%` : "18.4%"}</span><small>{data ? "last 30 days · non-cancelled orders" : "compared to last month"}</small></div>
      <div className="chart-wrap">
        <div className="chart-y-labels"><span>200M</span><span>150M</span><span>100M</span><span>50M</span><span>0</span></div>
        <svg className="sales-chart" viewBox="0 0 720 220" preserveAspectRatio="none" role="img" aria-label="Sales trend rising over the last 30 days">
          <defs><linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".32" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
          {[18, 68, 118, 168, 218].map((y) => <line key={y} x1="0" x2="720" y1={y} y2={y} className="chart-grid-line" />)}
          {data ? <><path d={dynamicArea} fill="url(#areaGradient)" /><path d={dynamicPath} fill="none" stroke="var(--accent)" strokeWidth="3" vectorEffect="non-scaling-stroke" />{trend.length > 1 && <circle cx={(trend.length - 1) * 720 / (trend.length - 1)} cy={218 - (Number(trend[trend.length - 1].revenue) / max) * 205} r="5" fill="white" stroke="var(--accent)" strokeWidth="3" vectorEffect="non-scaling-stroke" />}</> : <><path d="M0 182 C25 178 43 164 62 168 S96 148 116 152 S148 129 170 137 S204 121 226 132 S255 105 277 115 S308 90 330 104 S363 76 386 91 S421 73 442 82 S474 58 499 70 S530 54 552 57 S590 35 612 47 S649 23 670 30 S700 13 720 10 V220 H0Z" fill="url(#areaGradient)" /><path d="M0 182 C25 178 43 164 62 168 S96 148 116 152 S148 129 170 137 S204 121 226 132 S255 105 277 115 S308 90 330 104 S363 76 386 91 S421 73 442 82 S474 58 499 70 S530 54 552 57 S590 35 612 47 S649 23 670 30 S700 13 720 10" fill="none" stroke="var(--accent)" strokeWidth="3" vectorEffect="non-scaling-stroke" /><circle cx="612" cy="47" r="5" fill="white" stroke="var(--accent)" strokeWidth="3" vectorEffect="non-scaling-stroke" /></>}
        </svg>
      </div>
      <div className="chart-x-labels">{data && trend.length ? <><span>{trend[0].date.slice(5)}</span><span>{trend[Math.floor(trend.length / 3)]?.date.slice(5) ?? ""}</span><span>{trend[Math.floor(trend.length * 2 / 3)]?.date.slice(5) ?? ""}</span><span>{trend[trend.length - 1].date.slice(5)}</span></> : <><span>01 Aug</span><span>07 Aug</span><span>14 Aug</span><span>21 Aug</span><span>28 Aug</span></>}</div>
    </article>
  );
}

function CategoryCard({ data }: { data?: DashboardSummary }) {
  const categories = data?.categoryMix ?? [];
  const stops = categories.length ? categories.reduce<string[]>((result, category, index) => { const start = categories.slice(0, index).reduce((sum, item) => sum + item.percentage, 0); result.push(`${["var(--accent)", "#00bdd1", "#ff6fa7", "#f4b942", "#6fe0b2", "#9c8cff"][index % 6]} ${start}% ${start + category.percentage}%`); return result; }, []).join(", ") : "";
  return (
    <article className="panel category-panel">
      <div className="panel-heading"><div><span className="panel-kicker">INVENTORY MIX</span><h2>Top categories</h2></div><button className="ghost-icon" aria-label="Category options"><Icon name="dots" /></button></div>
      <div className="donut-layout"><div className="donut-chart" style={stops ? { background: `conic-gradient(${stops})` } : undefined}><div><strong>{data ? categories.reduce((sum, category) => sum + category.orders, 0).toLocaleString("en-US") : "8,642"}</strong><span>{data ? "orders" : "items sold"}</span></div></div><div className="legend">{data ? (categories.length ? categories.map((category, index) => <Legend key={category.name} color={["purple", "cyan", "pink", "muted"][index % 4]} label={category.name} value={`${category.percentage}%`} />) : <span className="data-empty-inline">No category data yet</span>) : <><Legend color="purple" label="Tropical fish" value="42%" /><Legend color="cyan" label="Aquariums" value="26%" /><Legend color="pink" label="Accessories" value="18%" /><Legend color="muted" label="Plants & food" value="14%" /></>}</div></div>
      <div className="category-foot"><span><i className="pulse-dot" /> Best seller</span><strong>{data?.topProducts[0]?.name ?? "Neon Tetra Premium"}</strong><span>{data?.topProducts[0] ? `$${Number(data.topProducts[0].price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / item` : "$1.40 / fish"}</span></div>
    </article>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return <div className="legend-row"><span className={`legend-dot ${color}`} /><span>{label}</span><b>{value}</b></div>;
}

function RecentOrders({ data, onViewAll }: { data?: DashboardSummary; onViewAll: () => void }) {
  const liveOrders = data?.recentOrders;
  return (
    <article className="panel orders-panel"><div className="panel-heading"><div><span className="panel-kicker">LIVE ACTIVITY</span><h2>Recent orders</h2></div><button className="text-button" onClick={onViewAll}>View all <span>→</span></button></div><div className="orders-table"><div className="orders-row orders-header"><span>ORDER</span><span>PRODUCT</span><span>AMOUNT</span><span>STATUS</span></div>{data ? (liveOrders?.length ? liveOrders.map((order, index) => <div className="orders-row" key={order.id}><div className="order-customer"><span className={`avatar avatar-${["purple", "blue", "pink", "green"][index % 4]}`}>{profileInitials(order.customerName)}</span><div><strong>{order.orderNumber}</strong><small>{order.customerName} · {new Date(order.createdAt).toLocaleDateString("en-US")}</small></div></div><span className="order-product">{order.productSummary}</span><strong className="order-amount">${Number(order.totalAmount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><span className={`status status-${order.status.toLowerCase()}`}><i />{order.status}</span></div>) : <div className="dashboard-empty-row">No orders in the last 30 days.</div>) : orders.map((order) => <div className="orders-row" key={order.id}><div className="order-customer"><span className={`avatar avatar-${order.tone}`}>{order.initials}</span><div><strong>{order.id}</strong><small>{order.customer} · {order.date}</small></div></div><span className="order-product">{order.product}</span><strong className="order-amount">{order.amount}</strong><span className={`status status-${order.status.toLowerCase()}`}><i />{order.status}</span></div>)}</div></article>
  );
}

function TopProducts({ data, onManage }: { data?: DashboardSummary; onManage: () => void }) {
  const liveProducts = data?.topProducts;
  return (
    <article className="panel products-panel"><div className="panel-heading"><div><span className="panel-kicker">STOCK & SALES</span><h2>Top products</h2></div><button className="ghost-icon" aria-label="Product options"><Icon name="dots" /></button></div><div className="product-list">{data ? (liveProducts?.length ? liveProducts.map((product, index) => <div className="product-row" key={product.id}><span className="product-image product-image-aqua"><Icon name="fish" size={20} /></span><div className="product-info"><strong>{product.name}</strong><small>{product.type} · <b>${Number(product.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></small></div><div className="product-stock"><span className={product.stockQuantity < 25 ? "stock-low" : ""}>{product.stockQuantity}</span><small>{product.soldQuantity} sold</small></div><span className="product-rank">0{index + 1}</span></div>) : <div className="dashboard-empty-row">No product sales data yet.</div>) : products.map((product, index) => <div className="product-row" key={product.name}><span className={`product-image product-image-${product.tone}`}>{product.image}</span><div className="product-info"><strong>{product.name}</strong><small>{product.type} · <b>{product.price}</b></small></div><div className="product-stock"><span className={product.stock < 25 ? "stock-low" : ""}>{product.stock}</span><small>in stock</small></div><span className="product-rank">0{index + 1}</span></div>)}</div><button className="manage-button" onClick={onManage}>Manage inventory <span>→</span></button></article>
  );
}

function SectionPlaceholder({ view }: { view: Exclude<View, "overview"> }) {
  const titles: Record<typeof view, { kicker: string; title: string; description: string }> = {
    products: { kicker: "CATALOG", title: "Products", description: "Manage fish, aquariums, plants, food and accessories from one calm workspace." },
    categories: { kicker: "CATALOG STRUCTURE", title: "Categories", description: "Organize the catalog into clear groups for faster sales conversations." },
    orders: { kicker: "FULFILLMENT", title: "Orders", description: "Track new orders and keep every delivery moving on time." },
    customers: { kicker: "RELATIONSHIPS", title: "Customers", description: "Understand your community of aquarists and their buying journey." },
    analytics: { kicker: "INSIGHTS", title: "Analytics", description: "Turn store activity into clear, actionable decisions." },
    payments: { kicker: "CHECKOUT", title: "Payment settings", description: "Configure the payment options your US customers can use at checkout." },
    returns: { kicker: "CUSTOMER CARE", title: "Returns & refunds", description: "Review customer requests and record provider-confirmed resolutions." },
  };
  const content = titles[view];
  return <section className="placeholder-view"><span className="panel-kicker">{content.kicker}</span><h1>{content.title}</h1><p>{content.description}</p><div className="placeholder-grid"><div className="placeholder-card"><Icon name="sparkle" size={24} /><strong>Coming together beautifully</strong><span>This module is ready for the API wiring in the next build step.</span></div><div className="placeholder-card placeholder-accent"><Icon name="chart" size={24} /><strong>Personalization stays on</strong><span>Use the Personalize button to change the accent and dashboard background.</span></div></div></section>;
}

function PersonalizeDrawer({
  accent,
  background,
  customImage,
  onAccentChange,
  onBackgroundChange,
  onImageChange,
  onReset,
  onClose,
}: {
  accent: string;
  background: string;
  customImage: string;
  onAccentChange: (value: string) => void;
  onBackgroundChange: (value: string) => void;
  onImageChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const presets = ["#4318ff", "#0075ff", "#00c897", "#ff5c8a", "#f59e0b", "#8b5cf6"];
  return (
    <>
      <button className="drawer-scrim" onClick={onClose} aria-label="Close personalize panel" />
      <aside className="personalize-drawer" aria-label="Personalize dashboard">
        <div className="drawer-heading"><div><span className="panel-kicker">YOUR SPACE</span><h2>Personalize</h2></div><button className="ghost-icon" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>
        <p className="drawer-intro">Make the dashboard feel like yours. Layout, corner radius and card styling stay consistent.</p>
        <div className="personalize-section"><div className="section-title"><strong>Accent color</strong><span>Theme highlights</span></div><div className="color-row">{presets.map((color) => <button key={color} className={`color-swatch ${accent.toLowerCase() === color ? "color-swatch-active" : ""}`} style={{ backgroundColor: color }} onClick={() => onAccentChange(color)} aria-label={`Use ${color}`} />)}<label className="custom-color"><input type="color" value={accent} onChange={(event) => onAccentChange(event.target.value)} aria-label="Choose custom accent color" /><span>+</span></label></div><div className="accent-preview"><span style={{ backgroundColor: accent }} /><div><strong>Live accent</strong><small>{accent.toUpperCase()}</small></div></div></div>
        <div className="personalize-section"><div className="section-title"><strong>Dashboard background</strong><span>Only the image layer changes</span></div><div className="background-grid"><button className={`background-option background-aurora ${background === "aurora" ? "background-active" : ""}`} onClick={() => onBackgroundChange("aurora")}><span />Aurora</button><button className={`background-option background-midnight ${background === "midnight" ? "background-active" : ""}`} onClick={() => onBackgroundChange("midnight")}><span />Midnight</button><button className={`background-option background-ocean ${background === "ocean" ? "background-active" : ""}`} onClick={() => onBackgroundChange("ocean")}><span />Ocean</button></div><label className={`upload-zone ${customImage ? "upload-zone-filled" : ""}`}><input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={onImageChange} /><span className="upload-icon"><Icon name="upload" size={18} /></span><strong>{customImage ? "Background image selected" : "Choose an image from your PC"}</strong><small>PNG, JPG, WEBP · stays local in your browser</small></label>{customImage && <button className={`background-option background-custom ${background === "custom" ? "background-active" : ""}`} onClick={() => onBackgroundChange("custom")}><span style={{ backgroundImage: `url(${customImage})` }} />Use selected photo</button>}</div>
        <div className="drawer-note"><Icon name="check" size={16} /><span>Your choice is saved on this device. Product, avatar and illustration images remain unchanged.</span></div>
        <button className="reset-button" onClick={onReset}>Reset to default</button>
      </aside>
    </>
  );
}

export default App;
