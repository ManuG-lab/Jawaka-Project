import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  Monitor,
  Search,
  Utensils,
} from 'lucide-react';
import { MENU_CATEGORIES } from '../data/seedMenu';
import { formatNairobiTime, toMillis } from '../lib/nairobiTime';
import { advanceOrderStatus, toggleMenuSoldOut } from '../services/jawakaService';
import { MenuCategory, MenuItem, Order, UserProfile } from '../types';
import { MenuFoodImage } from './MenuFoodImage';

interface KitchenViewProps {
  kitchenUser: UserProfile;
  menuItems: MenuItem[];
  orders: Order[];
  onOpenBoard: () => void;
  standaloneMode?: boolean;
  onOpenStandalone?: () => void;
}

export function KitchenView({
  kitchenUser,
  menuItems,
  orders,
  onOpenBoard,
  standaloneMode = false,
  onOpenStandalone,
}: KitchenViewProps) {
  const [mobilePane, setMobilePane] = useState<'queue' | 'stock'>('queue');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'paid' | 'preparing' | 'ready' | 'needs_attention'
  >('all');
  const [soldOutDrawerCat, setSoldOutDrawerCat] = useState<'All' | MenuCategory>('All');
  const [itemSearch, setItemSearch] = useState('');
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  // Unified FIFO queue sorted strictly by payment time (first paid, first served)
  const queueOrders = useMemo(() => {
    return orders
      .filter((o) => ['paid', 'preparing', 'ready', 'needs_attention'].includes(o.status))
      .sort((a, b) => {
        const ta = toMillis(a.paidAt) || toMillis(a.createdAt);
        const tb = toMillis(b.paidAt) || toMillis(b.createdAt);
        if (ta !== tb) return ta - tb;
        return a.orderSeq - b.orderSeq;
      });
  }, [orders]);

  const counts = useMemo(() => {
    let paid = 0;
    let preparing = 0;
    let ready = 0;
    let attention = 0;
    for (const o of queueOrders) {
      if (o.status === 'paid') paid++;
      else if (o.status === 'preparing') preparing++;
      else if (o.status === 'ready') ready++;
      else if (o.status === 'needs_attention') attention++;
    }
    return { paid, preparing, ready, attention };
  }, [queueOrders]);

  const visibleOrders = useMemo(() => {
    if (statusFilter === 'all') return queueOrders;
    return queueOrders.filter((o) => o.status === statusFilter);
  }, [queueOrders, statusFilter]);

  const filteredItems = useMemo(() => {
    return menuItems
      .filter((m) => m.active)
      .filter((m) => soldOutDrawerCat === 'All' || m.category === soldOutDrawerCat)
      .filter((m) =>
        itemSearch.trim()
          ? m.name.toLowerCase().includes(itemSearch.trim().toLowerCase())
          : true
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [menuItems, soldOutDrawerCat, itemSearch]);

  const soldOutCount = menuItems.filter((m) => m.active && m.soldOut).length;

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4 overflow-x-clip">
      {actionError && (
        <div className="bg-[#FCECE9] border border-[#B93829] px-4 py-2.5 text-xs text-[#B93829] flex items-center justify-between gap-2">
          <span>{actionError}</span>
          <button onClick={() => setActionError('')} className="font-semibold underline shrink-0">
            Dismiss
          </button>
        </div>
      )}
      {/* Independent Kitchen Status Strip */}
      <div className="bg-white border border-[#D9CEBC] p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[#1C1714]">
              Kitchen Display System
            </h2>
            <span className="font-ticket text-[11px] uppercase tracking-wider px-2 py-0.5 bg-[#1C1714] text-[#D49B27]">
              FIFO Live
            </span>
          </div>
          <p className="text-xs text-[#61554C] mt-0.5">
            Chef / Staff: <strong className="text-[#1C1714]">{kitchenUser.displayName}</strong> ·
            First paid, first served ({queueOrders.length} active)
          </p>
        </div>

        {/* Live Ticket Counters + Board/Standalone links */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2 flex-1 sm:flex-initial">
            <button
              onClick={() => setStatusFilter(statusFilter === 'paid' ? 'all' : 'paid')}
              className={`px-2.5 py-1.5 border text-left transition-colors min-w-0 ${
                statusFilter === 'paid'
                  ? 'bg-[#1C1714] text-[#FAF6EE] border-[#1C1714]'
                  : 'bg-[#FAF6EE] border-[#D9CEBC]'
              }`}
            >
              <span className="block text-[10px] uppercase tracking-wider opacity-80 truncate">
                Queued
              </span>
              <span className="font-ticket text-base sm:text-lg font-bold tabular-nums">
                {counts.paid}
              </span>
            </button>

            <button
              onClick={() => setStatusFilter(statusFilter === 'preparing' ? 'all' : 'preparing')}
              className={`px-2.5 py-1.5 border text-left transition-colors min-w-0 ${
                statusFilter === 'preparing'
                  ? 'bg-[#D49B27] text-[#1C1714] border-[#1C1714]'
                  : 'bg-[#FFF5D6] border-[#D49B27]'
              }`}
            >
              <span className="block text-[10px] uppercase tracking-wider text-[#61554C] truncate">
                Cooking
              </span>
              <span className="font-ticket text-base sm:text-lg font-bold tabular-nums">
                {counts.preparing}
              </span>
            </button>

            <button
              onClick={() => setStatusFilter(statusFilter === 'ready' ? 'all' : 'ready')}
              className={`px-2.5 py-1.5 border text-left transition-colors min-w-0 ${
                statusFilter === 'ready'
                  ? 'bg-[#2E6F40] text-white border-[#2E6F40]'
                  : 'bg-[#EDF5EE] border-[#2E6F40]/40'
              }`}
            >
              <span className="block text-[10px] uppercase tracking-wider opacity-85 truncate">
                Ready
              </span>
              <span className="font-ticket text-base sm:text-lg font-bold tabular-nums">
                {counts.ready}
              </span>
            </button>

            <button
              onClick={() =>
                setStatusFilter(statusFilter === 'needs_attention' ? 'all' : 'needs_attention')
              }
              className={`px-2.5 py-1.5 border text-left transition-colors min-w-0 ${
                statusFilter === 'needs_attention'
                  ? 'bg-[#B93829] text-white border-[#B93829]'
                  : 'bg-[#FCECE9] border-[#B93829]/40'
              }`}
            >
              <span className="block text-[10px] uppercase tracking-wider opacity-85 truncate">
                Hold
              </span>
              <span className="font-ticket text-base sm:text-lg font-bold tabular-nums">
                {counts.attention}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!standaloneMode && onOpenStandalone && (
              <button
                onClick={onOpenStandalone}
                className="min-h-[42px] px-3 py-2 border border-[#1C1714] text-xs font-semibold flex items-center gap-1.5 hover:bg-[#1C1714] hover:text-[#FAF6EE] whitespace-nowrap"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Dedicated /kitchen</span>
                <span className="sm:hidden">/kitchen</span>
              </button>
            )}
            <button
              onClick={onOpenBoard}
              className="min-h-[42px] px-3.5 py-2 bg-[#14110F] text-[#D49B27] text-xs font-semibold flex items-center gap-1.5 hover:bg-[#26201C] whitespace-nowrap"
            >
              <Monitor className="w-4 h-4" />
              <span>/board</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile / Tablet Segmented Pane Switcher */}
      <div className="lg:hidden grid grid-cols-2 border border-[#D9CEBC] bg-white">
        <button
          onClick={() => setMobilePane('queue')}
          className={`min-h-[46px] px-3 text-xs sm:text-sm font-semibold ${
            mobilePane === 'queue' ? 'bg-[#1C1714] text-[#FAF6EE]' : 'text-[#61554C]'
          }`}
        >
          Active Queue ({queueOrders.length})
        </button>
        <button
          onClick={() => setMobilePane('stock')}
          className={`min-h-[46px] px-3 text-xs sm:text-sm font-semibold ${
            mobilePane === 'stock' ? 'bg-[#B93829] text-white' : 'text-[#61554C]'
          }`}
        >
          Stock / Sold Out ({soldOutCount})
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Live FIFO Kitchen Queue */}
        <div
          className={`lg:col-span-8 xl:col-span-9 space-y-4 min-w-0 ${
            mobilePane === 'queue' ? 'block' : 'hidden lg:block'
          }`}
        >
          {statusFilter !== 'all' && (
            <div className="flex items-center justify-between bg-[#F2EBD9] border border-[#D9CEBC] px-3.5 py-2 text-xs">
              <span>
                Filtered by: <strong className="uppercase">{statusFilter.replace('_', ' ')}</strong>{' '}
                ({visibleOrders.length})
              </span>
              <button
                onClick={() => setStatusFilter('all')}
                className="font-semibold underline text-[#B93829]"
              >
                Show All Active
              </button>
            </div>
          )}

          {visibleOrders.length === 0 ? (
            <div className="bg-white border border-[#D9CEBC] p-10 sm:p-14 text-center">
              <Utensils className="w-10 h-10 text-[#9A8E82] mx-auto mb-3" />
              <p className="font-display text-xl font-bold text-[#1C1714]">
                {queueOrders.length === 0 ? 'Queue Clear' : 'No Tickets in This Filter'}
              </p>
              <p className="text-sm text-[#61554C] mt-1 max-w-md mx-auto">
                Paid orders from both the Student App and Cashier Counter appear here automatically in
                payment order.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {visibleOrders.map((order) => {
                const queueIdx = queueOrders.findIndex((q) => q.id === order.id);
                const isAttention = order.status === 'needs_attention';
                const isPreparing = order.status === 'preparing';
                const isReady = order.status === 'ready';
                const paidMs = toMillis(order.paidAt) || toMillis(order.createdAt);
                const waitMins = paidMs > 0 ? Math.max(0, Math.floor((nowTick - paidMs) / 60000)) : 0;

                return (
                  <div
                    key={order.id}
                    className={`border-2 p-4 sm:p-5 flex flex-col justify-between bg-white min-w-0 ${
                      isAttention
                        ? 'border-[#B93829] bg-[#FCECE9]'
                        : isReady
                          ? 'border-[#2E6F40]'
                          : isPreparing
                            ? 'border-[#D49B27]'
                            : 'border-[#1C1714]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-2 border-b border-dashed border-[#D9CEBC] pb-3 mb-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="font-ticket text-3xl sm:text-4xl font-bold text-[#1C1714]">
                              {order.orderNumber}
                            </span>
                            <span className="text-xs font-semibold uppercase tracking-wider text-[#61554C]">
                              #{queueIdx + 1} in line
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#61554C] mt-1">
                            <span>{formatNairobiTime(order.paidAt || order.createdAt)}</span>
                            <span>·</span>
                            <span>{order.entryPoint === 'cashier' ? 'Counter' : 'App'}</span>
                            <span>·</span>
                            <span className="truncate max-w-[140px]">{order.customerName}</span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span
                            className={`px-2 py-1 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap ${
                              isAttention
                                ? 'bg-[#B93829] text-white'
                                : isReady
                                  ? 'bg-[#2E6F40] text-white'
                                  : isPreparing
                                    ? 'bg-[#D49B27] text-[#1C1714]'
                                    : 'bg-[#1C1714] text-[#FAF6EE]'
                            }`}
                          >
                            {order.status.replace('_', ' ')}
                          </span>
                          <span
                            className={`font-ticket text-[11px] flex items-center gap-1 ${
                              waitMins >= 15
                                ? 'text-[#B93829] font-bold'
                                : waitMins >= 8
                                  ? 'text-[#9C6C0C] font-semibold'
                                  : 'text-[#61554C]'
                            }`}
                          >
                            <Clock className="w-3 h-3" />
                            {waitMins}m
                          </span>
                        </div>
                      </div>

                      {isAttention && (
                        <div className="mb-3 bg-white border border-[#B93829] px-3 py-2 text-xs text-[#B93829] flex items-start gap-2 font-medium">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>Awaiting sold-out replacement (queue position locked).</span>
                        </div>
                      )}

                      <ul className="space-y-2 mb-4">
                        {order.items.map((it, i) => (
                          <li
                            key={`${it.itemId}_${i}`}
                            className="flex items-baseline gap-2 text-sm sm:text-base min-w-0"
                          >
                            <span className="font-ticket font-bold text-[#B93829] w-7 shrink-0">
                              {it.quantity}×
                            </span>
                            <span className="font-medium text-[#1C1714] break-words min-w-0">
                              {it.name}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {!isAttention && (
                      <div className="pt-2">
                        {order.status === 'paid' && (
                          <button
                            disabled={busyOrderId === order.id}
                            onClick={async () => {
                              setActionError('');
                              setBusyOrderId(order.id);
                              try {
                                await advanceOrderStatus(order, 'preparing');
                              } catch (err) {
                                setActionError(
                                  err instanceof Error ? err.message : 'Could not update order.'
                                );
                              } finally {
                                setBusyOrderId(null);
                              }
                            }}
                            className="w-full min-h-[50px] bg-[#D49B27] text-[#1C1714] text-sm sm:text-base font-bold flex items-center justify-center gap-2 hover:brightness-95 disabled:opacity-50"
                          >
                            <Flame className="w-5 h-5" />
                            Start Preparing
                          </button>
                        )}

                        {order.status === 'preparing' && (
                          <button
                            disabled={busyOrderId === order.id}
                            onClick={async () => {
                              setActionError('');
                              setBusyOrderId(order.id);
                              try {
                                await advanceOrderStatus(order, 'ready');
                              } catch (err) {
                                setActionError(
                                  err instanceof Error ? err.message : 'Could not update order.'
                                );
                              } finally {
                                setBusyOrderId(null);
                              }
                            }}
                            className="w-full min-h-[50px] bg-[#1C1714] text-[#FAF6EE] text-sm sm:text-base font-bold flex items-center justify-center gap-2 hover:bg-[#332B26] disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-5 h-5 text-[#D49B27]" />
                            Mark Ready
                          </button>
                        )}

                        {order.status === 'ready' && (
                          <button
                            disabled={busyOrderId === order.id}
                            onClick={async () => {
                              setActionError('');
                              setBusyOrderId(order.id);
                              try {
                                await advanceOrderStatus(order, 'served');
                              } catch (err) {
                                setActionError(
                                  err instanceof Error ? err.message : 'Could not update order.'
                                );
                              } finally {
                                setBusyOrderId(null);
                              }
                            }}
                            className="w-full min-h-[48px] border-2 border-[#2E6F40] text-[#2E6F40] text-sm font-bold hover:bg-[#2E6F40] hover:text-white transition-colors disabled:opacity-50"
                          >
                            Mark Served & Clear Board
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: One-Tap Sold-Out Toggle Panel */}
        <aside
          className={`lg:col-span-4 xl:col-span-3 bg-white border border-[#D9CEBC] p-4 sm:p-5 lg:sticky lg:top-20 min-w-0 ${
            mobilePane === 'stock' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="mb-3">
            <h3 className="font-display text-lg font-bold">Stock / Sold-Out Toggles</h3>
            <p className="text-xs text-[#61554C]">
              {soldOutCount} marked sold out · Logs who & when
            </p>
          </div>

          <div className="relative mb-3">
            <Search className="w-4 h-4 text-[#61554C] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Filter items..."
              className="w-full min-h-[44px] pl-9 pr-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3">
            {(['All', ...MENU_CATEGORIES] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setSoldOutDrawerCat(cat)}
                className={`min-h-[38px] px-2.5 py-1 text-xs font-semibold whitespace-nowrap shrink-0 border ${
                  soldOutDrawerCat === cat
                    ? 'bg-[#1C1714] text-[#FAF6EE] border-[#1C1714]'
                    : 'bg-[#FAF6EE] text-[#61554C] border-[#D9CEBC]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="divide-y divide-[#F0E8DA] max-h-[60vh] overflow-y-auto pr-1">
            {filteredItems.map((item) => (
              <div key={item.id} className="py-2.5 flex items-center justify-between gap-2.5 min-w-0">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-12 aspect-[4/3] overflow-hidden border border-[#D9CEBC] bg-[#F3ECE0] shrink-0">
                    <MenuFoodImage
                      item={item}
                      className={`w-full h-full ${item.soldOut ? 'grayscale opacity-60' : ''}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium break-words leading-snug ${
                        item.soldOut ? 'line-through text-[#61554C]' : 'text-[#1C1714]'
                      }`}
                    >
                      {item.name}
                    </p>
                    {item.soldOut && item.soldOutBy && (
                      <p className="text-[11px] text-[#B93829] truncate">
                        Sold out by {item.soldOutBy} · {formatNairobiTime(item.soldOutAt)}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  disabled={busyItemId === item.id}
                  onClick={async () => {
                    setActionError('');
                    setBusyItemId(item.id);
                    try {
                      await toggleMenuSoldOut({
                        item,
                        soldOut: !item.soldOut,
                        actor: kitchenUser,
                      });
                    } catch (err) {
                      setActionError(
                        err instanceof Error ? err.message : 'Could not toggle stock status.'
                      );
                    } finally {
                      setBusyItemId(null);
                    }
                  }}
                  className={`min-h-[42px] px-3 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 border transition-colors ${
                    item.soldOut
                      ? 'bg-[#B93829] border-[#B93829] text-white'
                      : 'bg-[#FAF6EE] border-[#D9CEBC] text-[#1C1714] hover:border-[#B93829] hover:text-[#B93829]'
                  }`}
                >
                  {item.soldOut ? 'Reset Stock' : 'Sold Out'}
                </button>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
