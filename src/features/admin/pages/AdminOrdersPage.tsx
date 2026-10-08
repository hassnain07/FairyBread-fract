import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag, X, Printer } from 'lucide-react';
import { dataClient } from '../../../lib/data/client';
import type { ShopOrder } from '../../../types/shop';

function SourceBadge({ source }: { source: ShopOrder['source'] }) {
  return <span className={`table-status ${source === 'guest' ? 'pending' : 'paid'}`}>{source === 'guest' ? 'Guest' : 'Portal'}</span>;
}

function PayStatusBadge({ status }: { status: ShopOrder['payment_status'] }) {
  const cls = status === 'paid' ? 'paid' : status === 'pending_verification' ? '' : 'pending';
  const label = status === 'paid' ? 'Paid' : status === 'pending_verification' ? 'Pending verification' : 'Unpaid';
  return <span className={`table-status ${cls}`}>{label}</span>;
}

function OrderStatusBadge({ status }: { status: ShopOrder['status'] }) {
  const cls = status === 'Delivered' ? 'paid' : status === 'Processing' || status === 'Shipped' ? 'active' : 'pending';
  return <span className={`table-status ${cls}`}>{status}</span>;
}

function printReceipt(order: ShopOrder) {
  const rows = order.items.map(i =>
    `<tr><td>${i.title.replace(/</g, '&lt;')}</td><td style="text-align:center">${i.quantity}</td><td style="text-align:right">$${(i.price * i.quantity).toFixed(2)}</td></tr>`
  ).join('');
  const html = `<!DOCTYPE html><html><head><title>Receipt ${order.id}</title>
  <style>body{font-family:sans-serif;max-width:520px;margin:40px auto;color:#1a2e2b}h2{margin-bottom:4px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{padding:8px 4px;border-bottom:1px solid #e5e7eb;font-size:14px}th{text-align:left;font-weight:600}.total{font-weight:700;font-size:16px}.footer{margin-top:24px;font-size:12px;color:#6b7280}</style>
  </head><body>
  <h2>Order Receipt</h2>
  <p style="color:#6b7280;font-size:13px">Order ID: ${order.id} &nbsp;·&nbsp; ${new Date(order.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
  <p><strong>Payment:</strong> ${order.payment_method === 'cod' ? 'Cash on delivery' : 'Bank transfer'} &nbsp; <strong>Status:</strong> ${order.payment_status}</p>
  <p><strong>Deliver to:</strong> ${order.delivery_name.replace(/</g, '&lt;')}<br>${order.delivery_address.replace(/</g, '&lt;')}<br>${order.delivery_phone.replace(/</g, '&lt;')}<br>${order.delivery_email.replace(/</g, '&lt;')}</p>
  <table><thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Amount</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <p class="total">Total: $${order.total.toFixed(2)}</p>
  <p class="footer">Fairybread &amp; Fractions &nbsp;·&nbsp; admin@fairybread.au</p>
  </body></html>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.print();
}

function ReviewModal({ order, onClose }: { order: ShopOrder; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rejectNote, setRejectNote] = useState('');
  const [showReject, setShowReject] = useState(false);

  const mutation = useMutation({
    mutationFn: (action: 'approve' | 'reject') => dataClient.verifyShopOrder(order.id, action),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['allShopOrders'] }); onClose(); },
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <SourceBadge source={order.source} />
          <OrderStatusBadge status={order.status} />
        </div>
        <h3 style={{ marginBottom: 4 }}>{order.delivery_name}</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 4 }}>{order.delivery_email}</p>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>Order {order.id}</p>
        <p style={{ fontSize: 13, marginBottom: 12 }}>{order.delivery_address} · {order.delivery_phone}</p>
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginBottom: 12 }}>
          {order.items.map(item => (
            <div key={item.product_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 14 }}>
              <span>{item.title} × {item.quantity}</span>
              <span>${(item.price * item.quantity).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid var(--line)', paddingTop: 10, marginBottom: 16 }}>
          <span>Total</span><span>${order.total.toFixed(2)}</span>
        </div>
        {order.receipt_filename && (
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>Receipt: {order.receipt_filename}</p>
        )}
        {showReject ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea placeholder="Reason for rejection (required)" value={rejectNote} onChange={e => setRejectNote(e.target.value)} style={{ width: '100%', minHeight: 80, padding: 10, borderRadius: 8, border: '1px solid var(--line)', fontSize: 14, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => setShowReject(false)}>Cancel</button>
              <button className="btn btn-danger" disabled={!rejectNote.trim() || mutation.isPending} onClick={() => mutation.mutate('reject')}>Confirm reject</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => setShowReject(true)}>Reject</button>
            <button className="btn btn-primary" disabled={mutation.isPending} onClick={() => mutation.mutate('approve')}>
              {mutation.isPending ? 'Approving…' : 'Approve payment'}
            </button>
          </div>
        )}
        {mutation.isError && <p className="auth-error" style={{ marginTop: 8 }}><span>{(mutation.error as Error).message}</span></p>}
      </div>
    </div>
  );
}

export function AdminOrdersPage() {
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [reviewing, setReviewing] = useState<ShopOrder | null>(null);

  const { data: orders = [], isLoading, isError } = useQuery({
    queryKey: ['allShopOrders'],
    queryFn: () => dataClient.getAllShopOrders(),
  });

  const pending = orders.filter(o => o.payment_status === 'pending_verification');
  const revenue = orders.filter(o => o.payment_status === 'paid').reduce((s, o) => s + o.total, 0);
  const displayed = tab === 'pending' ? pending : orders;

  if (isLoading) return <p style={{ color: 'var(--muted)', padding: '24px 0' }}>Loading orders…</p>;
  if (isError) return <p className="auth-error"><span>Failed to load orders.</span></p>;

  return (
    <div className="page-stack">
      {/* Stat cards */}
      <div className="stats-row">
        {[
          { label: 'Total orders', value: orders.length, accent: 'pink' },
          { label: 'Pending verification', value: pending.length, accent: 'yellow' },
          { label: 'Revenue received', value: `$${revenue.toFixed(2)}`, accent: 'teal' },
        ].map(s => (
          <div key={s.label} className={`stat-card accent-${s.accent}`}>
            <ShoppingBag size={18} />
            <div><strong>{s.value}</strong><span>{s.label}</span></div>
          </div>
        ))}
      </div>

      {/* Tabs */}
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
                <th>Order ID</th><th>Source</th><th>Customer</th><th>Deliver to</th>
                <th>Items</th><th>Total</th><th>Pay status</th><th>Order status</th><th>Date</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(order => (
                <tr key={order.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{order.id}</td>
                  <td><SourceBadge source={order.source} /></td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{order.delivery_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{order.delivery_email}</div>
                  </td>
                  <td style={{ fontSize: 13 }}>
                    <div style={{ fontWeight: 600 }}>{order.delivery_name}</div>
                    <div style={{ color: 'var(--muted)' }}>{order.delivery_address}</div>
                    <div style={{ color: 'var(--muted)' }}>{order.delivery_phone}</div>
                  </td>
                  <td>{order.items.length}</td>
                  <td>${order.total.toFixed(2)}</td>
                  <td><PayStatusBadge status={order.payment_status} /></td>
                  <td><OrderStatusBadge status={order.status} /></td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {new Date(order.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {order.payment_status === 'pending_verification' && (
                        <button className="btn btn-sm btn-primary" onClick={() => setReviewing(order)}>Review</button>
                      )}
                      <button className="btn btn-sm" onClick={() => printReceipt(order)} title="Print receipt">
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

      {reviewing && <ReviewModal order={reviewing} onClose={() => setReviewing(null)} />}
    </div>
  );
}
