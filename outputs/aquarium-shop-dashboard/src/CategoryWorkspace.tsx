import { useEffect, useState, type FormEvent } from "react";
import {
  ApiError,
  clearAccessToken,
  createCategory,
  deleteCategory,
  getAccessToken,
  listManageCategories,
  listAdminProducts,
  updateCategory,
  type Category,
  type CreateCategoryInput,
  type Product,
} from "./lib/api";
import { Icon } from "./ui";

const emptyForm: CreateCategoryInput = {
  name: "",
  slug: "",
  description: "",
  isActive: true,
};

const demoCategorySeed: Category[] = [
  { id: "demo-cat-fish", name: "Tropical fish", slug: "tropical-fish", description: "Freshwater fish for vibrant community tanks.", isActive: true, productCount: 8 },
  { id: "demo-cat-plants", name: "Aquatic plants", slug: "aquatic-plants", description: "Easy-care plants for every aquascape.", isActive: true, productCount: 5 },
  { id: "demo-cat-aquarium", name: "Aquariums", slug: "aquariums", description: "Nano tanks and complete aquarium sets.", isActive: true, productCount: 4 },
];

function readDemoCategories(): Category[] {
  try {
    const stored = window.localStorage.getItem("aquarium-demo-categories");
    return stored ? JSON.parse(stored) as Category[] : demoCategorySeed;
  } catch {
    return demoCategorySeed;
  }
}

function slugify(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "category";
}

function displayError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Your session has expired. Please sign in again.";
    if (error.status === 403) return "";
    if (error.message.includes("Danh mục đang có sản phẩm")) return "This category still has products. Move them or set the category to Hidden before deleting.";
    return error.message;
  }
  return "Could not connect to the API. Check that the backend is running and try again.";
}

