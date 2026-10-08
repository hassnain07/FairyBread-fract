export type ShopProduct = {
  id: string;
  title: string;
  category: string;
  description: string;
  details: string;
  price: number;
  image_url: string;
  status: 'In Stock' | 'Low Stock' | 'Out of Stock';
};

export type ShopCartItem = {
  product: ShopProduct;
  quantity: number;
};

export type ShopOrderItem = {
  product_id: string;
  title: string;
  price: number;
  quantity: number;
};

export type ShopOrder = {
  id: string;
  family_id: string;
  family_name?: string;
  source: 'portal' | 'guest';
  items: ShopOrderItem[];
  total: number;
  status: 'Pending' | 'Processing' | 'Shipped' | 'Delivered';
  payment_method: 'cod' | 'advance';
  payment_status: 'unpaid' | 'pending_verification' | 'paid';
  receipt_filename?: string;
  delivery_name: string;
  delivery_address: string;
  delivery_phone: string;
  delivery_email: string;
  created_at: string;
};
