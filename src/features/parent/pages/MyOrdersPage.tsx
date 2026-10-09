import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, X, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { dataClient } from '../../../lib/data/client';
import { useAuth } from '../../../app/providers';
import { qk } from '../../../lib/data/queryKeys';
import { formatMoney } from '../../../lib/utils/money';
import type { ShopOrder } from '../../../types/shop';

function OrderStatusBadge({ status }: { status: ShopOrder['status'] }) {
  const map: Record<ShopOrder['status'], string> = {
    Pending: 'table-status pending',
    Processing: 'table-status active',
    Shipped: 'table-status',
    Delivered: 'table-status paid',
    Cancelled: 'table-status cancelled',
  };
  return <span className={map[status] ?? 'table-status'}>{status}</span>;
}

function PayStatusBadge({ status }: { status: ShopOrder['payment_status'] }) {
  const map: Record<ShopOrder['payment_status'], string> = {
    unpaid: 'table-status pending',
    pending_verification: 'table-status',
    paid: 'table-status paid',
    refunded: 'table-status cancelled',
  };
  const labels: Record<ShopOrder['payment_status'], string> = {
    unpaid: 'Unpaid',
    pending_verification: 'Pending verification',
    paid: 'Paid',
    refunded: 'Refunded',
  };
  return <span className={map[status] ?? 'table-status'}>{labels[status]}</span>;
}

function OrderDetailModal({ order, onClose }: { order: ShopOrder; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <h3 style={{ marginBottom: 4 }}>Order {order.order_number}</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
          {new Date(order.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <OrderStatusBadge status={order.status} />
          <PayStatusBadge status={order.payment_status} />
        </div>
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginBottom: 12 }}>
          {order.items.map((item, i) => (
            <div key={item.product_id ?? i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
              <span>{item.title} × {item.quantity}</span>
              <span>{formatMoney(item.unit_price_cents * item.quantity)}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <span>Total</span><span>{formatMoney(order.total_cents)}</span>
        </div>
        <div style={{ marginTop: 14, fontSize: 13, color: 'var(--muted)' }}>
          <strong style={{ color: 'var(--text)' }}>Payment method:</strong> {order.payment_method === 'cod' ? 'Cash on delivery' : 'Bank transfer'}
          {order.receipt_filename && <><br /><strong style={{ color: 'var(--text)' }}>Receipt:</strong> {order.receipt_filename}</>}
        </div>
        {order.review_note && (
          <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--surface)', borderRadius: 8, fontSize: 13 }}>
            <strong>Note from admin:</strong> {order.review_note}
          </div>
        )}
      </div>
    </div>
  );
}

export function MyOrdersPage() {
  const { familyId } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<ShopOrder | null>(null);

  const { data: orders = [], isLoading, isError } = useQuery({
    queryKey: qk.shopOrders(familyId),
    queryFn: () => dataClient.getShopOrders!(familyId),
  });

  const sorted = [...orders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (isLoading) return <p style={{ color: 'var(--muted)', padding: '24px 0' }}>Loading orders…</p>;
  if (isError) return <p className="auth-error"><span>Failed to load orders. Please try again.</span></p>;

  if (sorted.length === 0) {
    return (
      <div className="page-stack">
        <div className="shop-empty">
          <Package size={36} />
          <p>You haven't placed any orders yet.</p>
          <button className="btn btn-primary" onClick={() => navigate('/parent/shop')}>
            <ShoppingBag size={15} /> Browse the shop
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="orders-list">
        {sorted.map(order => (
          <div key={order.id} className="order-card">
            <div className="order-card-icon"><Package size={20} /></div>
            <div className="order-card-info">
              <strong>{order.order_number}</strong>
              <span>{order.items.length} item{order.items.length !== 1 ? 's' : ''} · {formatMoney(order.total_cents)}</span>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <OrderStatusBadge status={order.status} />
                <PayStatusBadge status={order.payment_status} />
              </div>
            </div>
            <div className="order-card-right">
              <span className="order-card-date">
                {new Date(order.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              </span>
              <button className="shop-view-btn" onClick={() => setSelected(order)}>View details</button>
            </div>
          </div>
        ))}
      </div>

      {selected && <OrderDetailModal order={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