export default function CategoryWorkspace({ onSessionExpired, demoMode = false }: { onSessionExpired: () => void; demoMode?: boolean }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingCategory, setViewingCategory] = useState<Category | null>(null);
  const [categoryProducts, setCategoryProducts] = useState<Product[]>([]);
  const [categoryProductsLoading, setCategoryProductsLoading] = useState(false);
  const [categoryProductsError, setCategoryProductsError] = useState("");
  const [form, setForm] = useState<CreateCategoryInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [demoCategories, setDemoCategories] = useState<Category[]>(() => demoMode ? readDemoCategories() : []);
  useEffect(() => {
    if (!demoMode) return;
    try {
      window.localStorage.setItem("aquarium-demo-categories", JSON.stringify(demoCategories));
    } catch {
      // Demo editing continues for the current tab when storage is unavailable.
    }
  }, [demoMode, demoCategories]);

  const loadCategories = async () => {
    if (demoMode) {
      const query = search.trim().toLowerCase();
      setCategories(demoCategories.filter((category) => !query || [category.name, category.slug].some((value) => value.toLowerCase().includes(query))));
      setLoading(false);
      return;
    }
    if (!getAccessToken()) {
      onSessionExpired();
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await listManageCategories(search);
      setCategories(result.data);
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
    const timeout = window.setTimeout(() => void loadCategories(), search ? 220 : 0);
    return () => window.clearTimeout(timeout);
  }, [search, demoMode, demoCategories]);

  const openCreate = () => {
    setEditingCategory(null);
    setForm({ ...emptyForm });
    setError("");
    setShowForm(true);
  };

  const openEdit = (category: Category) => {
    setEditingCategory(category);
    setForm({ name: category.name, slug: category.slug, description: category.description ?? "", isActive: category.isActive });
    setError("");
    setShowForm(true);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (form.name.trim().length < 2) {
      setError("Category name must be at least 2 characters.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (demoMode) {
        const next = {
          ...form,
          name: form.name.trim(),
          slug: form.slug?.trim() || slugify(form.name),
          description: form.description?.trim() || null,
          isActive: form.isActive !== false,
        };
        if (editingCategory) {
          setDemoCategories((current) => current.map((category) => category.id === editingCategory.id ? { ...category, ...next } : category));
          setNotice("Demo category updated.");
        } else {
          setDemoCategories((current) => [{ id: `demo-cat-${Date.now()}`, productCount: 0, ...next } as Category, ...current]);
          setNotice("Demo category created.");
        }
        setShowForm(false);
        return;
      }
      if (editingCategory) {
        await updateCategory(editingCategory.id, { ...form, name: form.name.trim(), slug: form.slug?.trim() || undefined });
        setNotice("Category updated.");
      } else {
        await createCategory({ ...form, name: form.name.trim(), slug: form.slug?.trim() || undefined });
        setNotice("New category created.");
      }
      setShowForm(false);
      await loadCategories();
    } catch (requestError) {
      setError(displayError(requestError));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (category: Category) => {
    setError("");
    setNotice("");
    try {
      if (demoMode) {
        setDemoCategories((current) => current.map((item) => item.id === category.id ? { ...item, isActive: !item.isActive } : item));
        setNotice(category.isActive ? "Demo category hidden." : "Demo category shown.");
        return;
      }
      await updateCategory(category.id, { isActive: !category.isActive });
      setNotice(category.isActive ? "Category hidden from the catalog." : "Category shown in the catalog.");
      await loadCategories();
    } catch (requestError) {
      setError(displayError(requestError));
    }
  };

  const requestDelete = (category: Category) => {
    setDeleteCandidate(category);
    setError("");
    setNotice("");
  };

  const openCategoryProducts = async (category: Category) => {
    setViewingCategory(category);
    setCategoryProducts([]);
    setCategoryProductsError("");
    setCategoryProductsLoading(true);
    try {
      if (demoMode) {
        let demoProducts: Product[] = [];
        try {
          const stored = window.localStorage.getItem("aquarium-demo-products");
          demoProducts = stored ? JSON.parse(stored) as Product[] : [];
        } catch {
          demoProducts = [];
        }
        setCategoryProducts(demoProducts.filter((product) => product.categoryId === category.id));
        return;
      }
      if (!getAccessToken()) {
        setViewingCategory(null);
        onSessionExpired();
        return;
      }
      const result = await listAdminProducts({ page: 1, pageSize: 100, search: "", status: "", categoryId: category.id, type: "" });
      setCategoryProducts(result.data);
    } catch (requestError) {
      setCategoryProductsError(displayError(requestError));
      if (requestError instanceof ApiError && requestError.status === 401) {
        clearAccessToken();
        setViewingCategory(null);
        onSessionExpired();
      }
    } finally {
      setCategoryProductsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteCandidate) return;
    const category = deleteCandidate;
    setDeleting(true);
    setError("");
    setNotice("");
    try {
      if (demoMode) {
        setDemoCategories((current) => current.filter((item) => item.id !== category.id));
        try {
          const rawProducts = window.localStorage.getItem("aquarium-demo-products");
          if (rawProducts) {
            const products = JSON.parse(rawProducts) as Array<{ categoryId?: string }>;
            window.localStorage.setItem("aquarium-demo-products", JSON.stringify(products.filter((product) => product.categoryId !== category.id)));
          }
        } catch {
          // Demo category removal still succeeds for the current screen.
        }
        setNotice("Demo category deleted.");
        setDeleteCandidate(null);
        return;
      }
      await deleteCategory(category.id, true);
      setNotice("Category deleted.");
      setDeleteCandidate(null);
      await loadCategories();
    } catch (requestError) {
      setError(displayError(requestError));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="category-workspace">
      <div className="category-heading">
        <div><span className="panel-kicker">CATALOG STRUCTURE</span><h1>Categories</h1><p>Create clear product groups so sales can find fish, plants, and accessories faster.</p></div>
        <button className="catalog-add" onClick={openCreate}><span>+</span> Add category</button>
      </div>

      {(error || notice) && <div className={`catalog-feedback ${error ? "feedback-error" : "feedback-success"}`} role="status"><Icon name={error ? "help" : "check"} size={15} /><span>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }} aria-label="Dismiss message"><Icon name="close" size={14} /></button></div>}

      <div className="category-toolbar"><label className="product-search"><Icon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search category or slug..." /></label><span className="category-count"><Icon name="grid" size={14} /> {categories.length} categories</span></div>

      <div className="category-card">
        <div className="category-card-top"><div><span className="panel-kicker">PRODUCT GROUPS</span><h2>Category list</h2></div><span className="catalog-source"><span className="source-dot" /> {demoMode ? "Demo data" : "Live API"}</span></div>
        {loading ? <div className="category-loading"><span /><span /><span /></div> : categories.length === 0 ? <div className="category-empty"><span className="empty-icon"><Icon name="grid" size={20} /></span><strong>No categories yet</strong><span>Create the first category for your catalog.</span><button onClick={openCreate}>Create category →</button></div> : <div className="category-list">{categories.map((category) => <CategoryRow key={category.id} category={category} onViewProducts={() => void openCategoryProducts(category)} onEdit={() => openEdit(category)} onToggle={() => void toggleActive(category)} onDelete={() => requestDelete(category)} />)}</div>}
      </div>

      {showForm && <CategoryFormModal category={editingCategory} form={form} saving={saving} onChange={setForm} onSubmit={handleSave} onClose={() => setShowForm(false)} />}
      {deleteCandidate && <DeleteCategoryModal category={deleteCandidate} deleting={deleting} onConfirm={() => void handleDelete()} onClose={() => { if (!deleting) setDeleteCandidate(null); }} />}
      {viewingCategory && <CategoryProductsModal category={viewingCategory} products={categoryProducts} loading={categoryProductsLoading} error={categoryProductsError} onClose={() => setViewingCategory(null)} />}
    </section>
  );
}

