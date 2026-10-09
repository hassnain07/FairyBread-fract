import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Plus, X, Upload } from 'lucide-react';
import { dataClient } from '../../../lib/data/client';
import { qk } from '../../../lib/data/queryKeys';
import { toAppError } from '../../../lib/data/errors';
import { formatMoney } from '../../../lib/utils/money';
import { Toggle } from '../../../components/ui/Toggle';
import type { AdminShopProduct, ShopProductInput } from '../../../types/shop';

const CATEGORIES = ['Workbooks', 'Flash Cards', 'Activity Kits'];
const IMG_MIME = ['image/jpeg', 'image/png', 'image/webp'];

interface ProductFormState {
  title: string; category: string; description: string; details: string;
  price_cents: string; stock_quantity: string; low_stock_threshold: string;
  is_active: boolean;
}
const EMPTY_FORM: ProductFormState = {
  title: '', category: CATEGORIES[0], description: '', details: '',
  price_cents: '', stock_quantity: '0', low_stock_threshold: '3', is_active: true,
};

function validate(f: ProductFormState): Partial<Record<keyof ProductFormState, string>> {
  const e: Partial<Record<keyof ProductFormState, string>> = {};
  if (!f.title.trim() || f.title.length > 200) e.title = 'Title is required (max 200 chars).';
  const price = Number(f.price_cents);
  if (isNaN(price) || price < 0) e.price_cents = 'Enter a valid price in cents (e.g. 1800 for $18.00).';
  const stock = Number(f.stock_quantity);
  if (isNaN(stock) || stock < 0) e.stock_quantity = 'Stock must be 0 or more.';
  const threshold = Number(f.low_stock_threshold);
  if (isNaN(threshold) || threshold < 0) e.low_stock_threshold = 'Threshold must be 0 or more.';
  return e;
}

