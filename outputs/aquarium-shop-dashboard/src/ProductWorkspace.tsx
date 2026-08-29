import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ApiError,
  adjustInventory,
  clearAccessToken,
  createProduct,
  getAccessToken,
  listAdminCategories,
  listAdminProducts,
  type Category,
  type CreateProductInput,
  type Product,
  type ProductFilters,
  updateProduct,
  deleteProduct,
} from "./lib/api";
import { Icon, type IconName } from "./ui";

const pageSize = 8;
const emptyForm: CreateProductInput = {
  categoryId: "",
  sku: "",
  name: "",
  type: "FISH",
  status: "DRAFT",
  price: "",
  costPrice: "",
  stockQuantity: 0,
  lowStockThreshold: 5,
  description: "",
  images: [],
};

const typeLabels: Record<string, string> = {
  FISH: "Fish",
  ACCESSORY: "Accessory",
  FOOD: "Food",
  AQUARIUM: "Aquarium",
  PLANT: "Plant",
  OTHER: "Other",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  OUT_OF_STOCK: "Out of stock",
};

const demoCategories: Category[] = [
  { id: "demo-cat-fish", name: "Tropical fish", slug: "tropical-fish", description: "Freshwater fish for vibrant community tanks.", isActive: true, productCount: 8 },
  { id: "demo-cat-plants", name: "Aquatic plants", slug: "aquatic-plants", description: "Easy-care plants for every aquascape.", isActive: true, productCount: 5 },
  { id: "demo-cat-aquarium", name: "Aquariums", slug: "aquariums", description: "Nano tanks and complete aquarium sets.", isActive: true, productCount: 4 },
];

const demoProducts: Product[] = [
  { id: "demo-prod-neon", categoryId: "demo-cat-fish", sku: "FISH-NEON-001", name: "Neon Tetra Premium", slug: "neon-tetra-premium", description: "Bright schooling fish for planted tanks.", type: "FISH", status: "ACTIVE", price: "1.40", costPrice: "0.72", stockQuantity: 124, lowStockThreshold: 10, size: "2–3 cm", careLevel: "Easy", temperatureRange: "22–26°C", category: demoCategories[0], images: [], createdAt: "2025-08-01T08:00:00.000Z", updatedAt: "2025-08-28T08:00:00.000Z" },
  { id: "demo-prod-betta", categoryId: "demo-cat-fish", sku: "FISH-BETTA-002", name: "Betta Koi Galaxy", slug: "betta-koi-galaxy", description: "Hand-selected koi betta with vivid pattern.", type: "FISH", status: "ACTIVE", price: "27.20", costPrice: "16.80", stockQuantity: 18, lowStockThreshold: 5, size: "5–6 cm", careLevel: "Easy", temperatureRange: "24–28°C", category: demoCategories[0], images: [], createdAt: "2025-08-02T08:00:00.000Z", updatedAt: "2025-08-27T08:00:00.000Z" },
  { id: "demo-prod-anubias", categoryId: "demo-cat-plants", sku: "PLANT-ANUB-003", name: "Anubias Nana Petite", slug: "anubias-nana-petite", description: "Compact, slow-growing plant for nano tanks.", type: "PLANT", status: "ACTIVE", price: "4.20", costPrice: "2.40", stockQuantity: 42, lowStockThreshold: 8, size: "5–8 cm", careLevel: "Easy", temperatureRange: "20–28°C", category: demoCategories[1], images: [], createdAt: "2025-08-04T08:00:00.000Z", updatedAt: "2025-08-26T08:00:00.000Z" },
  { id: "demo-prod-nano", categoryId: "demo-cat-aquarium", sku: "TANK-NANO-004", name: "Nano Cube 30L Set", slug: "nano-cube-30l-set", description: "A calm starter set with light and filter.", type: "AQUARIUM", status: "DRAFT", price: "50.00", costPrice: "35.20", stockQuantity: 7, lowStockThreshold: 3, size: "30L", careLevel: "Easy", temperatureRange: "22–27°C", category: demoCategories[2], images: [], createdAt: "2025-08-05T08:00:00.000Z", updatedAt: "2025-08-25T08:00:00.000Z" },
];

