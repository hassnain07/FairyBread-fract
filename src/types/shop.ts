export type ShopProduct = {
  id: string;
  title: string;
  category: string;
  description: string;
  details: string;
  price_cents: number;
  image_url: string | null;
  status: 'In Stock' | 'Low Stock' | 'Out of Stock';
};

export type ShopCartItem = {
  product: ShopProduct;
  quantity: number;
};

export type ShopOrderItem = {
  product_id: string | null;
  title: string;
  unit_price_cents: number;
  quantity: number;
};

export type ShopOrder = {
  id: string;
  order_number: string;
  family_id: string | null;
  family_name?: string;
  source: 'portal' | 'guest';
  items: ShopOrderItem[];
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  status: 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';
  payment_method: 'cod' | 'advance';
  payment_status: 'unpaid' | 'pending_verification' | 'paid' | 'refunded';
  receipt_filename?: string;
  review_note?: string;
  delivery_name: string;
  delivery_address: string;
  delivery_phone: string;
  delivery_email?: string;
  created_at: string;
};

export type PlaceOrderInput = {
  orderId: string;
  source: 'portal' | 'guest';
  items: Array<{ productId: string; quantity: number }>;
  paymentMethod: 'cod' | 'advance';
  delivery: { name: string; address: string; phone: string; email: string };
  receipt?: File | null;
  captchaToken?: string;
};

export type PlacedOrder = {
  id: string;
  order_number: string;
  total_cents: number;
};

export type ShopStats = {
  total_orders: number;
  pending_verification: number;
  revenue_cents: number;
  low_stock_products: number;
};

export type AdminShopProduct = ShopProduct & {
  stock_quantity: number;
  low_stock_threshold: number;
  is_active: boolean;
  sort_order: number;
};

export type ShopProductInput = Partial<Omit<AdminShopProduct, 'status' | 'image_url'>> & {
  image_path?: string | null;
};
