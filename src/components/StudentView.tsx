import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  Minus,
  Plus,
  Receipt,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import { MENU_CATEGORIES } from '../data/seedMenu';
import {
  formatKSh,
  formatNairobiTime,
  getNairobiDateString,
  isCafeteriaOpenForOrders,
  toMillis,
} from '../lib/nairobiTime';
import {
  cancelOrderBeforePreparing,
  createStudentOrder,
  escalateOrderToCashier,
  queryStkStatusFallback,
  removeOrderItemBeforePreparing,
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
  UserProfile,
} from '../types';
import { MenuFoodImage } from './MenuFoodImage';
import { StkPushModal } from './StkPushModal';
import { TicketReceipt } from './TicketReceipt';

interface StudentViewProps {
  user: UserProfile;
  menuItems: MenuItem[];
  orders: Order[];
  allowanceUsage: AllowanceUsage | null;
  cafeteriaSettings: CafeteriaSettings;
  mpesaSettings: MpesaSettings;
}

export function StudentView({
  user,
  menuItems,
  orders,
  allowanceUsage,
  cafeteriaSettings,
  mpesaSettings,
}: StudentViewProps) {
  const [tab, setTab] = useState<'menu' | 'orders'>('menu');
  const [selectedCategory, setSelectedCategory] = useState<'All' | MenuCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState(user.phone || '');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [orderActionError, setOrderActionError] = useState('');
  const [verifyingOrderId, setVerifyingOrderId] = useState<string | null>(null);
  const [activeReceiptOrder, setActiveReceiptOrder] = useState<Order | null>(null);
  const [stkSession, setStkSession] = useState<{
    checkoutRequestId: string;
    orderId: string;
  } | null>(null);
  const [replacementModal, setReplacementModal] = useState<{
    order: Order;
    removedItemId: string;
    removedItemName: string;
    originalPrice: number;
    quantity: number;
  } | null>(null);
  const [replacementSearch, setReplacementSearch] = useState('');
  const [replacementPhone, setReplacementPhone] = useState(user.phone || '');
  const [replacementError, setReplacementError] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  // Auto-escalate any needs_attention order older than 5 minutes
  useEffect(() => {
    for (const order of orders) {
      if (order.status === 'needs_attention' && !order.escalatedToCashier && order.needsAttentionAt) {
        const elapsed = nowTick - toMillis(order.needsAttentionAt);
        if (elapsed >= 5 * 60 * 1000) {
          void escalateOrderToCashier(order.id).catch(() => undefined);
        }
      }
    }
  }, [orders, nowTick]);

  const dailyLimit = Number(cafeteriaSettings.dailyAllowance ?? 350);
  const isFullBoard = user.studentType === 'full_board';
  const usedToday = allowanceUsage?.used || 0;
  const reservedToday = allowanceUsage?.reserved || 0;
  const remainingAllowance = isFullBoard
    ? Math.max(0, dailyLimit - usedToday - reservedToday)
    : 0;

  const hoursCheck = isCafeteriaOpenForOrders(cafeteriaSettings, new Date(nowTick));

  const activeMenuItems = useMemo(() => {
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

  const groupedMenu = useMemo(() => {
    const map = new Map<MenuCategory, MenuItem[]>();
    for (const cat of MENU_CATEGORIES) map.set(cat, []);
    for (const item of activeMenuItems) {
      const list = map.get(item.category) || [];
      list.push(item);
      map.set(item.category, list);
    }
    return Array.from(map.entries()).filter(([, items]) => items.length > 0);
  }, [activeMenuItems]);

  const cartQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cart) map.set(c.item.id, c.quantity);
    return map;
  }, [cart]);

  const cartTotal = cart.reduce((sum, c) => sum + c.item.price * c.quantity, 0);
  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);
  const projectedAllowance = isFullBoard ? Math.min(remainingAllowance, cartTotal) : 0;
  const projectedMpesa = Math.max(0, cartTotal - projectedAllowance);

  const today = getNairobiDateString();
  const readyOrders = orders.filter((o) => o.dailyDate === today && o.status === 'ready');
  const attentionOrders = orders.filter((o) => o.status === 'needs_attention');

  const updateCart = (item: MenuItem, delta: number) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id);
      if (!existing && delta > 0) return [...prev, { item, quantity: delta }];
      if (!existing) return prev;
      const nextQty = existing.quantity + delta;
      if (nextQty <= 0) return prev.filter((c) => c.item.id !== item.id);
      return prev.map((c) => (c.item.id === item.id ? { ...c, quantity: nextQty } : c));
    });
  };

  const handleCheckout = async () => {
    setErrorMsg('');
    setSubmitting(true);
    try {
      const res = await createStudentOrder({
        user,
        cart,
        cafeteriaSettings,
        mpesaSettings,
        phoneInput,
      });
      setCart([]);
      setCheckoutOpen(false);
      if (res.mpesaDue > 0 && res.checkoutRequestId) {
        setStkSession({ checkoutRequestId: res.checkoutRequestId, orderId: res.orderId });
      } else {
        setTab('orders');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Checkout failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectReplacement = async (replacementItem: MenuItem) => {
    if (!replacementModal) return;
    setReplacementError('');
    setSubmitting(true);
    try {
      const res = await resolveReplacement({
        order: replacementModal.order,
        removedItemId: replacementModal.removedItemId,
        replacementItem,
        cafeteriaSettings,
        mpesaSettings,
        actor: user,
        extraPaymentChannel: 'mpesa_stk',
        phoneInput: replacementPhone,
      });
      setReplacementModal(null);
      if (res.extraMpesaDue > 0 && res.checkoutRequestId) {
        setStkSession({
          checkoutRequestId: res.checkoutRequestId,
          orderId: replacementModal.order.id,
        });
      }
    } catch (err) {
      setReplacementError(err instanceof Error ? err.message : 'Failed to apply replacement.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 pb-28 lg:pb-12 pt-4 sm:pt-5 overflow-x-clip">
      {/* Live In-App Notifications for Ready & Needs Attention Orders */}
      {readyOrders.map((o) => (
        <div
          key={`ready_${o.id}`}
          className="mb-4 bg-[#1C1714] text-[#FAF6EE] px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 border border-[#D49B27]"
        >
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-[#D49B27] shrink-0" />
            <div>
              <p className="text-sm font-semibold">
                Order <span className="font-ticket text-[#D49B27]">{o.orderNumber}</span> is READY
                for pickup
              </p>
              <p className="text-xs text-[#D9CEBC]">
                Present your digital ticket at the serving counter.
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveReceiptOrder(o)}
            className="min-h-[40px] px-3.5 py-1.5 bg-[#D49B27] text-[#1C1714] text-xs font-semibold whitespace-nowrap shrink-0"
          >
            Show Ticket
          </button>
        </div>
      ))}

      {attentionOrders.map((o) => {
        const elapsedSec = Math.floor((nowTick - toMillis(o.needsAttentionAt)) / 1000);
        const remainSec = Math.max(0, 300 - elapsedSec);
        const mins = Math.floor(remainSec / 60);
        const secs = remainSec % 60;
        const firstAffected = o.needsAttentionItems?.[0];

        return (
          <div
            key={`attn_${o.id}`}
            className="mb-4 bg-[#FCECE9] border border-[#B93829] px-4 py-3.5 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#B93829] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-[#1C1714]">
                  Order <span className="font-ticket">{o.orderNumber}</span> needs replacement (keeps
                  queue position)
                </p>
                <p className="text-xs text-[#61554C]">
                  {firstAffected?.itemName} sold out.{' '}
                  {o.escalatedToCashier
                    ? 'Escalated to Cashier counter for resolution.'
                    : `Pick replacement within ${mins}:${String(secs).padStart(2, '0')} before cashier handoff.`}
                </p>
              </div>
            </div>
            {firstAffected && (
              <button
                onClick={() =>
                  setReplacementModal({
                    order: o,
                    removedItemId: firstAffected.itemId,
                    removedItemName: firstAffected.itemName,
                    originalPrice: firstAffected.originalPrice,
                    quantity: firstAffected.quantity,
                  })
                }
                className="min-h-[44px] px-4 py-2 bg-[#B93829] text-white text-xs font-semibold whitespace-nowrap shrink-0"
              >
                Pick Replacement
              </button>
            )}
          </div>
        );
      })}

      {/* Editorial Cafeteria Masthead Banner + Allowance & Hours */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6 items-stretch">
        <div className="lg:col-span-8 bg-white border border-[#D9CEBC] p-5 sm:p-6 flex flex-col sm:flex-row gap-5 items-center">
          <div className="w-full sm:w-44 h-32 shrink-0 bg-[#F2EBD9] overflow-hidden border border-[#E6DDD0]">
            <img
              src="/src/assets/images/hero_jawaka_spread_1795003276742.jpg"
              alt="Jawaka Catering hot cafeteria meals"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#61554C] mb-1.5">
              <span>{cafeteriaSettings.openTime} – {cafeteriaSettings.closeTime} EAT</span>
              <span aria-hidden="true">·</span>
              <span>{hoursCheck.open ? 'Open for Ordering' : 'Closed'}</span>
            </div>
            <h2 className="font-display text-2xl font-bold text-[#1C1714] leading-tight">
              Fresh from the Campus Kitchen
            </h2>
            <p className="text-sm text-[#61554C] mt-1.5">
              {hoursCheck.open
                ? `Orders accepted until ${hoursCheck.lastOrderTime} EAT. Paid tickets enter the single kitchen queue in payment order.`
                : hoursCheck.reason}
            </p>
          </div>
        </div>

        <div className="lg:col-span-4 bg-[#F2EBD9] border border-[#D9CEBC] p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-[#61554C] font-semibold">
              {user.isGuest ? 'Walk-in Guest Session' : isFullBoard ? 'Daily Full-Board Allowance' : 'Meal Plan'}
            </p>
            {isFullBoard ? (
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-ticket text-3xl font-bold text-[#1C1714] tabular-nums">
                  {formatKSh(remainingAllowance)}
                </span>
                <span className="text-xs text-[#61554C]">of {formatKSh(dailyLimit)} left today</span>
              </div>
            ) : (
              <div className="mt-1">
                <span className="font-display text-xl font-bold text-[#1C1714] capitalize">
                  {user.isGuest ? user.displayName : (user.studentType || 'commuter').replace('_', '-')}
                </span>
                <p className="text-xs text-[#61554C] mt-0.5">
                  {user.isGuest
                    ? 'Order & pay directly via M-Pesa STK Push'
                    : 'Full balance paid via M-Pesa STK'}
                </p>
              </div>
            )}
          </div>
          {isFullBoard && (
            <div className="mt-3">
              <div className="h-2 w-full bg-[#D9CEBC] overflow-hidden">
                <div
                  className="h-full bg-[#1C1714] transition-all"
                  style={{ width: `${Math.min(100, (remainingAllowance / dailyLimit) * 100)}%` }}
                />
              </div>
              <p className="text-[11px] text-[#61554C] mt-1.5">
                Applied automatically at checkout · Resets midnight EAT
              </p>
            </div>
          )}
        </div>
      </div>

      {/* View Switcher: Menu Board vs My Orders */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#D9CEBC] pb-3 mb-5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab('menu')}
            className={`min-h-[44px] px-4 py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
              tab === 'menu'
                ? 'bg-[#1C1714] text-[#FAF6EE]'
                : 'bg-transparent text-[#61554C] hover:text-[#1C1714]'
            }`}
          >
            Printed Menu
          </button>
          <button
            onClick={() => setTab('orders')}
            className={`min-h-[44px] px-4 py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
              tab === 'orders'
                ? 'bg-[#1C1714] text-[#FAF6EE]'
                : 'bg-transparent text-[#61554C] hover:text-[#1C1714]'
            }`}
          >
            My Orders ({orders.length})
          </button>
        </div>

        {tab === 'menu' && (
          <div className="relative w-full sm:max-w-xs">
            <Search className="w-4 h-4 text-[#61554C] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find pilau, chai, chapo..."
              className="w-full min-h-[44px] pl-9 pr-3 bg-white border border-[#D9CEBC] text-sm focus:outline-none focus:border-[#1C1714]"
            />
          </div>
        )}
      </div>

      {tab === 'menu' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Printed Menu Column */}
          <div className="lg:col-span-8">
            {/* Ticket-Tag Category Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-5">
              {(['All', ...MENU_CATEGORIES] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`min-h-[40px] px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors ${
                    selectedCategory === cat
                      ? 'bg-[#D49B27] border-[#1C1714] text-[#1C1714]'
                      : 'bg-white border-[#D9CEBC] text-[#61554C] hover:border-[#1C1714] hover:text-[#1C1714]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {menuItems.length === 0 ? (
              <div className="bg-white border border-[#D9CEBC] p-10 text-center space-y-2">
                <p className="font-display text-xl font-bold text-[#1C1714]">
                  Cafeteria Menu Not Seeded Yet
                </p>
                <p className="text-sm text-[#61554C] max-w-md mx-auto">
                  An administrator needs to sign in once (or open Admin Console → Menu CRUD) to
                  seed the 72 Jawaka Catering menu items and opening hours.
                </p>
              </div>
            ) : groupedMenu.length === 0 ? (
              <div className="bg-white border border-[#D9CEBC] p-10 text-center">
                <p className="text-base font-medium text-[#1C1714]">No dishes match "{searchQuery}"</p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('All');
                  }}
                  className="mt-3 text-sm underline text-[#B93829]"
                >
                  Show full cafeteria menu
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                {groupedMenu.map(([category, items]) => (
                  <section key={category} className="bg-white border border-[#D9CEBC] p-4 sm:p-6 min-w-0">
                    <div className="flex items-baseline justify-between border-b-2 border-[#1C1714] pb-2 mb-4">
                      <h3 className="font-display text-xl font-bold text-[#1C1714]">{category}</h3>
                      <span className="text-xs text-[#61554C] tabular-nums">
                        {items.length} items
                      </span>
                    </div>

                    <div className="divide-y divide-[#F0E8DA]">
                      {items.map((item) => {
                        const qty = cartQtyMap.get(item.id) || 0;
                        return (
                          <div
                            key={item.id}
                            className={`py-3 flex items-center justify-between gap-3 min-w-0 transition-opacity duration-200 ${
                              item.soldOut ? 'opacity-50' : ''
                            }`}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="w-20 sm:w-24 aspect-[4/3] overflow-hidden border border-[#D9CEBC] bg-[#F3ECE0] shrink-0">
                                <MenuFoodImage
                                  item={item}
                                  className={`w-full h-full ${item.soldOut ? 'grayscale' : ''}`}
                                />
                              </div>

                              <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-2">
                                <span className="text-sm sm:text-base font-medium text-[#1C1714] break-words leading-snug min-w-0">
                                  {item.name}
                                </span>
                                <span
                                  aria-hidden="true"
                                  className="hidden sm:block flex-1 border-b border-dotted border-[#BFB3A2] mx-2 mb-1 min-w-[20px]"
                                />
                                <span className="font-ticket text-sm sm:text-base font-bold text-[#1C1714] tabular-nums shrink-0 sm:ml-auto">
                                  {formatKSh(item.price)}
                                </span>
                              </div>
                            </div>

                            <div className="shrink-0">
                              {item.soldOut ? (
                                <span className="inline-block px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-[#B93829]">
                                  Sold Out
                                </span>
                              ) : qty === 0 ? (
                                <button
                                  onClick={() => updateCart(item, 1)}
                                  className="min-h-[40px] min-w-[68px] px-3 py-1.5 border border-[#1C1714] text-xs font-semibold text-[#1C1714] hover:bg-[#1C1714] hover:text-[#FAF6EE] transition-colors flex items-center justify-center gap-1"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  Add
                                </button>
                              ) : (
                                <div className="flex items-center border border-[#1C1714] bg-[#FAF6EE]">
                                  <button
                                    onClick={() => updateCart(item, -1)}
                                    aria-label={`Remove one ${item.name}`}
                                    className="min-h-[40px] min-w-[36px] flex items-center justify-center hover:bg-[#E6DDD0]"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <span className="font-ticket text-sm font-bold px-2.5 tabular-nums">
                                    {qty}
                                  </span>
                                  <button
                                    onClick={() => updateCart(item, 1)}
                                    aria-label={`Add one ${item.name}`}
                                    className="min-h-[40px] min-w-[36px] flex items-center justify-center hover:bg-[#E6DDD0]"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

          {/* Desktop Tray / Checkout Panel */}
          <aside className="hidden lg:block lg:col-span-4 sticky top-20 bg-white border border-[#D9CEBC]">
            <div className="p-5 border-b border-[#D9CEBC] flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Your Meal Tray</h3>
              <span className="font-ticket text-xs text-[#61554C]">{cartCount} items</span>
            </div>

            <div className="p-5">
              {cart.length === 0 ? (
                <p className="text-sm text-[#61554C] py-8 text-center">
                  Tap any dish on the menu board to add it to your tray.
                </p>
              ) : (
                <>
                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1 mb-4">
                    {cart.map((c) => (
                      <div key={c.item.id} className="flex items-center justify-between gap-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium text-[#1C1714] truncate">{c.item.name}</p>
                          <p className="text-xs text-[#61554C] font-ticket">
                            {c.quantity} × {formatKSh(c.item.price)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-ticket font-semibold tabular-nums">
                            {formatKSh(c.item.price * c.quantity)}
                          </span>
                          <button
                            onClick={() => updateCart(c.item, -c.quantity)}
                            aria-label={`Remove ${c.item.name}`}
                            className="p-1 text-[#61554C] hover:text-[#B93829]"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-dashed border-[#D9CEBC] pt-3 space-y-1.5 text-sm mb-4">
                    <div className="flex justify-between font-bold text-base">
                      <span>Order Total</span>
                      <span className="font-ticket tabular-nums">{formatKSh(cartTotal)}</span>
                    </div>
                    {isFullBoard && (
                      <div className="flex justify-between text-xs text-[#2E6F40]">
                        <span>Allowance Applied</span>
                        <span className="font-ticket tabular-nums">
                          -{formatKSh(projectedAllowance)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs font-semibold text-[#1C1714]">
                      <span>M-Pesa Due</span>
                      <span className="font-ticket tabular-nums">{formatKSh(projectedMpesa)}</span>
                    </div>
                  </div>

                  {projectedMpesa > 0 && (
                    <div className="mb-4">
                      <label className="block text-xs font-medium text-[#61554C] mb-1">
                        M-Pesa Phone Number
                      </label>
                      <input
                        type="tel"
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        placeholder="0712345678"
                        className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm font-ticket"
                      />
                    </div>
                  )}

                  {errorMsg && <p className="text-xs text-[#B93829] mb-3">{errorMsg}</p>}

                  <button
                    onClick={handleCheckout}
                    disabled={submitting || !hoursCheck.open}
                    className="w-full min-h-[48px] bg-[#B93829] text-white text-sm font-semibold hover:bg-[#9C2E21] disabled:opacity-50 transition-colors"
                  >
                    {submitting
                      ? 'Submitting Order...'
                      : !hoursCheck.open
                        ? 'Cafeteria Closed'
                        : projectedMpesa > 0
                          ? `Pay ${formatKSh(projectedMpesa)} via M-Pesa`
                          : 'Confirm Order with Allowance'}
                  </button>
                </>
              )}
            </div>
          </aside>
        </div>
      ) : (
        /* Order Tracking & History Tab */
        <div className="space-y-4">
          {orderActionError && (
            <div className="bg-[#FCECE9] border border-[#B93829] px-4 py-3 text-xs text-[#B93829] flex items-center justify-between gap-2">
              <span>{orderActionError}</span>
              <button
                onClick={() => setOrderActionError('')}
                className="font-semibold underline shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}
          {orders.length === 0 ? (
            <div className="bg-white border border-[#D9CEBC] p-12 text-center">
              <p className="font-display text-xl font-bold text-[#1C1714]">No orders yet</p>
              <p className="text-sm text-[#61554C] mt-1">
                Place an order from the printed menu to track it live here.
              </p>
              <button
                onClick={() => setTab('menu')}
                className="mt-4 min-h-[44px] px-5 py-2 bg-[#1C1714] text-[#FAF6EE] text-sm font-medium"
              >
                Browse Menu
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {orders.map((order) => {
                const steps = ['paid', 'preparing', 'ready', 'served'] as const;
                const currentIdx = steps.indexOf(
                  order.status === 'needs_attention' ? 'paid' : (order.status as typeof steps[number])
                );
                const canEditOrCancel = order.status === 'paid' || order.status === 'needs_attention';
                const canRetry =
                  order.status === 'pending_payment' ||
                  (order.status === 'cancelled' && order.orderSeq === 0);

                return (
                  <div key={order.id} className="bg-white border border-[#D9CEBC] p-4 sm:p-5 flex flex-col justify-between min-w-0">
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-2 border-b border-dashed border-[#D9CEBC] pb-3 mb-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-ticket text-2xl font-bold text-[#1C1714]">
                              {order.orderNumber}
                            </span>
                            <span className="text-xs uppercase font-semibold tracking-wider text-[#61554C]">
                              · {order.status.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="text-xs text-[#61554C] mt-0.5">
                            {order.dailyDate} · {formatNairobiTime(order.paidAt || order.createdAt)} EAT
                          </p>
                        </div>
                        <span className="font-ticket text-lg font-bold tabular-nums shrink-0">
                          {formatKSh(order.totalAmount)}
                        </span>
                      </div>

                      {/* Order Stepper */}
                      {order.status !== 'cancelled' && order.status !== 'pending_payment' && (
                        <div className="grid grid-cols-4 gap-1 mb-4">
                          {steps.map((st, idx) => {
                            const active = currentIdx >= idx;
                            return (
                              <div key={st} className="text-center">
                                <div
                                  className={`h-1.5 mb-1.5 transition-colors ${
                                    active ? 'bg-[#1C1714]' : 'bg-[#E6DDD0]'
                                  }`}
                                />
                                <span
                                  className={`text-[11px] capitalize ${
                                    active ? 'font-semibold text-[#1C1714]' : 'text-[#9A8E82]'
                                  }`}
                                >
                                  {st}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="space-y-1.5 mb-4">
                        {order.items.map((it, idx) => (
                          <div key={`${it.itemId}_${idx}`} className="flex items-center justify-between gap-2 text-sm min-w-0">
                            <span className="min-w-0 break-words">
                              <span className="font-ticket text-xs mr-1.5">{it.quantity}x</span>
                              {it.name}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-ticket text-xs tabular-nums">
                                {formatKSh(it.price * it.quantity)}
                              </span>
                              {order.status === 'paid' &&
                                order.items.length > 1 &&
                                order.paymentSplit.mpesa === 0 && (
                                  <button
                                    onClick={async () => {
                                      setOrderActionError('');
                                      try {
                                        await removeOrderItemBeforePreparing(order, it.itemId, user);
                                      } catch (err) {
                                        setOrderActionError(
                                          err instanceof Error ? err.message : 'Could not remove item.'
                                        );
                                      }
                                    }}
                                    className="text-xs text-[#B93829] underline"
                                  >
                                    Remove
                                  </button>
                                )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {order.mpesaReceiptNumber && (
                        <p className="text-xs text-[#61554C] mb-3">
                          M-Pesa Receipt:{' '}
                          <span className="font-ticket font-semibold text-[#1C1714]">
                            {order.mpesaReceiptNumber}
                          </span>
                        </p>
                      )}

                      {order.mpesaRefundFlag && order.status === 'cancelled' && (
                        <p className="text-xs bg-[#FFF5D6] border border-[#D49B27] px-3 py-2 text-[#1C1714] mb-3">
                          M-Pesa portion ({formatKSh(order.paymentSplit.mpesa)}) flagged for manual
                          admin handling.
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#F0E8DA]">
                      <button
                        onClick={() => setActiveReceiptOrder(order)}
                        className="min-h-[40px] px-3.5 py-1.5 border border-[#1C1714] text-xs font-semibold flex items-center gap-1.5 hover:bg-[#1C1714] hover:text-[#FAF6EE]"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        Ticket Receipt
                      </button>

                      {canEditOrCancel && (
                        <button
                          onClick={async () => {
                            setOrderActionError('');
                            try {
                              await cancelOrderBeforePreparing(order, user);
                            } catch (err) {
                              setOrderActionError(
                                err instanceof Error ? err.message : 'Could not cancel order.'
                              );
                            }
                          }}
                          className="min-h-[40px] px-3.5 py-1.5 border border-[#B93829] text-[#B93829] text-xs font-semibold hover:bg-[#FCECE9]"
                        >
                          Cancel Order
                        </button>
                      )}

                      {order.status === 'pending_payment' &&
                        order.mpesaCheckoutRequestId &&
                        mpesaSettings.env !== 'mock' && (
                          <button
                            disabled={verifyingOrderId === order.id}
                            onClick={async () => {
                              setOrderActionError('');
                              setVerifyingOrderId(order.id);
                              try {
                                await queryStkStatusFallback(order.mpesaCheckoutRequestId!);
                              } catch (err) {
                                setOrderActionError(
                                  err instanceof Error
                                    ? err.message
                                    : 'Could not verify M-Pesa payment status.'
                                );
                              } finally {
                                setVerifyingOrderId(null);
                              }
                            }}
                            className="min-h-[40px] px-3.5 py-1.5 bg-[#2E6F40] text-white text-xs font-semibold disabled:opacity-50"
                          >
                            {verifyingOrderId === order.id ? 'Checking...' : 'Verify M-Pesa'}
                          </button>
                        )}

                      {canRetry && order.paymentSplit.mpesa > 0 && order.mpesaCheckoutRequestId && (
                        <button
                          onClick={async () => {
                            setOrderActionError('');
                            try {
                              const id = await retryFailedOrderPayment({
                                order,
                                phone: order.phone || user.phone || '0712345678',
                                cafeteriaSettings,
                                mpesaSettings,
                              });
                              setStkSession({ checkoutRequestId: id, orderId: order.id });
                            } catch (err) {
                              setOrderActionError(
                                err instanceof Error
                                  ? err.message
                                  : 'Could not retry M-Pesa payment.'
                              );
                            }
                          }}
                          className="min-h-[40px] px-3.5 py-1.5 bg-[#B93829] text-white text-xs font-semibold"
                        >
                          Retry M-Pesa
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Mobile Sticky Cart Bar (<= 15% viewport height) */}
      {tab === 'menu' && cartCount > 0 && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#1C1714] text-[#FAF6EE] border-t border-[#3A312B] px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-[#D9CEBC] truncate">
              {cartCount} {cartCount === 1 ? 'item' : 'items'} · M-Pesa {formatKSh(projectedMpesa)}
            </p>
            <p className="font-ticket text-base font-bold tabular-nums">{formatKSh(cartTotal)}</p>
          </div>
          <button
            onClick={() => setCheckoutOpen(true)}
            className="min-h-[44px] px-5 py-2 bg-[#D49B27] text-[#1C1714] text-sm font-bold flex items-center gap-2 shrink-0"
          >
            <ShoppingBag className="w-4 h-4" />
            Checkout
          </button>
        </div>
      )}

      {/* Mobile Checkout Sheet */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center">
          <div className="w-full max-w-md bg-[#FAF6EE] border-t sm:border border-[#D9CEBC] p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl font-bold">Checkout Summary</h3>
              <button
                onClick={() => setCheckoutOpen(false)}
                aria-label="Close checkout"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 mb-4 bg-white border border-[#D9CEBC] p-4">
              {cart.map((c) => (
                <div key={c.item.id} className="flex justify-between text-sm">
                  <span>
                    {c.quantity}× {c.item.name}
                  </span>
                  <span className="font-ticket tabular-nums">
                    {formatKSh(c.item.price * c.quantity)}
                  </span>
                </div>
              ))}
              <div className="border-t border-dashed border-[#D9CEBC] pt-2.5 space-y-1 text-sm">
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span className="font-ticket tabular-nums">{formatKSh(cartTotal)}</span>
                </div>
                {isFullBoard && (
                  <div className="flex justify-between text-xs text-[#2E6F40]">
                    <span>Allowance Applied</span>
                    <span className="font-ticket tabular-nums">-{formatKSh(projectedAllowance)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-[#B93829]">
                  <span>M-Pesa STK Due</span>
                  <span className="font-ticket tabular-nums">{formatKSh(projectedMpesa)}</span>
                </div>
              </div>
            </div>

            {projectedMpesa > 0 && (
              <div className="mb-4">
                <label className="block text-xs font-medium text-[#61554C] mb-1">
                  M-Pesa Phone Number
                </label>
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="0712345678"
                  className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-white text-sm font-ticket"
                />
              </div>
            )}

            {errorMsg && <p className="text-xs text-[#B93829] mb-3">{errorMsg}</p>}

            <button
              onClick={handleCheckout}
              disabled={submitting || !hoursCheck.open}
              className="w-full min-h-[48px] bg-[#B93829] text-white text-sm font-semibold disabled:opacity-50"
            >
              {submitting
                ? 'Placing Order...'
                : !hoursCheck.open
                  ? 'Cafeteria Closed'
                  : projectedMpesa > 0
                    ? `Send STK Push (${formatKSh(projectedMpesa)})`
                    : 'Confirm with Allowance'}
            </button>
          </div>
        </div>
      )}

      {/* Replacement Picker Modal */}
      {replacementModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#FAF6EE] border border-[#D9CEBC] p-6 max-h-[88vh] flex flex-col">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-[#B93829] font-semibold">
                  Sold-Out Replacement · Order {replacementModal.order.orderNumber}
                </p>
                <h3 className="font-display text-xl font-bold mt-0.5">
                  Replace {replacementModal.quantity}× {replacementModal.removedItemName} (
                  {formatKSh(replacementModal.originalPrice)} each)
                </h3>
              </div>
              <button
                onClick={() => setReplacementModal(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#61554C] mb-3">
              {replacementModal.order.paymentSplit.mpesa > 0
                ? 'This order includes M-Pesa payment: pick an available dish of the same or higher price (no M-Pesa refunds; extra charged via allowance/M-Pesa).'
                : 'Pick an available dish. Any lower-price difference restores allowance first, then cash back.'}
            </p>

            {replacementModal.order.paymentSplit.mpesa > 0 && (
              <div className="mb-3">
                <input
                  type="tel"
                  value={replacementPhone}
                  onChange={(e) => setReplacementPhone(e.target.value)}
                  placeholder="M-Pesa phone if extra due (0712345678)"
                  className="w-full min-h-[40px] px-3 border border-[#D9CEBC] bg-white text-xs font-ticket"
                />
              </div>
            )}

            <input
              type="search"
              value={replacementSearch}
              onChange={(e) => setReplacementSearch(e.target.value)}
              placeholder="Search available replacements..."
              className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-white text-sm mb-3"
            />

            {replacementError && (
              <p className="text-xs text-[#B93829] mb-2">{replacementError}</p>
            )}

            <div className="flex-1 overflow-y-auto divide-y divide-[#E6DDD0] bg-white border border-[#D9CEBC] px-3">
              {menuItems
                .filter((m) => m.active && !m.soldOut && m.id !== replacementModal.removedItemId)
                .filter((m) =>
                  replacementSearch.trim()
                    ? m.name.toLowerCase().includes(replacementSearch.trim().toLowerCase())
                    : true
                )
                .map((candidate) => {
                  const mpesaLock =
                    replacementModal.order.paymentSplit.mpesa > 0 &&
                    candidate.price < replacementModal.originalPrice;
                  const diff =
                    (candidate.price - replacementModal.originalPrice) * replacementModal.quantity;

                  return (
                    <div
                      key={candidate.id}
                      className={`py-2.5 flex items-center justify-between gap-3 ${
                        mpesaLock ? 'opacity-45' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-14 aspect-[4/3] overflow-hidden border border-[#D9CEBC] bg-[#F3ECE0] shrink-0">
                          <MenuFoodImage item={candidate} className="w-full h-full" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#1C1714] truncate">{candidate.name}</p>
                          <p className="text-xs text-[#61554C]">
                            {candidate.category} ·{' '}
                            <span className="font-ticket">{formatKSh(candidate.price)}</span>
                            {diff > 0 && ` (+${formatKSh(diff)} extra)`}
                            {diff < 0 && !mpesaLock && ` (${formatKSh(Math.abs(diff))} credited)`}
                          </p>
                        </div>
                      </div>
                      <button
                        disabled={mpesaLock || submitting}
                        onClick={() => void handleSelectReplacement(candidate)}
                        className="min-h-[40px] px-3.5 py-1.5 bg-[#1C1714] text-[#FAF6EE] text-xs font-semibold disabled:opacity-40 shrink-0"
                      >
                        {mpesaLock ? 'Below Price' : 'Select'}
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
          key={stkSession.checkoutRequestId}
          checkoutRequestId={stkSession.checkoutRequestId}
          orderId={stkSession.orderId}
          mpesaSettings={mpesaSettings}
          onRetry={async (phone) => {
            const targetOrder = orders.find((o) => o.id === stkSession.orderId);
            if (!targetOrder) {
              throw new Error('Order could not be loaded for retry. Please try from My Orders.');
            }
            const newId = await retryFailedOrderPayment({
              order: targetOrder,
              phone,
              cafeteriaSettings,
              mpesaSettings,
            });
            setStkSession({ checkoutRequestId: newId, orderId: targetOrder.id });
          }}
          onSuccessOrder={(paidOrder) => {
            setStkSession(null);
            setTab('orders');
            setActiveReceiptOrder(paidOrder);
          }}
          onClose={() => {
            setStkSession(null);
            setTab('orders');
          }}
        />
      )}

      {activeReceiptOrder && (
        <TicketReceipt
          order={activeReceiptOrder}
          onClose={() => setActiveReceiptOrder(null)}
        />
      )}
    </div>
  );
}