function readDemoCategories(): Category[] {
  try {
    const stored = window.localStorage.getItem("aquarium-demo-categories");
    return stored ? JSON.parse(stored) as Category[] : demoCategories;
  } catch {
    return demoCategories;
  }
}

function readDemoProducts(): Product[] {
  try {
    const stored = window.localStorage.getItem("aquarium-demo-products");
    return stored ? JSON.parse(stored) as Product[] : demoProducts;
  } catch {
    return demoProducts;
  }
}

interface GlassSelectOption {
  value: string;
  label: string;
}

function GlassSelect({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: GlassSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  return (
    <div className={`glass-select ${open ? "glass-select-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="glass-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label ?? "Choose an option"}</span>
        <span className="glass-select-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="glass-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`glass-select-option ${option.value === value ? "glass-select-option-active" : ""}`}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function displayError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Your session has expired. Please sign in again.";
    if (error.status === 403) return "";
    return error.message;
  }
  return "Could not connect to the API. Check that the backend is running and try again.";
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "product";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

async function compressProductImage(file: File): Promise<string> {
  if (!file.type.match(/^image\/(?:png|jpe?g|webp)$/i)) {
    throw new Error("Only PNG, JPEG, or WebP images are supported.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Image is too large. Choose an image smaller than 10 MB.");
  }

  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The selected image could not be read."));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("The image is invalid or corrupted."));
    element.src = source;
  });

  const maxDimension = 1000;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot process images.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const compressed = canvas.toDataURL("image/jpeg", 0.76);
  if (compressed.length > 480_000) {
    throw new Error("The compressed image is still too large. Choose a lighter image.");
  }
  return compressed;
}

export default function ProductWorkspace({ onSessionExpired, demoMode = false }: { onSessionExpired: () => void; demoMode?: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, totalItems: 0 });
  const [filters, setFilters] = useState<ProductFilters>({
    page: 1,
    pageSize,
    search: "",
    status: "",
    categoryId: "",
    type: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<CreateProductInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [demoCatalog, setDemoCatalog] = useState<Product[]>(() => demoMode ? readDemoProducts() : []);
  const [demoCategoryList] = useState<Category[]>(() => demoMode ? readDemoCategories() : []);
  useEffect(() => {
    if (!demoMode) return;
    try {
      window.localStorage.setItem("aquarium-demo-products", JSON.stringify(demoCatalog));
    } catch {
      // Demo editing continues for the current tab when storage is unavailable.
    }
  }, [demoMode, demoCatalog]);
  const loadCatalog = async () => {
    if (demoMode) {
      setLoading(true);
      const query = filters.search.trim().toLowerCase();
      const filtered = demoCatalog.filter((product) => {
        const matchesSearch = !query || [product.name, product.sku, product.category.name].some((value) => value.toLowerCase().includes(query));
        const matchesStatus = !filters.status || product.status === filters.status;
        const matchesType = !filters.type || product.type === filters.type;
        const matchesCategory = !filters.categoryId || product.categoryId === filters.categoryId;
        return matchesSearch && matchesStatus && matchesType && matchesCategory;
      });
      const start = (filters.page - 1) * pageSize;
      setProducts(filtered.slice(start, start + pageSize));
      setMeta({ page: filters.page, totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)), totalItems: filtered.length });
      setCategories(demoCategoryList.filter((category) => category.isActive));
      setLoading(false);
      return;
    }
    if (!getAccessToken()) {
      setProducts([]);
      setCategories([]);
      onSessionExpired();
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [productPage, categoryPage] = await Promise.all([
        listAdminProducts(filters),
        listAdminCategories(),
      ]);
      setProducts(productPage.data);
      setMeta({ ...productPage.meta });
      setCategories(categoryPage.data);
    } catch (requestError) {
      setError(displayError(requestError));
      if (requestError instanceof ApiError && requestError.status === 401) {
        clearAccessToken();
        onSessionExpired();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCatalog();
  }, [filters.page, filters.pageSize, filters.search, filters.status, filters.categoryId, filters.type, demoMode, demoCatalog, demoCategoryList]);

  const openCreate = () => {
    setEditingProduct(null);
    setForm({ ...emptyForm, categoryId: categories[0]?.id ?? "" });
    setShowForm(true);
    setError("");
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setForm({
      categoryId: product.categoryId,
      sku: product.sku,
      name: product.name,
      type: product.type,
      status: product.status,
      price: product.price,
      costPrice: product.costPrice ?? "",
      stockQuantity: product.stockQuantity,
      lowStockThreshold: product.lowStockThreshold,
      description: product.description ?? "",
      images: (product.images ?? []).map(({ url, altText, position, isPrimary }) => ({ url, altText: altText ?? undefined, position, isPrimary })),
    });
    setShowForm(true);
    setError("");
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.categoryId) {
      setError("Choose a category before saving the product.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (demoMode) {
        const now = new Date().toISOString();
        const demoCategory = demoCategoryList.find((category) => category.id === form.categoryId) ?? demoCategoryList[0];
        if (editingProduct) {
          setDemoCatalog((current) => current.map((product) => product.id === editingProduct.id ? {
            ...product,
            categoryId: form.categoryId,
            category: demoCategory ?? product.category,
            sku: form.sku.trim(),
            name: form.name.trim(),
            slug: slugify(form.name),
            description: form.description?.trim() || null,
            type: form.type,
            status: form.status,
            price: form.price,
            costPrice: form.costPrice?.trim() || null,
            stockQuantity: form.stockQuantity ?? product.stockQuantity,
            lowStockThreshold: form.lowStockThreshold ?? product.lowStockThreshold,
            images: (form.images ?? []).map((image, index) => ({ id: `demo-image-${editingProduct.id}-${index}`, ...image, altText: image.altText ?? null, position: image.position ?? index, isPrimary: image.isPrimary ?? index === 0 })),
            updatedAt: now,
          } : product));
          setNotice("Demo product updated.");
        } else {
          const newProduct: Product = {
            id: `demo-prod-${Date.now()}`,
            categoryId: form.categoryId,
            sku: form.sku.trim(),
            name: form.name.trim(),
            slug: slugify(form.name),
            description: form.description?.trim() || null,
            type: form.type,
            status: form.status,
            price: form.price,
            costPrice: form.costPrice?.trim() || null,
            stockQuantity: form.stockQuantity ?? 0,
            lowStockThreshold: form.lowStockThreshold ?? 5,
            size: null,
            careLevel: null,
            temperatureRange: null,
            category: demoCategory ?? demoCategories[0],
            images: (form.images ?? []).map((image, index) => ({ id: `demo-image-${Date.now()}-${index}`, ...image, altText: image.altText ?? null, position: image.position ?? index, isPrimary: image.isPrimary ?? index === 0 })),
            createdAt: now,
            updatedAt: now,
          };
          setDemoCatalog((current) => [newProduct, ...current]);
          setNotice("Demo product created.");
        }
        setShowForm(false);
        return;
      }
      if (editingProduct) {
        const { stockQuantity: _stockQuantity, ...updateInput } = form;
        await updateProduct(editingProduct.id, updateInput);
        if (_stockQuantity !== undefined && _stockQuantity !== editingProduct.stockQuantity) {
          const delta = _stockQuantity - editingProduct.stockQuantity;
          await adjustInventory(editingProduct.id, "ADJUSTMENT", delta, "Updated from product editor");
        }
        setNotice("Product updated.");
      } else {
        await createProduct(form);
        setNotice("New product created.");
      }
      setShowForm(false);
      await loadCatalog();
    } catch (requestError) {
      setError(displayError(requestError));
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (product: Product) => {
    setDeleteCandidate(product);
    setError("");
    setNotice("");
  };

  const handleDelete = async () => {
    if (!deleteCandidate) return;
    const product = deleteCandidate;
    setDeleting(true);
    setError("");
    setNotice("");
    try {
      if (demoMode) {
        setDemoCatalog((current) => current.filter((item) => item.id !== product.id));
        setNotice("Demo product deleted.");
        setDeleteCandidate(null);
        return;
      }
      await deleteProduct(product.id);
      setNotice("Product deleted.");
      setDeleteCandidate(null);
      await loadCatalog();
    } catch (requestError) {
      setError(displayError(requestError));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="product-workspace">
      <div className="catalog-heading">
        <div><span className="panel-kicker">SALES CATALOG</span><h1>Products</h1><p>Keep your catalog clear so sales can find the right fish, price, and stock in seconds.</p></div>
        <div className="catalog-actions"><button className="catalog-refresh" onClick={() => void loadCatalog()} disabled={loading}><Icon name="chart" size={15} /> Refresh</button><button className="catalog-add" onClick={openCreate}><span>+</span> Add product</button></div>
      </div>

      {(error || notice) && <div className={`catalog-feedback ${error ? "feedback-error" : "feedback-success"}`} role="status"><Icon name={error ? "help" : "check"} size={15} /><span>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }} aria-label="Dismiss message"><Icon name="close" size={14} /></button></div>}

      <div className="product-filters">
        <label className="product-search"><Icon name="search" size={16} /><input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value, page: 1 }))} placeholder="Search by name, SKU..." /></label>
        <GlassSelect value={filters.status} onChange={(value) => setFilters((current) => ({ ...current, status: value, page: 1 }))} ariaLabel="Filter by status" options={[{ value: "", label: "All statuses" }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))]} />
        <GlassSelect value={filters.type} onChange={(value) => setFilters((current) => ({ ...current, type: value, page: 1 }))} ariaLabel="Filter by type" options={[{ value: "", label: "All types" }, ...Object.entries(typeLabels).map(([value, label]) => ({ value, label }))]} />
        <GlassSelect value={filters.categoryId} onChange={(value) => setFilters((current) => ({ ...current, categoryId: value, page: 1 }))} ariaLabel="Filter by category" options={[{ value: "", label: "All categories" }, ...categories.map((category) => ({ value: category.id, label: category.name }))]} />
      </div>

      <div className="catalog-card"><div className="catalog-card-top"><div><span className="panel-kicker">INVENTORY & PRICING</span><h2>Product list <small>{meta.totalItems} items</small></h2></div><span className="catalog-source"><span className="source-dot" /> {demoMode ? "Demo data" : "Live API"}</span></div><div className="product-table-wrap"><table className="product-table"><thead><tr><th>PRODUCT</th><th>SKU</th><th>CATEGORY</th><th>PRICE</th><th>STOCK</th><th>STATUS</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{loading ? <LoadingRows /> : products.length === 0 ? <tr><td colSpan={7}><EmptyProducts onCreate={openCreate} /></td></tr> : products.map((product) => <ProductRow key={product.id} product={product} onEdit={() => openEdit(product)} onDelete={() => requestDelete(product)} />)}</tbody></table></div><div className="catalog-pagination"><span>Showing {products.length ? (filters.page - 1) * pageSize + 1 : 0}–{Math.min(filters.page * pageSize, meta.totalItems)} of {meta.totalItems}</span><div><button onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }))} disabled={filters.page <= 1 || loading}>←</button><b>{filters.page}</b><button onClick={() => setFilters((current) => ({ ...current, page: Math.min(meta.totalPages, current.page + 1) }))} disabled={filters.page >= meta.totalPages || loading}>→</button></div></div></div>

      {showForm && <ProductFormModal editingProduct={editingProduct} form={form} saving={saving} categories={categories} onChange={setForm} onSubmit={handleSave} onClose={() => setShowForm(false)} />}
      {deleteCandidate && <DeleteProductModal product={deleteCandidate} deleting={deleting} onConfirm={() => void handleDelete()} onClose={() => { if (!deleting) setDeleteCandidate(null); }} />}
    </section>
  );
}

function ProductRow({ product, onEdit, onDelete }: { product: Product; onEdit: () => void; onDelete: () => void }) {
  const icon: IconName = product.type === "FISH" ? "fish" : product.type === "PLANT" ? "sparkle" : "box";
  const primaryImage = (product.images ?? []).find((image) => image.isPrimary)?.url ?? product.images?.[0]?.url;
  return <tr><td><div className="product-name-cell"><span className={`product-type-icon type-${product.type.toLowerCase()} ${primaryImage ? "product-type-image" : ""}`}>{primaryImage ? <img src={primaryImage} alt="" /> : <Icon name={icon} size={16} />}</span><div><strong>{product.name}</strong><small>{product.description || `${typeLabels[product.type] || product.type} · updated ${formatDate(product.updatedAt)}`}</small></div></div></td><td><code>{product.sku}</code></td><td><span className="category-pill">{product.category.name}</span></td><td><strong className="price-cell">${Number(product.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td><td><span className={`stock-cell ${product.stockQuantity <= product.lowStockThreshold ? "stock-cell-low" : ""}`}>{product.stockQuantity}</span></td><td><span className={`catalog-status status-${product.status.toLowerCase()}`}><i />{statusLabels[product.status] || product.status}</span></td><td><div className="row-actions"><button onClick={onEdit} aria-label={`Edit ${product.name}`}>Edit</button><button onClick={onDelete} aria-label={`Delete ${product.name}`}>Delete</button></div></td></tr>;
}

function LoadingRows() {
  return <>{[1, 2, 3, 4].map((row) => <tr key={row}><td colSpan={7}><div className="table-skeleton"><span /><span /><span /></div></td></tr>)}</>;
}

function EmptyProducts({ onCreate }: { onCreate: () => void }) {
  return <div className="empty-products"><div className="empty-icon"><Icon name="box" size={20} /></div><strong>No products match these filters</strong><span>Try another search or create a new product.</span><button onClick={onCreate}>Create product →</button></div>;
}

function ProductFormModal({ editingProduct, form, saving, categories, onChange, onSubmit, onClose }: { editingProduct: Product | null; form: CreateProductInput; saving: boolean; categories: Category[]; onChange: (value: CreateProductInput) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void }) {
  const [imageError, setImageError] = useState("");
  const field = <K extends keyof CreateProductInput>(key: K, value: CreateProductInput[K]) => onChange({ ...form, [key]: value });
  const productImages = form.images ?? [];
  const maxProductImages = 8;
  const normalizedImages = (images: NonNullable<CreateProductInput["images"]>) => images.map((image, index) => ({
    ...image,
    position: index,
    isPrimary: index === 0,
  }));

  const handleImageChange = async (files: FileList | null) => {
    const filesToAdd = Array.from(files ?? []).slice(0, Math.max(0, maxProductImages - productImages.length));
    if (!filesToAdd.length) return;
    setImageError("");
    try {
      const addedImages = await Promise.all(filesToAdd.map(async (file) => ({
        url: await compressProductImage(file),
        altText: form.name.trim() || "Product image",
      })));
      field("images", normalizedImages([...productImages, ...addedImages]));
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "The image could not be uploaded.");
    }
  };

  const removeImage = (index: number) => {
    field("images", normalizedImages(productImages.filter((_, imageIndex) => imageIndex !== index)));
    setImageError("");
  };

  const setPrimaryImage = (index: number) => {
    const reordered = [productImages[index], ...productImages.filter((_, imageIndex) => imageIndex !== index)];
    field("images", normalizedImages(reordered));
  };

  return (
    <div className="modal-layer">
      <button type="button" className="modal-scrim" onClick={onClose} aria-label="Close product form" />
      <form className="product-modal" onSubmit={onSubmit}>
        <div className="modal-heading">
          <div><span className="panel-kicker">CATALOG ACTION</span><h2>{editingProduct ? "Edit product" : "Add product"}</h2><p>{editingProduct ? "Update sales-facing product information." : "Create a new product in the live catalog."}</p></div>
          <button type="button" className="ghost-icon" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="modal-fields">
          <label>Product name<input value={form.name} onChange={(event) => field("name", event.target.value)} placeholder="Neon Tetra Premium" required minLength={2} maxLength={160} /></label>
          <label>SKU<input value={form.sku} onChange={(event) => field("sku", event.target.value)} placeholder="FISH-NEON-001" required disabled={Boolean(editingProduct)} /></label>
          <label>Category<GlassSelect value={form.categoryId} onChange={(value) => field("categoryId", value)} ariaLabel="Category" options={[{ value: "", label: "Choose category" }, ...categories.map((category) => ({ value: category.id, label: category.name }))]} /></label>
          <label>Type<GlassSelect value={form.type} onChange={(value) => field("type", value)} ariaLabel="Type" options={Object.entries(typeLabels).map(([value, label]) => ({ value, label }))} /></label>
          <label>Price (USD)<input inputMode="decimal" value={form.price} onChange={(event) => field("price", event.target.value)} placeholder="14.00" required /></label>
          <label>Cost price<input inputMode="decimal" value={form.costPrice ?? ""} onChange={(event) => field("costPrice", event.target.value)} placeholder="18000.00" /></label>
          <label>Status<GlassSelect value={form.status} onChange={(value) => field("status", value)} ariaLabel="Status" options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} /></label>
          <label>{editingProduct ? "Current stock" : "Opening stock"}<input type="number" min="0" value={form.stockQuantity ?? 0} onChange={(event) => field("stockQuantity", Number(event.target.value))} /></label>
          <div className="field-wide product-image-field"><span className="product-image-field-label">Product images</span>
            <div className="product-image-picker">
              {productImages.length > 0 && <div className="product-image-gallery">{productImages.map((image, index) => <div className={`product-image-preview ${index === 0 ? "is-primary" : ""}`} key={`${image.url}-${index}`}><img src={image.url} alt={image.altText || form.name || "Product preview"} /><div className="product-image-preview-copy"><strong>{index === 0 ? "Primary image" : `Image ${index + 1}`}</strong><small>{index === 0 ? "Shown on the customer storefront card." : "Shown in product details."}</small><div className="product-image-actions">{index !== 0 && <button type="button" className="image-action-button" onClick={() => setPrimaryImage(index)}>Make primary</button>}<button type="button" className="image-action-button image-remove-button" onClick={() => removeImage(index)}>Remove</button></div></div></div>)}</div>}
              {productImages.length < maxProductImages && <label className="product-image-drop"><input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => { void handleImageChange(event.target.files); event.currentTarget.value = ""; }} /><span className="product-image-drop-icon"><Icon name="upload" size={18} /></span><span><strong>{productImages.length ? "Add more images" : "Choose images from PC"}</strong><small>PNG, JPEG or WebP · up to {maxProductImages} images · first image is shown on cards</small></span></label>}
            </div>
            {imageError && <small className="product-image-error">{imageError}</small>}
          </div>
          <label className="field-wide">Description<textarea value={form.description ?? ""} onChange={(event) => field("description", event.target.value)} placeholder="Short description for sales team..." maxLength={5000} /></label>
        </div>
        <div className="modal-foot"><span>Stock changes are recorded in Inventory.</span><div><button type="button" className="modal-cancel" onClick={onClose}>Cancel</button><button type="submit" className="modal-submit" disabled={saving}>{saving ? "Saving..." : editingProduct ? "Save changes" : "Create product"}</button></div></div>
      </form>
    </div>
  );
}

function DeleteProductModal({ product, deleting, onConfirm, onClose }: { product: Product; deleting: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="modal-layer delete-modal-layer">
      <button type="button" className="modal-scrim" onClick={onClose} aria-label="Close delete confirmation" />
      <section className="delete-product-modal" role="dialog" aria-modal="true" aria-labelledby="delete-product-title" aria-describedby="delete-product-description">
        <button type="button" className="ghost-icon delete-modal-close" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        <div className="delete-modal-icon"><Icon name="help" size={22} /></div>
        <span className="panel-kicker">CATALOG ACTION</span>
        <h2 id="delete-product-title">Delete product?</h2>
        <p id="delete-product-description">You are about to remove <strong>{product.name}</strong> from the catalog. This action cannot be undone.</p>
        <div className="delete-modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose} disabled={deleting}>Cancel</button>
          <button type="button" className="delete-modal-submit" onClick={onConfirm} disabled={deleting}>{deleting ? "Deleting..." : "Delete product"}</button>
        </div>
      </section>
    </div>
  );
}
