import { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { CheckCircle2, Loader2, RefreshCw, Smartphone, X, XCircle } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { formatKSh } from '../lib/nairobiTime';
import { queryStkStatusFallback, settleMockStkPayment } from '../services/jawakaService';
import { MpesaSettings, Order, PaymentDoc } from '../types';

interface StkPushModalProps {
  checkoutRequestId: string;
  orderId: string;
  mpesaSettings: MpesaSettings;
  onRetry: (phone: string) => Promise<void>;
  onSuccessOrder: (order: Order) => void;
  onClose: () => void;
}

export function StkPushModal({
  checkoutRequestId,
  orderId,
  mpesaSettings,
  onRetry,
  onSuccessOrder,
  onClose,
}: StkPushModalProps) {
  const [payment, setPayment] = useState<PaymentDoc | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [retryPhone, setRetryPhone] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [statusHint, setStatusHint] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(120);

  useEffect(() => {
    setSecondsLeft(120);
    setStatusHint('');
    setRetryError('');
  }, [checkoutRequestId]);

  useEffect(() => {
    const unsubPay = onSnapshot(
      doc(db, 'payments', checkoutRequestId),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as PaymentDoc;
          setPayment(data);
          if (!retryPhone && data.phone) {
            setRetryPhone(data.phone);
          }
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `payments/${checkoutRequestId}`)
    );

    const unsubOrder = onSnapshot(
      doc(db, 'orders', orderId),
      (snap) => {
        if (snap.exists()) {
          setOrder(snap.data() as Order);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `orders/${orderId}`)
    );

    return () => {
      unsubPay();
      unsubOrder();
    };
  }, [checkoutRequestId, orderId, retryPhone]);

  // Countdown for 2-minute STK window
  useEffect(() => {
    if (payment?.status !== 'pending') return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [payment?.status]);

  // Auto-run mock STK outcome if in mock mode
  useEffect(() => {
    if (mpesaSettings.env !== 'mock') return;
    if (!payment || payment.status !== 'pending') return;

    const delay = mpesaSettings.mockOutcome === 'timeout' ? 4000 : 2500;
    const t = setTimeout(() => {
      void settleMockStkPayment({
        checkoutRequestId,
        outcome: mpesaSettings.mockOutcome,
      });
    }, delay);

    return () => clearTimeout(t);
  }, [checkoutRequestId, mpesaSettings.env, mpesaSettings.mockOutcome, payment]);

  const handleCheckStatus = useCallback(async () => {
    if (mpesaSettings.env === 'mock') return;
    setCheckingStatus(true);
    setStatusHint('');
    try {
      const res = await queryStkStatusFallback(checkoutRequestId);
      if (res.status === 'pending' && res.message) {
        setStatusHint(res.message);
      }
    } catch (err) {
      setStatusHint(err instanceof Error ? err.message : 'Unable to check M-Pesa status right now.');
    } finally {
      setCheckingStatus(false);
    }
  }, [checkoutRequestId, mpesaSettings.env]);

  // Automatic fallback STK query polling in live/sandbox mode if callback is delayed
  useEffect(() => {
    if (mpesaSettings.env === 'mock') return;
    if (payment && payment.status !== 'pending') return;

    const initialTimer = setTimeout(() => {
      void queryStkStatusFallback(checkoutRequestId).catch(() => undefined);
    }, 18_000);

    const intervalTimer = setInterval(() => {
      void queryStkStatusFallback(checkoutRequestId).catch(() => undefined);
    }, 15_000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, [checkoutRequestId, mpesaSettings.env, payment]);

  const handleRetryClick = async () => {
    setRetryError('');
    setRetrying(true);
    try {
      await onRetry(retryPhone);
      setSecondsLeft(120);
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'Could not retry STK push.');
    } finally {
      setRetrying(false);
    }
  };

  const status = payment?.status || 'pending';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#FAF6EE] border border-[#D9CEBC] shadow-2xl overflow-hidden">
        <div className="filmstrip-border" />
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-[#61554C] font-semibold">
                Lipa Na M-Pesa · Till {mpesaSettings.tillNumber}
                {mpesaSettings.env === 'production' ? ' · LIVE' : mpesaSettings.env === 'sandbox' ? ' · SANDBOX' : ' · MOCK'}
              </p>
              <h2 className="font-display text-2xl font-bold text-[#1C1714] mt-0.5">
                {status === 'pending' && 'Awaiting M-Pesa PIN'}
                {status === 'completed' && 'Payment Confirmed'}
                {(status === 'failed' || status === 'timeout') && 'Payment Not Completed'}
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Close payment window"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[#61554C] hover:text-[#1C1714]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {status === 'pending' && (
            <div className="bg-white border border-[#D9CEBC] p-5 text-center space-y-4">
              <div className="w-14 h-14 mx-auto bg-[#FFF5D6] border border-[#D49B27] flex items-center justify-center">
                <Smartphone className="w-7 h-7 text-[#1C1714]" />
              </div>
              <div>
                <p className="text-base font-semibold text-[#1C1714]">
                  Check your phone and enter your M-Pesa PIN
                </p>
                <p className="text-sm text-[#61554C] mt-1">
                  Prompt sent to <span className="font-ticket">{payment?.phone || '...'}</span> for{' '}
                  <strong className="font-ticket text-[#1C1714]">
                    {formatKSh(payment?.amount || 0)}
                  </strong>
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 text-xs text-[#61554C]">
                <Loader2 className="w-4 h-4 animate-spin text-[#B93829]" />
                <span>Waiting for Safaricom confirmation · {secondsLeft}s</span>
              </div>

              {mpesaSettings.env !== 'mock' && (
                <div className="border-t border-[#E6DDD0] pt-3 space-y-2">
                  <button
                    onClick={handleCheckStatus}
                    disabled={checkingStatus}
                    className="w-full min-h-[40px] px-3 py-2 border border-[#1C1714] text-xs font-semibold text-[#1C1714] hover:bg-[#FAF6EE] flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${checkingStatus ? 'animate-spin' : ''}`} />
                    {checkingStatus ? 'Verifying with Safaricom...' : 'Already Paid? Verify M-Pesa Status'}
                  </button>
                  {statusHint && <p className="text-[11px] text-[#61554C]">{statusHint}</p>}
                </div>
              )}

              {mpesaSettings.env === 'mock' && (
                <div className="border-t border-[#E6DDD0] pt-4 text-left">
                  <p className="text-[11px] uppercase tracking-wider text-[#61554C] font-semibold mb-2">
                    Mock Daraja Simulator Controls
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() =>
                        void settleMockStkPayment({ checkoutRequestId, outcome: 'success' })
                      }
                      className="min-h-[40px] px-2 py-1.5 text-xs font-medium bg-[#1C1714] text-[#FAF6EE] hover:bg-[#332B26]"
                    >
                      Approve PIN
                    </button>
                    <button
                      onClick={() =>
                        void settleMockStkPayment({ checkoutRequestId, outcome: 'fail' })
                      }
                      className="min-h-[40px] px-2 py-1.5 text-xs font-medium border border-[#B93829] text-[#B93829] hover:bg-[#FCECE9]"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() =>
                        void settleMockStkPayment({ checkoutRequestId, outcome: 'timeout' })
                      }
                      className="min-h-[40px] px-2 py-1.5 text-xs font-medium border border-[#D9CEBC] text-[#61554C] hover:bg-[#F2EBD9]"
                    >
                      Timeout
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {status === 'completed' && order && (
            <div className="bg-white border border-[#D9CEBC] p-5 text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-[#2E6F40] mx-auto" />
              <div>
                <p className="text-xs uppercase tracking-widest text-[#61554C]">
                  Queue Ticket Issued
                </p>
                <div className="font-ticket text-5xl font-bold text-[#1C1714] my-1">
                  {order.orderNumber}
                </div>
                {payment?.mpesaReceiptNumber && (
                  <p className="text-xs text-[#61554C]">
                    M-Pesa Receipt:{' '}
                    <span className="font-ticket font-semibold text-[#1C1714]">
                      {payment.mpesaReceiptNumber}
                    </span>
                  </p>
                )}
              </div>
              <button
                onClick={() => onSuccessOrder(order)}
                className="w-full min-h-[44px] bg-[#1C1714] text-[#FAF6EE] py-2.5 text-sm font-medium hover:bg-[#332B26]"
              >
                View Order Ticket & Receipt
              </button>
            </div>
          )}

          {(status === 'failed' || status === 'timeout') && (
            <div className="bg-white border border-[#D9CEBC] p-5 space-y-4">
              <div className="flex items-start gap-3">
                <XCircle className="w-6 h-6 text-[#B93829] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-[#1C1714]">
                    {status === 'timeout' ? 'STK Prompt Timed Out' : 'M-Pesa Request Failed'}
                  </p>
                  <p className="text-xs text-[#61554C] mt-1">
                    {payment?.resultDesc || 'Payment was not completed.'} Any reserved full-board
                    allowance has been released.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#61554C] mb-1">
                  M-Pesa Phone Number
                </label>
                <input
                  type="tel"
                  value={retryPhone}
                  onChange={(e) => setRetryPhone(e.target.value)}
                  placeholder="0712345678"
                  className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm font-ticket"
                />
              </div>

              {retryError && <p className="text-xs text-[#B93829]">{retryError}</p>}

              <div className="flex gap-3">
                <button
                  onClick={handleRetryClick}
                  disabled={retrying}
                  className="flex-1 min-h-[44px] bg-[#B93829] text-white px-4 py-2 text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#9C2E21] disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
                  Retry STK Push
                </button>
                <button
                  onClick={onClose}
                  className="min-h-[44px] px-4 py-2 border border-[#D9CEBC] text-sm font-medium text-[#1C1714]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