function CategoryRow({ category, onViewProducts, onEdit, onToggle, onDelete }: { category: Category; onViewProducts: () => void; onEdit: () => void; onToggle: () => void; onDelete: () => void }) {
  return <div className="category-row"><span className="category-row-icon"><Icon name="grid" size={17} /></span><button type="button" className="category-row-main category-view-trigger" onClick={onViewProducts} aria-label={`View products in ${category.name}`}><strong>{category.name}</strong><small>/{category.slug}{category.description ? ` · ${category.description}` : ""}</small></button><span className="category-products">{category.productCount} products</span><span className={`catalog-status ${category.isActive ? "status-active" : "status-inactive"}`}><i />{category.isActive ? "Active" : "Hidden"}</span><div className="row-actions"><button onClick={onEdit}>Edit</button><button onClick={onToggle}>{category.isActive ? "Hide" : "Show"}</button><button onClick={onDelete}>Delete</button></div></div>;
}

function CategoryFormModal({ category, form, saving, onChange, onSubmit, onClose }: { category: Category | null; form: CreateCategoryInput; saving: boolean; onChange: (value: CreateCategoryInput) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void }) {
  return <div className="modal-layer"><button type="button" className="modal-scrim" onClick={onClose} aria-label="Close category form" /><form className="product-modal category-modal" onSubmit={onSubmit}><div className="modal-heading"><div><span className="panel-kicker">CATALOG STRUCTURE</span><h2>{category ? "Edit category" : "Add category"}</h2><p>{category ? "Update this product group." : "Create a new group for your sales catalog."}</p></div><button type="button" className="ghost-icon" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div><div className="modal-fields"><label>Category name<input value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} placeholder="Tropical fish" required minLength={2} maxLength={100} /></label><label>Slug<input value={form.slug ?? ""} onChange={(event) => onChange({ ...form, slug: event.target.value })} placeholder="tropical-fish" maxLength={120} /></label><label className="field-wide">Description<textarea value={form.description ?? ""} onChange={(event) => onChange({ ...form, description: event.target.value })} placeholder="Short note for the sales team..." maxLength={1000} /></label><div className="field-wide category-status-field"><span className="category-status-label">Category status</span><div className="category-status-options" role="group" aria-label="Category status"><button type="button" className={form.isActive !== false ? "category-status-option category-status-option-active" : "category-status-option"} onClick={() => onChange({ ...form, isActive: true })}>Active</button><button type="button" className={form.isActive === false ? "category-status-option category-status-option-hidden" : "category-status-option"} onClick={() => onChange({ ...form, isActive: false })}>Hidden</button></div><small>Hidden categories stay in admin but are removed from the customer catalog.</small></div></div><div className="modal-foot"><span>Slug is generated when left blank.</span><div><button type="button" className="modal-cancel" onClick={onClose}>Cancel</button><button type="submit" className="modal-submit" disabled={saving}>{saving ? "Saving..." : category ? "Save changes" : "Create category"}</button></div></div></form></div>;
}

