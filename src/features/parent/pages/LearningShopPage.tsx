import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag, Search, X, Plus, Minus, ArrowRight, Check, Upload } from 'lucide-react';
import { dataClient } from '../../../lib/data/client';
import { useAuth } from '../../../app/providers';
import type { ShopProduct, ShopCartItem } from '../../../types/shop';

const IMG_COLORS = ['pink', 'teal', 'yellow', 'orange', 'green', 'pink'];
const CATEGORIES = ['All', 'Workbooks', 'Flash Cards', 'Activity Kits'];

function ProductImage({ product, index }: { product: ShopProduct; index: number }) {
  const color = IMG_COLORS[index % IMG_COLORS.length];
  const initials = product.title.split(' ').slice(0, 2).map(w => w[0]).join('');
  return (
    <div className={`shop-product-img shop-img-${color}`}>
      <span>{initials}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: ShopProduct['status'] }) {
  const cls = status === 'In Stock' ? 'instock' : status === 'Low Stock' ? 'low' : 'out';
  return <span className={`shop-status-badge shop-status-${cls}`}>{status}</span>;
}

interface ProductModalProps {
  product: ShopProduct;
  index: number;
  cartQty: number;
  onAdd: (p: ShopProduct) => void;
  onClose: () => void;
}

function ProductModal({ product, index, cartQty, onAdd, onClose }: ProductModalProps) {
  const [qty, setQty] = useState(1);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal shop-detail-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <ProductImage product={product} index={index} />
        <div className="shop-detail-desc">
          <span className="shop-category-pill">{product.category}</span>
          <StatusBadge status={product.status} />
          <h3>{product.title}</h3>
          <p>{product.details}</p>
        </div>
        <div className="shop-detail-meta">
          <div className="shop-detail-price">${product.price.toFixed(2)}</div>
          {product.status !== 'Out of Stock' ? (
            <div className="shop-detail-actions">
              <div className="shop-qty-ctrl">
                <button onClick={() => setQty(q => Math.max(1, q - 1))}><Minus size={14} /></button>
                <span>{qty}</span>
                <button onClick={() => setQty(q => q + 1)}><Plus size={14} /></button>
              </div>
              <button className="btn btn-primary" onClick={() => { for (let i = 0; i < qty; i++) onAdd(product); onClose(); }}>
                {cartQty > 0 ? `Add more (${cartQty} in cart)` : 'Add to cart'}
              </button>
            </div>
          ) : (
            <p className="shop-out-msg">This item is currently out of stock.</p>
          )}
        </div>
      </div>
    </div>
  );
}

type CheckoutStep = 'cart' | 'delivery' | 'payment' | 'proof';

interface DeliveryForm { name: string; address: string; phone: string; email: string; }
const EMPTY_DELIVERY: DeliveryForm = { name: '', address: '', phone: '', email: '' };

interface CheckoutModalProps {
  cart: ShopCartItem[];
  familyId: string;
  onUpdateQty: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
  onSuccess: () => void;
  onClose: () => void;
}

