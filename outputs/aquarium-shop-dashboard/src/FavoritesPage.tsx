import type { PublicProduct } from "./lib/api";

interface FavoritesPageProps {
  products: PublicProduct[];
  onBack: () => void;
  onOpenProduct: (product: PublicProduct) => void;
  onToggleFavorite: (productId: string) => void;
}

const FALLBACK = "https://images.unsplash.com/photo-1707580640921-42d78bfa19cc?auto=format&fit=crop&w=900&q=85";

function productImage(product: PublicProduct): string {
  return product.images?.find((image) => image.isPrimary)?.url ?? product.images?.[0]?.url ?? FALLBACK;
}

function price(value: string): string {
  return `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function FavoritesPage({ products, onBack, onOpenProduct, onToggleFavorite }: FavoritesPageProps) {
  return (
    <main className="store-favorites-page">
      <div className="store-contact-breadcrumb"><button type="button" onClick={onBack}>Home</button><span>→</span><strong>Favorites</strong></div>
      <header className="store-favorites-heading"><div><span className="store-kicker">Your saved collection</span><h1>Things you&apos;d like<br /><em>to keep close.</em></h1></div><p>Save a fish, plant or habitat while you decide. Your favorites stay on this device.</p></header>
      {products.length ? <div className="store-favorites-grid">{products.map((product) => <article className="store-favorite-card" key={product.id} role="button" tabIndex={0} onClick={() => onOpenProduct(product)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenProduct(product); } }}>
        <button type="button" className="store-favorite-card-image" onClick={(event) => { event.stopPropagation(); onOpenProduct(product); }}><img src={productImage(product)} alt={product.name} /><span>{product.inStock ? "In the water" : "Resting"}</span></button>
        <div><span className="store-kicker">{product.category.name}</span><h2>{product.name}</h2><strong>{price(product.price)}</strong><button type="button" className="store-text-link" onClick={(event) => { event.stopPropagation(); onToggleFavorite(product.id); }}>Remove <span>×</span></button></div>
      </article>)}</div> : <div className="store-favorites-empty"><span>♡</span><h2>Your favorites are waiting.</h2><p>Tap the heart on anything that belongs in your little world.</p><button type="button" className="store-primary-button" onClick={onBack}>Explore the collection <span>→</span></button></div>}
    </main>
  );
}
