import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ShoppingBag, Search, X, Plus, Minus, ArrowRight, Check, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { dataClient } from '../../../lib/data/client';
import type { ShopProduct, ShopCartItem } from '../../../types/shop';

const IMG_COLORS = ['pink', 'teal', 'yellow', 'orange', 'green', 'pink'];
const CATEGORIES = ['All', 'Workbooks', 'Flash Cards', 'Activity Kits'];

function ProductImage({ product, index }: { product: ShopProduct; index: number }) {
  const color = IMG_COLORS[index % IMG_COLORS.length];
  const initials = product.title.split(' ').slice(0, 2).map(w => w[0]).join('');
  return <div className={`shop-product-img shop-img-${color}`}><span>{initials}</span></div>;
}

function StatusBadge({ status }: { status: ShopProduct['status'] }) {
  const cls = status === 'In Stock' ? 'instock' : status === 'Low Stock' ? 'low' : 'out';
  return <span className={`shop-status-badge shop-status-${cls}`}>{status}</span>;
}

type GuestStep = 'cart' | 'details' | 'payment' | 'proof';
const STEP_ORDER: GuestStep[] = ['cart', 'details', 'payment', 'proof'];
const STEP_LABELS: Record<GuestStep, string> = { cart: 'Cart', details: 'Your details', payment: 'Payment', proof: 'Receipt' };

interface GuestForm { email: string; name: string; address: string; phone: string; }
const EMPTY_FORM: GuestForm = { email: '', name: '', address: '', phone: '' };

interface GuestCheckoutModalProps {
  cart: ShopCartItem[];
  onUpdateQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
  onSuccess: (orderId: string, email: string) => void;
  onClose: () => void;
}

