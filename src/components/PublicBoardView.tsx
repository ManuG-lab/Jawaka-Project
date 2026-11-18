import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ArrowLeft, UtensilsCrossed } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { getNairobiDateString } from '../lib/nairobiTime';
import { BoardOrder } from '../types';

interface PublicBoardViewProps {
  onExitBoard?: () => void;
}

export function PublicBoardView({ onExitBoard }: PublicBoardViewProps) {
  const [boardOrders, setBoardOrders] = useState<BoardOrder[]>([]);
  const [nairobiTime, setNairobiTime] = useState('');

  useEffect(() => {
    const updateClock = () => {
      setNairobiTime(
        new Intl.DateTimeFormat('en-KE', {
          timeZone: 'Africa/Nairobi',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(new Date())
      );
    };
    updateClock();
    const t = setInterval(updateClock, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const today = getNairobiDateString();
    const q = query(collection(db, 'boardOrders'), where('dailyDate', '==', today));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as BoardOrder);
        list.sort((a, b) => a.paidAtMillis - b.paidAtMillis);
        setBoardOrders(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'boardOrders')
    );
    return () => unsub();
  }, []);

  const readyOrders = boardOrders.filter((o) => o.status === 'ready');
  const preparingOrders = boardOrders.filter((o) => o.status === 'preparing' || o.status === 'paid');

  return (
    <div className="min-h-screen bg-[#14110F] text-[#FAF6EE] flex flex-col overflow-x-hidden">
      <div className="filmstrip-border" />
      <header className="px-4 sm:px-6 lg:px-12 py-4 sm:py-5 border-b border-[#2D2621] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {onExitBoard && (
            <button
              onClick={onExitBoard}
              className="min-h-[40px] px-3 py-1.5 border border-[#3A312B] text-xs text-[#D9CEBC] hover:text-white hover:border-[#D49B27] flex items-center gap-1.5 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          )}
          <div className="min-w-0">
            <h1 className="font-display text-xl sm:text-3xl font-bold tracking-tight text-[#FAF6EE] truncate">
              Jawaka Catering
            </h1>
          </div>
        </div>
        <div className="text-right ml-auto">
          <p className="font-ticket text-xl sm:text-3xl font-bold text-[#D49B27] tabular-nums">
            {nairobiTime}
          </p>
          <p className="text-xs text-[#A89B8C]">Nairobi EAT · Live Counter Board</p>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12">
        {/* NOW SERVING */}
        <section className="lg:col-span-7 p-6 lg:p-12 border-b lg:border-b-0 lg:border-r border-[#2D2621] flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#D49B27]">
              Now Serving
            </h2>
            <span className="font-ticket text-lg text-[#A89B8C] tabular-nums">
              {readyOrders.length} Ready
            </span>
          </div>

          {readyOrders.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-16 border border-dashed border-[#2D2621]">
              <UtensilsCrossed className="w-12 h-12 text-[#5A4F47] mb-4" />
              <p className="text-xl text-[#A89B8C]">Orders ready for pickup will appear here</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
              {readyOrders.map((o) => (
                <div
                  key={o.orderId}
                  className="bg-[#D49B27] text-[#14110F] py-8 px-4 text-center shadow-lg"
                >
                  <span className="font-ticket text-5xl sm:text-6xl font-bold tracking-tight">
                    {o.orderNumber}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* PREPARING */}
        <section className="lg:col-span-5 p-6 lg:p-12 flex flex-col bg-[#191512]">
          <div className="flex items-center justify-between mb-8">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#FAF6EE]">
              Preparing
            </h2>
            <span className="font-ticket text-lg text-[#A89B8C] tabular-nums">
              {preparingOrders.length} In Queue
            </span>
          </div>

          {preparingOrders.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center py-16 border border-dashed border-[#2D2621]">
              <p className="text-base text-[#A89B8C]">Kitchen queue is currently clear</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-4">
              {preparingOrders.map((o) => (
                <div
                  key={o.orderId}
                  className="border border-[#3A312B] bg-[#211B17] py-5 px-4 text-center"
                >
                  <div className="font-ticket text-3xl sm:text-4xl font-bold text-[#FAF6EE]">
                    {o.orderNumber}
                  </div>
                  <p className="text-xs uppercase tracking-widest text-[#A89B8C] mt-1.5">
                    {o.status === 'preparing' ? 'Cooking' : 'Queued'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
