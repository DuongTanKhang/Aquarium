import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ApiError,
  type CheckoutOrderResponse,
  getCurrentUser,
  getAccessToken,
  listPublicCategories,
  listPublicProducts,
  refreshAccessToken,
  saveAccessToken,
  type Category,
  type CustomerUser,
  type PublicProduct,
} from "./lib/api";
import CheckoutPage from "./CheckoutPage";
import ContactPage from "./ContactPage";
import FavoritesPage from "./FavoritesPage";
import CustomerOrdersPage from "./CustomerOrdersPage";
import CustomerAccountPage, { CustomerAuthModal, CustomerAuthPage, CustomerEmailVerificationPage } from "./CustomerAuth";

type StoreIconName =
  | "arrow"
  | "bag"
  | "check"
  | "chevron"
  | "close"
  | "heart"
  | "leaf"
  | "menu"
  | "search"
  | "sparkle"
  | "user";

const FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1707580640921-42d78bfa19cc?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1565393062922-46b4a044cdd6?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1628328879683-257489852765?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1515467699666-4adf84b2fd42?auto=format&fit=crop&w=900&q=85",
];

const CATEGORY_ART = [
  { name: "Tropical fish", slug: "tropical-fish", image: FALLBACK_IMAGES[0], note: "0" },
  { name: "Betta fish", slug: "betta-fish", image: FALLBACK_IMAGES[1], note: "0" },
  { name: "Aquatic plants", slug: "aquatic-plants", image: FALLBACK_IMAGES[2], note: "0" },
  { name: "Aquarium care", slug: "aquarium-care", image: FALLBACK_IMAGES[3], note: "0" },
];

interface CartItem {
  product: PublicProduct;
  quantity: number;
}