function GuestCheckoutModal({ cart, onUpdateQty, onRemove, onSuccess, onClose }: GuestCheckoutModalProps) {
  const [step, setStep] = useState<GuestStep>('cart');
  const [form, setForm] = useState<GuestForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<GuestForm>>({});
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'advance'>('cod');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');

  const total = cart.reduce((s, i) => s + i.product.price * i.quantity, 0);
  const currentIdx = STEP_ORDER.indexOf(step);
  const visibleSteps = paymentMethod === 'advance' ? STEP_ORDER : STEP_ORDER.filter(s => s !== 'proof');

  const mutation = useMutation({
    mutationFn: () => dataClient.placeOrder('guest', form.name, cart, paymentMethod, form, 'guest', receiptFile?.name),
    onSuccess: (order) => onSuccess(order.id, form.email),
  });

  function setField(field: keyof GuestForm, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    setFormErrors(e => ({ ...e, [field]: undefined }));
  }

  function validateDetails() {
    const e: Partial<GuestForm> = {};
    if (!form.email.includes('@')) e.email = 'Please enter a valid email address.';
    if (!form.name.trim()) e.name = 'Full name is required.';
    if (!form.address.trim()) e.address = 'Delivery address is required.';
    if (!form.phone.trim()) e.phone = 'Phone number is required.';
    return e;
  }

  function handleDetailsNext(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateDetails();
    if (Object.keys(errs).length) { setFormErrors(errs); return; }
    setStep('payment');
  }

  function handlePaymentNext() {
    if (paymentMethod === 'cod') { mutation.mutate(); } else { setStep('proof'); }
  }

  function handleProofSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!receiptFile) { setFileError('Please upload your payment receipt.'); return; }
    setFileError('');
    mutation.mutate();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal shop-cart-modal" onClick={e => e.stopPropagation()}>
        {/* Step indicator */}
        <div className="guest-checkout-steps">
          {visibleSteps.map((s, i) => (
            <div key={s} className={`guest-step${i < currentIdx ? ' done' : i === currentIdx ? ' active' : ''}`}>
              <span>{i < currentIdx ? <Check size={11} /> : i + 1}</span>
              <small>{STEP_LABELS[s]}</small>
            </div>
          ))}
        </div>

        <div className="shop-cart-head">
          <h3>{STEP_LABELS[step]}</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Cart */}
        {step === 'cart' && (
          <>
            {cart.length === 0 ? (
              <div className="shop-cart-empty"><ShoppingBag size={32} /><p>Your cart is empty.</p></div>
            ) : (
              <>
                <div className="shop-cart-list">
                  {cart.map(item => (
                    <div key={item.product.id} className="shop-cart-row">
                      <div className="shop-cart-row-info">
                        <strong>{item.product.title}</strong>
                        <span>${item.product.price.toFixed(2)} each</span>
                      </div>
                      <div className="shop-qty-ctrl">
                        <button onClick={() => onUpdateQty(item.product.id, item.quantity - 1)}><Minus size={13} /></button>
                        <span>{item.quantity}</span>
                        <button onClick={() => onUpdateQty(item.product.id, item.quantity + 1)}><Plus size={13} /></button>
                      </div>
                      <div className="shop-cart-row-total">${(item.product.price * item.quantity).toFixed(2)}</div>
                      <button className="shop-cart-remove" onClick={() => onRemove(item.product.id)}><X size={14} /></button>
                    </div>
                  ))}
                </div>
                <div className="shop-cart-footer">
                  <div className="shop-cart-total"><span>Total</span><strong>${total.toFixed(2)}</strong></div>
                  <button className="btn btn-primary" onClick={() => setStep('details')}>Continue <ArrowRight size={15} /></button>
                </div>
              </>
            )}
          </>
        )}

        {/* Details */}
        {step === 'details' && (
          <form onSubmit={handleDetailsNext} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {([
              { field: 'email' as const, label: 'Email address', type: 'email', placeholder: 'you@example.com' },
              { field: 'name' as const, label: 'Full name', type: 'text', placeholder: 'Sarah Johnson' },
              { field: 'address' as const, label: 'Delivery address', type: 'text', placeholder: '123 Main St, Sydney NSW 2000' },
              { field: 'phone' as const, label: 'Phone number', type: 'tel', placeholder: '04xx xxx xxx' },
            ]).map(({ field, label, type, placeholder }) => (
              <div key={field} className="auth-field">
                <label>{label}</label>
                <input type={type} placeholder={placeholder} value={form[field]} onChange={e => setField(field, e.target.value)} />
                {formErrors[field] && <span className="auth-field-error">{formErrors[field]}</span>}
              </div>
            ))}
            <div className="shop-cart-footer">
              <button type="button" className="auth-back-btn" onClick={() => setStep('cart')}>← Back</button>
              <button type="submit" className="btn btn-primary">Continue <ArrowRight size={15} /></button>
            </div>
          </form>
        )}

        {/* Payment */}
        {step === 'payment' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="checkout-method-options">
              {(['cod', 'advance'] as const).map(m => (
                <button key={m} className={`checkout-method-btn${paymentMethod === m ? ' active' : ''}`} onClick={() => setPaymentMethod(m)}>
                  <span className="checkout-method-icon">{m === 'cod' ? '🚚' : '🏦'}</span>
                  <div>
                    <strong>{m === 'cod' ? 'Cash on delivery' : 'Bank transfer'}</strong>
                    <span>{m === 'cod' ? 'Pay when your order arrives' : 'Upload your receipt after paying'}</span>
                  </div>
                  {paymentMethod === m && <Check size={16} className="checkout-method-check" />}
                </button>
              ))}
            </div>
            <div className="shop-cart-footer">
              <button className="auth-back-btn" onClick={() => setStep('details')}>← Back</button>
              <button className="btn btn-primary" onClick={handlePaymentNext} disabled={mutation.isPending}>
                {mutation.isPending ? 'Placing order…' : paymentMethod === 'cod' ? 'Place order' : 'Continue'}
                {!mutation.isPending && <ArrowRight size={15} />}
              </button>
            </div>
            {mutation.isError && <p className="auth-error"><span>{(mutation.error as Error).message}</span></p>}
          </div>
        )}

        {/* Proof */}
        {step === 'proof' && (
          <form onSubmit={handleProofSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ background: 'var(--surface)', padding: '14px 16px', fontSize: 14 }}>
              <strong>Bank transfer details</strong>
              <p style={{ margin: '6px 0 0', color: 'var(--muted)' }}>BSB: 000-000 · Account: 12345678 · Reference: GUEST-SHOP</p>
            </div>
            <div className="auth-field">
              <label>Upload receipt <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(image or PDF)</span></label>
              <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', border: '2px dashed var(--line)', borderRadius: 10 }}>
                <Upload size={16} />
                <span>{receiptFile ? receiptFile.name : 'Click to upload'}</span>
                <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => { setReceiptFile(e.target.files?.[0] ?? null); setFileError(''); }} />
              </label>
              {fileError && <span className="auth-field-error">{fileError}</span>}
            </div>
            <div className="shop-cart-footer">
              <button type="button" className="auth-back-btn" onClick={() => setStep('payment')}>← Back</button>
              <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
                {mutation.isPending ? 'Placing order…' : 'Place order'} {!mutation.isPending && <ArrowRight size={15} />}
              </button>
            </div>
            {mutation.isError && <p className="auth-error"><span>{(mutation.error as Error).message}</span></p>}
          </form>
        )}
      </div>
    </div>
  );
}

