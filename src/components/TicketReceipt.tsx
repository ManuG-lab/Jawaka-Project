import { Printer, X } from 'lucide-react';
import { formatKSh, formatNairobiTime } from '../lib/nairobiTime';
import { Order } from '../types';

interface TicketReceiptProps {
  order: Order;
  onClose?: () => void;
  printable?: boolean;
}

export function TicketReceipt({ order, onClose, printable = true }: TicketReceiptProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-sm">
        <div
          id={printable ? 'printable-receipt' : undefined}
          className="bg-white text-[#1C1714] shadow-xl border border-[#D9CEBC] relative"
        >
          <div className="filmstrip-border no-print" />
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#61554C] font-semibold">
                  Jawaka Catering
                </p>
                <p className="text-xs text-[#61554C]">University Cafeteria · {order.dailyDate}</p>
              </div>
              {onClose && (
                <button
                  onClick={onClose}
                  aria-label="Close receipt"
                  className="no-print min-h-[40px] min-w-[40px] flex items-center justify-center text-[#61554C] hover:text-[#1C1714]"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="border-y-2 border-dashed border-[#D9CEBC] py-4 my-3 text-center">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#61554C] mb-1">
                Order Ticket
              </p>
              <div className="font-ticket text-5xl font-bold tracking-tight text-[#1C1714]">
                {order.orderNumber}
              </div>
              <p className="text-xs text-[#61554C] mt-1.5">
                {order.entryPoint === 'cashier' ? 'Cashier Counter' : 'Student Mobile'} ·{' '}
                {formatNairobiTime(order.paidAt || order.createdAt)} EAT
              </p>
            </div>

            <div className="text-xs text-[#61554C] space-y-1 mb-4">
              <div className="flex justify-between">
                <span>Customer</span>
                <span className="font-medium text-[#1C1714]">{order.customerName}</span>
              </div>
              {order.studentNumber && (
                <div className="flex justify-between">
                  <span>Student No.</span>
                  <span className="font-ticket text-[#1C1714]">{order.studentNumber}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Status</span>
                <span className="uppercase font-semibold text-[#1C1714]">
                  {order.status.replace('_', ' ')}
                </span>
              </div>
            </div>

            <div className="border-t border-dashed border-[#D9CEBC] pt-3 mb-3 space-y-2">
              {order.items.map((item, idx) => (
                <div key={`${item.itemId}_${idx}`} className="flex items-baseline justify-between text-sm">
                  <span className="pr-2">
                    <span className="font-ticket text-xs mr-1.5">{item.quantity}x</span>
                    {item.name}
                  </span>
                  <span className="font-ticket tabular-nums shrink-0">
                    {formatKSh(item.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-[#1C1714] pt-2.5 space-y-1.5 text-sm">
              <div className="flex justify-between font-bold text-base">
                <span>Total</span>
                <span className="font-ticket tabular-nums">{formatKSh(order.totalAmount)}</span>
              </div>

              {order.paymentSplit.allowance > 0 && (
                <div className="flex justify-between text-xs text-[#61554C]">
                  <span>Full-Board Allowance</span>
                  <span className="font-ticket tabular-nums">
                    {formatKSh(order.paymentSplit.allowance)}
                  </span>
                </div>
              )}
              {order.paymentSplit.mpesa > 0 && (
                <div className="flex justify-between text-xs text-[#61554C]">
                  <span>M-Pesa {order.mpesaManual ? '(Manual)' : 'STK'}</span>
                  <span className="font-ticket tabular-nums">
                    {formatKSh(order.paymentSplit.mpesa)}
                  </span>
                </div>
              )}
              {order.paymentSplit.cash > 0 && (
                <div className="flex justify-between text-xs text-[#61554C]">
                  <span>Cash</span>
                  <span className="font-ticket tabular-nums">
                    {formatKSh(order.paymentSplit.cash)}
                  </span>
                </div>
              )}
            </div>

            {order.mpesaReceiptNumber && (
              <div className="mt-4 bg-[#FAF6EE] border border-[#D9CEBC] px-3 py-2 text-center">
                <p className="text-[10px] uppercase tracking-widest text-[#61554C]">
                  M-Pesa Receipt Code
                </p>
                <p className="font-ticket text-sm font-bold text-[#1C1714] mt-0.5">
                  {order.mpesaReceiptNumber}
                </p>
              </div>
            )}

            {(order.cashBackDue ?? 0) > 0 && (
              <div className="mt-3 bg-[#FFF5D6] border border-[#D49B27] px-3 py-2 text-xs text-[#1C1714]">
                Cash Back Due: <strong className="font-ticket">{formatKSh(order.cashBackDue!)}</strong>{' '}
                ({order.cashBackPaid ? 'Paid Out' : 'Collect at Cashier'})
              </div>
            )}
          </div>
          <div className="ticket-perforated-bottom h-2" />
        </div>

        <div className="no-print flex items-center gap-3 mt-3">
          <button
            onClick={() => window.print()}
            className="flex-1 min-h-[44px] bg-[#1C1714] text-[#FAF6EE] px-4 py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#332B26] transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print Ticket
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="min-h-[44px] bg-white border border-[#D9CEBC] text-[#1C1714] px-4 py-2.5 text-sm font-medium hover:bg-[#F2EBD9] transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