function loadFavoriteIds(key: string): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function StoreIcon({ name, size = 19 }: { name: StoreIconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  const paths: Record<StoreIconName, ReactNode> = {
    arrow: <path d="M5 12h13M13 6l6 6-6 6" />,
    bag: <><path d="M5 8.5h14l-1 12H6l-1-12Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m7 9 5 5 5-5" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    heart: <path d="M20.8 8.8c0 5.1-8.8 10-8.8 10S3.2 13.9 3.2 8.8A4.6 4.6 0 0 1 12 6.1a4.6 4.6 0 0 1 8.8 2.7Z" />,
    leaf: <path d="M19.5 4.5C11 4.7 5.1 8.1 5.1 13.4c0 3 2.2 5.1 5 5.1 5.6 0 8.8-6 9.4-14Z" />,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></>,
    sparkle: <><path d="m12 3 1.3 5.7L19 10l-5.7 1.3L12 17l-1.3-5.7L5 10l5.7-1.3L12 3Z" /><path d="m19 16 .6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6L19 16Z" /></>,
    user: <><circle cx="12" cy="8" r="3.2" /><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function productImage(product: PublicProduct, index: number, useGalleryIndex = false): string {
  const images = product.images ?? [];
  if (useGalleryIndex && images[index]?.url) return images[index].url;
  return images.find((image) => image.isPrimary)?.url
    ?? images[0]?.url
    ?? FALLBACK_IMAGES[index % FALLBACK_IMAGES.length];
}

function formatPrice(value: string): string {
  return `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function categorySlugFor(category: Category): string {
  return category.slug;
}

function categoryLabel(name: string): string {
  const labels: Record<string, string> = {
    "bể cá": "Aquariums",
    "cá cảnh": "Tropical fish",
    "cây thủy sinh": "Aquatic plants",
    "phụ kiện": "Accessories",
    "thức ăn": "Fish food",
  };
  return labels[name.trim().toLocaleLowerCase()] ?? name;
}

function ProductDetailView({
  product,
  selectedImage,
  quantity,
  customerUser,
  onSelectImage,
  onQuantityChange,
  onAdd,
  isFavorite,
  onToggleFavorite,
  onClose,
}: {
  product: PublicProduct;
  selectedImage: number;
  quantity: number;
  customerUser: CustomerUser | null;
  onSelectImage: (index: number) => void;
  onQuantityChange: (quantity: number) => void;
  onAdd: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onClose: () => void;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const images = product.images ?? [];
  const activeImage = Math.min(selectedImage, Math.max(0, images.length - 1));
  const typeLabel = product.type.replace(/_/g, " ").toLocaleLowerCase();

  useEffect(() => {
    layerRef.current?.scrollTo(0, 0);
  }, []);

  return (
    <div ref={layerRef} className="store-modal-layer store-single-product-layer" role="presentation" onClick={onClose}>
      <div className="store-single-product-page" role="dialog" aria-modal="true" aria-label={`${product.name} product details`} onClick={(event) => event.stopPropagation()}>
        <div className="store-single-product-breadcrumb">
          <button type="button" onClick={onClose}>Home</button>
          <StoreIcon name="chevron" size={15} />
          <button type="button" onClick={onClose}>Shop</button>
          <StoreIcon name="chevron" size={15} />
          <strong>{product.name}</strong>
          <button type="button" className="store-single-product-close" aria-label="Close product details" onClick={onClose}><StoreIcon name="close" size={20} /></button>
        </div>
        <div className="store-single-product-content">
          <div className="store-single-product-gallery">
            <div className="store-single-product-thumbs" aria-label="Product images">
              {images.length ? images.map((image, index) => <button type="button" className={index === activeImage ? "is-selected" : ""} key={`${image.url}-${index}`} onClick={() => onSelectImage(index)} aria-label={`View product image ${index + 1}`}><img src={image.url} alt="" /></button>) : <span className="store-single-product-thumb-placeholder" />}
            </div>
            <div className="store-single-product-image-wrap"><img src={productImage(product, activeImage, true)} alt={product.name} /></div>
          </div>
          <div className="store-single-product-info">
            <span className="store-kicker">{categoryLabel(product.category.name)}</span>
            <h2>{product.name}</h2>
            <strong className="store-single-product-price">{formatPrice(product.price)}</strong>
            <p className="store-single-product-description">{product.description || "A considered addition to your aquatic world, selected and packed with care."}</p>
            <div className="store-single-product-facts">
              <div><span>Type</span><b>{typeLabel}</b></div>
              <div><span>Category</span><b>{categoryLabel(product.category.name)}</b></div>
              <div><span>Availability</span><b className={product.inStock ? "is-available" : ""}>{product.inStock ? "In stock" : "Resting"}</b></div>
              <div><span>Stock left</span><b>{product.availableQuantity}</b></div>
            </div>
            <div className="store-single-product-buy">
              <div className="store-single-product-quantity" aria-label="Quantity">
                <button type="button" onClick={() => onQuantityChange(Math.max(1, quantity - 1))} aria-label="Decrease quantity">−</button>
                <span>{quantity}</span>
                <button type="button" onClick={() => onQuantityChange(Math.min(99, product.availableQuantity, quantity + 1))} aria-label="Increase quantity">+</button>
              </div>
              <button type="button" className="store-primary-button" onClick={onAdd}>{product.inStock ? (customerUser ? "Add to bag" : "Sign in to add") : "Notify me"} <StoreIcon name="arrow" size={16} /></button>
              <button type="button" className={`store-single-product-wishlist ${isFavorite ? "is-favorite" : ""}`} aria-label={`${isFavorite ? "Remove" : "Save"} ${product.name}`} aria-pressed={isFavorite} onClick={onToggleFavorite}><StoreIcon name="heart" size={18} /></button>
            </div>
            <small className="store-single-product-note">Secure checkout · Carefully packed for a healthy arrival</small>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Storefront() {
  const routeSection = typeof window !== "undefined"
    ? ({ "/shop/collections": "collections", "/shop/care": "care", "/shop/story": "story" } as Record<string, string>)[window.location.pathname]
    : undefined;
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const raw = window.localStorage.getItem("aquarium-store-cart");
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<PublicProduct | null>(null);
  const [selectedProductImage, setSelectedProductImage] = useState(0);
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [notice, setNotice] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(() => typeof window !== "undefined" && window.location.pathname === "/shop/checkout");
  const [ordersOpen, setOrdersOpen] = useState(() => typeof window !== "undefined" && window.location.pathname === "/shop/orders");
  const [accountOpen, setAccountOpen] = useState(() => typeof window !== "undefined" && window.location.pathname === "/shop/account");
  const [contactOpen, setContactOpen] = useState(() => typeof window !== "undefined" && window.location.pathname === "/shop/contact");
  const [favoritesOpen, setFavoritesOpen] = useState(() => typeof window !== "undefined" && window.location.pathname === "/shop/favorites");
  const [customerUser, setCustomerUser] = useState<CustomerUser | null>(null);
  const [customerAuthChecking, setCustomerAuthChecking] = useState(true);
  const [customerAuthOpen, setCustomerAuthOpen] = useState(false);
  const [pendingAddProduct, setPendingAddProduct] = useState<PublicProduct | null>(null);
  const [pendingAddQuantity, setPendingAddQuantity] = useState(1);
  const favoriteStorageKey = customerUser ? `aquarium-store-favorites:${customerUser.id}` : null;
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [pendingFavoriteId, setPendingFavoriteId] = useState<string | null>(null);
  const emailVerificationOpen = typeof window !== "undefined" && window.location.pathname === "/verify-email";

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Aqua · The Living Shop";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (!routeSection) return;
    const timer = window.setTimeout(() => document.getElementById(routeSection)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    return () => window.clearTimeout(timer);
  }, [routeSection]);

  useEffect(() => {
    const syncRoute = () => {
      setCheckoutOpen(window.location.pathname === "/shop/checkout");
      setOrdersOpen(window.location.pathname === "/shop/orders");
      setAccountOpen(window.location.pathname === "/shop/account");
      setContactOpen(window.location.pathname === "/shop/contact");
      setFavoritesOpen(window.location.pathname === "/shop/favorites");
    };
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!favoriteStorageKey) {
      setFavoriteIds([]);
      return;
    }
    setFavoriteIds(loadFavoriteIds(favoriteStorageKey));
  }, [favoriteStorageKey]);

  useEffect(() => {
    if (!favoriteStorageKey) return;
    try { window.localStorage.setItem(favoriteStorageKey, JSON.stringify(favoriteIds)); } catch { /* storage can be unavailable */ }
  }, [favoriteIds, favoriteStorageKey]);

  useEffect(() => {
    let active = true;
    const finish = () => { if (active) setCustomerAuthChecking(false); };
    const clearGuestCart = () => {
      if (!active) return;
      setCart([]);
      try { window.localStorage.removeItem("aquarium-store-cart"); } catch { /* storage can be unavailable */ }
    };
    const load = async () => {
      try {
        const result = getAccessToken() ? { accessToken: getAccessToken()!, user: null } : await refreshAccessToken();
        if (!getAccessToken()) saveAccessToken(result.accessToken);
        if (result.user && result.user.role !== "CUSTOMER") { clearGuestCart(); finish(); return; }
        const user = await getCurrentUser();
        if (active && user.role === "CUSTOMER") setCustomerUser(user);
        else clearGuestCart();
      } catch {
        // Browsing remains available without an account.
        clearGuestCart();
      } finally {
        finish();
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    let firstLoad = true;
    let requestId = 0;
    const loadCategories = async () => {
      const currentRequest = ++requestId;
      try {
        const page = await listPublicCategories({ page: 1, pageSize: 24 });
        if (active && currentRequest === requestId) {
          setCategories(page.data);
          if (firstLoad) setError("");
        }
      } catch (requestError: unknown) {
        // Keep the last known catalog visible during a transient background failure.
        if (active && firstLoad) setError(requestError instanceof ApiError ? requestError.message : "We could not load categories right now.");
      } finally {
        firstLoad = false;
      }
    };
    void loadCategories();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadCategories();
    }, 15_000);
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") void loadCategories();
    };
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let firstLoad = true;
    let requestId = 0;
    const loadProducts = async (showLoading: boolean) => {
      const currentRequest = ++requestId;
      if (showLoading) {
        setLoading(true);
        setError("");
      }
      try {
        const page = await listPublicProducts({
          page: 1,
          pageSize: 12,
          search: search || undefined,
          categorySlug: selectedCategory || undefined,
          sort: "newest",
        });
        if (active && currentRequest === requestId) {
          setProducts(page.data);
          setError("");
        }
      } catch (requestError: unknown) {
        // Do not replace a working catalog with an error during polling. The next
        // interval/focus event will retry automatically without requiring F5.
        if (active && firstLoad) setError(requestError instanceof ApiError ? requestError.message : "We could not load the collection right now.");
      } finally {
        if (active && showLoading) setLoading(false);
        firstLoad = false;
      }
    };
    const timer = window.setTimeout(() => {
      void loadProducts(true);
    }, 180);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadProducts(false);
    }, 10_000);
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") void loadProducts(false);
    };
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [search, selectedCategory]);

  useEffect(() => {
    try {
      window.localStorage.setItem("aquarium-store-cart", JSON.stringify(cart));
    } catch {
      // Browsing and adding to the cart still works when storage is blocked.
    }
  }, [cart]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 3_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const cartCount = useMemo(() => cart.reduce((total, item) => total + item.quantity, 0), [cart]);
  const cartTotal = useMemo(() => cart.reduce((total, item) => total + Number(item.product.price) * item.quantity, 0), [cart]);

  const addToCart = (product: PublicProduct, quantity = 1) => {
    if (!product.inStock) {
      setNotice("This fish is currently resting between arrivals.");
      return;
    }
    if (!customerUser) {
      setPendingAddProduct(product);
      setPendingAddQuantity(quantity);
      setCustomerAuthOpen(true);
      return;
    }
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      return existing
        ? current.map((item) => item.product.id === product.id ? { ...item, quantity: item.quantity + quantity } : item)
        : [...current, { product, quantity }];
    });
    setCartOpen(true);
  };

  const handleProductAction = (product: PublicProduct, quantity = 1) => {
    if (!product.inStock) {
      setNotice(`${product.name} is resting right now. Check back soon for its next arrival.`);
      return;
    }
    addToCart(product, quantity);
  };

  const openProductDetails = (product: PublicProduct) => {
    setSelectedProductImage(0);
    setDetailQuantity(1);
    setSelectedProduct(product);
  };

  const updateQuantity = (productId: string, quantity: number) => {
    setCart((current) => quantity < 1
      ? current.filter((item) => item.product.id !== productId)
      : current.map((item) => item.product.id === productId ? { ...item, quantity } : item));
  };

  const displayedCategories = categories.length
    ? categories.slice(0, 4).map((category, index) => ({
        name: categoryLabel(category.name),
        slug: categorySlugFor(category),
        image: CATEGORY_ART[index % CATEGORY_ART.length].image,
        note: `${category.productCount}`,
      }))
    : CATEGORY_ART;

  const openCheckout = () => {
    setCartOpen(false);
    window.history.pushState({}, "", "/shop/checkout");
    setCheckoutOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openOrders = () => {
    setCartOpen(false);
    window.history.pushState({}, "", "/shop/orders");
    setCheckoutOpen(false);
    setOrdersOpen(true);
    setAccountOpen(false);
    setContactOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const closeOrders = () => {
    window.history.pushState({}, "", "/shop");
    setOrdersOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openAccount = () => {
    // A guest's header action is a sign-in prompt, not a profile destination.
    // Keep the storefront visible behind the modal and return home after auth.
    if (!customerUser) {
      setCustomerAuthOpen(true);
      return;
    }
    setCartOpen(false);
    window.history.pushState({}, "", "/shop/account");
    setCheckoutOpen(false);
    setOrdersOpen(false);
    setContactOpen(false);
    setAccountOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const closeAccount = () => {
    window.history.pushState({}, "", "/shop");
    setAccountOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openContact = () => {
    setCartOpen(false);
    window.history.pushState({}, "", "/shop/contact");
    setCheckoutOpen(false);
    setOrdersOpen(false);
    setAccountOpen(false);
    setContactOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const closeContact = () => {
    window.history.pushState({}, "", "/shop");
    setContactOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openFavorites = () => {
    setCartOpen(false);
    window.history.pushState({}, "", "/shop/favorites");
    setCheckoutOpen(false);
    setOrdersOpen(false);
    setAccountOpen(false);
    setContactOpen(false);
    setFavoritesOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const closeFavorites = () => {
    window.history.pushState({}, "", "/shop");
    setFavoritesOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleFavorite = (productId: string) => {
    if (!customerUser) {
      setPendingFavoriteId(productId);
      setNotice("Please sign in to save favorites.");
      setCustomerAuthOpen(true);
      return;
    }
    setFavoriteIds((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]);
  };

  const closeCheckout = () => {
    window.history.pushState({}, "", "/shop");
    setCheckoutOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const completeCheckout = (order: CheckoutOrderResponse, email: string) => {
    setCart([]);
    try {
      const raw = window.localStorage.getItem("aquarium-store-order-refs");
      const previous = raw ? JSON.parse(raw) as Array<{ orderNumber: string; email: string }> : [];
      const next = [{ orderNumber: order.orderNumber, email }, ...previous.filter((ref) => ref.orderNumber !== order.orderNumber)].slice(0, 12);
      window.localStorage.setItem("aquarium-store-order-refs", JSON.stringify(next));
    } catch { /* the order is already committed server-side */ }
  };

  const handleCustomerAuthenticated = (user: CustomerUser) => {
    setCustomerUser(user);
    if (!user.emailVerifiedAt) {
      setNotice("Account created. Check your email for the verification link before checkout (local development links appear in the API console).");
    }
    setCustomerAuthOpen(false);
    const favoriteToSave = pendingFavoriteId;
    setPendingFavoriteId(null);
    if (favoriteToSave) {
      const key = `aquarium-store-favorites:${user.id}`;
      const next = loadFavoriteIds(key);
      if (!next.includes(favoriteToSave)) next.push(favoriteToSave);
      try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage can be unavailable */ }
      setFavoriteIds(next);
    }
    const pending = pendingAddProduct;
    setPendingAddProduct(null);
    const pendingQuantity = pendingAddQuantity;
    setPendingAddQuantity(1);
    if (!pending) return;
    setCart((current) => {
      const existing = current.find((item) => item.product.id === pending.id);
      return existing
        ? current.map((item) => item.product.id === pending.id ? { ...item, quantity: item.quantity + pendingQuantity } : item)
        : [...current, { product: pending, quantity: pendingQuantity }];
    });
    setCartOpen(true);
  };

  if (emailVerificationOpen) return <CustomerEmailVerificationPage onAuthenticated={setCustomerUser} onBack={() => { window.location.href = "/shop/account"; }} />;
  if (checkoutOpen) return <CheckoutPage cart={cart} customer={customerUser} onCustomerAuthenticated={setCustomerUser} onUpdateQuantity={updateQuantity} onBack={closeCheckout} onCompleted={completeCheckout} />;
  if (ordersOpen) return <CustomerOrdersPage customer={customerUser} onBack={closeOrders} />;
  if (accountOpen) return customerUser ? <CustomerAccountPage user={customerUser} onUpdated={setCustomerUser} onLogout={() => { setCustomerUser(null); closeAccount(); }} onBack={closeAccount} onOpenOrders={openOrders} /> : <CustomerAuthPage onAuthenticated={(user) => { setCustomerUser(user); closeAccount(); }} onBack={closeAccount} />;
  if (contactOpen) return <ContactPage onBack={closeContact} />;
  if (favoritesOpen) return <FavoritesPage products={products.filter((product) => favoriteIds.includes(product.id))} onBack={closeFavorites} onOpenProduct={(product) => { closeFavorites(); openProductDetails(product); }} onToggleFavorite={toggleFavorite} />;

  return (
    <div className="storefront">
      <div className="store-announcement"><span><StoreIcon name="sparkle" size={14} /> Thoughtful aquatics, delivered with care</span><span>Free shipping on orders over $80.00 <StoreIcon name="arrow" size={13} /></span></div>
      <header className="store-header">
        <button className="store-mobile-menu" aria-label="Open menu" onClick={() => setMenuOpen((open) => !open)}><StoreIcon name="menu" /></button>
        <a className="store-logo" href="/shop" aria-label="Aquarium home"><span className="store-logo-mark"><StoreIcon name="leaf" size={20} /></span><span><strong>AQUA</strong><small>THE LIVING SHOP</small></span></a>
        <nav className={`store-nav ${menuOpen ? "store-nav-open" : ""}`} aria-label="Store navigation">
          <a href="/shop#shop" onClick={() => setMenuOpen(false)}>Shop</a>
          <a href="/shop/collections#collections" onClick={() => setMenuOpen(false)}>Collections</a>
          <a href="/shop/care#care" onClick={() => setMenuOpen(false)}>Care guide</a>
          <a href="/shop/story#story" onClick={() => setMenuOpen(false)}>Our story</a>
          <a href="/shop/contact" onClick={(event) => { event.preventDefault(); setMenuOpen(false); openContact(); }}>Contact</a>
          <a href="/shop/favorites" onClick={(event) => { event.preventDefault(); setMenuOpen(false); openFavorites(); }}>Favorites{favoriteIds.length ? ` · ${favoriteIds.length}` : ""}</a>
          <a href="/shop/orders" onClick={(event) => { event.preventDefault(); setMenuOpen(false); openOrders(); }}>My orders</a>
        </nav>
        <div className="store-actions">
          <label className="store-search"><StoreIcon name="search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search fish, plants..." aria-label="Search products" /></label>
          <button className={`store-action-icon ${customerUser?.avatarUrl ? "store-action-avatar" : ""}`} aria-label={customerUser ? "My account" : "Sign in"} onClick={openAccount}>{customerUser?.avatarUrl ? <img src={customerUser.avatarUrl} alt="" /> : <StoreIcon name="user" />}</button>
          <button className="store-action-icon store-favorites-action" aria-label={`Favorites, ${favoriteIds.length} saved`} onClick={openFavorites}><StoreIcon name="heart" /></button>
          <button className="store-cart-button" aria-label={`Shopping bag, ${cartCount} items`} onClick={() => setCartOpen(true)}><StoreIcon name="bag" size={20} /><span>{cartCount}</span></button>
        </div>
      </header>

      <main>
        <section className="store-hero">
          <div className="store-hero-copy"><span className="store-kicker">A little more life, every day</span><h1>Bring the<br /><em>ocean home.</em></h1><p>Beautiful fish, considered habitats and the quiet joy of watching a world come alive.</p><div className="store-hero-actions"><a className="store-primary-button" href="#shop">Shop the collection <StoreIcon name="arrow" size={16} /></a><a className="store-text-link" href="#care">Start with care <StoreIcon name="arrow" size={14} /></a></div></div>
          <div className="store-hero-art"><img src={FALLBACK_IMAGES[0]} alt="Tropical fish swimming through clear water" /><div className="store-hero-caption"><span>01 / 04</span><strong>Life in colour</strong><small>Explore our hand-picked tropical collection</small></div><span className="store-hero-seal"><StoreIcon name="leaf" size={22} /> Aquatic<br />living</span></div>
        </section>

        <section className="store-trust"><div><StoreIcon name="check" /><span><strong>Healthy arrivals</strong>Quarantined with care</span></div><div><StoreIcon name="leaf" /><span><strong>Conscious choices</strong>Better for every tank</span></div><div><StoreIcon name="heart" /><span><strong>Here to help</strong>Friendly expert advice</span></div><div><StoreIcon name="sparkle" /><span><strong>Safe delivery</strong>Carefully packed, always</span></div></section>

        <section className="store-section store-collections" id="collections"><div className="store-section-heading"><div><span className="store-kicker">Find your fit</span><h2>Made for your<br /><em>little world.</em></h2></div><p>Whether you are starting your first tank or adding to a well-loved ecosystem, there is something here for every kind of keeper.</p></div><div className="store-category-grid">{displayedCategories.map((category) => <button className="store-category-card" key={category.slug} onClick={() => { setSelectedCategory(category.slug); document.getElementById("shop")?.scrollIntoView({ behavior: "smooth" }); }}><img src={category.image} alt="" /><span><strong>{category.name}</strong><small>{category.note}</small></span><span className="store-circle-arrow"><StoreIcon name="arrow" size={15} /></span></button>)}</div></section>

        <section className="store-section store-shop" id="shop"><div className="store-section-heading store-section-heading-shop"><div><span className="store-kicker">The collection</span><h2>Small wonders,<br /><em>carefully chosen.</em></h2></div><div className="store-filter-row"><button className={!selectedCategory ? "store-filter-active" : ""} onClick={() => setSelectedCategory("")}>All pieces</button>{categories.slice(0, 3).map((category) => <button className={selectedCategory === category.slug ? "store-filter-active" : ""} key={category.id} onClick={() => setSelectedCategory(category.slug)}>{categoryLabel(category.name)}</button>)}</div></div>{error ? <div className="store-error"><span>{error}</span><button onClick={() => { setError(""); setSearch((value) => `${value} `); }}>Try again</button></div> : loading ? <div className="store-product-grid">{[1, 2, 3, 4].map((item) => <div className="store-product-card store-product-skeleton" key={item}><span /></div>)}</div> : products.length ? <div className="store-product-grid">{products.map((product, index) => <article className="store-product-card" key={product.id} role="button" tabIndex={0} onClick={() => openProductDetails(product)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openProductDetails(product); } }}><div className="store-product-image"><img src={productImage(product, index)} alt={product.name} /><button className={`store-heart ${favoriteIds.includes(product.id) ? "is-favorite" : ""}`} aria-label={`${favoriteIds.includes(product.id) ? "Remove" : "Save"} ${product.name}`} aria-pressed={favoriteIds.includes(product.id)} onClick={(event) => { event.stopPropagation(); toggleFavorite(product.id); }}><StoreIcon name="heart" size={17} /></button><span className={`store-stock ${product.inStock ? "" : "store-stock-out"}`}>{product.inStock ? "In the water" : "Resting"}</span><button className={`store-quick-add ${product.inStock ? "" : "store-quick-add-resting"}`} onClick={(event) => { event.stopPropagation(); handleProductAction(product); }}>{product.inStock ? (customerUser ? "Add to bag" : "Sign in to add") : "Notify me"} <StoreIcon name="arrow" size={14} /></button></div><div className="store-product-meta"><span>{categoryLabel(product.category.name)}</span><button aria-label={`View ${product.name}`} onClick={(event) => { event.stopPropagation(); openProductDetails(product); }}><StoreIcon name="arrow" size={15} /></button><h3>{product.name}</h3><p>{product.description || "A considered addition to your aquatic world."}</p><strong>{formatPrice(product.price)}</strong></div></article>)}</div> : <div className="store-empty"><StoreIcon name="leaf" size={28} /><strong>A new collection is taking shape.</strong><span>Check back soon for more aquatic pieces.</span></div>}</section>

        <section className="store-editorial" id="story"><div className="store-editorial-image"><img src={FALLBACK_IMAGES[2]} alt="A planted aquarium in a calm home" /></div><div className="store-editorial-copy"><span className="store-kicker">The aqua journal</span><h2>A calmer corner<br />of the <em>everyday.</em></h2><p>There is something special about making space for a small, living world. We are here to make it simple, beautiful and a little more joyful.</p><a className="store-text-link" href="#care">Read our beginner's guide <StoreIcon name="arrow" size={14} /></a></div></section>

        <section className="store-care" id="care"><div><span className="store-kicker">Good to know</span><h2>Care looks<br /><em>good on you.</em></h2></div><div className="store-care-list"><div><span>01</span><strong>Choose your habitat</strong><p>Start with the right size, light and water conditions.</p></div><div><span>02</span><strong>Meet your new friend</strong><p>Every arrival comes with simple, personal care notes.</p></div><div><span>03</span><strong>Let it grow</strong><p>Watch a little ecosystem become part of home.</p></div></div></section>

        <section className="store-newsletter"><div><span className="store-kicker">A note from the water</span><h2>Good things,<br /><em>once in a while.</em></h2></div><form onSubmit={(event) => { event.preventDefault(); setNotice("You're on the list — welcome to the water."); }}><p>New arrivals, care notes and a little inspiration for your tank.</p><label><input type="email" required placeholder="Your email address" aria-label="Email address" /><button type="submit" aria-label="Subscribe"><StoreIcon name="arrow" /></button></label></form></section>
      </main>

      <footer className="store-footer"><a className="store-logo" href="/shop"><span className="store-logo-mark"><StoreIcon name="leaf" size={20} /></span><span><strong>AQUA</strong><small>THE LIVING SHOP</small></span></a><p>Thoughtful aquatics for slower, brighter days.</p><div><a href="#shop">Shop</a><a href="#care">Care</a><a href="#story">Journal</a><a href="/shop/contact" onClick={(event) => { event.preventDefault(); openContact(); }}>Contact</a><a href="/shop/favorites" onClick={(event) => { event.preventDefault(); openFavorites(); }}>Favorites</a><a href="/shop/orders" onClick={(event) => { event.preventDefault(); openOrders(); }}>My orders</a><a href="/">Admin sign in</a></div><small>© {new Date().getFullYear()} Aqua. Made with care.</small></footer>

      {notice && <div className="store-toast"><StoreIcon name="check" size={16} />{notice}<button aria-label="Dismiss" onClick={() => setNotice("")}><StoreIcon name="close" size={15} /></button></div>}
      {selectedProduct && <ProductDetailView product={selectedProduct} selectedImage={selectedProductImage} quantity={detailQuantity} customerUser={customerUser} isFavorite={favoriteIds.includes(selectedProduct.id)} onToggleFavorite={() => toggleFavorite(selectedProduct.id)} onSelectImage={setSelectedProductImage} onQuantityChange={setDetailQuantity} onAdd={() => { handleProductAction(selectedProduct, detailQuantity); if (customerUser || !selectedProduct.inStock) setSelectedProduct(null); }} onClose={() => setSelectedProduct(null)} />}
      {customerAuthOpen && <CustomerAuthModal onAuthenticated={handleCustomerAuthenticated} onClose={() => { setCustomerAuthOpen(false); setPendingAddProduct(null); setPendingAddQuantity(1); setPendingFavoriteId(null); }} />}
      {cartOpen && <div className="store-cart-layer" role="presentation" onClick={() => setCartOpen(false)}><aside className="store-cart-drawer" role="dialog" aria-modal="true" aria-label="Shopping bag" onClick={(event) => event.stopPropagation()}><div className="store-cart-heading"><div><span className="store-kicker">Your collection</span><h2>Shopping bag <small>{cartCount} {cartCount === 1 ? "piece" : "pieces"}</small></h2></div><button aria-label="Close shopping bag" onClick={() => setCartOpen(false)}><StoreIcon name="close" /></button></div>{cart.length ? <><div className="store-cart-items">{cart.map((item) => <div className="store-cart-item" key={item.product.id}><img src={productImage(item.product, 0)} alt="" /><div><strong>{item.product.name}</strong><small>{formatPrice(item.product.price)}</small><div><button onClick={() => updateQuantity(item.product.id, item.quantity - 1)} aria-label="Decrease quantity">−</button><span>{item.quantity}</span><button onClick={() => updateQuantity(item.product.id, item.quantity + 1)} aria-label="Increase quantity">+</button></div></div></div>)}</div><div className="store-cart-total"><span>Estimated total</span><strong>{formatPrice(String(cartTotal))}</strong></div><button className="store-primary-button store-checkout-button" onClick={openCheckout}>Continue to checkout <StoreIcon name="arrow" size={16} /></button><small className="store-cart-note">Secure checkout · Healthy arrival guarantee</small></> : <div className="store-cart-empty"><StoreIcon name="bag" size={28} /><strong>Your bag is waiting.</strong><span>Add a little life to your world.</span><button className="store-text-link" onClick={() => setCartOpen(false)}>Explore the collection <StoreIcon name="arrow" size={14} /></button></div>}</aside></div>}
    </div>
  );
}