function ProductModal({ product, onClose }: { product?: AdminShopProduct; onClose: () => void }) {
  const qc = useQueryClient();
  const imgRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<ProductFormState>(product ? {
    title: product.title, category: product.category,
    description: product.description, details: product.details,
    price_cents: String(product.price_cents), stock_quantity: String(product.stock_quantity),
    low_stock_threshold: String(product.low_stock_threshold), is_active: product.is_active,
  } : EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof ProductFormState, string>>>({});
  const [imgError, setImgError] = useState('');
  const [savedId, setSavedId] = useState(product?.id);

  const upsertMutation = useMutation({
    mutationFn: (input: ShopProductInput) => dataClient.upsertShopProduct!(input),
    onSuccess: (p) => {
      setSavedId(p.id);
      qc.invalidateQueries({ queryKey: qk.adminShopProducts });
      qc.invalidateQueries({ queryKey: qk.shopProducts });
    },
  });

  const imgMutation = useMutation({
    mutationFn: async (file: File) => {
      const id = savedId;
      if (!id) throw new Error('Save the product first.');
      const path = await dataClient.uploadShopProductImage!(id, file);
      await dataClient.upsertShopProduct!({ id, image_path: path });
      return path;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.adminShopProducts });
      qc.invalidateQueries({ queryKey: qk.shopProducts });
      setImgError('');
    },
    onError: (e) => setImgError(toAppError(e).message),
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    upsertMutation.mutate({
      id: savedId,
      title: form.title.trim(), category: form.category,
      description: form.description.trim(), details: form.details.trim(),
      price_cents: Number(form.price_cents),
      stock_quantity: Number(form.stock_quantity),
      low_stock_threshold: Number(form.low_stock_threshold),
      is_active: form.is_active,
    });
  }

  function handleImg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!IMG_MIME.includes(file.type)) { setImgError('Please upload a JPG, PNG or WebP image.'); return; }
    if (file.size > 5 * 1024 * 1024) { setImgError('Image must be under 5 MB.'); return; }
    setImgError('');
    imgMutation.mutate(file);
    e.target.value = '';
  }

  function setField<K extends keyof ProductFormState>(k: K, v: ProductFormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(er => ({ ...er, [k]: undefined }));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <h3 style={{ marginBottom: 16 }}>{product ? 'Edit product' : 'New product'}</h3>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="auth-field">
            <label>Title</label>
            <input value={form.title} onChange={e => setField('title', e.target.value)} maxLength={200} />
            {errors.title && <span className="auth-field-error">{errors.title}</span>}
          </div>
          <div className="auth-field">
            <label>Category</label>
            <select value={form.category} onChange={e => setField('category', e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 14 }}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="auth-field">
            <label>Description (short)</label>
            <input value={form.description} onChange={e => setField('description', e.target.value)} />
          </div>
          <div className="auth-field">
            <label>Details (long)</label>
            <textarea value={form.details} onChange={e => setField('details', e.target.value)}
              style={{ width: '100%', minHeight: 72, padding: 10, borderRadius: 8, border: '1px solid var(--line)', fontSize: 14, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div className="auth-field">
              <label>Price (cents)</label>
              <input type="number" min={0} value={form.price_cents} onChange={e => setField('price_cents', e.target.value)} />
              {errors.price_cents && <span className="auth-field-error">{errors.price_cents}</span>}
            </div>
            <div className="auth-field">
              <label>Stock qty</label>
              <input type="number" min={0} value={form.stock_quantity} onChange={e => setField('stock_quantity', e.target.value)} />
              {errors.stock_quantity && <span className="auth-field-error">{errors.stock_quantity}</span>}
            </div>
            <div className="auth-field">
              <label>Low stock at</label>
              <input type="number" min={0} value={form.low_stock_threshold} onChange={e => setField('low_stock_threshold', e.target.value)} />
              {errors.low_stock_threshold && <span className="auth-field-error">{errors.low_stock_threshold}</span>}
            </div>
          </div>
          <Toggle on={form.is_active} onToggle={() => setField('is_active', !form.is_active)} label="Active (visible in shop)" sublabel={form.is_active ? 'Visible' : 'Hidden'} />
          {upsertMutation.isError && <p className="auth-error"><span>{toAppError(upsertMutation.error).message}</span></p>}
          {upsertMutation.isSuccess && <p style={{ fontSize: 13, color: 'var(--green)' }}>✓ Saved</p>}
          <button type="submit" className="btn btn-primary" disabled={upsertMutation.isPending}>
            {upsertMutation.isPending ? 'Saving…' : 'Save product'}
          </button>
        </form>

        {/* Image upload — only after product is saved */}
        {savedId && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Product image (JPG/PNG/WebP, max 5 MB)</p>
            <input ref={imgRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleImg} />
            <button className="btn btn-sm" onClick={() => imgRef.current?.click()} disabled={imgMutation.isPending}>
              <Upload size={13} /> {imgMutation.isPending ? 'Uploading…' : 'Upload image'}
            </button>
            {imgError && <p className="auth-error" style={{ marginTop: 6 }}><span>{imgError}</span></p>}
            {imgMutation.isSuccess && <p style={{ fontSize: 13, color: 'var(--green)', marginTop: 6 }}>✓ Image updated</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminShopProductsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AdminShopProduct | undefined>();
  const [creating, setCreating] = useState(false);

  const { data: products = [], isLoading, isError } = useQuery({
    queryKey: qk.adminShopProducts,
    queryFn: () => dataClient.getAdminShopProducts!(),
  });

  const toggleMutation = useMutation({
    mutationFn: (p: AdminShopProduct) => dataClient.upsertShopProduct!({ id: p.id, is_active: !p.is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.adminShopProducts });
      qc.invalidateQueries({ queryKey: qk.shopProducts });
    },
  });

  if (isLoading) return <p style={{ color: 'var(--muted)', padding: '24px 0' }}>Loading products…</p>;
  if (isError) return <p className="auth-error"><span>Failed to load products.</span></p>;

  return (
    <div className="page-stack">
      <div className="page-toolbar" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={15} /> New product
        </button>
      </div>

      {products.length === 0 ? (
        <div style={{ color: 'var(--muted)', padding: '32px 0', textAlign: 'center' }}>
          <Package size={32} style={{ marginBottom: 8 }} />
          <p>No products yet. Add your first product above.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Title</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Active</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.title}</td>
                  <td><span className="shop-category-pill">{p.category}</span></td>
                  <td>{formatMoney(p.price_cents)}</td>
                  <td>{p.stock_quantity}</td>
                  <td>
                    <span className={`shop-status-badge shop-status-${p.status === 'In Stock' ? 'instock' : p.status === 'Low Stock' ? 'low' : 'out'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td>
                    <Toggle on={p.is_active} onToggle={() => toggleMutation.mutate(p)} label="" sublabel="" />
                  </td>
                  <td>
                    <button className="btn btn-sm" onClick={() => setEditing(p)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <ProductModal
          product={editing}
          onClose={() => { setCreating(false); setEditing(undefined); }}
        />
      )}
    </div>
  );
}