function DeleteCategoryModal({ category, deleting, onConfirm, onClose }: { category: Category; deleting: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="modal-layer delete-modal-layer">
      <button type="button" className="modal-scrim" onClick={onClose} aria-label="Close delete confirmation" />
      <section className="delete-product-modal" role="dialog" aria-modal="true" aria-labelledby="delete-category-title" aria-describedby="delete-category-description">
        <button type="button" className="ghost-icon delete-modal-close" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        <div className="delete-modal-icon"><Icon name="help" size={22} /></div>
        <span className="panel-kicker">CATALOG STRUCTURE</span>
        <h2 id="delete-category-title">Delete category and products?</h2>
        <p id="delete-category-description">This will permanently remove <strong>{category.name}</strong> and all {category.productCount} {category.productCount === 1 ? "product" : "products"} assigned to it. This action cannot be undone.</p>
        <div className="delete-modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose} disabled={deleting}>Cancel</button>
          <button type="button" className="delete-modal-submit" onClick={onConfirm} disabled={deleting}>{deleting ? "Deleting..." : "Delete all"}</button>
        </div>
      </section>
    </div>
  );
}

function CategoryProductsModal({ category, products, loading, error, onClose }: { category: Category; products: Product[]; loading: boolean; error: string; onClose: () => void }) {
  return (
    <div className="modal-layer category-products-layer">
      <button type="button" className="modal-scrim" onClick={onClose} aria-label="Close category products" />
      <section className="category-products-modal" role="dialog" aria-modal="true" aria-labelledby="category-products-title">
        <div className="modal-heading">
          <div><span className="panel-kicker">CATEGORY PRODUCTS</span><h2 id="category-products-title">{category.name}</h2><p>Products currently assigned to this category.</p></div>
          <button type="button" className="ghost-icon" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="category-products-summary"><span><Icon name="box" size={15} /> {loading ? "Loading products..." : `${products.length} ${products.length === 1 ? "product" : "products"}`}</span><span className={`catalog-status ${category.isActive ? "status-active" : "status-inactive"}`}><i />{category.isActive ? "Active" : "Hidden"}</span></div>
        {error ? <div className="catalog-feedback feedback-error category-products-feedback" role="alert"><Icon name="help" size={15} /><span>{error}</span></div> : loading ? <div className="category-products-loading"><span /><span /><span /></div> : products.length ? <div className="category-products-list">{products.map((product) => { const primaryImage = product.images?.find((image) => image.isPrimary)?.url ?? product.images?.[0]?.url; return <div className="category-product-row" key={product.id}><span className={`category-product-type ${primaryImage ? "category-product-type-image" : ""}`}>{primaryImage ? <img src={primaryImage} alt="" /> : <Icon name={product.type === "FISH" ? "fish" : product.type === "PLANT" ? "sparkle" : "box"} size={15} />}</span><div><strong>{product.name}</strong><small>{product.sku}</small></div><span className="category-product-price">${Number(product.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span><span className={`catalog-status status-${product.status.toLowerCase()}`}><i />{product.status.replaceAll("_", " ")}</span><span className="category-product-stock">{product.stockQuantity} in stock</span></div>; })}</div> : <div className="category-products-empty"><span className="empty-icon"><Icon name="box" size={19} /></span><strong>No products in this category</strong><span>Add a product and choose this category to see it here.</span></div>}
        <div className="modal-foot category-products-foot"><span>Click the category name anytime to refresh this list.</span><div><button type="button" className="modal-submit" onClick={onClose}>Done</button></div></div>
      </section>
    </div>
  );
}
