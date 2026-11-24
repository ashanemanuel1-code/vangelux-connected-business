export type ProductStatus = 'draft' | 'published' | 'archived';
export type CollectionStatus = 'concept' | 'development' | 'sampling' | 'pre-launch' | 'available' | 'discontinued';
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
export type ImageKind = 'front' | 'back' | 'detail';

export interface Lookup { id: string; name: string; sort_order: number; is_active: boolean }
export interface SizeOption { id: string; size_group: 'adult' | 'kids' | 'other'; label: string; sort_order: number; is_active: boolean }
export interface Tag { id: string; name: string; color: string; is_public: boolean; sort_order: number }
export interface ExpenseCategory { id: string; name: string; is_operating: boolean; sort_order: number; is_active: boolean }

export interface Collection {
  id: string; volume_label: string | null; name: string; tagline: string | null; scripture: string | null;
  description: string | null; artwork_path: string | null; status: CollectionStatus; is_published: boolean; sort_order: number;
}

export interface ProductImage { id: string; product_id: string; storage_path: string; kind: ImageKind; is_main: boolean; sort_order: number }
export interface ProductCosts {
  product_id: string; manufacturing_cost: number; fabric_cost: number; printing_cost: number; packaging_cost: number;
  transport_cost: number; other_cost: number; total_unit_cost: number; wholesale_price: number; supplier: string | null; internal_notes: string | null;
}
export interface Product {
  id: string; name: string; sku: string; description: string | null; collection_id: string | null; category_id: string | null;
  target_customer_id: string | null; fit_type_id: string | null; sizes: string[]; colors: string[]; selling_price: number;
  discount_percent: number; is_concept: boolean; status: ProductStatus; low_stock_threshold: number; sort_order: number;
  published_at: string | null; created_at: string; updated_at: string; size_chart_id?: string | null;
  product_images?: ProductImage[]; product_tags?: { tag_id: string }[]; product_costs?: ProductCosts | null;
}

export interface Customer { id: string; name: string; phone: string | null; email: string | null; address: string | null; notes: string | null; created_at: string }

export interface QuotationItem {
  id?: string; quotation_id?: string; product_id: string | null; description: string; sku: string | null; size: string | null;
  color: string | null; quantity: number; unit_price: number; discount_amount: number; line_total?: number; sort_order: number;
}
export interface Quotation {
  id: string; quote_number: string; customer_id: string | null; customer_name: string; customer_phone: string | null;
  customer_email: string | null; customer_address: string | null; issue_date: string; validity_days: number;
  discount_amount: number; delivery_fee: number; terms: string | null; notes: string | null; status: QuoteStatus;
  converted_sale_id: string | null; created_at: string; quotation_items?: QuotationItem[];
}

export interface SaleItem {
  id?: string; sale_id?: string; product_id: string | null; description: string; size: string | null; color: string | null;
  quantity: number; unit_price: number; discount_amount: number; unit_cost?: number; line_total?: number;
  /** How many come from stock in hand (null = let the app decide). The rest is to order. */
  from_stock?: number | null;
  supply_status?: SupplyStatus;
}
export type SupplyStatus = 'none' | 'to_order' | 'ordered' | 'received';
/** Orders still being worked on (not yet handed over). */
export const OPEN_ORDER_STATUSES = ['pending', 'confirmed', 'processing'];
export interface Sale {
  id: string; invoice_number: string; sale_date: string; customer_id: string | null; customer_name: string | null;
  discount_amount: number; delivery_fee: number; amount_paid: number; payment_method: string; payment_status: string;
  order_status: string; quotation_id: string | null; notes: string | null; created_at: string; sale_items?: SaleItem[];
}

export interface Expense {
  id: string; expense_date: string; category_id: string | null; description: string; vendor: string | null; amount: number;
  payment_method: string | null; receipt_path: string | null; created_at: string;
}

export interface InventoryMovement {
  id: string; product_id: string; size: string; color: string; movement_type: string; quantity: number;
  sale_item_id: string | null; note: string | null; created_at: string;
}
export interface StockLevel { product_id: string; size: string; color: string; quantity: number }

export interface StaffMember { user_id: string; email: string; full_name: string | null; role: 'owner' | 'admin' | 'staff'; is_active: boolean; created_at: string }

// Public catalogue (from get_showroom_catalog RPC) — contains no private data
export interface PublicProduct {
  id: string; name: string; sku: string; description: string | null; collection_id: string | null; collection_name: string | null;
  category: string | null; fit_type: string | null; target_customer: string | null; sizes: string[]; colors: string[];
  selling_price: number; discount_percent: number; published_at: string | null; sort_order: number; size_chart_id?: string | null;
  images: { path: string; kind: ImageKind; is_main: boolean }[]; tags: { name: string; color: string }[];
}
export interface PublicCollection {
  id: string; volume_label: string | null; name: string; tagline: string | null; scripture: string | null;
  description: string | null; artwork_path: string | null; status: CollectionStatus; sort_order: number;
}
export interface PublicSizeChart { id: string; name: string; image_path: string; notes: string | null }
export interface PublicCatalog { version: number; collections: PublicCollection[]; products: PublicProduct[]; size_charts?: PublicSizeChart[]; site?: Record<string, string> }
export interface SizeChart { id: string; name: string; image_path: string | null; notes: string | null; is_published: boolean; sort_order: number; created_at: string }

export const PRODUCT_STATUSES: ProductStatus[] = ['draft', 'published', 'archived'];
export const COLLECTION_STATUSES: CollectionStatus[] = ['concept', 'development', 'sampling', 'pre-launch', 'available', 'discontinued'];
export const QUOTE_STATUSES: QuoteStatus[] = ['draft', 'sent', 'accepted', 'rejected', 'expired'];
export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'card', 'online', 'cod', 'other'];
export const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid', 'refunded'];
export const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'completed', 'cancelled', 'returned'];
export const MOVEMENT_TYPES = ['initial', 'addition', 'return', 'damaged', 'adjustment'] as const;
