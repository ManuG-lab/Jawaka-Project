import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Check,
  CheckCircle2,
  ExternalLink,
  Minus,
  Plus,
  Receipt,
  Search,
  ShoppingBag,
  Smartphone,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { MENU_CATEGORIES } from '../data/seedMenu';
import { formatKSh, formatNairobiTime, isCafeteriaOpenForOrders } from '../lib/nairobiTime';
import {
  advanceOrderStatus,
  cancelOrderBeforePreparing,
  createCashierOrder,
  lookupStudentByNumber,
  markCashBackPaid,
  resolveReplacement,
  retryFailedOrderPayment,
} from '../services/jawakaService';
import {
  AllowanceUsage,
  CafeteriaSettings,
  CartItem,
  MenuCategory,
  MenuItem,
  MpesaSettings,
  Order,
  StudentLookupRecord,
  UserProfile,
} from '../types';
import { MenuFoodImage } from './MenuFoodImage';
import { StkPushModal } from './StkPushModal';
import { TicketReceipt } from './TicketReceipt';

interface CashierViewProps {
  cashier: UserProfile;
  menuItems: MenuItem[];
  orders: Order[];
  cafeteriaSettings: CafeteriaSettings;
  mpesaSettings: MpesaSettings;
  standaloneMode?: boolean;
  onOpenStandalone?: () => void;
}

