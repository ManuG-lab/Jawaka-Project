export type UserRole = 'student' | 'cashier' | 'kitchen' | 'admin';
export type StudentType = 'full_board' | 'half_board' | 'commuter';

export type MenuCategory =
  | 'Meals'
  | "Comrade's Corner"
  | 'Beverages'
  | 'Special Corner'
  | 'Snacks';

export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'needs_attention'
  | 'cancelled';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  studentType?: StudentType;
  studentNumber?: string;
  phone?: string;
  pinHash?: string;
  isGuest?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudentLookupRecord {
  uid: string;
  studentNumber: string;
  displayName: string;
  studentType: StudentType;
  pinHash: string;
  updatedAt?: unknown;
}

export interface MenuItem {
  id: string;
  name: string;
  category: MenuCategory;
  price: number;
  active: boolean;
  soldOut: boolean;
  soldOutBy?: string;
  soldOutAt?: unknown;
  sortOrder: number;
  updatedAt?: unknown;
}

export interface CafeteriaSettings {
  openTime: string;
  closeTime: string;
  cutoffMinutesBeforeClose: number;
  dailyAllowance: number;
  timezone: string;
  updatedAt?: unknown;
}

export interface MpesaSettings {
  env: 'mock' | 'sandbox' | 'production';
  tillNumber: string;
  shortcode: string;
  transactionType: 'CustomerBuyGoodsOnline' | 'CustomerPayBillOnline';
  mockOutcome: 'success' | 'fail' | 'timeout';
  updatedAt?: unknown;
}

export interface AllowanceUsage {
  uid: string;
  date: string;
  used: number;
  reserved: number;
  dailyLimit: number;
  updatedAt?: unknown;
}

export interface OrderItem {
  itemId: string;
  name: string;
  category: MenuCategory;
  price: number;
  quantity: number;
  removedSoldOut?: boolean;
  replacedFromItemId?: string;
}

export interface PaymentSplit {
  allowance: number;
  mpesa: number;
  cash: number;
}

export interface NeedsAttentionItem {
  itemId: string;
  itemName: string;
  originalPrice: number;
  quantity: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  orderSeq: number;
  dailyDate: string;
  entryPoint: 'student_app' | 'cashier';
  customerUid: string;
  customerName: string;
  studentNumber?: string;
  phone?: string;
  cashierUid?: string;
  items: OrderItem[];
  totalAmount: number;
  paymentSplit: PaymentSplit;
  mpesaReceiptNumber?: string;
  mpesaManual?: boolean;
  mpesaCheckoutRequestId?: string;
  cashBackDue?: number;
  cashBackPaid?: boolean;
  cashBackPaidAt?: unknown;
  cashBackPaidBy?: string;
  mpesaRefundFlag?: boolean;
  status: OrderStatus;
  needsAttentionItems?: NeedsAttentionItem[];
  needsAttentionAt?: unknown;
  escalatedToCashier?: boolean;
  paidAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PaymentDoc {
  checkoutRequestId: string;
  orderId: string;
  orderNumber: string;
  customerUid: string;
  amount: number;
  phone: string;
  env: 'mock' | 'sandbox' | 'production';
  status: 'pending' | 'completed' | 'failed' | 'timeout';
  mpesaReceiptNumber?: string;
  resultCode?: number;
  resultDesc?: string;
  manual?: boolean;
  expiresAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BoardOrder {
  orderId: string;
  orderNumber: string;
  dailyDate: string;
  status: Exclude<OrderStatus, 'pending_payment'>;
  paidAtMillis: number;
  updatedAt?: unknown;
}

export interface AuditLog {
  id?: string;
  action: string;
  actorUid: string;
  actorName: string;
  actorRole: UserRole;
  targetType: string;
  targetId: string;
  details: string;
  createdAt?: unknown;
}

export interface CartItem {
  item: MenuItem;
  quantity: number;
}