function CheckoutModal({ cart, familyId, onUpdateQty, onRemove, onSuccess, onClose }: CheckoutModalProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<CheckoutStep>('cart');
  const [delivery, setDelivery] = useState<DeliveryForm>(EMPTY_DELIVERY);
  const [deliveryErrors, setDeliveryErrors] = useState<Partial<DeliveryForm>>({});
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'advance'>('cod');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');

  const total = cart.reduce((s, i) => s + i.product.price * i.quantity, 0);

  const placeMutation = useMutation({
    mutationFn: () => dataClient.placeOrder(
      familyId,
      delivery.name,
      cart,
      paymentMethod,
      delivery,
      'portal',
      receiptFile?.name,
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopOrders', familyId] });
      onSuccess();
    },
  });

  function validateDelivery() {
    const e: Partial<DeliveryForm> = {};
    if (!delivery.name.trim()) e.name = 'Full name is required.';
    if (!delivery.address.trim()) e.address = 'Delivery address is required.';
    if (!delivery.phone.trim()) e.phone = 'Phone number is required.';
    return e;
  }

  function handleDeliveryNext(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateDelivery();
    if (Object.keys(errs).length) { setDeliveryErrors(errs); return; }
    setDeliveryErrors({});
    setStep('payment');
  }

  function handlePaymentNext() {
    if (paymentMethod === 'cod') {
      placeMutation.mutate();
    } else {
      setStep('proof');
    }
  }

  function handleProofSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!receiptFile) { setFileError('Please upload your payment receipt.'); return; }
    setFileError('');
    placeMutation.mutate();
  }

  function setField(field: keyof DeliveryForm, value: string) {
    setDelivery(d => ({ ...d, [field]: value }));
    setDeliveryErrors(e => ({ ...e, [field]: undefined }));
  }

  const STEP_LABELS: Record<CheckoutStep, string> = {
    cart: 'Review cart', delivery: 'Delivery', payment: 'Payment', proof: 'Upload receipt',
  };
  const STEP_ORDER: CheckoutStep[] = ['cart', 'delivery', 'payment', 'proof'];
  const currentIdx = STEP_ORDER.indexOf(step);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal shop-cart-modal" onClick={e => e.stopPropagation()}>
        <div className="shop-cart-head">
          <h3>{STEP_LABELS[step]}</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Step: cart */}
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
                  <button className="btn btn-primary" onClick={() => setStep('delivery')}>
                    Continue <ArrowRight size={15} />
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* Step: delivery */}
        {step === 'delivery' && (
          <form onSubmit={handleDeliveryNext} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(['name', 'address', 'phone'] as const).map(field => (
              <div key={field} className="auth-field">
                <label htmlFor={`del-${field}`} style={{ textTransform: 'capitalize' }}>{field === 'name' ? 'Full name' : field === 'address' ? 'Delivery address' : 'Phone number'}</label>
                <input id={`del-${field}`} type={field === 'phone' ? 'tel' : 'text'} value={delivery[field]} onChange={e => setField(field, e.target.value)} placeholder={field === 'name' ? 'Sarah Johnson' : field === 'address' ? '123 Main St, Sydney NSW 2000' : '04xx xxx xxx'} />
                {deliveryErrors[field] && <span className="auth-field-error">{deliveryErrors[field]}</span>}
              </div>
            ))}
            <div className="shop-cart-footer">
              <button type="button" className="auth-back-btn" onClick={() => setStep('cart')}>← Back</button>
              <button type="submit" className="btn btn-primary">Continue <ArrowRight size={15} /></button>
            </div>
          </form>
        )}

        {/* Step: payment */}
        {step === 'payment' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>How would you like to pay?</p>
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
              <button className="auth-back-btn" onClick={() => setStep('delivery')}>← Back</button>
              <button className="btn btn-primary" onClick={handlePaymentNext} disabled={placeMutation.isPending}>
                {placeMutation.isPending ? 'Placing order…' : paymentMethod === 'cod' ? 'Place order' : 'Continue'}
                {!placeMutation.isPending && <ArrowRight size={15} />}
              </button>
            </div>
            {placeMutation.isError && <p className="auth-error"><span>{(placeMutation.error as Error).message}</span></p>}
          </div>
        )}

        {/* Step: proof (advance only) */}
        {step === 'proof' && (
          <form onSubmit={handleProofSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ background: 'var(--surface)', padding: '14px 16px', fontSize: 14 }}>
              <strong>Bank transfer details</strong>
              <p style={{ margin: '6px 0 0', color: 'var(--muted)' }}>BSB: 000-000 · Account: 12345678 · Reference: {familyId.toUpperCase()}-SHOP</p>
            </div>
            <div className="auth-field">
              <label>Upload receipt <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(image or PDF)</span></label>
              <label className="upload-area" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', border: '2px dashed var(--line)', borderRadius: 10 }}>
                <Upload size={16} />
                <span>{receiptFile ? receiptFile.name : 'Click to upload'}</span>
                <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => { setReceiptFile(e.target.files?.[0] ?? null); setFileError(''); }} />
              </label>
              {fileError && <span className="auth-field-error">{fileError}</span>}
            </div>
            <div className="shop-cart-footer">
              <button type="button" className="auth-back-btn" onClick={() => setStep('payment')}>← Back</button>
              <button type="submit" className="btn btn-primary" disabled={placeMutation.isPending}>
                {placeMutation.isPending ? 'Placing order…' : 'Place order'} {!placeMutation.isPending && <ArrowRight size={15} />}
              </button>
            </div>
            {placeMutation.isError && <p className="auth-error"><span>{(placeMutation.error as Error).message}</span></p>}
          </form>
        )}

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 16 }}>
          {STEP_ORDER.filter(s => s !== 'proof' || paymentMethod === 'advance').map((s, i) => (
            <span key={s} style={{ width: 8, height: 8, borderRadius: '50%', background: i <= currentIdx ? 'var(--teal)' : 'var(--line)' }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function LearningShopPage() {
  const { familyId } = useAuth();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [cart, setCart] = useState<ShopCartItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<{ product: ShopProduct; index: number } | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [successToast, setSuccessToast] = useState(false);

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
    if (qty <= 0) { removeFromCart(productId); return; }
    setCart(c => c.map(i => i.product.id === productId ? { ...i, quantity: qty } : i));
  }

  function removeFromCart(productId: string) {
    setCart(c => c.filter(i => i.product.id !== productId));
  }

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  function handleOrderSuccess() {
    setCart([]);
    setCheckoutOpen(false);
    setSuccessToast(true);
    setTimeout(() => setSuccessToast(false), 5000);
  }

  return (
    <div className="page-stack">
      {/* Banner */}
      <div className="shop-banner">
        <div className="shop-banner-text">
          <h2>Learning Shop</h2>
          <p>Workbooks, flash cards and activity kits to support learning at home.</p>
        </div>
        <button className="shop-cart-btn" onClick={() => cartCount > 0 && setCheckoutOpen(true)}>
          <ShoppingBag size={18} />
          {cartCount > 0 && <span className="shop-cart-badge">{cartCount}</span>}
          Cart
        </button>
      </div>

      {/* Success toast */}
      {successToast && (
        <div className="shop-order-success">
          <Check size={16} /> Order placed! We'll be in touch soon.
        </div>
      )}

      {/* Toolbar */}
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

      {/* Grid */}
      {isLoading && <p style={{ color: 'var(--muted)', padding: '24px 0' }}>Loading products…</p>}
      {isError && <p className="auth-error"><span>Failed to load products. Please try again.</span></p>}
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

      {/* Product modal */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct.product}
          index={selectedProduct.index}
          cartQty={cart.find(c => c.product.id === selectedProduct.product.id)?.quantity ?? 0}
          onAdd={addToCart}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {/* Checkout modal */}
      {checkoutOpen && (
        <CheckoutModal
          cart={cart}
          familyId={familyId}
          onUpdateQty={updateQty}
          onRemove={removeFromCart}
          onSuccess={handleOrderSuccess}
          onClose={() => setCheckoutOpen(false)}
        />
      )}
    </div>
  );
}
