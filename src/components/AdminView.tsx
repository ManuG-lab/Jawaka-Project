import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { Check, Plus, RefreshCw, RotateCcw, Save, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { MENU_CATEGORIES } from '../data/seedMenu';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { formatKSh, formatNairobiTime, getNairobiDateString } from '../lib/nairobiTime';
import {
  adminDeleteMenuItem,
  adminResetStudentAllowance,
  adminSaveMenuItem,
  adminUpdateCafeteriaSettings,
  adminUpdateMpesaSettings,
  adminUpdateUserRole,
  seedMenuAndSettings,
} from '../services/jawakaService';
import {
  AllowanceUsage,
  AuditLog,
  CafeteriaSettings,
  MenuCategory,
  MenuItem,
  MpesaSettings,
  Order,
  StudentType,
  UserProfile,
  UserRole,
} from '../types';
import { MenuFoodImage } from './MenuFoodImage';

interface AdminViewProps {
  admin: UserProfile;
  menuItems: MenuItem[];
  orders: Order[];
  cafeteriaSettings: CafeteriaSettings;
  mpesaSettings: MpesaSettings;
}

interface UserDraft {
  role: UserRole;
  studentType: StudentType;
  studentNumber: string;
  newPin: string;
}

export function AdminView({
  admin,
  menuItems,
  orders,
  cafeteriaSettings,
  mpesaSettings,
}: AdminViewProps) {
  const [section, setSection] = useState<'report' | 'menu' | 'settings' | 'users' | 'audit'>(
    'report'
  );

  // Admin-only collections
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [todayUsages, setTodayUsages] = useState<Record<string, AllowanceUsage>>({});
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // User Verification filters & drafts
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState<
    'all' | 'full_board' | 'half_board' | 'commuter' | 'staff'
  >('all');
  const [userDrafts, setUserDrafts] = useState<Record<string, UserDraft>>({});
  const [savingUid, setSavingUid] = useState<string | null>(null);
  const [savedUid, setSavedUid] = useState<string | null>(null);
  const [userActionError, setUserActionError] = useState('');

  const today = getNairobiDateString();

  useEffect(() => {
    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        setAllUsers(snap.docs.map((d) => d.data() as UserProfile));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );

    const unsubUsage = onSnapshot(
      query(collection(db, 'allowanceUsage'), where('date', '==', today)),
      (snap) => {
        const map: Record<string, AllowanceUsage> = {};
        for (const d of snap.docs) {
          const data = d.data() as AllowanceUsage;
          map[data.uid] = data;
        }
        setTodayUsages(map);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'allowanceUsage')
    );

    const unsubAudit = onSnapshot(
      query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc')),
      (snap) => {
        setAuditLogs(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLog, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'auditLogs')
    );

    return () => {
      unsubUsers();
      unsubUsage();
      unsubAudit();
    };
  }, [today]);

  // Menu form state
  const [editingItemId, setEditingItemId] = useState<string | undefined>(undefined);
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState<MenuCategory>('Meals');
  const [itemPrice, setItemPrice] = useState('100');
  const [itemActive, setItemActive] = useState(true);
  const [seedMessage, setSeedMessage] = useState('');

  // Cafeteria Settings state
  const [openTime, setOpenTime] = useState(cafeteriaSettings.openTime);
  const [closeTime, setCloseTime] = useState(cafeteriaSettings.closeTime);
  const [cutoffMins, setCutoffMins] = useState(String(cafeteriaSettings.cutoffMinutesBeforeClose));
  const [dailyAllowance, setDailyAllowance] = useState(String(cafeteriaSettings.dailyAllowance));
  const [settingsSaved, setSettingsSaved] = useState('');

  // M-Pesa Settings state
  const [mpesaEnv, setMpesaEnv] = useState<MpesaSettings['env']>(mpesaSettings.env);
  const [tillNumber, setTillNumber] = useState(mpesaSettings.tillNumber);
  const [shortcode, setShortcode] = useState(mpesaSettings.shortcode);
  const [txType, setTxType] = useState<MpesaSettings['transactionType']>(
    mpesaSettings.transactionType
  );
  const [mockOutcome, setMockOutcome] = useState<MpesaSettings['mockOutcome']>(
    mpesaSettings.mockOutcome
  );
  const [mpesaSaved, setMpesaSaved] = useState('');

  useEffect(() => {
    setOpenTime(cafeteriaSettings.openTime);
    setCloseTime(cafeteriaSettings.closeTime);
    setCutoffMins(String(cafeteriaSettings.cutoffMinutesBeforeClose));
    setDailyAllowance(String(cafeteriaSettings.dailyAllowance));
  }, [cafeteriaSettings]);

  useEffect(() => {
    setMpesaEnv(mpesaSettings.env);
    setTillNumber(mpesaSettings.tillNumber);
    setShortcode(mpesaSettings.shortcode);
    setTxType(mpesaSettings.transactionType);
    setMockOutcome(mpesaSettings.mockOutcome);
  }, [mpesaSettings]);

  const dailyLimit = Number(cafeteriaSettings.dailyAllowance ?? 350);

  const getDraftForUser = (u: UserProfile): UserDraft => {
    return (
      userDrafts[u.uid] || {
        role: u.role,
        studentType: u.studentType || 'full_board',
        studentNumber: u.studentNumber || '',
        newPin: '',
      }
    );
  };

  const updateUserDraft = (u: UserProfile, patch: Partial<UserDraft>) => {
    setUserDrafts((prev) => ({
      ...prev,
      [u.uid]: {
        ...(prev[u.uid] || {
          role: u.role,
          studentType: u.studentType || 'full_board',
          studentNumber: u.studentNumber || '',
          newPin: '',
        }),
        ...patch,
      },
    }));
  };

  const handleSaveUser = async (u: UserProfile, overrideDraft?: Partial<UserDraft>) => {
    setUserActionError('');
    const current = { ...getDraftForUser(u), ...overrideDraft };
    if (current.newPin.trim() && current.newPin.trim().length < 4) {
      setUserActionError('If setting a new PIN, enter at least 4 digits.');
      return;
    }
    setSavingUid(u.uid);
    try {
      await adminUpdateUserRole(
        u,
        {
          role: current.role,
          studentType: current.studentType,
          studentNumber: current.studentNumber,
          newPin: current.newPin.trim() || undefined,
        },
        admin
      );
      setUserDrafts((prev) => {
        const copy = { ...prev };
        delete copy[u.uid];
        return copy;
      });
      setSavedUid(u.uid);
      setTimeout(() => {
        setSavedUid((prev) => (prev === u.uid ? null : prev));
      }, 2500);
    } catch (err) {
      setUserActionError(err instanceof Error ? err.message : 'Failed to update user.');
    } finally {
      setSavingUid(null);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return allUsers
      .filter((u) => {
        if (userFilter === 'staff') return u.role !== 'student';
        if (userFilter === 'full_board') return u.studentType === 'full_board';
        if (userFilter === 'half_board') return u.studentType === 'half_board';
        if (userFilter === 'commuter') return u.studentType === 'commuter';
        return true;
      })
      .filter((u) => {
        if (!q) return true;
        return (
          u.displayName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.studentNumber || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [allUsers, userFilter, userSearch]);

  const userSummary = useMemo(() => {
    const fullBoard = allUsers.filter((u) => u.studentType === 'full_board').length;
    const staff = allUsers.filter((u) => u.role !== 'student').length;
    return { total: allUsers.length, fullBoard, staff };
  }, [allUsers]);

  // Daily report calculations
  const report = useMemo(() => {
    const todaysOrders = orders.filter((o) => o.dailyDate === today);
    const confirmed = todaysOrders.filter((o) =>
      ['paid', 'preparing', 'ready', 'served', 'needs_attention'].includes(o.status)
    );
    const totalSales = confirmed.reduce((s, o) => s + o.totalAmount, 0);
    const totalAllowance = confirmed.reduce((s, o) => s + (o.paymentSplit?.allowance || 0), 0);
    const totalMpesa = confirmed.reduce((s, o) => s + (o.paymentSplit?.mpesa || 0), 0);
    const totalCash = confirmed.reduce((s, o) => s + (o.paymentSplit?.cash || 0), 0);
    const cashBackPaidTotal = todaysOrders
      .filter((o) => o.cashBackPaid)
      .reduce((s, o) => s + (o.cashBackDue || 0), 0);
    const cashBackPendingTotal = todaysOrders
      .filter((o) => !o.cashBackPaid && (o.cashBackDue || 0) > 0)
      .reduce((s, o) => s + (o.cashBackDue || 0), 0);
    const mpesaReceipts = confirmed.filter((o) => o.mpesaReceiptNumber);
    const manualMpesaOrders = todaysOrders.filter((o) => o.mpesaManual);
    const mpesaRefundFlags = todaysOrders.filter((o) => o.mpesaRefundFlag);

    return {
      confirmedCount: confirmed.length,
      totalSales,
      totalAllowance,
      totalMpesa,
      totalCash,
      cashBackPaidTotal,
      cashBackPendingTotal,
      mpesaReceipts,
      manualMpesaOrders,
      mpesaRefundFlags,
    };
  }, [orders, today]);

  const handleSaveMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) return;
    await adminSaveMenuItem(
      {
        id: editingItemId,
        name: itemName,
        category: itemCategory,
        price: Number(itemPrice) || 0,
        active: itemActive,
        sortOrder: editingItemId
          ? menuItems.find((m) => m.id === editingItemId)?.sortOrder || menuItems.length + 1
          : menuItems.length + 1,
      },
      admin
    );
    setEditingItemId(undefined);
    setItemName('');
    setItemPrice('100');
    setItemActive(true);
  };

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-5 space-y-5 overflow-x-hidden">
      {/* Sub-navigation */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-[#D9CEBC] pb-3">
        {(
          [
            ['report', 'Daily Report'],
            ['users', `Users & Verification (${allUsers.length})`],
            ['menu', `Menu CRUD (${menuItems.length})`],
            ['settings', 'Hours, Allowance & M-Pesa'],
            ['audit', 'Audit Log'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`min-h-[44px] px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 border ${
              section === key
                ? 'bg-[#1C1714] border-[#1C1714] text-[#FAF6EE]'
                : 'bg-white border-[#D9CEBC] text-[#61554C] hover:text-[#1C1714]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 1. DAILY REPORT */}
      {section === 'report' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
            <div className="bg-white border border-[#D9CEBC] p-4 min-w-0">
              <p className="text-xs text-[#61554C]">Confirmed Sales ({today})</p>
              <p className="font-ticket text-2xl font-bold mt-1 tabular-nums">
                {formatKSh(report.totalSales)}
              </p>
              <p className="text-xs text-[#61554C] mt-0.5">{report.confirmedCount} paid orders</p>
            </div>
            <div className="bg-white border border-[#D9CEBC] p-4 min-w-0">
              <p className="text-xs text-[#61554C]">M-Pesa Collected</p>
              <p className="font-ticket text-2xl font-bold mt-1 tabular-nums text-[#2E6F40]">
                {formatKSh(report.totalMpesa)}
              </p>
              <p className="text-xs text-[#61554C] mt-0.5">
                {report.mpesaReceipts.length} receipts
              </p>
            </div>
            <div className="bg-white border border-[#D9CEBC] p-4 min-w-0">
              <p className="text-xs text-[#61554C]">Cash Collected</p>
              <p className="font-ticket text-2xl font-bold mt-1 tabular-nums">
                {formatKSh(report.totalCash)}
              </p>
            </div>
            <div className="bg-white border border-[#D9CEBC] p-4 min-w-0">
              <p className="text-xs text-[#61554C]">Allowance Used</p>
              <p className="font-ticket text-2xl font-bold mt-1 tabular-nums">
                {formatKSh(report.totalAllowance)}
              </p>
            </div>
            <div className="bg-white border border-[#D9CEBC] p-4 min-w-0 sm:col-span-2 lg:col-span-1">
              <p className="text-xs text-[#61554C]">Cash Back Payouts</p>
              <p className="font-ticket text-2xl font-bold mt-1 tabular-nums text-[#B93829]">
                {formatKSh(report.cashBackPaidTotal)}
              </p>
              <p className="text-xs text-[#61554C] mt-0.5">
                Pending: {formatKSh(report.cashBackPendingTotal)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* M-Pesa Receipts */}
            <div className="bg-white border border-[#D9CEBC] p-4 sm:p-5 min-w-0">
              <h3 className="font-display text-lg font-bold mb-3">Today's M-Pesa Receipt Codes</h3>
              {report.mpesaReceipts.length === 0 ? (
                <p className="text-sm text-[#61554C]">No M-Pesa receipts recorded today.</p>
              ) : (
                <div className="divide-y divide-[#F0E8DA] max-h-72 overflow-y-auto">
                  {report.mpesaReceipts.map((o) => (
                    <div
                      key={o.id}
                      className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="font-ticket font-bold">{o.orderNumber}</span>
                        <span className="font-ticket text-xs bg-[#FAF6EE] border border-[#D9CEBC] px-2 py-0.5">
                          {o.mpesaReceiptNumber}
                        </span>
                        {o.mpesaManual && (
                          <span className="text-xs font-semibold text-[#B93829]">
                            Manual Review
                          </span>
                        )}
                      </div>
                      <span className="font-ticket font-semibold tabular-nums">
                        {formatKSh(o.paymentSplit.mpesa)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Manual M-Pesa & Cancelled M-Pesa Admin Review */}
            <div className="bg-white border border-[#D9CEBC] p-4 sm:p-5 space-y-5 min-w-0">
              <div>
                <h3 className="font-display text-lg font-bold mb-2">
                  Manual M-Pesa Entries ({report.manualMpesaOrders.length})
                </h3>
                {report.manualMpesaOrders.length === 0 ? (
                  <p className="text-sm text-[#61554C]">No manual cashier M-Pesa codes today.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {report.manualMpesaOrders.map((o) => (
                      <li
                        key={o.id}
                        className="flex flex-wrap justify-between gap-2 border-b border-[#F0E8DA] pb-1.5"
                      >
                        <span>
                          <strong className="font-ticket">{o.orderNumber}</strong> · Code{' '}
                          <span className="font-ticket">{o.mpesaReceiptNumber}</span>
                        </span>
                        <span className="font-ticket">{formatKSh(o.paymentSplit.mpesa)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-[#E6DDD0] pt-4">
                <h3 className="font-display text-lg font-bold mb-2">
                  Cancelled M-Pesa Orders for Manual Handling ({report.mpesaRefundFlags.length})
                </h3>
                {report.mpesaRefundFlags.length === 0 ? (
                  <p className="text-sm text-[#61554C]">None today.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {report.mpesaRefundFlags.map((o) => (
                      <li
                        key={o.id}
                        className="flex flex-wrap justify-between gap-2 text-[#B93829]"
                      >
                        <span>
                          <strong className="font-ticket">{o.orderNumber}</strong> ·{' '}
                          {o.customerName} ({o.mpesaReceiptNumber || 'STK'})
                        </span>
                        <span className="font-ticket font-bold">
                          {formatKSh(o.paymentSplit.mpesa)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. USERS & FULL-BOARD PACKAGE VERIFICATION */}
      {section === 'users' && (
        <div className="bg-white border border-[#D9CEBC] p-4 sm:p-5 space-y-4 min-w-0">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[#E6DDD0] pb-4">
            <div>
              <h3 className="font-display text-xl font-bold">
                Student Package Verification & Role Management
              </h3>
              <p className="text-xs text-[#61554C] mt-0.5">
                Verify Full-Board packages (KSh {dailyLimit}/day), assign student numbers, reset
                counter PINs, or reset today's allowance usage.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-ticket">
              <span className="px-2.5 py-1 bg-[#FAF6EE] border border-[#D9CEBC]">
                Total: <strong>{userSummary.total}</strong>
              </span>
              <span className="px-2.5 py-1 bg-[#EDF5EE] border border-[#2E6F40]/40 text-[#2E6F40]">
                Full-Board: <strong>{userSummary.fullBoard}</strong>
              </span>
              <span className="px-2.5 py-1 bg-[#FFF5D6] border border-[#D49B27] text-[#1C1714]">
                Staff: <strong>{userSummary.staff}</strong>
              </span>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-[#61554C] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search name, email, or student #..."
                className="w-full min-h-[42px] pl-9 pr-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {(
                [
                  ['all', 'All'],
                  ['full_board', 'Full-Board'],
                  ['half_board', 'Half-Board'],
                  ['commuter', 'Commuter'],
                  ['staff', 'Staff'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setUserFilter(k)}
                  className={`min-h-[38px] px-3 text-xs font-semibold whitespace-nowrap shrink-0 border ${
                    userFilter === k
                      ? 'bg-[#1C1714] text-[#FAF6EE] border-[#1C1714]'
                      : 'bg-[#FAF6EE] text-[#61554C] border-[#D9CEBC]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {userActionError && (
            <div className="bg-[#FCECE9] border border-[#B93829] px-3 py-2 text-xs text-[#B93829]">
              {userActionError}
            </div>
          )}

          {/* Mobile & Tablet Cards (< lg) */}
          <div className="lg:hidden space-y-3">
            {filteredUsers.map((u) => {
              const draft = getDraftForUser(u);
              const usage = todayUsages[u.uid];
              const usedAmt = (usage?.used || 0) + (usage?.reserved || 0);
              const isDirty = Boolean(userDrafts[u.uid]);

              return (
                <div key={u.uid} className="border border-[#D9CEBC] bg-[#FAF6EE] p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-[#1C1714] truncate">
                        {u.displayName}
                      </p>
                      <p className="text-xs text-[#61554C] truncate">{u.email}</p>
                    </div>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 border shrink-0 ${
                        u.studentType === 'full_board'
                          ? 'bg-[#EDF5EE] border-[#2E6F40] text-[#2E6F40]'
                          : 'bg-white border-[#D9CEBC] text-[#61554C]'
                      }`}
                    >
                      {(u.studentType || 'full_board').replace('_', '-')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#61554C] mb-1">
                        Role
                      </label>
                      <select
                        value={draft.role}
                        onChange={(e) =>
                          updateUserDraft(u, { role: e.target.value as UserRole })
                        }
                        className="w-full min-h-[40px] px-2 border border-[#D9CEBC] bg-white text-xs font-semibold"
                      >
                        <option value="student">student</option>
                        <option value="cashier">cashier</option>
                        <option value="kitchen">kitchen</option>
                        <option value="admin">admin</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#61554C] mb-1">
                        Meal Package
                      </label>
                      <select
                        value={draft.studentType}
                        onChange={(e) =>
                          updateUserDraft(u, { studentType: e.target.value as StudentType })
                        }
                        className="w-full min-h-[40px] px-2 border border-[#D9CEBC] bg-white text-xs font-semibold"
                      >
                        <option value="full_board">full_board</option>
                        <option value="half_board">half_board</option>
                        <option value="commuter">commuter</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#61554C] mb-1">
                        Student Number
                      </label>
                      <input
                        type="text"
                        value={draft.studentNumber}
                        onChange={(e) => updateUserDraft(u, { studentNumber: e.target.value })}
                        placeholder="JKU-..."
                        className="w-full min-h-[40px] px-2.5 border border-[#D9CEBC] bg-white text-xs font-ticket uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#61554C] mb-1">
                        Reset PIN (optional)
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={draft.newPin}
                        onChange={(e) => updateUserDraft(u, { newPin: e.target.value })}
                        placeholder="New PIN"
                        className="w-full min-h-[40px] px-2.5 border border-[#D9CEBC] bg-white text-xs font-ticket"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#E6DDD0]">
                    <span className="text-xs text-[#61554C] font-ticket">
                      Today used: {formatKSh(usedAmt)} / {formatKSh(dailyLimit)}
                    </span>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {u.studentType !== 'full_board' && (
                        <button
                          disabled={savingUid === u.uid}
                          onClick={() => void handleSaveUser(u, { studentType: 'full_board' })}
                          className="min-h-[38px] px-2.5 bg-[#2E6F40] text-white text-xs font-semibold flex items-center gap-1"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Verify Full-Board
                        </button>
                      )}
                      {usedAmt > 0 && (
                        <button
                          onClick={() => void adminResetStudentAllowance(u, dailyLimit, admin)}
                          className="min-h-[38px] px-2.5 border border-[#D9CEBC] bg-white text-xs font-semibold flex items-center gap-1"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Reset Quota
                        </button>
                      )}
                      <button
                        disabled={savingUid === u.uid}
                        onClick={() => void handleSaveUser(u)}
                        className={`min-h-[38px] px-3 text-xs font-semibold flex items-center gap-1 ${
                          savedUid === u.uid
                            ? 'bg-[#2E6F40] text-white'
                            : isDirty
                              ? 'bg-[#B93829] text-white'
                              : 'bg-[#1C1714] text-[#FAF6EE]'
                        }`}
                      >
                        {savedUid === u.uid ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Saved
                          </>
                        ) : savingUid === u.uid ? (
                          'Saving...'
                        ) : (
                          <>
                            <Save className="w-3.5 h-3.5" />
                            Save
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Verification Table (>= lg) */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-[#1C1714] text-left text-xs uppercase tracking-wider text-[#61554C]">
                  <th className="py-2 pr-3">Student / User</th>
                  <th className="py-2 pr-3">Student #</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Meal Package</th>
                  <th className="py-2 pr-3">Today's Quota</th>
                  <th className="py-2 pr-3">PIN Reset</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0E8DA]">
                {filteredUsers.map((u) => {
                  const draft = getDraftForUser(u);
                  const usage = todayUsages[u.uid];
                  const usedAmt = (usage?.used || 0) + (usage?.reserved || 0);
                  const isDirty = Boolean(userDrafts[u.uid]);

                  return (
                    <tr key={u.uid} className="align-middle">
                      <td className="py-2.5 pr-3">
                        <p className="font-medium text-[#1C1714]">{u.displayName}</p>
                        <p className="text-xs text-[#61554C]">{u.email}</p>
                      </td>
                      <td className="py-2.5 pr-3">
                        <input
                          type="text"
                          value={draft.studentNumber}
                          onChange={(e) => updateUserDraft(u, { studentNumber: e.target.value })}
                          placeholder="JKU-..."
                          className="w-32 min-h-[38px] px-2 border border-[#D9CEBC] bg-[#FAF6EE] font-ticket text-xs uppercase"
                        />
                      </td>
                      <td className="py-2.5 pr-3">
                        <select
                          value={draft.role}
                          onChange={(e) =>
                            updateUserDraft(u, { role: e.target.value as UserRole })
                          }
                          className="min-h-[38px] px-2 border border-[#D9CEBC] bg-[#FAF6EE] text-xs font-semibold"
                        >
                          <option value="student">student</option>
                          <option value="cashier">cashier</option>
                          <option value="kitchen">kitchen</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td className="py-2.5 pr-3">
                        <select
                          value={draft.studentType}
                          onChange={(e) =>
                            updateUserDraft(u, { studentType: e.target.value as StudentType })
                          }
                          className={`min-h-[38px] px-2 border text-xs font-semibold ${
                            draft.studentType === 'full_board'
                              ? 'border-[#2E6F40] bg-[#EDF5EE] text-[#2E6F40]'
                              : 'border-[#D9CEBC] bg-[#FAF6EE] text-[#1C1714]'
                          }`}
                        >
                          <option value="full_board">full_board</option>
                          <option value="half_board">half_board</option>
                          <option value="commuter">commuter</option>
                        </select>
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-ticket text-xs tabular-nums">
                            {u.studentType === 'full_board'
                              ? `${formatKSh(usedAmt)} / ${formatKSh(dailyLimit)}`
                              : 'N/A'}
                          </span>
                          {usedAmt > 0 && (
                            <button
                              title="Reset today's allowance usage to 0"
                              onClick={() => void adminResetStudentAllowance(u, dailyLimit, admin)}
                              className="px-2 py-1 border border-[#D9CEBC] text-[11px] hover:border-[#1C1714] flex items-center gap-1"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Reset
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3">
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={6}
                          value={draft.newPin}
                          onChange={(e) => updateUserDraft(u, { newPin: e.target.value })}
                          placeholder="New PIN"
                          className="w-24 min-h-[38px] px-2 border border-[#D9CEBC] bg-[#FAF6EE] font-ticket text-xs"
                        />
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {u.studentType !== 'full_board' && (
                            <button
                              disabled={savingUid === u.uid}
                              onClick={() => void handleSaveUser(u, { studentType: 'full_board' })}
                              className="min-h-[38px] px-2.5 bg-[#2E6F40] text-white text-xs font-semibold flex items-center gap-1 whitespace-nowrap"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              Verify Full-Board
                            </button>
                          )}
                          <button
                            disabled={savingUid === u.uid}
                            onClick={() => void handleSaveUser(u)}
                            className={`min-h-[38px] px-3 text-xs font-semibold flex items-center gap-1 whitespace-nowrap ${
                              savedUid === u.uid
                                ? 'bg-[#2E6F40] text-white'
                                : isDirty
                                  ? 'bg-[#B93829] text-white'
                                  : 'bg-[#1C1714] text-[#FAF6EE]'
                            }`}
                          >
                            {savedUid === u.uid ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                Saved
                              </>
                            ) : savingUid === u.uid ? (
                              'Saving...'
                            ) : (
                              <>
                                <Save className="w-3.5 h-3.5" />
                                Save
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. MENU CRUD */}
      {section === 'menu' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={(e) => void handleSaveMenu(e)}
            className="lg:col-span-4 bg-white border border-[#D9CEBC] p-4 sm:p-5 space-y-4 min-w-0"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-xl font-bold">
                {editingItemId ? 'Edit Menu Item' : 'Add Menu Item'}
              </h3>
              <div className="w-16 aspect-[4/3] overflow-hidden border border-[#D9CEBC] bg-[#F3ECE0] shrink-0">
                <MenuFoodImage
                  item={{
                    id: editingItemId || '',
                    name: itemName.trim() || itemCategory,
                    category: itemCategory,
                  }}
                  className="w-full h-full"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#61554C] mb-1">Dish Name</label>
              <input
                required
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g. Pilau Special"
                className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#61554C] mb-1">Category</label>
              <select
                value={itemCategory}
                onChange={(e) => setItemCategory(e.target.value as MenuCategory)}
                className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm"
              >
                {MENU_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#61554C] mb-1">Price (KSh)</label>
              <input
                required
                type="number"
                min={0}
                value={itemPrice}
                onChange={(e) => setItemPrice(e.target.value)}
                className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm font-ticket"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={itemActive}
                onChange={(e) => setItemActive(e.target.checked)}
                className="w-4 h-4"
              />
              Active on Menu
            </label>

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 min-h-[44px] bg-[#1C1714] text-[#FAF6EE] text-sm font-semibold flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {editingItemId ? 'Save Changes' : 'Add Item'}
              </button>
              {editingItemId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingItemId(undefined);
                    setItemName('');
                  }}
                  className="min-h-[44px] px-3 border border-[#D9CEBC] text-sm"
                >
                  Cancel
                </button>
              )}
            </div>

            <div className="border-t border-[#E6DDD0] pt-4">
              <button
                type="button"
                onClick={async () => {
                  const count = await seedMenuAndSettings(admin);
                  setSeedMessage(
                    count > 0
                      ? `Added ${count} missing seed menu items.`
                      : 'All 72 seed menu items are already present.'
                  );
                }}
                className="w-full min-h-[42px] border border-[#1C1714] text-xs font-semibold flex items-center justify-center gap-2 hover:bg-[#FAF6EE]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Verify / Seed Default Menu
              </button>
              {seedMessage && <p className="text-xs text-[#2E6F40] mt-2">{seedMessage}</p>}
            </div>
          </form>

          <div className="lg:col-span-8 bg-white border border-[#D9CEBC] p-4 sm:p-5 min-w-0">
            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-[#F0E8DA]">
              {menuItems.map((m) => (
                <div key={m.id} className="py-3 flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-14 aspect-[4/3] overflow-hidden border border-[#D9CEBC] bg-[#F3ECE0] shrink-0">
                      <MenuFoodImage item={m} className="w-full h-full" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#1C1714] break-words">{m.name}</p>
                      <p className="text-xs text-[#61554C]">
                        {m.category} · <span className="font-ticket">{formatKSh(m.price)}</span> ·{' '}
                        {!m.active ? 'Inactive' : m.soldOut ? 'Sold Out' : 'Active'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        setEditingItemId(m.id);
                        setItemName(m.name);
                        setItemCategory(m.category);
                        setItemPrice(String(m.price));
                        setItemActive(m.active);
                      }}
                      className="min-h-[36px] px-2.5 border border-[#D9CEBC] text-xs font-semibold"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => void adminDeleteMenuItem(m, admin)}
                      aria-label={`Delete ${m.name}`}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center text-[#B93829]"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-[#1C1714] text-left text-xs uppercase tracking-wider text-[#61554C]">
                    <th className="py-2 pr-3">Item</th>
                    <th className="py-2 pr-3">Category</th>
                    <th className="py-2 pr-3">Price</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0E8DA]">
                  {menuItems.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2.5 pr-3 font-medium">
                        <div className="flex items-center gap-3">
                          <div className="w-12 aspect-[4/3] overflow-hidden border border-[#D9CEBC] bg-[#F3ECE0] shrink-0">
                            <MenuFoodImage item={m} className="w-full h-full" />
                          </div>
                          <span>{m.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-[#61554C]">{m.category}</td>
                      <td className="py-2.5 pr-3 font-ticket tabular-nums">
                        {formatKSh(m.price)}
                      </td>
                      <td className="py-2.5 pr-3 text-xs">
                        {!m.active ? 'Inactive' : m.soldOut ? 'Sold Out' : 'Active'}
                      </td>
                      <td className="py-2.5 text-right space-x-2">
                        <button
                          onClick={() => {
                            setEditingItemId(m.id);
                            setItemName(m.name);
                            setItemCategory(m.category);
                            setItemPrice(String(m.price));
                            setItemActive(m.active);
                          }}
                          className="text-xs underline text-[#1C1714]"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => void adminDeleteMenuItem(m, admin)}
                          aria-label={`Delete ${m.name}`}
                          className="text-[#B93829] inline-flex align-middle"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. HOURS, ALLOWANCE & MPESA */}
      {section === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-[#D9CEBC] p-4 sm:p-6 space-y-4 min-w-0">
            <h3 className="font-display text-xl font-bold">Cafeteria Hours & Allowance</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#61554C] mb-1">
                  Open Time (EAT)
                </label>
                <input
                  type="time"
                  value={openTime}
                  onChange={(e) => setOpenTime(e.target.value)}
                  className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] font-ticket text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#61554C] mb-1">
                  Close Time (EAT)
                </label>
                <input
                  type="time"
                  value={closeTime}
                  onChange={(e) => setCloseTime(e.target.value)}
                  className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] font-ticket text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#61554C] mb-1">
                  Cutoff Before Closing (min)
                </label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={cutoffMins}
                  onChange={(e) => setCutoffMins(e.target.value)}
                  className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] font-ticket text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#61554C] mb-1">
                  Full-Board Allowance (KSh)
                </label>
                <input
                  type="number"
                  min={0}
                  value={dailyAllowance}
                  onChange={(e) => setDailyAllowance(e.target.value)}
                  className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] font-ticket text-sm"
                />
              </div>
            </div>

            <button
              onClick={async () => {
                await adminUpdateCafeteriaSettings(
                  {
                    openTime,
                    closeTime,
                    cutoffMinutesBeforeClose: Number(cutoffMins) || 0,
                    dailyAllowance: Number(dailyAllowance) || 350,
                    timezone: 'Africa/Nairobi',
                  },
                  admin
                );
                setSettingsSaved('Cafeteria hours & allowance saved.');
              }}
              className="min-h-[44px] px-5 py-2 bg-[#1C1714] text-[#FAF6EE] text-sm font-semibold flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save Hours & Allowance
            </button>
            {settingsSaved && <p className="text-xs text-[#2E6F40]">{settingsSaved}</p>}
          </div>

          <div className="bg-white border border-[#D9CEBC] p-4 sm:p-6 space-y-4 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-display text-xl font-bold">M-Pesa Daraja Settings</h3>
                <p className="text-xs text-[#61554C] mt-1">
                  Consumer Key, Consumer Secret, and Passkey live strictly in Firebase Secret
                  Manager (never in client code).
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  setMpesaEnv('production');
                  setTxType('CustomerBuyGoodsOnline');
                  setShortcode('1334820');
                  setTillNumber('1804698');
                  await adminUpdateMpesaSettings(
                    {
                      env: 'production',
                      tillNumber: '1804698',
                      shortcode: '1334820',
                      transactionType: 'CustomerBuyGoodsOnline',
                      mockOutcome,
                    },
                    admin
                  );
                  setMpesaSaved(
                    'Live Production settings saved (Shortcode 1334820 · Till 1804698).'
                  );
                }}
                className="min-h-[38px] px-3 py-1.5 bg-[#2E6F40] text-white text-xs font-semibold hover:bg-[#245932] shrink-0"
              >
                Activate Live Store (1334820 / 1804698)
              </button>
            </div>

            <div className="bg-[#FAF6EE] border border-[#E6DDD0] p-3 text-xs text-[#61554C] space-y-1">
              <p className="font-semibold text-[#1C1714]">
                Live BuyGoods Configuration (`europe-west1`)
              </p>
              <p>
                Store Shortcode: <span className="font-ticket text-[#1C1714]">1334820</span> ·
                Till (PartyB): <span className="font-ticket text-[#1C1714]">1804698</span> ·
                Secrets required: <span className="font-ticket">MPESA_CONSUMER_KEY</span>,{' '}
                <span className="font-ticket">MPESA_CONSUMER_SECRET</span>,{' '}
                <span className="font-ticket">MPESA_PASSKEY</span>
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#61554C] mb-1">
                  MPESA_ENV
                </label>
                <select
                  value={mpesaEnv}
                  onChange={(e) => setMpesaEnv(e.target.value as MpesaSettings['env'])}
                  className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm"
                >
                  <option value="production">production (Live Safaricom)</option>
                  <option value="sandbox">sandbox (Daraja Sandbox)</option>
                  <option value="mock">mock (Built-in Simulator)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#61554C] mb-1">
                  Transaction Type
                </label>
                <select
                  value={txType}
                  onChange={(e) =>
                    setTxType(e.target.value as MpesaSettings['transactionType'])
                  }
                  className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm"
                >
                  <option value="CustomerBuyGoodsOnline">CustomerBuyGoodsOnline (Till)</option>
                  <option value="CustomerPayBillOnline">CustomerPayBillOnline (Paybill)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#61554C] mb-1">
                  Till Number (PartyB)
                </label>
                <input
                  type="text"
                  value={tillNumber}
                  onChange={(e) => setTillNumber(e.target.value)}
                  className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] font-ticket text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#61554C] mb-1">
                  Business Shortcode (Store / HO)
                </label>
                <input
                  type="text"
                  value={shortcode}
                  onChange={(e) => setShortcode(e.target.value)}
                  className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] font-ticket text-sm"
                />
              </div>
            </div>

            {mpesaEnv === 'mock' && (
              <div>
                <label className="block text-xs font-semibold text-[#61554C] mb-1">
                  Mock STK Auto-Outcome
                </label>
                <select
                  value={mockOutcome}
                  onChange={(e) => setMockOutcome(e.target.value as MpesaSettings['mockOutcome'])}
                  className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm"
                >
                  <option value="success">Success (PIN Approved)</option>
                  <option value="fail">Failure (Cancelled / Insufficient Funds)</option>
                  <option value="timeout">Timeout (2-min Window Expired)</option>
                </select>
              </div>
            )}

            <button
              onClick={async () => {
                await adminUpdateMpesaSettings(
                  {
                    env: mpesaEnv,
                    tillNumber: tillNumber.trim(),
                    shortcode: shortcode.trim(),
                    transactionType: txType,
                    mockOutcome,
                  },
                  admin
                );
                setMpesaSaved('M-Pesa settings updated.');
              }}
              className="min-h-[44px] px-5 py-2 bg-[#1C1714] text-[#FAF6EE] text-sm font-semibold flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save M-Pesa Settings
            </button>
            {mpesaSaved && <p className="text-xs text-[#2E6F40]">{mpesaSaved}</p>}
          </div>
        </div>
      )}

      {/* 5. AUDIT LOG */}
      {section === 'audit' && (
        <div className="bg-white border border-[#D9CEBC] p-4 sm:p-5 min-w-0">
          <h3 className="font-display text-xl font-bold mb-4">Operational Audit Log</h3>
          {auditLogs.length === 0 ? (
            <p className="text-sm text-[#61554C]">No audit events recorded yet.</p>
          ) : (
            <>
              <div className="md:hidden divide-y divide-[#F0E8DA]">
                {auditLogs.map((log) => (
                  <div key={log.id} className="py-3 space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-ticket font-bold text-[#1C1714]">{log.action}</span>
                      <span className="font-ticket text-[#61554C]">
                        {formatNairobiTime(log.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-[#61554C]">
                      {log.actorName} ({log.actorRole})
                    </p>
                    <p className="text-xs text-[#1C1714] break-words">{log.details}</p>
                  </div>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-[#1C1714] text-left text-xs uppercase tracking-wider text-[#61554C]">
                      <th className="py-2 pr-3">Time (EAT)</th>
                      <th className="py-2 pr-3">Action</th>
                      <th className="py-2 pr-3">Actor</th>
                      <th className="py-2">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0E8DA]">
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="py-2 pr-3 font-ticket text-xs text-[#61554C] whitespace-nowrap">
                          {formatNairobiTime(log.createdAt)}
                        </td>
                        <td className="py-2 pr-3 font-ticket text-xs font-bold">{log.action}</td>
                        <td className="py-2 pr-3 text-xs">
                          {log.actorName} ({log.actorRole})
                        </td>
                        <td className="py-2 text-xs text-[#1C1714]">{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