function OrderSuccess({ orderId, email, onContinue }: { orderId: string; email: string; onContinue: () => void }) {
  return (
    <div className="public-shop-success">
      <div className="public-shop-success-icon"><Check size={32} /></div>
      <h2>Order placed!</h2>
      <p>Thanks for your order. We'll be in touch at <strong>{email}</strong> with updates.</p>
      <div className="public-shop-success-id">Order ID: {orderId}</div>
      <button className="btn btn-primary" onClick={onContinue}>Continue shopping</button>
    </div>
  );
}

export function PublicShopPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [cart, setCart] = useState<ShopCartItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<{ product: ShopProduct; index: number } | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{ orderId: string; email: string } | null>(null);

  const { data: products = [], isLoading, isError } = useQuery({
    queryKey: ['shopProducts'],
    queryFn: () => dataClient.getShopProducts(),
  });

  const filtered = products.filter(p => {
    const matchCat = category === 'All' || p.category === category;
    const matchSearch = p.title.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  function addToCart(product: ShopProduct) {
    setCart(c => {
      const existing = c.find(i => i.product.id === product.id);
      if (existing) return c.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...c, { product, quantity: 1 }];
    });
  }

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) { setCart(c => c.filter(i => i.product.id !== productId)); return; }
    setCart(c => c.map(i => i.product.id === productId ? { ...i, quantity: qty } : i));
  }

  function removeFromCart(productId: string) {
    setCart(c => c.filter(i => i.product.id !== productId));
  }

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  if (successInfo) {
    return (
      <div className="public-shop-site">
        <header className="topbar">
          <div className="brand brand-compact">
            <img src="/assets/image.png" alt="Fairybread & Fractions" />
            <div><strong>fairybread</strong><span>& fractions</span></div>
          </div>
          <nav>
            <a href="/#how">How it works</a>
            <a href="/#why">Why fairybread?</a>
            <a href="/shop" style={{ color: 'var(--pink)', fontWeight: 700 }}>Shop</a>
          </nav>
          <div className="top-actions">
            <button className="btn btn-ghost" onClick={() => navigate('/login')}>Sign in <ArrowRight size={15} /></button>
          </div>
        </header>
        <main style={{ padding: '60px 24px' }}>
          <OrderSuccess orderId={successInfo.orderId} email={successInfo.email} onContinue={() => setSuccessInfo(null)} />
        </main>
      </div>
    );
  }

  return (
    <div className="public-shop-site">
      <header className="topbar">
        <div className="brand brand-compact">
          <img src="/assets/image.png" alt="Fairybread & Fractions" />
          <div><strong>fairybread</strong><span>& fractions</span></div>
        </div>
        <nav>
          <a href="/#how">How it works</a>
          <a href="/#why">Why fairybread?</a>
          <a href="/shop" style={{ color: 'var(--pink)', fontWeight: 700 }}>Shop</a>
        </nav>
        <div className="top-actions">
          <button className="btn btn-ghost" onClick={() => navigate('/login')}>Sign in <ArrowRight size={15} /></button>
          <button className="shop-cart-btn" onClick={() => cartCount > 0 && setCheckoutOpen(true)}>
            <ShoppingBag size={18} />
            {cartCount > 0 && <span className="shop-cart-badge">{cartCount}</span>}
            Cart
          </button>
        </div>
      </header>

      <main>
        <div className="public-shop-hero">
          <div className="public-shop-hero-text">
            <h1>Learning Shop</h1>
            <p>Workbooks, flash cards and activity kits to support learning at home. No account needed.</p>
          </div>
        </div>

        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
          <div className="shop-toolbar">
            <div className="shop-search-wrap">
              <Search size={15} className="shop-search-icon" />
              <input className="shop-search" placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="shop-filters">
              {CATEGORIES.map(c => (
                <button key={c} className={`shop-filter-btn${category === c ? ' active' : ''}`} onClick={() => setCategory(c)}>{c}</button>
              ))}
            </div>
          </div>

          {isLoading && <p style={{ color: 'var(--muted)', padding: '24px 0' }}>Loading products…</p>}
          {isError && <p className="auth-error"><span>Failed to load products.</span></p>}
          {!isLoading && !isError && filtered.length === 0 && (
            <div className="shop-empty"><ShoppingBag size={32} /><p>No products match your search.</p></div>
          )}
          {!isLoading && !isError && filtered.length > 0 && (
            <div className="shop-grid">
              {filtered.map((product, i) => {
                const cartQty = cart.find(c => c.product.id === product.id)?.quantity ?? 0;
                return (
                  <div key={product.id} className="shop-card">
                    <ProductImage product={product} index={i} />
                    <div className="shop-card-body">
                      <div className="shop-card-top">
                        <span className="shop-category-pill">{product.category}</span>
                        <StatusBadge status={product.status} />
                      </div>
                      <button className="shop-card-title" onClick={() => setSelectedProduct({ product, index: i })}>{product.title}</button>
                      <p className="shop-card-desc">{product.description}</p>
                      <div className="shop-card-footer">
                        <span className="shop-card-price">${product.price.toFixed(2)}</span>
                        <div className="shop-card-actions">
                          <button className="shop-view-btn" onClick={() => setSelectedProduct({ product, index: i })}>Details</button>
                          {product.status !== 'Out of Stock' ? (
                            <button className="btn btn-primary" style={{ fontSize: 13, padding: '6px 14px' }} onClick={() => addToCart(product)}>
                              {cartQty > 0 ? `In cart (${cartQty})` : 'Add to cart'}
                            </button>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Out of stock</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Upsell */}
          <div className="public-shop-upsell">
            <div className="public-shop-upsell-text">
              <strong>Already a Fairybread family?</strong>
              <span>Sign in to your portal to track orders and manage your account.</span>
            </div>
            <button className="btn btn-primary" onClick={() => navigate('/login')}>Sign in <ArrowRight size={15} /></button>
          </div>
        </div>
      </main>

      {/* Product modal */}
      {selectedProduct && (
        <div className="modal-backdrop" onClick={() => setSelectedProduct(null)}>
          <div className="modal shop-detail-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedProduct(null)}><X size={18} /></button>
            <ProductImage product={selectedProduct.product} index={selectedProduct.index} />
            <div className="shop-detail-desc">
              <span className="shop-category-pill">{selectedProduct.product.category}</span>
              <StatusBadge status={selectedProduct.product.status} />
              <h3>{selectedProduct.product.title}</h3>
              <p>{selectedProduct.product.details}</p>
            </div>
            <div className="shop-detail-meta">
              <div className="shop-detail-price">${selectedProduct.product.price.toFixed(2)}</div>
              {selectedProduct.product.status !== 'Out of Stock' ? (
                <button className="btn btn-primary" onClick={() => { addToCart(selectedProduct.product); setSelectedProduct(null); }}>
                  Add to cart
                </button>
              ) : (
                <p className="shop-out-msg">Currently out of stock.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {checkoutOpen && (
        <GuestCheckoutModal
          cart={cart}
          onUpdateQty={updateQty}
          onRemove={removeFromCart}
          onSuccess={(orderId, email) => { setCart([]); setCheckoutOpen(false); setSuccessInfo({ orderId, email }); }}
          onClose={() => setCheckoutOpen(false)}
        />
      )}
    </div>
  );
}
