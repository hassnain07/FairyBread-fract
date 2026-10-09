import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag, X, Printer, ExternalLink } from 'lucide-react';
import { dataClient } from '../../../lib/data/client';
import { qk } from '../../../lib/data/queryKeys';
import { toAppError } from '../../../lib/data/errors';
import { formatMoney } from '../../../lib/utils/money';
import type { ShopOrder } from '../../../types/shop';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function printReceipt(order: ShopOrder, contactEmail: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  (w as any).opener = null;
  const rows = order.items.map(i =>
    `<tr><td>${esc(i.title)}</td><td>${esc(i.quantity)}</td><td>${esc(formatMoney(i.unit_price_cents * i.quantity))}</td></tr>`
  ).join('');
  w.document.open();
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Receipt ${esc(order.order_number)}</title>
    <style>body{font-family:sans-serif;max-width:520px;margin:40px auto;color:#1a2e2b}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{padding:8px 4px;border-bottom:1px solid #e5e7eb;font-size:14px}th{text-align:left}</style>
    <h2>Receipt ${esc(order.order_number)}</h2>
    <p>${esc(new Date(order.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }))} · ${esc(order.payment_method === 'cod' ? 'Cash on delivery' : 'Bank transfer')} · ${esc(order.payment_status)}</p>
    <p><b>${esc(order.delivery_name)}</b><br>${esc(order.delivery_address)}<br>${esc(order.delivery_phone)}<br>${esc(order.delivery_email ?? '')}</p>
    <table><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <p><b>Total ${esc(formatMoney(order.total_cents))}</b></p>
    <p style="font-size:12px;color:#6b7280">${esc(contactEmail)}</p>`);
  w.document.close(); w.focus(); w.print();
}

function SourceBadge({ source }: { source: ShopOrder['source'] }) {
  return <span className={`table-status ${source === 'guest' ? 'pending' : 'paid'}`}>{source === 'guest' ? 'Guest' : 'Portal'}</span>;
}
function PayStatusBadge({ status }: { status: ShopOrder['payment_status'] }) {
  const cls = status === 'paid' ? 'paid' : status === 'pending_verification' ? '' : status === 'refunded' ? 'cancelled' : 'pending';
  const label = { paid: 'Paid', pending_verification: 'Pending verification', unpaid: 'Unpaid', refunded: 'Refunded' }[status] ?? status;
  return <span className={`table-status ${cls}`}>{label}</span>;
}
function OrderStatusBadge({ status }: { status: ShopOrder['status'] }) {
  const cls = status === 'Delivered' ? 'paid' : status === 'Processing' || status === 'Shipped' ? 'active' : status === 'Cancelled' ? 'cancelled' : 'pending';
  return <span className={`table-status ${cls}`}>{status}</span>;
}

const NEXT_STATES: Record<ShopOrder['status'], ShopOrder['status'][]> = {
  Pending: ['Processing', 'Cancelled'],
  Processing: ['Shipped', 'Cancelled'],
  Shipped: ['Delivered'],
  Delivered: [],
  Cancelled: [],
};

function ReviewModal({ order, contactEmail, onClose }: { order: ShopOrder; contactEmail: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rejectNote, setRejectNote] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null | 'loading'>('loading');
  const [statusNote, setStatusNote] = useState('');

  useEffect(() => {
    dataClient.getShopReceiptUrl!(order.id).then(url => setReceiptUrl(url)).catch(() => setReceiptUrl(null));
  }, [order.id]);

  const verifyMutation = useMutation({
    mutationFn: (action: 'approve' | 'reject') => dataClient.verifyShopOrder!(order.id, action, action === 'reject' ? rejectNote : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.allShopOrders() });
      queryClient.invalidateQueries({ queryKey: qk.shopStats });
      onClose();
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: ShopOrder['status']) => dataClient.updateShopOrderStatus!(order.id, status, statusNote || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.allShopOrders() });
      queryClient.invalidateQueries({ queryKey: qk.shopStats });
      onClose();
    },
  });

  const nextStates = NEXT_STATES[order.status] ?? [];
  const canVerify = order.payment_status === 'pending_verification';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <SourceBadge source={order.source} />
          <OrderStatusBadge status={order.status} />
          <PayStatusBadge status={order.payment_status} />
        </div>
        <h3 style={{ marginBottom: 4 }}>{order.delivery_name}</h3>
        {order.delivery_email && (
          order.source === 'guest'
            ? <p style={{ fontSize: 13, marginBottom: 4 }}><a href={`mailto:${order.delivery_email}`}>{order.delivery_email}</a></p>
            : <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 4 }}>{order.delivery_email}</p>
        )}
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>Order {order.order_number}</p>
        <p style={{ fontSize: 13, marginBottom: 12 }}>{order.delivery_address} · {order.delivery_phone}</p>

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginBottom: 12 }}>
          {order.items.map((item, i) => (
            <div key={item.product_id ?? i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 14 }}>
              <span>{item.title} × {item.quantity}</span>
              <span>{formatMoney(item.unit_price_cents * item.quantity)}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid var(--line)', paddingTop: 10, marginBottom: 16 }}>
          <span>Total</span><span>{formatMoney(order.total_cents)}</span>
        </div>

        {/* Receipt preview */}
        {receiptUrl === 'loading' && <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>Loading receipt…</p>}
        {receiptUrl && receiptUrl !== 'loading' && (
          <div style={{ marginBottom: 16 }}>
            {/\.(jpg|jpeg|png|webp|heic)$/i.test(order.receipt_filename ?? '') ? (
              <img src={receiptUrl} alt="Receipt" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--line)' }} />
            ) : (
              <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm" style={{ display: 'inline-flex', gap: 6 }}>
                <ExternalLink size={13} /> View receipt
              </a>
            )}
          </div>
        )}
        {receiptUrl === null && order.receipt_filename && (
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>Receipt: {order.receipt_filename}</p>
        )}

        {/* Verify payment */}
        {canVerify && !showReject && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className="btn" onClick={() => setShowReject(true)}>Reject</button>
            <button className="btn btn-primary" disabled={verifyMutation.isPending} onClick={() => verifyMutation.mutate('approve')}>
              {verifyMutation.isPending ? 'Approving…' : 'Approve payment'}
            </button>
          </div>
        )}
        {canVerify && showReject && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            <textarea placeholder="Reason for rejection (required)" value={rejectNote} onChange={e => setRejectNote(e.target.value)}
              style={{ width: '100%', minHeight: 80, padding: 10, borderRadius: 8, border: '1px solid var(--line)', fontSize: 14, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => setShowReject(false)}>Cancel</button>
              <button className="btn btn-danger" disabled={!rejectNote.trim() || verifyMutation.isPending} onClick={() => verifyMutation.mutate('reject')}>Confirm reject</button>
            </div>
          </div>
        )}
        {verifyMutation.isError && <p className="auth-error" style={{ marginBottom: 8 }}><span>{toAppError(verifyMutation.error).message}</span></p>}

        {/* Status control */}
        {nextStates.length > 0 && (
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 4 }}>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Update order status</p>
            <input placeholder="Optional note" value={statusNote} onChange={e => setStatusNote(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 13, marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {nextStates.map(s => (
                <button key={s} className={`btn btn-sm${s === 'Cancelled' ? ' btn-danger' : ''}`}
                  disabled={statusMutation.isPending}
                  onClick={() => {
                    if (s === 'Cancelled' && !confirm('Stock will be returned. If this order was paid, you must refund the customer manually.')) return;
                    statusMutation.mutate(s);
                  }}>
                  → {s}
                </button>
              ))}
            </div>
            {statusMutation.isError && <p className="auth-error" style={{ marginTop: 8 }}><span>{toAppError(statusMutation.error).message}</span></p>}
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminOrdersPage() {
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [reviewing, setReviewing] = useState<ShopOrder | null>(null);

  const { data: stats } = useQuery({
    queryKey: qk.shopStats,
    queryFn: () => dataClient.getShopStats!(),
  });

  const { data: settings = {} } = useQuery({
    queryKey: qk.settings,
    queryFn: () => dataClient.getSettings!(),
  });

  const { data: orders = [], isLoading, isError } = useQuery({
    queryKey: qk.allShopOrders(),
    queryFn: () => dataClient.getAllShopOrders!(),
  });

  const contactEmail = (settings as any)?.public_info?.contact_email ?? 'admin@fairybread.au';
  const pending = orders.filter(o => o.payment_status === 'pending_verification');
  const displayed = tab === 'pending' ? pending : orders;

  if (isLoading) return <p style={{ color: 'var(--muted)', padding: '24px 0' }}>Loading orders…</p>;
  if (isError) return <p className="auth-error"><span>Failed to load orders.</span></p>;

  return (
    <div className="page-stack">
      <div className="stats-row">
        {[
          { label: 'Total orders', value: stats?.total_orders ?? orders.length, accent: 'pink' },
          { label: 'Pending verification', value: stats?.pending_verification ?? pending.length, accent: 'yellow' },
          { label: 'Revenue received', value: formatMoney(stats?.revenue_cents ?? 0), accent: 'teal' },
          { label: 'Low stock products', value: stats?.low_stock_products ?? 0, accent: 'orange' },
        ].map(s => (
          <div key={s.label} className={`stat-card accent-${s.accent}`}>
            <ShoppingBag size={18} />
            <div><strong>{s.value}</strong><span>{s.label}</span></div>
          </div>
        ))}
      </div>

      <div className="page-toolbar">
        {(['pending', 'all'] as const).map(t => (
          <button key={t} className={`filter-btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t === 'pending' ? `Pending verification (${pending.length})` : `All orders (${orders.length})`}
          </button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <div style={{ color: 'var(--muted)', padding: '32px 0', textAlign: 'center' }}>
          {tab === 'pending' ? 'No orders pending verification.' : 'No orders yet.'}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th><th>Source</th><th>Customer</th><th>Items</th>
                <th>Total</th><th>Pay status</th><th>Order status</th><th>Date</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(order => (
                <tr key={order.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{order.order_number}</td>
                  <td><SourceBadge source={order.source} /></td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{order.delivery_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{order.delivery_email}</div>
                  </td>
                  <td>{order.items.length}</td>
                  <td>{formatMoney(order.total_cents)}</td>
                  <td><PayStatusBadge status={order.payment_status} /></td>
                  <td><OrderStatusBadge status={order.status} /></td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {new Date(order.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-primary" onClick={() => setReviewing(order)}>Review</button>
                      <button className="btn btn-sm" onClick={() => printReceipt(order, contactEmail)} title="Print receipt">
                        <Printer size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reviewing && <ReviewModal order={reviewing} contactEmail={contactEmail} onClose={() => setReviewing(null)} />}
    </div>
  );
}