export function CashierView({
  cashier,
  menuItems,
  orders,
  cafeteriaSettings,
  mpesaSettings,
  standaloneMode = false,
  onOpenStandalone,
}: CashierViewProps) {
  // Responsive tab controls: mobile 3-pane switcher + desktop 2-pane right switcher
  const [mobilePane, setMobilePane] = useState<'menu' | 'ticket' | 'queue'>('menu');
  const [rightTab, setRightTab] = useState<'pos' | 'queue'>('pos');
  const [selectedCategory, setSelectedCategory] = useState<'All' | MenuCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);

  // Customer lookup state
  const [customerMode, setCustomerMode] = useState<'walk_in' | 'student'>('walk_in');
  const [walkInName, setWalkInName] = useState('Walk-in Guest');
  const [studentNoInput, setStudentNoInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [verifiedStudent, setVerifiedStudent] = useState<{
    lookup: StudentLookupRecord;
    usage: AllowanceUsage | null;
  } | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Payment method + cash tendered calculator
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mpesa_stk' | 'mpesa_manual'>('cash');
  const [cashTenderedInput, setCashTenderedInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [manualReceiptCode, setManualReceiptCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  // Modals
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [pendingReceiptOrderId, setPendingReceiptOrderId] = useState<string | null>(null);
  const [stkSession, setStkSession] = useState<{
    checkoutRequestId: string;
    orderId: string;
  } | null>(null);
  const [escalatedReplaceOrder, setEscalatedReplaceOrder] = useState<Order | null>(null);
  const [replaceExtraChannel, setReplaceExtraChannel] = useState<'cash' | 'mpesa_stk'>('cash');

  const hoursCheck = isCafeteriaOpenForOrders(cafeteriaSettings);

  useEffect(() => {
    if (pendingReceiptOrderId) {
      const found = orders.find((o) => o.id === pendingReceiptOrderId && o.status === 'paid');
      if (found) {
        setReceiptOrder(found);
        setPendingReceiptOrderId(null);
      }
    }
  }, [orders, pendingReceiptOrderId]);

  const filteredMenu = useMemo(() => {
    return menuItems
      .filter((m) => m.active)
      .filter((m) => selectedCategory === 'All' || m.category === selectedCategory)
      .filter((m) =>
        searchQuery.trim()
          ? m.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
          : true
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [menuItems, selectedCategory, searchQuery]);

  const dailyLimit = Number(cafeteriaSettings.dailyAllowance ?? 350);
  const studentAllowanceRemaining = useMemo(() => {
    if (!verifiedStudent || verifiedStudent.lookup.studentType !== 'full_board') return 0;
    const used = verifiedStudent.usage?.used || 0;
    const reserved = verifiedStudent.usage?.reserved || 0;
    return Math.max(0, dailyLimit - used - reserved);
  }, [verifiedStudent, dailyLimit]);

  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);
  const cartTotal = cart.reduce((sum, c) => sum + c.item.price * c.quantity, 0);
  const allowanceApplied =
    customerMode === 'student' && verifiedStudent?.lookup.studentType === 'full_board'
      ? Math.min(studentAllowanceRemaining, cartTotal)
      : 0;
  const balanceDue = Math.max(0, cartTotal - allowanceApplied);

  const cashTenderedVal = Number(cashTenderedInput) || 0;
  const cashChangeDue = cashTenderedVal > 0 ? cashTenderedVal - balanceDue : 0;

  const readyOrders = useMemo(() => orders.filter((o) => o.status === 'ready'), [orders]);
  const activePrePrepOrders = useMemo(
    () => orders.filter((o) => ['paid', 'preparing'].includes(o.status)),
    [orders]
  );
  const cashBackOrders = useMemo(
    () => orders.filter((o) => (o.cashBackDue ?? 0) > 0 && !o.cashBackPaid),
    [orders]
  );
  const attentionOrders = useMemo(
    () => orders.filter((o) => o.status === 'needs_attention'),
    [orders]
  );

  const alertCount = cashBackOrders.length + attentionOrders.length + readyOrders.length;
  const recentCounterOrders = orders.filter((o) => o.entryPoint === 'cashier').slice(0, 6);

  const updateCart = (item: MenuItem, delta: number) => {
    setCart((prev) => {
      const ex = prev.find((c) => c.item.id === item.id);
      if (!ex && delta > 0) return [...prev, { item, quantity: delta }];
      if (!ex) return prev;
      const next = ex.quantity + delta;
      if (next <= 0) return prev.filter((c) => c.item.id !== item.id);
      return prev.map((c) => (c.item.id === item.id ? { ...c, quantity: next } : c));
    });
  };

  const handleVerifyStudent = async () => {
    setLookupError('');
    setVerifying(true);
    try {
      const res = await lookupStudentByNumber(studentNoInput, pinInput);
      setVerifiedStudent(res);
      setPinInput('');
    } catch (err) {
      setVerifiedStudent(null);
      setLookupError(err instanceof Error ? err.message : 'Student verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmitOrder = async () => {
    setSubmitError('');
    if (customerMode === 'student' && !verifiedStudent) {
      setSubmitError('Verify student number and 4-digit PIN first.');
      return;
    }
    if (
      balanceDue > 0 &&
      paymentMethod === 'cash' &&
      cashTenderedInput.trim() !== '' &&
      cashTenderedVal < balanceDue
    ) {
      setSubmitError(`Cash tendered (${formatKSh(cashTenderedVal)}) is less than balance due.`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await createCashierOrder({
        cashier,
        cart,
        cafeteriaSettings,
        mpesaSettings,
        customer:
          customerMode === 'student' && verifiedStudent
            ? {
                type: 'student',
                uid: verifiedStudent.lookup.uid,
                name: verifiedStudent.lookup.displayName,
                studentNumber: verifiedStudent.lookup.studentNumber,
                studentType: verifiedStudent.lookup.studentType,
              }
            : {
                type: 'walk_in',
                uid: 'walk_in',
                name: walkInName.trim() || 'Walk-in Guest',
              },
        paymentMethod,
        phoneInput,
        manualReceiptCode,
      });

      setCart([]);
      setManualReceiptCode('');
      setCashTenderedInput('');
      setVerifiedStudent(null);
      setStudentNoInput('');

      if (res.mpesaDue > 0 && res.checkoutRequestId) {
        setStkSession({ checkoutRequestId: res.checkoutRequestId, orderId: res.orderId });
      } else {
        setPendingReceiptOrderId(res.orderId);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not complete order.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderTicketForm = () => (
    <div className="p-4 sm:p-5 space-y-4">
      {!hoursCheck.open && (
        <div className="bg-[#FCECE9] border border-[#B93829] px-3 py-2 text-xs text-[#B93829] font-medium">
          {hoursCheck.reason}
        </div>
      )}

      {/* Customer Mode Toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            setCustomerMode('walk_in');
            setVerifiedStudent(null);
          }}
          className={`min-h-[44px] px-2.5 text-xs font-semibold border ${
            customerMode === 'walk_in'
              ? 'bg-[#D49B27] border-[#1C1714] text-[#1C1714]'
              : 'border-[#D9CEBC] text-[#61554C]'
          }`}
        >
          Walk-in Customer
        </button>
        <button
          onClick={() => setCustomerMode('student')}
          className={`min-h-[44px] px-2.5 text-xs font-semibold border ${
            customerMode === 'student'
              ? 'bg-[#D49B27] border-[#1C1714] text-[#1C1714]'
              : 'border-[#D9CEBC] text-[#61554C]'
          }`}
        >
          Student Allowance (PIN)
        </button>
      </div>

      {customerMode === 'walk_in' ? (
        <input
          type="text"
          value={walkInName}
          onChange={(e) => setWalkInName(e.target.value)}
          placeholder="Guest label (optional)"
          className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm"
        />
      ) : (
        <div className="bg-[#FAF6EE] border border-[#D9CEBC] p-3.5 space-y-2.5">
          {verifiedStudent ? (
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <UserCheck className="w-5 h-5 text-[#2E6F40] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{verifiedStudent.lookup.displayName}</p>
                  <p className="text-xs text-[#61554C]">
                    <span className="font-ticket">{verifiedStudent.lookup.studentNumber}</span> ·{' '}
                    <span className="capitalize">
                      {verifiedStudent.lookup.studentType.replace('_', '-')}
                    </span>
                  </p>
                  <p className="text-xs text-[#1C1714] mt-0.5">
                    Allowance left:{' '}
                    <strong className="font-ticket">
                      {formatKSh(studentAllowanceRemaining)}
                    </strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setVerifiedStudent(null)}
                className="text-xs underline text-[#B93829] shrink-0"
              >
                Clear
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={studentNoInput}
                  onChange={(e) => setStudentNoInput(e.target.value)}
                  placeholder="Student No."
                  className="min-h-[44px] px-3 border border-[#D9CEBC] bg-white text-sm font-ticket uppercase w-full"
                />
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="4-digit PIN"
                  className="min-h-[44px] px-3 border border-[#D9CEBC] bg-white text-sm font-ticket w-full"
                />
              </div>
              {lookupError && <p className="text-xs text-[#B93829]">{lookupError}</p>}
              <button
                onClick={() => void handleVerifyStudent()}
                disabled={verifying}
                className="w-full min-h-[44px] bg-[#1C1714] text-[#FAF6EE] text-xs font-semibold"
              >
                {verifying ? 'Verifying PIN...' : 'Verify Student & Load Allowance'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Cart Items */}
      <div className="border-y border-dashed border-[#D9CEBC] py-3 space-y-2.5 max-h-56 overflow-y-auto">
        {cart.length === 0 ? (
          <p className="text-sm text-[#61554C] text-center py-4">
            Select dishes from the menu to build ticket.
          </p>
        ) : (
          cart.map((c) => (
            <div key={c.item.id} className="flex items-center justify-between gap-2 text-sm min-w-0">
              <span className="truncate flex-1 min-w-0 font-medium">{c.item.name}</span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => updateCart(c.item, -1)}
                  aria-label={`Remove ${c.item.name}`}
                  className="min-h-[36px] min-w-[34px] border border-[#D9CEBC] flex items-center justify-center"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="font-ticket w-5 text-center font-bold">{c.quantity}</span>
                <button
                  onClick={() => updateCart(c.item, 1)}
                  aria-label={`Add ${c.item.name}`}
                  className="min-h-[36px] min-w-[34px] border border-[#D9CEBC] flex items-center justify-center"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <span className="font-ticket w-16 sm:w-20 text-right tabular-nums font-semibold text-xs sm:text-sm">
                  {formatKSh(c.item.price * c.quantity)}
                </span>
                <button
                  onClick={() => updateCart(c.item, -c.quantity)}
                  aria-label={`Delete ${c.item.name}`}
                  className="p-1 text-[#61554C] hover:text-[#B93829]"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Totals */}
      <div className="space-y-1 text-sm">
        <div className="flex justify-between font-bold text-base">
          <span>Order Total</span>
          <span className="font-ticket tabular-nums">{formatKSh(cartTotal)}</span>
        </div>
        {allowanceApplied > 0 && (
          <div className="flex justify-between text-xs text-[#2E6F40]">
            <span>Allowance Auto-Applied</span>
            <span className="font-ticket tabular-nums">-{formatKSh(allowanceApplied)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-bold text-[#B93829]">
          <span>Balance Due</span>
          <span className="font-ticket tabular-nums">{formatKSh(balanceDue)}</span>
        </div>
      </div>

      {/* Payment Method + Cash Tendered Calculator */}
      {balanceDue > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            <button
              onClick={() => setPaymentMethod('cash')}
              className={`min-h-[44px] px-2 text-xs font-semibold border flex items-center justify-center gap-1 ${
                paymentMethod === 'cash'
                  ? 'bg-[#1C1714] text-[#FAF6EE] border-[#1C1714]'
                  : 'border-[#D9CEBC] text-[#1C1714]'
              }`}
            >
              <Banknote className="w-4 h-4 shrink-0" />
              <span>Cash</span>
            </button>
            <button
              onClick={() => setPaymentMethod('mpesa_stk')}
              className={`min-h-[44px] px-2 text-xs font-semibold border flex items-center justify-center gap-1 ${
                paymentMethod === 'mpesa_stk'
                  ? 'bg-[#1C1714] text-[#FAF6EE] border-[#1C1714]'
                  : 'border-[#D9CEBC] text-[#1C1714]'
              }`}
            >
              <Smartphone className="w-4 h-4 shrink-0" />
              <span>M-Pesa STK</span>
            </button>
            <button
              onClick={() => setPaymentMethod('mpesa_manual')}
              className={`min-h-[44px] px-2 text-xs font-semibold border ${
                paymentMethod === 'mpesa_manual'
                  ? 'bg-[#1C1714] text-[#FAF6EE] border-[#1C1714]'
                  : 'border-[#D9CEBC] text-[#1C1714]'
              }`}
            >
              Manual Code
            </button>
          </div>

          {paymentMethod === 'cash' && (
            <div className="bg-[#FAF6EE] border border-[#D9CEBC] p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-[#61554C]">Cash Tendered</label>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setCashTenderedInput(String(balanceDue))}
                    className="px-2 py-1 text-[11px] font-ticket border border-[#D9CEBC] bg-white hover:border-[#1C1714]"
                  >
                    Exact
                  </button>
                  {[100, 200, 500, 1000].map((note) => (
                    <button
                      key={note}
                      type="button"
                      onClick={() => setCashTenderedInput(String(note))}
                      className="px-2 py-1 text-[11px] font-ticket border border-[#D9CEBC] bg-white hover:border-[#1C1714]"
                    >
                      {note}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={cashTenderedInput}
                  onChange={(e) => setCashTenderedInput(e.target.value)}
                  placeholder={String(balanceDue)}
                  className="w-32 min-h-[40px] px-2.5 border border-[#D9CEBC] bg-white text-sm font-ticket"
                />
                {cashTenderedInput.trim() !== '' && (
                  <p
                    className={`text-xs font-semibold ${
                      cashChangeDue >= 0 ? 'text-[#2E6F40]' : 'text-[#B93829]'
                    }`}
                  >
                    {cashChangeDue >= 0
                      ? `Change: ${formatKSh(cashChangeDue)}`
                      : `Short by ${formatKSh(Math.abs(cashChangeDue))}`}
                  </p>
                )}
              </div>
            </div>
          )}

          {paymentMethod === 'mpesa_stk' && (
            <input
              type="tel"
              inputMode="tel"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="Customer M-Pesa phone (0712345678)"
              className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm font-ticket"
            />
          )}

          {paymentMethod === 'mpesa_manual' && (
            <input
              type="text"
              value={manualReceiptCode}
              onChange={(e) => setManualReceiptCode(e.target.value)}
              placeholder="M-Pesa receipt code (e.g. TJK8X92P1Q)"
              className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm font-ticket uppercase"
            />
          )}
        </div>
      )}

      {submitError && <p className="text-xs text-[#B93829]">{submitError}</p>}

      <div className="flex gap-2">
        {cart.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setCart([]);
              setCashTenderedInput('');
            }}
            className="min-h-[52px] px-4 border border-[#D9CEBC] text-xs font-semibold text-[#61554C] hover:text-[#B93829] hover:border-[#B93829]"
          >
            Clear
          </button>
        )}
        <button
          onClick={() => void handleSubmitOrder()}
          disabled={cart.length === 0 || submitting || !hoursCheck.open}
          className="flex-1 min-h-[52px] bg-[#B93829] text-white text-sm font-bold hover:bg-[#9C2E21] disabled:opacity-50"
        >
          {submitting
            ? 'Processing...'
            : balanceDue === 0 && cart.length > 0
              ? 'Issue Paid Ticket (Allowance)'
              : paymentMethod === 'mpesa_stk'
                ? `Send M-Pesa STK (${formatKSh(balanceDue)})`
                : `Confirm Paid & Print (${formatKSh(balanceDue)})`}
        </button>
      </div>
    </div>
  );

  const renderQueueAndPayouts = () => (
    <div className="p-4 sm:p-5 space-y-5 max-h-[75vh] overflow-y-auto">
      {/* 1. Ready for Counter Pickup */}
      <div>
        <h3 className="font-display text-lg font-bold mb-2">
          Ready for Pickup ({readyOrders.length})
        </h3>
        {readyOrders.length === 0 ? (
          <p className="text-xs text-[#61554C]">No orders waiting at pickup window.</p>
        ) : (
          <div className="space-y-2">
            {readyOrders.map((o) => (
              <div
                key={o.id}
                className="border border-[#2E6F40] bg-[#EDF5EE] p-3 flex flex-wrap items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold">
                    <span className="font-ticket text-base">{o.orderNumber}</span> · {o.customerName}
                  </p>
                  <p className="text-xs text-[#61554C] truncate">
                    {o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setReceiptOrder(o)}
                    aria-label={`Print ${o.orderNumber}`}
                    className="min-h-[38px] px-2.5 border border-[#1C1714] bg-white text-xs font-semibold"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                  </button>
                  <button
                    disabled={actionBusyId === o.id}
                    onClick={async () => {
                      setActionBusyId(o.id);
                      try {
                        await advanceOrderStatus(o, 'served');
                      } finally {
                        setActionBusyId(null);
                      }
                    }}
                    className="min-h-[38px] px-3 bg-[#2E6F40] text-white text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Served
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Cash Back Due */}
      <div className="border-t border-[#E6DDD0] pt-4">
        <h3 className="font-display text-lg font-bold mb-2">
          Cash Back Due ({cashBackOrders.length})
        </h3>
        {cashBackOrders.length === 0 ? (
          <p className="text-xs text-[#61554C]">No pending cash back payouts.</p>
        ) : (
          <div className="space-y-2.5">
            {cashBackOrders.map((o) => (
              <div
                key={o.id}
                className="border border-[#D49B27] bg-[#FFF5D6] p-3 flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <p className="text-sm font-bold">
                    <span className="font-ticket">{o.orderNumber}</span> · {o.customerName}
                  </p>
                  <p className="text-xs text-[#61554C]">
                    Refund due:{' '}
                    <strong className="font-ticket text-[#1C1714]">
                      {formatKSh(o.cashBackDue || 0)}
                    </strong>
                  </p>
                </div>
                <button
                  onClick={() => void markCashBackPaid(o, cashier)}
                  className="min-h-[40px] px-3 py-1.5 bg-[#1C1714] text-[#FAF6EE] text-xs font-semibold flex items-center gap-1.5 shrink-0"
                >
                  <Check className="w-4 h-4" />
                  Mark Paid Out
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Sold-Out Attention */}
      <div className="border-t border-[#E6DDD0] pt-4">
        <h3 className="font-display text-lg font-bold mb-2">
          Sold-Out Attention ({attentionOrders.length})
        </h3>
        {attentionOrders.length === 0 ? (
          <p className="text-xs text-[#61554C]">No orders awaiting replacement.</p>
        ) : (
          <div className="space-y-2.5">
            {attentionOrders.map((o) => (
              <div key={o.id} className="border border-[#B93829] bg-[#FCECE9] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-[#B93829] shrink-0" />
                      <span className="font-ticket">{o.orderNumber}</span> ·{' '}
                      <span className="truncate">{o.customerName}</span>
                    </p>
                    <p className="text-xs text-[#61554C] mt-0.5">
                      {o.escalatedToCashier
                        ? 'Escalated (>5m no student response)'
                        : 'Waiting on student or resolve here'}
                    </p>
                  </div>
                  <button
                    onClick={() => setEscalatedReplaceOrder(o)}
                    className="min-h-[38px] px-3 py-1.5 bg-[#B93829] text-white text-xs font-semibold shrink-0"
                  >
                    Resolve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Pre-Prep & In-Kitchen Orders (Reprint or Cancel pre-prep) */}
      <div className="border-t border-[#E6DDD0] pt-4">
        <h3 className="font-display text-lg font-bold mb-2">
          Active Queue ({activePrePrepOrders.length})
        </h3>
        {activePrePrepOrders.length === 0 ? (
          <p className="text-xs text-[#61554C]">No active orders in kitchen.</p>
        ) : (
          <div className="space-y-2">
            {activePrePrepOrders.map((o) => (
              <div
                key={o.id}
                className="border border-[#D9CEBC] bg-[#FAF6EE] p-3 flex flex-wrap items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold">
                    <span className="font-ticket text-sm">{o.orderNumber}</span> · {o.customerName}{' '}
                    <span className="uppercase text-[10px] px-1.5 py-0.5 bg-white border border-[#D9CEBC]">
                      {o.status}
                    </span>
                  </p>
                  <p className="text-[11px] text-[#61554C]">
                    {formatNairobiTime(o.paidAt || o.createdAt)} · {formatKSh(o.totalAmount)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setReceiptOrder(o)}
                    className="min-h-[36px] px-2.5 border border-[#1C1714] bg-white text-xs font-semibold flex items-center gap-1"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    Print
                  </button>
                  {o.status === 'paid' && (
                    <button
                      disabled={actionBusyId === o.id}
                      onClick={async () => {
                        setActionBusyId(o.id);
                        try {
                          await cancelOrderBeforePreparing(o, cashier);
                        } finally {
                          setActionBusyId(null);
                        }
                      }}
                      className="min-h-[36px] px-2.5 border border-[#B93829] text-[#B93829] bg-white text-xs font-semibold disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4 overflow-x-hidden pb-20 lg:pb-6">
      {/* Counter POS Top Strip */}
      <div className="bg-white border border-[#D9CEBC] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[#1C1714]">
              Cashier Counter POS
            </h2>
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 border ${
                hoursCheck.open
                  ? 'border-[#2E6F40] text-[#2E6F40] bg-[#EDF5EE]'
                  : 'border-[#B93829] text-[#B93829] bg-[#FCECE9]'
              }`}
            >
              {hoursCheck.open ? 'Counter Open' : 'Closed'}
            </span>
          </div>
          <p className="text-xs text-[#61554C]">
            Cashier: <strong className="text-[#1C1714]">{cashier.displayName}</strong> · Till{' '}
            <span className="font-ticket">{mpesaSettings.tillNumber}</span> ·{' '}
            {readyOrders.length} ready for pickup
          </p>
        </div>

        {!standaloneMode && onOpenStandalone && (
          <button
            onClick={onOpenStandalone}
            className="min-h-[40px] px-3 border border-[#1C1714] text-xs font-semibold flex items-center gap-1.5 hover:bg-[#1C1714] hover:text-[#FAF6EE]"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Dedicated /cashier
          </button>
        )}
      </div>

      {/* Mobile / Tablet 3-Tab Switcher */}
      <div className="lg:hidden grid grid-cols-3 border border-[#D9CEBC] bg-white">
        <button
          onClick={() => setMobilePane('menu')}
          className={`min-h-[46px] px-2 text-xs font-semibold ${
            mobilePane === 'menu' ? 'bg-[#1C1714] text-[#FAF6EE]' : 'text-[#61554C]'
          }`}
        >
          Menu
        </button>
        <button
          onClick={() => setMobilePane('ticket')}
          className={`min-h-[46px] px-2 text-xs font-semibold flex items-center justify-center gap-1 ${
            mobilePane === 'ticket' ? 'bg-[#B93829] text-white' : 'text-[#61554C]'
          }`}
        >
          Ticket ({cartCount})
        </button>
        <button
          onClick={() => setMobilePane('queue')}
          className={`min-h-[46px] px-2 text-xs font-semibold ${
            mobilePane === 'queue' ? 'bg-[#1C1714] text-[#FAF6EE]' : 'text-[#61554C]'
          }`}
        >
          Queue ({alertCount})
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: High-Contrast Touch Menu Selector */}
        <div
          className={`lg:col-span-7 xl:col-span-7 bg-white border border-[#D9CEBC] p-3.5 sm:p-5 min-w-0 ${
            mobilePane === 'menu' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 min-w-0">
              {(['All', ...MENU_CATEGORIES] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`min-h-[42px] px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 border ${
                    selectedCategory === cat
                      ? 'bg-[#1C1714] border-[#1C1714] text-[#FAF6EE]'
                      : 'bg-[#FAF6EE] border-[#D9CEBC] text-[#1C1714] hover:border-[#1C1714]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-52 shrink-0">
              <Search className="w-4 h-4 text-[#61554C] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search dish..."
                className="w-full min-h-[42px] pl-9 pr-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 max-h-[68vh] overflow-y-auto pr-1">
            {filteredMenu.length === 0 ? (
              <div className="col-span-full py-12 text-center text-sm text-[#61554C]">
                No menu items match your search.
              </div>
            ) : (
              filteredMenu.map((item) => {
                const qty = cart.find((c) => c.item.id === item.id)?.quantity || 0;
                return (
                  <div
                    key={item.id}
                    className={`group border flex flex-col overflow-hidden transition-all duration-150 min-w-0 ${
                      item.soldOut
                        ? 'bg-[#FAF6EE] border-[#E6DDD0] opacity-60'
                        : qty > 0
                          ? 'bg-[#FFF5D6] border-[#1C1714] shadow-sm'
                          : 'bg-[#FAF6EE] border-[#D9CEBC] hover:border-[#1C1714] hover:-translate-y-0.5'
                    }`}
                  >
                    <button
                      type="button"
                      disabled={item.soldOut}
                      onClick={() => updateCart(item, 1)}
                      className={`text-left flex-1 flex flex-col min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1C1714] ${
                        item.soldOut ? 'cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    >
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F3ECE0]">
                        <MenuFoodImage
                          item={item}
                          className={`w-full h-full transition-transform duration-200 ${
                            item.soldOut ? 'grayscale' : 'group-hover:scale-[1.03]'
                          }`}
                        />
                        {item.soldOut && (
                          <div className="absolute inset-0 bg-[#1C1714]/55 flex items-center justify-center">
                            <span className="bg-[#1C1714] text-[#FAF6EE] px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase">
                              Sold Out
                            </span>
                          </div>
                        )}
                        {!item.soldOut && qty > 0 && (
                          <div className="absolute top-2 right-2 bg-[#D49B27] text-[#1C1714] border border-[#1C1714] px-2 py-0.5 font-ticket text-xs font-bold tabular-nums shadow-sm">
                            ×{qty}
                          </div>
                        )}
                      </div>

                      <div className="p-2.5 sm:p-3 flex-1 flex flex-col justify-between gap-1 min-w-0 w-full">
                        <div className="min-w-0">
                          <p className="text-[11px] text-[#61554C] truncate">{item.category}</p>
                          <p className="text-xs sm:text-sm font-semibold text-[#1C1714] leading-snug line-clamp-2 mt-0.5">
                            {item.name}
                          </p>
                        </div>
                      </div>
                    </button>

                    <div className="px-2.5 sm:px-3 pb-2.5 pt-1.5 border-t border-[#E6DDD0]/80 flex items-center justify-between gap-2">
                      <span className="font-ticket text-xs sm:text-sm font-bold text-[#1C1714] tabular-nums">
                        {formatKSh(item.price)}
                      </span>
                      {!item.soldOut && (
                        <div className="flex items-center gap-1 shrink-0">
                          {qty > 0 && (
                            <button
                              type="button"
                              onClick={() => updateCart(item, -1)}
                              aria-label={`Remove one ${item.name}`}
                              className="min-h-[40px] min-w-[40px] sm:min-h-[36px] sm:min-w-[36px] border border-[#1C1714] bg-white hover:bg-[#FCECE9] hover:border-[#B93829] hover:text-[#B93829] flex items-center justify-center"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => updateCart(item, 1)}
                            aria-label={`Add ${item.name}`}
                            className="min-h-[40px] min-w-[40px] sm:min-h-[36px] sm:min-w-[36px] border border-[#1C1714] bg-[#1C1714] text-[#FAF6EE] hover:bg-[#B93829] hover:border-[#B93829] flex items-center justify-center"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Recent Cashier Tickets Bar for Quick Reprint */}
          {recentCounterOrders.length > 0 && (
            <div className="mt-4 pt-3 border-t border-[#E6DDD0]">
              <p className="text-xs uppercase tracking-wider text-[#61554C] font-semibold mb-2">
                Recent Counter Tickets (Tap to Print)
              </p>
              <div className="flex flex-wrap gap-2">
                {recentCounterOrders.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setReceiptOrder(o)}
                    className="min-h-[40px] px-3 py-1.5 border border-[#D9CEBC] bg-[#FAF6EE] hover:border-[#1C1714] text-xs flex items-center gap-2"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span className="font-ticket font-bold">{o.orderNumber}</span>
                    <span className="text-[#61554C]">{formatKSh(o.totalAmount)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Active Ticket + Queue & Payouts */}
        <div
          className={`lg:col-span-5 xl:col-span-5 bg-white border border-[#D9CEBC] min-w-0 ${
            mobilePane === 'ticket' || mobilePane === 'queue' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="hidden lg:grid grid-cols-2 border-b border-[#D9CEBC]">
            <button
              onClick={() => setRightTab('pos')}
              className={`min-h-[48px] px-3 text-xs sm:text-sm font-semibold ${
                rightTab === 'pos'
                  ? 'bg-[#1C1714] text-[#FAF6EE]'
                  : 'bg-[#FAF6EE] text-[#61554C] hover:text-[#1C1714]'
              }`}
            >
              Counter Ticket ({cartCount})
            </button>
            <button
              onClick={() => setRightTab('queue')}
              className={`min-h-[48px] px-3 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 ${
                rightTab === 'queue'
                  ? 'bg-[#B93829] text-white'
                  : 'bg-[#FAF6EE] text-[#61554C] hover:text-[#1C1714]'
              }`}
            >
              Queue, Ready & Cash Back ({alertCount})
            </button>
          </div>

          {/* Mobile renders by mobilePane; Desktop renders by rightTab */}
          <div className="lg:hidden">
            {mobilePane === 'ticket' ? renderTicketForm() : renderQueueAndPayouts()}
          </div>
          <div className="hidden lg:block">
            {rightTab === 'pos' ? renderTicketForm() : renderQueueAndPayouts()}
          </div>
        </div>
      </div>

      {/* Mobile quick jump bar when on menu with items in ticket */}
      {mobilePane === 'menu' && cartCount > 0 && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#1C1714] text-[#FAF6EE] border-t border-[#3A312B] px-4 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-[#D9CEBC] truncate">
              {cartCount} {cartCount === 1 ? 'item' : 'items'} · Balance {formatKSh(balanceDue)}
            </p>
            <p className="font-ticket text-base font-bold tabular-nums">{formatKSh(cartTotal)}</p>
          </div>
          <button
            onClick={() => setMobilePane('ticket')}
            className="min-h-[44px] px-4 py-2 bg-[#D49B27] text-[#1C1714] text-xs font-bold flex items-center gap-1.5 shrink-0"
          >
            <ShoppingBag className="w-4 h-4" />
            Open Ticket
          </button>
        </div>
      )}

      {/* Cashier Escalated Replacement Modal */}
      {escalatedReplaceOrder && escalatedReplaceOrder.needsAttentionItems?.[0] && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#FAF6EE] border border-[#D9CEBC] p-5 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-3 gap-2">
              <h3 className="font-display text-lg sm:text-xl font-bold min-w-0">
                Resolve {escalatedReplaceOrder.orderNumber} (
                {escalatedReplaceOrder.needsAttentionItems[0].itemName})
              </h3>
              <button
                onClick={() => setEscalatedReplaceOrder(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-xs font-medium">If extra price due:</span>
              <button
                onClick={() => setReplaceExtraChannel('cash')}
                className={`px-3 py-1.5 text-xs border ${
                  replaceExtraChannel === 'cash'
                    ? 'bg-[#1C1714] text-white border-[#1C1714]'
                    : 'border-[#D9CEBC]'
                }`}
              >
                Cash
              </button>
              <button
                onClick={() => setReplaceExtraChannel('mpesa_stk')}
                className={`px-3 py-1.5 text-xs border ${
                  replaceExtraChannel === 'mpesa_stk'
                    ? 'bg-[#1C1714] text-white border-[#1C1714]'
                    : 'border-[#D9CEBC]'
                }`}
              >
                M-Pesa STK
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#E6DDD0] bg-white border border-[#D9CEBC] px-3">
              {menuItems
                .filter(
                  (m) =>
                    m.active &&
                    !m.soldOut &&
                    m.id !== escalatedReplaceOrder.needsAttentionItems![0].itemId
                )
                .map((candidate) => {
                  const orig = escalatedReplaceOrder.needsAttentionItems![0].originalPrice;
                  const mpesaLock =
                    escalatedReplaceOrder.paymentSplit.mpesa > 0 && candidate.price < orig;
                  return (
                    <div
                      key={candidate.id}
                      className={`py-2.5 flex items-center justify-between gap-3 ${
                        mpesaLock ? 'opacity-45' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-14 aspect-[4/3] overflow-hidden border border-[#D9CEBC] shrink-0">
                          <MenuFoodImage item={candidate} className="w-full h-full" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{candidate.name}</p>
                          <p className="text-xs text-[#61554C] font-ticket">
                            {formatKSh(candidate.price)}
                          </p>
                        </div>
                      </div>
                      <button
                        disabled={mpesaLock}
                        onClick={async () => {
                          const res = await resolveReplacement({
                            order: escalatedReplaceOrder,
                            removedItemId: escalatedReplaceOrder.needsAttentionItems![0].itemId,
                            replacementItem: candidate,
                            cafeteriaSettings,
                            mpesaSettings,
                            actor: cashier,
                            extraPaymentChannel: replaceExtraChannel,
                            phoneInput: escalatedReplaceOrder.phone || phoneInput,
                          });
                          setEscalatedReplaceOrder(null);
                          if (res.extraMpesaDue > 0 && res.checkoutRequestId) {
                            setStkSession({
                              checkoutRequestId: res.checkoutRequestId,
                              orderId: escalatedReplaceOrder.id,
                            });
                          }
                        }}
                        className="min-h-[40px] px-3.5 py-1.5 bg-[#1C1714] text-white text-xs font-semibold disabled:opacity-40 shrink-0"
                      >
                        Apply
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {stkSession && (
        <StkPushModal
          checkoutRequestId={stkSession.checkoutRequestId}
          orderId={stkSession.orderId}
          mpesaSettings={mpesaSettings}
          onRetry={async (phone) => {
            const target = orders.find((o) => o.id === stkSession.orderId);
            if (!target) return;
            const newId = await retryFailedOrderPayment({
              order: target,
              phone,
              cafeteriaSettings,
              mpesaSettings,
            });
            setStkSession({ checkoutRequestId: newId, orderId: target.id });
          }}
          onSuccessOrder={(paidOrder) => {
            setStkSession(null);
            setReceiptOrder(paidOrder);
          }}
          onClose={() => setStkSession(null)}
        />
      )}

      {receiptOrder && (
        <TicketReceipt order={receiptOrder} onClose={() => setReceiptOrder(null)} />
      )}
    </div>
  );
}
