import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { SEED_MENU_ITEMS } from '../data/seedMenu';
import { db, functions, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  getNairobiDateString,
  hashPin,
  isCafeteriaOpenForOrders,
  normalizeKenyanPhone,
} from '../lib/nairobiTime';
import {
  AllowanceUsage,
  CafeteriaSettings,
  CartItem,
  MenuCategory,
  MenuItem,
  MpesaSettings,
  Order,
  OrderItem,
  StudentLookupRecord,
  StudentType,
  UserProfile,
  UserRole,
} from '../types';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'gmannu2055@gmail.com';

export const DEFAULT_CAFETERIA_SETTINGS: CafeteriaSettings = {
  openTime: '06:30',
  closeTime: '20:45',
  cutoffMinutesBeforeClose: 15,
  dailyAllowance: 350,
  timezone: 'Africa/Nairobi',
};

export const DEFAULT_MPESA_SETTINGS: MpesaSettings = {
  env: 'production',
  tillNumber: '1804698',
  shortcode: '1334820',
  transactionType: 'CustomerBuyGoodsOnline',
  mockOutcome: 'success',
};

export function sanitizeLookupId(studentNumber: string): string {
  return studentNumber.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
}

export async function logAudit(params: {
  action: string;
  actor: Pick<UserProfile, 'uid' | 'displayName' | 'role'>;
  targetType: string;
  targetId: string;
  details: string;
}) {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      action: params.action.slice(0, 64),
      actorUid: params.actor.uid,
      actorName: params.actor.displayName.slice(0, 100),
      actorRole: params.actor.role,
      targetType: params.targetType.slice(0, 40),
      targetId: params.targetId.slice(0, 128),
      details: params.details.slice(0, 500),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'auditLogs');
  }
}

export async function seedMenuAndSettings(actor: UserProfile): Promise<number> {
  let added = 0;
  try {
    const existingSnap = await getDocs(collection(db, 'menuItems'));
    const existingIds = new Set(existingSnap.docs.map((d) => d.id));
    const missing = SEED_MENU_ITEMS.filter((item) => !existingIds.has(item.id));

    if (missing.length > 0) {
      const chunkSize = 40;
      for (let i = 0; i < missing.length; i += chunkSize) {
        const batch = writeBatch(db);
        const chunk = missing.slice(i, i + chunkSize);
        for (const item of chunk) {
          batch.set(doc(db, 'menuItems', item.id), {
            id: item.id,
            name: item.name,
            category: item.category,
            price: item.price,
            active: true,
            soldOut: false,
            sortOrder: item.sortOrder,
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
      }
      added = missing.length;
    }

    const cafRef = doc(db, 'settings', 'cafeteria');
    const cafSnap = await getDoc(cafRef);
    if (!cafSnap.exists()) {
      await setDoc(cafRef, {
        ...DEFAULT_CAFETERIA_SETTINGS,
        updatedAt: serverTimestamp(),
      });
    }

    const mpesaRef = doc(db, 'settings', 'mpesa');
    const mpesaSnap = await getDoc(mpesaRef);
    if (!mpesaSnap.exists()) {
      await setDoc(mpesaRef, {
        ...DEFAULT_MPESA_SETTINGS,
        updatedAt: serverTimestamp(),
      });
    }

    if (added > 0) {
      await logAudit({
        action: 'MENU_SEEDED',
        actor,
        targetType: 'menuItems',
        targetId: 'seed',
        details: `Seeded ${added} cafeteria menu items and default settings.`,
      });
    }
    return added;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'menuItems/seed');
  }
}

export async function saveUserProfile(params: {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  studentType?: StudentType;
  studentNumber?: string;
  phone?: string;
  pin?: string;
  existingPinHash?: string;
  isGuest?: boolean;
  isNew: boolean;
}) {
  const {
    uid,
    email,
    displayName,
    role,
    studentType,
    studentNumber,
    phone,
    pin,
    existingPinHash,
    isGuest,
    isNew,
  } = params;

  const cleanPhone = phone && phone.trim() ? normalizeKenyanPhone(phone) : undefined;
  const cleanStudentNo = studentNumber?.trim().toUpperCase();
  if (cleanStudentNo && cleanStudentNo.length < 2) {
    throw new Error('Student number must be at least 2 characters.');
  }
  const pinHash = pin && pin.trim().length >= 4 ? await hashPin(pin) : existingPinHash;

  const userPayload: Record<string, unknown> = {
    uid,
    email,
    displayName: displayName.trim().slice(0, 100),
    role,
    updatedAt: serverTimestamp(),
  };
  if (isNew) {
    userPayload.createdAt = serverTimestamp();
  }
  if (studentType) userPayload.studentType = studentType;
  if (cleanStudentNo) userPayload.studentNumber = cleanStudentNo;
  if (cleanPhone) userPayload.phone = cleanPhone;
  if (pinHash) userPayload.pinHash = pinHash;
  if (typeof isGuest === 'boolean') userPayload.isGuest = isGuest;

  try {
    if (isNew) {
      await setDoc(doc(db, 'users', uid), userPayload);
    } else {
      await updateDoc(doc(db, 'users', uid), userPayload);
    }

    if (!isGuest && cleanStudentNo && studentType && pinHash) {
      const lookupId = sanitizeLookupId(cleanStudentNo);
      await setDoc(doc(db, 'studentLookup', lookupId), {
        uid,
        studentNumber: cleanStudentNo,
        displayName: displayName.trim().slice(0, 100),
        studentType,
        pinHash,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
  }
}

export async function lookupStudentByNumber(
  studentNumber: string,
  pin: string
): Promise<{ lookup: StudentLookupRecord; usage: AllowanceUsage | null }> {
  const lookupId = sanitizeLookupId(studentNumber);
  if (!lookupId || lookupId.length < 2) throw new Error('Enter a valid student number.');

  try {
    const snap = await getDoc(doc(db, 'studentLookup', lookupId));
    if (!snap.exists()) {
      throw new Error(`No student registered with number "${studentNumber.toUpperCase()}".`);
    }
    const lookup = snap.data() as StudentLookupRecord;
    const enteredHash = await hashPin(pin);
    if (enteredHash !== lookup.pinHash) {
      throw new Error('Incorrect 4-digit student PIN.');
    }

    const today = getNairobiDateString();
    const usageSnap = await getDoc(doc(db, 'allowanceUsage', `${lookup.uid}_${today}`));
    return {
      lookup,
      usage: usageSnap.exists() ? (usageSnap.data() as AllowanceUsage) : null,
    };
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.startsWith('No student registered') ||
        err.message.startsWith('Incorrect 4-digit') ||
        err.message.startsWith('{'))
    ) {
      throw err;
    }
    handleFirestoreError(err, OperationType.GET, `studentLookup/${lookupId}`);
  }
}

export async function createStudentOrder(params: {
  user: UserProfile;
  cart: CartItem[];
  cafeteriaSettings: CafeteriaSettings;
  mpesaSettings: MpesaSettings;
  phoneInput?: string;
}): Promise<{ orderId: string; mpesaDue: number; checkoutRequestId?: string }> {
  const { user, cart, cafeteriaSettings, mpesaSettings, phoneInput } = params;
  if (cart.length === 0) throw new Error('Your tray is empty.');
  if (cart.length > 30) throw new Error('Maximum 30 distinct dishes per order.');

  const hours = isCafeteriaOpenForOrders(cafeteriaSettings);
  if (!hours.open) {
    throw new Error(hours.reason || 'Cafeteria is currently closed.');
  }

  const today = getNairobiDateString();
  const orderRef = doc(collection(db, 'orders'));
  const orderId = orderRef.id;
  const usageRef = doc(db, 'allowanceUsage', `${user.uid}_${today}`);
  const counterRef = doc(db, 'dailyCounters', today);

  let computedMpesaDue = 0;
  let normalizedPhone: string | undefined;

  if (phoneInput && phoneInput.trim()) {
    normalizedPhone = normalizeKenyanPhone(phoneInput);
  } else if (user.phone) {
    normalizedPhone = user.phone;
  }

  try {
    await runTransaction(db, async (tx) => {
      // Verify live menu items
      const verifiedItems: OrderItem[] = [];
      let totalAmount = 0;
      for (const c of cart) {
        const itemSnap = await tx.get(doc(db, 'menuItems', c.item.id));
        if (!itemSnap.exists()) throw new Error(`${c.item.name} is no longer on the menu.`);
        const live = itemSnap.data() as MenuItem;
        if (!live.active || live.soldOut) {
          throw new Error(`${live.name} just sold out. Remove it from your tray to continue.`);
        }
        verifiedItems.push({
          itemId: live.id,
          name: live.name,
          category: live.category,
          price: live.price,
          quantity: c.quantity,
        });
        totalAmount += live.price * c.quantity;
      }
      if (totalAmount > 500000) {
        throw new Error('Order total cannot exceed KSh 500,000.');
      }

      const dailyLimit = Number(cafeteriaSettings.dailyAllowance ?? 350);
      let allowanceUsed = 0;
      const isFullBoard = user.studentType === 'full_board';

      const usageSnap = await tx.get(usageRef);
      const currentUsed = usageSnap.exists() ? Number(usageSnap.data().used || 0) : 0;
      const currentReserved = usageSnap.exists() ? Number(usageSnap.data().reserved || 0) : 0;

      if (isFullBoard) {
        const remaining = Math.max(0, dailyLimit - currentUsed - currentReserved);
        allowanceUsed = Math.min(remaining, totalAmount);
      }

      const mpesaDue = totalAmount - allowanceUsed;
      computedMpesaDue = mpesaDue;

      if (mpesaDue > 0 && !normalizedPhone) {
        throw new Error('Please enter your M-Pesa phone number (e.g. 0712345678).');
      }

      if (mpesaDue === 0) {
        // Fully covered by allowance -> confirm paid immediately
        const counterSnap = await tx.get(counterRef);
        const nextSeq = counterSnap.exists() ? Number(counterSnap.data().lastOrderSeq || 0) + 1 : 1;
        const orderNumber = `#${String(nextSeq).padStart(3, '0')}`;

        tx.set(
          counterRef,
          { date: today, lastOrderSeq: nextSeq, updatedAt: serverTimestamp() },
          { merge: true }
        );

        if (allowanceUsed > 0) {
          tx.set(usageRef, {
            uid: user.uid,
            date: today,
            used: currentUsed + allowanceUsed,
            reserved: currentReserved,
            dailyLimit,
            updatedAt: serverTimestamp(),
          });
        }

        tx.set(orderRef, {
          id: orderId,
          orderNumber,
          orderSeq: nextSeq,
          dailyDate: today,
          entryPoint: 'student_app',
          customerUid: user.uid,
          customerName: user.displayName,
          ...(user.studentNumber ? { studentNumber: user.studentNumber } : {}),
          ...(normalizedPhone ? { phone: normalizedPhone } : {}),
          items: verifiedItems,
          totalAmount,
          paymentSplit: { allowance: allowanceUsed, mpesa: 0, cash: 0 },
          cashBackDue: 0,
          cashBackPaid: false,
          mpesaRefundFlag: false,
          escalatedToCashier: false,
          needsAttentionItems: [],
          status: 'paid',
          paidAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        tx.set(doc(db, 'boardOrders', orderId), {
          orderId,
          orderNumber,
          dailyDate: today,
          status: 'paid',
          paidAtMillis: Date.now(),
          updatedAt: serverTimestamp(),
        });
      } else {
        // Reserve allowance portion & create pending_payment order
        if (allowanceUsed > 0) {
          tx.set(usageRef, {
            uid: user.uid,
            date: today,
            used: currentUsed,
            reserved: currentReserved + allowanceUsed,
            dailyLimit,
            updatedAt: serverTimestamp(),
          });
        }

        tx.set(orderRef, {
          id: orderId,
          orderNumber: 'PENDING',
          orderSeq: 0,
          dailyDate: today,
          entryPoint: 'student_app',
          customerUid: user.uid,
          customerName: user.displayName,
          ...(user.studentNumber ? { studentNumber: user.studentNumber } : {}),
          ...(normalizedPhone ? { phone: normalizedPhone } : {}),
          items: verifiedItems,
          totalAmount,
          paymentSplit: { allowance: allowanceUsed, mpesa: mpesaDue, cash: 0 },
          cashBackDue: 0,
          cashBackPaid: false,
          mpesaRefundFlag: false,
          escalatedToCashier: false,
          needsAttentionItems: [],
          status: 'pending_payment',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    });

    if (computedMpesaDue > 0 && normalizedPhone) {
      try {
        const checkoutRequestId = await triggerStkPush({
          orderId,
          phone: normalizedPhone,
          mpesaSettings,
        });
        return { orderId, mpesaDue: computedMpesaDue, checkoutRequestId };
      } catch (stkErr) {
        await rollbackFailedPendingOrder(orderId, today).catch(() => undefined);
        throw stkErr;
      }
    }

    return { orderId, mpesaDue: 0 };
  } catch (err) {
    if (err instanceof Error && !err.message.startsWith('{')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, 'orders');
  }
}

export async function createCashierOrder(params: {
  cashier: UserProfile;
  cart: CartItem[];
  cafeteriaSettings: CafeteriaSettings;
  mpesaSettings: MpesaSettings;
  customer: {
    type: 'walk_in' | 'student';
    uid: string;
    name: string;
    studentNumber?: string;
    studentType?: StudentType;
  };
  paymentMethod: 'cash' | 'mpesa_stk' | 'mpesa_manual';
  phoneInput?: string;
  manualReceiptCode?: string;
}): Promise<{ orderId: string; mpesaDue: number; checkoutRequestId?: string }> {
  const {
    cashier,
    cart,
    cafeteriaSettings,
    mpesaSettings,
    customer,
    paymentMethod,
    phoneInput,
    manualReceiptCode,
  } = params;

  if (cart.length === 0) throw new Error('Add items to the order first.');
  if (cart.length > 30) throw new Error('Maximum 30 distinct dishes per order.');

  const hours = isCafeteriaOpenForOrders(cafeteriaSettings);
  if (!hours.open) {
    throw new Error(hours.reason || 'Cafeteria is currently closed.');
  }

  const today = getNairobiDateString();
  const orderRef = doc(collection(db, 'orders'));
  const orderId = orderRef.id;
  const counterRef = doc(db, 'dailyCounters', today);

  const normalizedPhone =
    phoneInput && phoneInput.trim() ? normalizeKenyanPhone(phoneInput) : undefined;

  if (paymentMethod === 'mpesa_stk' && !normalizedPhone) {
    throw new Error('Customer phone number is required for M-Pesa STK Push.');
  }
  if (paymentMethod === 'mpesa_manual' && (!manualReceiptCode || manualReceiptCode.trim().length < 6)) {
    throw new Error('Enter a valid M-Pesa transaction receipt code (min 6 characters).');
  }

  let mpesaDue = 0;

  try {
    await runTransaction(db, async (tx) => {
      const verifiedItems: OrderItem[] = [];
      let totalAmount = 0;
      for (const c of cart) {
        const itemSnap = await tx.get(doc(db, 'menuItems', c.item.id));
        if (!itemSnap.exists()) throw new Error(`${c.item.name} not found.`);
        const live = itemSnap.data() as MenuItem;
        if (!live.active || live.soldOut) {
          throw new Error(`${live.name} is sold out.`);
        }
        verifiedItems.push({
          itemId: live.id,
          name: live.name,
          category: live.category,
          price: live.price,
          quantity: c.quantity,
        });
        totalAmount += live.price * c.quantity;
      }
      if (totalAmount > 500000) {
        throw new Error('Order total cannot exceed KSh 500,000.');
      }

      const dailyLimit = Number(cafeteriaSettings.dailyAllowance ?? 350);
      let allowanceUsed = 0;
      let currentUsed = 0;
      let currentReserved = 0;
      const usageRef = doc(db, 'allowanceUsage', `${customer.uid}_${today}`);

      if (customer.type === 'student' && customer.studentType === 'full_board') {
        const usageSnap = await tx.get(usageRef);
        currentUsed = usageSnap.exists() ? Number(usageSnap.data().used || 0) : 0;
        currentReserved = usageSnap.exists() ? Number(usageSnap.data().reserved || 0) : 0;
        const remaining = Math.max(0, dailyLimit - currentUsed - currentReserved);
        allowanceUsed = Math.min(remaining, totalAmount);
      }

      const balanceDue = totalAmount - allowanceUsed;

      if (balanceDue === 0 || paymentMethod === 'cash' || paymentMethod === 'mpesa_manual') {
        const counterSnap = await tx.get(counterRef);
        const nextSeq = counterSnap.exists() ? Number(counterSnap.data().lastOrderSeq || 0) + 1 : 1;
        const orderNumber = `#${String(nextSeq).padStart(3, '0')}`;

        tx.set(
          counterRef,
          { date: today, lastOrderSeq: nextSeq, updatedAt: serverTimestamp() },
          { merge: true }
        );

        if (allowanceUsed > 0) {
          tx.set(usageRef, {
            uid: customer.uid,
            date: today,
            used: currentUsed + allowanceUsed,
            reserved: currentReserved,
            dailyLimit,
            updatedAt: serverTimestamp(),
          });
        }

        const isManualMpesa = balanceDue > 0 && paymentMethod === 'mpesa_manual';
        const cleanReceipt = isManualMpesa ? manualReceiptCode!.trim().toUpperCase() : undefined;

        tx.set(orderRef, {
          id: orderId,
          orderNumber,
          orderSeq: nextSeq,
          dailyDate: today,
          entryPoint: 'cashier',
          customerUid: customer.uid,
          customerName: customer.name,
          ...(customer.studentNumber ? { studentNumber: customer.studentNumber } : {}),
          ...(normalizedPhone ? { phone: normalizedPhone } : {}),
          cashierUid: cashier.uid,
          items: verifiedItems,
          totalAmount,
          paymentSplit: {
            allowance: allowanceUsed,
            mpesa: isManualMpesa ? balanceDue : 0,
            cash: paymentMethod === 'cash' ? balanceDue : 0,
          },
          ...(cleanReceipt ? { mpesaReceiptNumber: cleanReceipt, mpesaManual: true } : {}),
          cashBackDue: 0,
          cashBackPaid: false,
          mpesaRefundFlag: false,
          escalatedToCashier: false,
          needsAttentionItems: [],
          status: 'paid',
          paidAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        tx.set(doc(db, 'boardOrders', orderId), {
          orderId,
          orderNumber,
          dailyDate: today,
          status: 'paid',
          paidAtMillis: Date.now(),
          updatedAt: serverTimestamp(),
        });

        if (isManualMpesa && cleanReceipt) {
          const manualPayId = `MANUAL_${Date.now()}_${orderId.slice(0, 6)}`;
          tx.set(doc(db, 'payments', manualPayId), {
            checkoutRequestId: manualPayId,
            orderId,
            orderNumber,
            customerUid: customer.uid,
            amount: balanceDue,
            phone: normalizedPhone || '254700000000',
            env: mpesaSettings.env,
            status: 'completed',
            mpesaReceiptNumber: cleanReceipt,
            resultCode: 0,
            resultDesc: 'Cashier manual M-Pesa receipt entry',
            manual: true,
            expiresAt: Timestamp.now(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } else {
        // M-Pesa STK Push due
        mpesaDue = balanceDue;
        if (allowanceUsed > 0) {
          tx.set(usageRef, {
            uid: customer.uid,
            date: today,
            used: currentUsed,
            reserved: currentReserved + allowanceUsed,
            dailyLimit,
            updatedAt: serverTimestamp(),
          });
        }

        tx.set(orderRef, {
          id: orderId,
          orderNumber: 'PENDING',
          orderSeq: 0,
          dailyDate: today,
          entryPoint: 'cashier',
          customerUid: customer.uid,
          customerName: customer.name,
          ...(customer.studentNumber ? { studentNumber: customer.studentNumber } : {}),
          ...(normalizedPhone ? { phone: normalizedPhone } : {}),
          cashierUid: cashier.uid,
          items: verifiedItems,
          totalAmount,
          paymentSplit: { allowance: allowanceUsed, mpesa: balanceDue, cash: 0 },
          cashBackDue: 0,
          cashBackPaid: false,
          mpesaRefundFlag: false,
          escalatedToCashier: false,
          needsAttentionItems: [],
          status: 'pending_payment',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    });

    if (paymentMethod === 'mpesa_manual' && manualReceiptCode) {
      await logAudit({
        action: 'MANUAL_MPESA',
        actor: cashier,
        targetType: 'orders',
        targetId: orderId,
        details: `Cashier recorded manual M-Pesa receipt ${manualReceiptCode.trim().toUpperCase()}.`,
      });
    }

    if (mpesaDue > 0 && normalizedPhone) {
      try {
        const checkoutRequestId = await triggerStkPush({
          orderId,
          phone: normalizedPhone,
          mpesaSettings,
        });
        return { orderId, mpesaDue, checkoutRequestId };
      } catch (stkErr) {
        await rollbackFailedPendingOrder(orderId, today).catch(() => undefined);
        throw stkErr;
      }
    }

    return { orderId, mpesaDue: 0 };
  } catch (err) {
    if (err instanceof Error && !err.message.startsWith('{')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, 'orders');
  }
}

async function rollbackFailedPendingOrder(orderId: string, dailyDate: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const orderRef = doc(db, 'orders', orderId);
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists()) return;
    const live = orderSnap.data() as Order;
    if (live.status !== 'pending_payment') return;

    const allowancePortion = Number(live.paymentSplit?.allowance || 0);
    if (allowancePortion > 0 && live.customerUid && live.customerUid !== 'walk_in') {
      const usageRef = doc(db, 'allowanceUsage', `${live.customerUid}_${dailyDate}`);
      const usageSnap = await tx.get(usageRef);
      if (usageSnap.exists()) {
        const curReserved = Number(usageSnap.data().reserved || 0);
        tx.update(usageRef, {
          reserved: Math.max(0, curReserved - allowancePortion),
          updatedAt: serverTimestamp(),
        });
      }
    }

    tx.update(orderRef, {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
  });
}

function formatCallableError(err: unknown, fallback: string): Error {
  const code = typeof (err as { code?: unknown })?.code === 'string' ? (err as { code: string }).code : '';
  const msg = err instanceof Error ? err.message : fallback;
  if (code === 'functions/not-found' || msg.includes('NOT_FOUND') || msg.includes('Failed to fetch')) {
    return new Error(
      'Live M-Pesa Cloud Function (initiateStkPush) is not deployed or unreachable yet. Deploy functions to jawaka-project (europe-west1) with your Safaricom Daraja secrets.'
    );
  }
  return new Error(msg || fallback);
}

export async function queryStkStatusFallback(
  checkoutRequestId: string
): Promise<{ status: string; message?: string }> {
  try {
    const callable = httpsCallable<
      { checkoutRequestId: string },
      { status: string; message?: string }
    >(functions, 'queryStkStatus');
    const res = await callable({ checkoutRequestId });
    return res.data;
  } catch (err) {
    throw formatCallableError(err, 'Could not verify M-Pesa payment status.');
  }
}

export async function triggerStkPush(params: {
  orderId: string;
  phone: string;
  mpesaSettings: MpesaSettings;
  extraAmountOnly?: number;
}): Promise<string> {
  const { orderId, phone, mpesaSettings, extraAmountOnly } = params;
  const normalizedPhone = normalizeKenyanPhone(phone);

  if (mpesaSettings.env === 'sandbox' || mpesaSettings.env === 'production') {
    try {
      const callable = httpsCallable<
        { orderId: string; phone: string; extraAmountOnly?: number },
        { checkoutRequestId: string }
      >(functions, 'initiateStkPush');
      const result = await callable({ orderId, phone: normalizedPhone, extraAmountOnly });
      return result.data.checkoutRequestId;
    } catch (err) {
      throw formatCallableError(err, 'Failed to trigger M-Pesa STK Push.');
    }
  }

  // Mock mode (runs end-to-end against Firestore before Cloud Functions/Daraja credentials exist)
  const checkoutRequestId = `MOCK_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    await runTransaction(db, async (tx) => {
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists()) throw new Error('Order not found.');
      const order = orderSnap.data() as Order;

      // Recompute server-style amount from order doc
      const mpesaAmount =
        typeof extraAmountOnly === 'number' && extraAmountOnly > 0
          ? Math.ceil(extraAmountOnly)
          : Math.max(0, Math.ceil(order.totalAmount - order.paymentSplit.allowance - order.paymentSplit.cash));

      const now = Timestamp.now();
      const expiresAt = Timestamp.fromMillis(now.toMillis() + 2 * 60 * 1000);

      tx.set(doc(db, 'payments', checkoutRequestId), {
        checkoutRequestId,
        orderId,
        orderNumber: order.orderNumber || 'PENDING',
        customerUid: order.customerUid,
        amount: mpesaAmount,
        phone: normalizedPhone,
        env: 'mock',
        status: 'pending',
        expiresAt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.update(orderRef, {
        mpesaCheckoutRequestId: checkoutRequestId,
        phone: normalizedPhone,
        updatedAt: serverTimestamp(),
      });
    });

    return checkoutRequestId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'payments');
  }
}

export async function settleMockStkPayment(params: {
  checkoutRequestId: string;
  outcome: 'success' | 'fail' | 'timeout';
}) {
  const { checkoutRequestId, outcome } = params;
  const paymentRef = doc(db, 'payments', checkoutRequestId);

  try {
    await runTransaction(db, async (tx) => {
      const paymentSnap = await tx.get(paymentRef);
      if (!paymentSnap.exists()) return;
      const payment = paymentSnap.data();
      if (payment.status !== 'pending') return; // Idempotent!

      const orderRef = doc(db, 'orders', payment.orderId);
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists()) return;
      const order = orderSnap.data() as Order;
      const dailyDate = order.dailyDate || getNairobiDateString();

      if (outcome === 'success') {
        const counterRef = doc(db, 'dailyCounters', dailyDate);
        const counterSnap = await tx.get(counterRef);
        const prevSeq = counterSnap.exists() ? Number(counterSnap.data().lastOrderSeq || 0) : 0;
        const nextSeq = order.orderSeq > 0 ? order.orderSeq : prevSeq + 1;
        const orderNumber =
          order.orderSeq > 0 ? order.orderNumber : `#${String(nextSeq).padStart(3, '0')}`;

        if (order.orderSeq === 0) {
          tx.set(
            counterRef,
            { date: dailyDate, lastOrderSeq: nextSeq, updatedAt: serverTimestamp() },
            { merge: true }
          );
        }

        // Confirm reserved allowance if order was pending_payment
        const allowancePortion = Number(order.paymentSplit?.allowance || 0);
        if (
          allowancePortion > 0 &&
          order.customerUid !== 'walk_in' &&
          order.status === 'pending_payment'
        ) {
          const usageRef = doc(db, 'allowanceUsage', `${order.customerUid}_${dailyDate}`);
          const usageSnap = await tx.get(usageRef);
          if (usageSnap.exists()) {
            const u = usageSnap.data();
            const newReserved = Math.max(0, Number(u.reserved || 0) - allowancePortion);
            const newUsed = Number(u.used || 0) + allowancePortion;
            tx.update(usageRef, {
              reserved: newReserved,
              used: newUsed,
              updatedAt: serverTimestamp(),
            });
          }
        }

        const mockReceipt = `TJ${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

        tx.update(paymentRef, {
          status: 'completed',
          mpesaReceiptNumber: mockReceipt,
          resultCode: 0,
          resultDesc: 'The service request is processed successfully.',
          updatedAt: serverTimestamp(),
        });

        tx.update(orderRef, {
          orderNumber,
          orderSeq: nextSeq,
          status: 'paid',
          mpesaReceiptNumber: mockReceipt,
          mpesaCheckoutRequestId: checkoutRequestId,
          paidAt: order.paidAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        tx.set(doc(db, 'boardOrders', order.id), {
          orderId: order.id,
          orderNumber,
          dailyDate,
          status: 'paid',
          paidAtMillis: Date.now(),
          updatedAt: serverTimestamp(),
        });
      } else {
        // Release reserved allowance if pending_payment
        const allowancePortion = Number(order.paymentSplit?.allowance || 0);
        if (
          allowancePortion > 0 &&
          order.customerUid !== 'walk_in' &&
          order.status === 'pending_payment'
        ) {
          const usageRef = doc(db, 'allowanceUsage', `${order.customerUid}_${dailyDate}`);
          const usageSnap = await tx.get(usageRef);
          if (usageSnap.exists()) {
            const u = usageSnap.data();
            const newReserved = Math.max(0, Number(u.reserved || 0) - allowancePortion);
            tx.update(usageRef, { reserved: newReserved, updatedAt: serverTimestamp() });
          }
        }

        tx.update(paymentRef, {
          status: outcome === 'timeout' ? 'timeout' : 'failed',
          resultCode: outcome === 'timeout' ? 1037 : 1032,
          resultDesc:
            outcome === 'timeout'
              ? 'DS timeout user cannot be reached.'
              : 'Request cancelled by user.',
          updatedAt: serverTimestamp(),
        });

        if (order.status === 'pending_payment') {
          tx.update(orderRef, {
            status: 'cancelled',
            updatedAt: serverTimestamp(),
          });
        }
      }
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `payments/${checkoutRequestId}`);
  }
}

export async function retryFailedOrderPayment(params: {
  order: Order;
  phone: string;
  cafeteriaSettings: CafeteriaSettings;
  mpesaSettings: MpesaSettings;
}): Promise<string> {
  const { order, phone, cafeteriaSettings, mpesaSettings } = params;
  const normalizedPhone = normalizeKenyanPhone(phone);

  const today = getNairobiDateString();
  const usageRef = doc(db, 'allowanceUsage', `${order.customerUid}_${today}`);

  // Re-reserve allowance if the order had timed out/cancelled and user hits Retry
  try {
    await runTransaction(db, async (tx) => {
      const orderSnap = await tx.get(doc(db, 'orders', order.id));
      if (!orderSnap.exists()) throw new Error('Order not found.');
      const liveOrder = orderSnap.data() as Order;
      if (liveOrder.status === 'cancelled' && liveOrder.orderSeq > 0) {
        throw new Error('Cancelled orders that were already ticketed cannot be retried.');
      }
      let allowancePortion = liveOrder.paymentSplit.allowance;

      if (liveOrder.status === 'cancelled' && allowancePortion > 0 && liveOrder.customerUid !== 'walk_in') {
        const usageSnap = await tx.get(usageRef);
        const dailyLimit = Number(cafeteriaSettings.dailyAllowance ?? 350);
        const currentUsed = usageSnap.exists() ? Number(usageSnap.data().used || 0) : 0;
        const currentReserved = usageSnap.exists() ? Number(usageSnap.data().reserved || 0) : 0;
        const remaining = Math.max(0, dailyLimit - currentUsed - currentReserved);
        allowancePortion = Math.min(remaining, liveOrder.totalAmount);
        if (allowancePortion > 0) {
          tx.set(usageRef, {
            uid: liveOrder.customerUid,
            date: today,
            used: currentUsed,
            reserved: currentReserved + allowancePortion,
            dailyLimit,
            updatedAt: serverTimestamp(),
          });
        }
      }

      const mpesaDue = Math.max(0, liveOrder.totalAmount - allowancePortion - liveOrder.paymentSplit.cash);
      tx.update(doc(db, 'orders', order.id), {
        status: 'pending_payment',
        paymentSplit: {
          allowance: allowancePortion,
          mpesa: mpesaDue,
          cash: liveOrder.paymentSplit.cash,
        },
        phone: normalizedPhone,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message === 'Order not found.' ||
        err.message.startsWith('Cancelled orders') ||
        err.message.startsWith('{'))
    ) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `orders/${order.id}`);
  }

  return triggerStkPush({ orderId: order.id, phone: normalizedPhone, mpesaSettings });
}

export async function toggleMenuSoldOut(params: {
  item: MenuItem;
  soldOut: boolean;
  actor: UserProfile;
}) {
  const { item, soldOut, actor } = params;
  const today = getNairobiDateString();

  try {
    await updateDoc(doc(db, 'menuItems', item.id), {
      soldOut,
      soldOutBy: actor.displayName,
      soldOutAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await logAudit({
      action: soldOut ? 'MENU_SOLD_OUT' : 'MENU_AVAILABLE',
      actor,
      targetType: 'menuItems',
      targetId: item.id,
      details: `${item.name} marked ${soldOut ? 'SOLD OUT' : 'AVAILABLE'} by ${actor.displayName}.`,
    });

    if (soldOut) {
      const paidSnap = await getDocs(
        query(
          collection(db, 'orders'),
          where('dailyDate', '==', today),
          where('status', '==', 'paid')
        )
      );

      for (const orderDoc of paidSnap.docs) {
        const order = orderDoc.data() as Order;
        const matchingItems = order.items.filter(
          (i) => i.itemId === item.id && !i.removedSoldOut
        );
        if (matchingItems.length === 0) continue;

        const qtyAffected = matchingItems.reduce((sum, i) => sum + i.quantity, 0);
        await runTransaction(db, async (tx) => {
          const freshSnap = await tx.get(orderDoc.ref);
          if (!freshSnap.exists()) return;
          const fresh = freshSnap.data() as Order;
          if (fresh.status !== 'paid') return;

          const existingAttention = fresh.needsAttentionItems || [];
          const nextAttention = [
            ...existingAttention,
            {
              itemId: item.id,
              itemName: item.name,
              originalPrice: item.price,
              quantity: qtyAffected,
            },
          ];

          tx.update(orderDoc.ref, {
            status: 'needs_attention',
            needsAttentionItems: nextAttention,
            needsAttentionAt: fresh.needsAttentionAt || serverTimestamp(),
            escalatedToCashier: false,
            updatedAt: serverTimestamp(),
          });

          tx.set(
            doc(db, 'boardOrders', fresh.id),
            {
              orderId: fresh.id,
              orderNumber: fresh.orderNumber,
              dailyDate: fresh.dailyDate,
              status: 'needs_attention',
              paidAtMillis:
                fresh.paidAt && typeof (fresh.paidAt as Timestamp).toMillis === 'function'
                  ? (fresh.paidAt as Timestamp).toMillis()
                  : Date.now(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `menuItems/${item.id}`);
  }
}

export async function advanceOrderStatus(
  order: Order,
  nextStatus: 'preparing' | 'ready' | 'served'
) {
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'orders', order.id);
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      tx.update(ref, {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      tx.set(
        doc(db, 'boardOrders', order.id),
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          dailyDate: order.dailyDate,
          status: nextStatus,
          paidAtMillis:
            order.paidAt && typeof (order.paidAt as Timestamp).toMillis === 'function'
              ? (order.paidAt as Timestamp).toMillis()
              : Date.now(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
  }
}

export async function resolveReplacement(params: {
  order: Order;
  removedItemId: string;
  replacementItem: MenuItem;
  cafeteriaSettings: CafeteriaSettings;
  mpesaSettings: MpesaSettings;
  actor: UserProfile;
  extraPaymentChannel?: 'mpesa_stk' | 'cash';
  phoneInput?: string;
}): Promise<{ extraMpesaDue: number; checkoutRequestId?: string; cashBackAdded: number }> {
  const {
    order,
    removedItemId,
    replacementItem,
    cafeteriaSettings,
    mpesaSettings,
    actor,
    extraPaymentChannel = 'mpesa_stk',
    phoneInput,
  } = params;

  const today = order.dailyDate || getNairobiDateString();
  let extraMpesaDue = 0;
  let cashBackAdded = 0;
  let resolvedPhoneForStk: string | undefined;

  try {
    await runTransaction(db, async (tx) => {
      const orderRef = doc(db, 'orders', order.id);
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists()) throw new Error('Order not found.');
      const liveOrder = orderSnap.data() as Order;
      if (liveOrder.status !== 'needs_attention') {
        throw new Error('Order is no longer awaiting replacement.');
      }

      const menuSnap = await tx.get(doc(db, 'menuItems', replacementItem.id));
      if (!menuSnap.exists()) throw new Error('Replacement item not found.');
      const liveRep = menuSnap.data() as MenuItem;
      if (!liveRep.active || liveRep.soldOut) {
        throw new Error(`${liveRep.name} is sold out. Please pick another dish.`);
      }

      const attentionList = liveOrder.needsAttentionItems || [];
      const targetAttention = attentionList.find((a) => a.itemId === removedItemId);
      if (!targetAttention) throw new Error('Sold-out item already resolved.');

      const qty = targetAttention.quantity;
      const oldLineTotal = targetAttention.originalPrice * qty;
      const newLineTotal = liveRep.price * qty;
      const diff = newLineTotal - oldLineTotal;

      // Enforce M-Pesa non-refund rule: M-Pesa (alone or with allowance) cannot pick cheaper item
      if (liveOrder.paymentSplit.mpesa > 0 && diff < 0) {
        throw new Error(
          'Orders paid with M-Pesa require a replacement of the same or higher price (no M-Pesa refunds).'
        );
      }

      let nextAllowance = liveOrder.paymentSplit.allowance;
      let nextMpesa = liveOrder.paymentSplit.mpesa;
      let nextCash = liveOrder.paymentSplit.cash;
      let nextCashBackDue = liveOrder.cashBackDue || 0;

      const usageRef = doc(db, 'allowanceUsage', `${liveOrder.customerUid}_${today}`);
      const usageSnap =
        liveOrder.customerUid !== 'walk_in' ? await tx.get(usageRef) : null;
      const dailyLimit = Number(cafeteriaSettings.dailyAllowance ?? 350);
      const currentUsed = usageSnap && usageSnap.exists() ? Number(usageSnap.data().used || 0) : 0;
      const currentReserved =
        usageSnap && usageSnap.exists() ? Number(usageSnap.data().reserved || 0) : 0;

      if (diff < 0) {
        const credit = Math.abs(diff);
        if (nextAllowance > 0 && nextCash > 0) {
          // Allowance + Cash: restore allowance first (never above allowance part), rest as cash back
          const restoreAllowance = Math.min(nextAllowance, credit);
          const cashBack = credit - restoreAllowance;
          nextAllowance -= restoreAllowance;
          nextCash = Math.max(0, nextCash - cashBack);
          nextCashBackDue += cashBack;
          cashBackAdded = cashBack;
          if (restoreAllowance > 0 && usageSnap?.exists()) {
            tx.update(usageRef, {
              used: Math.max(0, currentUsed - restoreAllowance),
              updatedAt: serverTimestamp(),
            });
          }
        } else if (nextAllowance > 0) {
          // Allowance only: restore difference to allowance
          const restoreAllowance = Math.min(nextAllowance, credit);
          nextAllowance -= restoreAllowance;
          if (restoreAllowance > 0 && usageSnap?.exists()) {
            tx.update(usageRef, {
              used: Math.max(0, currentUsed - restoreAllowance),
              updatedAt: serverTimestamp(),
            });
          }
        } else if (nextCash > 0) {
          // Cash only: cash back due
          nextCash = Math.max(0, nextCash - credit);
          nextCashBackDue += credit;
          cashBackAdded = credit;
        }
      } else if (diff > 0) {
        // Extra to pay: allowance first, then M-Pesa or Cash
        let remainingExtra = diff;
        if (liveOrder.customerUid !== 'walk_in') {
          const userSnap = await tx.get(doc(db, 'users', liveOrder.customerUid));
          const isFullBoard = userSnap.exists() && userSnap.data().studentType === 'full_board';
          if (isFullBoard) {
            const availAllowance = Math.max(0, dailyLimit - currentUsed - currentReserved);
            const useExtraAllowance = Math.min(availAllowance, remainingExtra);
            if (useExtraAllowance > 0) {
              nextAllowance += useExtraAllowance;
              remainingExtra -= useExtraAllowance;
              tx.set(usageRef, {
                uid: liveOrder.customerUid,
                date: today,
                used: currentUsed + useExtraAllowance,
                reserved: currentReserved,
                dailyLimit,
                updatedAt: serverTimestamp(),
              });
            }
          }
        }

        if (remainingExtra > 0) {
          if (extraPaymentChannel === 'cash' && (actor.role === 'cashier' || actor.role === 'admin')) {
            nextCash += remainingExtra;
          } else {
            const rawPhone = (phoneInput || liveOrder.phone || '').trim();
            if (!rawPhone) {
              throw new Error('Phone number required to pay the price difference via M-Pesa.');
            }
            resolvedPhoneForStk = normalizeKenyanPhone(rawPhone);
            extraMpesaDue = remainingExtra;
            nextMpesa += remainingExtra;
          }
        }
      }

      // Swap item in items array
      const nextItems = liveOrder.items.map((it) => {
        if (it.itemId === removedItemId) {
          return {
            itemId: liveRep.id,
            name: liveRep.name,
            category: liveRep.category,
            price: liveRep.price,
            quantity: it.quantity,
            replacedFromItemId: removedItemId,
          };
        }
        return it;
      });

      const remainingAttention = attentionList.filter((a) => a.itemId !== removedItemId);
      const nextTotal = Math.max(0, liveOrder.totalAmount + diff);

      const resolvedStatus =
        extraMpesaDue > 0 || remainingAttention.length > 0 ? 'needs_attention' : 'paid';

      tx.update(orderRef, {
        items: nextItems,
        totalAmount: nextTotal,
        paymentSplit: { allowance: nextAllowance, mpesa: nextMpesa, cash: nextCash },
        ...(resolvedPhoneForStk ? { phone: resolvedPhoneForStk } : {}),
        cashBackDue: nextCashBackDue,
        needsAttentionItems: remainingAttention,
        status: resolvedStatus,
        updatedAt: serverTimestamp(),
      });

      tx.set(
        doc(db, 'boardOrders', liveOrder.id),
        {
          orderId: liveOrder.id,
          orderNumber: liveOrder.orderNumber,
          dailyDate: liveOrder.dailyDate,
          status: resolvedStatus,
          paidAtMillis:
            liveOrder.paidAt && typeof (liveOrder.paidAt as Timestamp).toMillis === 'function'
              ? (liveOrder.paidAt as Timestamp).toMillis()
              : Date.now(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });

    await logAudit({
      action: 'REPLACEMENT_SELECTED',
      actor,
      targetType: 'orders',
      targetId: order.id,
      details: `Order ${order.orderNumber}: replaced item with ${replacementItem.name} (${replacementItem.price} KSh).`,
    });

    if (extraMpesaDue > 0 && resolvedPhoneForStk) {
      const checkoutRequestId = await triggerStkPush({
        orderId: order.id,
        phone: resolvedPhoneForStk,
        mpesaSettings,
        extraAmountOnly: extraMpesaDue,
      });
      return { extraMpesaDue, checkoutRequestId, cashBackAdded };
    }

    return { extraMpesaDue: 0, cashBackAdded };
  } catch (err) {
    if (err instanceof Error && !err.message.startsWith('{')) throw err;
    handleFirestoreError(err, OperationType.WRITE, `orders/${order.id}`);
  }
}

export async function cancelOrderBeforePreparing(order: Order, actor: UserProfile) {
  const today = order.dailyDate || getNairobiDateString();
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'orders', order.id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Order not found.');
      const live = snap.data() as Order;
      if (!['paid', 'needs_attention', 'pending_payment'].includes(live.status)) {
        throw new Error('Orders already preparing or ready cannot be cancelled.');
      }

      if (live.customerUid !== 'walk_in' && live.paymentSplit.allowance > 0) {
        const usageRef = doc(db, 'allowanceUsage', `${live.customerUid}_${today}`);
        const usageSnap = await tx.get(usageRef);
        if (usageSnap.exists()) {
          const u = usageSnap.data();
          const newUsed =
            live.status === 'pending_payment'
              ? Number(u.used || 0)
              : Math.max(0, Number(u.used || 0) - live.paymentSplit.allowance);
          const newReserved =
            live.status === 'pending_payment'
              ? Math.max(0, Number(u.reserved || 0) - live.paymentSplit.allowance)
              : Number(u.reserved || 0);
          tx.update(usageRef, {
            used: newUsed,
            reserved: newReserved,
            updatedAt: serverTimestamp(),
          });
        }
      }

      const cashRefund = live.status === 'pending_payment' ? 0 : live.paymentSplit.cash;
      const mpesaFlag = live.status === 'pending_payment' ? false : live.paymentSplit.mpesa > 0;

      tx.update(ref, {
        status: 'cancelled',
        cashBackDue: (live.cashBackDue || 0) + cashRefund,
        mpesaRefundFlag: mpesaFlag,
        needsAttentionItems: [],
        updatedAt: serverTimestamp(),
      });

      if (live.orderSeq > 0) {
        tx.set(
          doc(db, 'boardOrders', live.id),
          {
            orderId: live.id,
            orderNumber: live.orderNumber,
            dailyDate: live.dailyDate,
            status: 'cancelled',
            paidAtMillis: Date.now(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    });

    await logAudit({
      action: 'ORDER_CANCELLED',
      actor,
      targetType: 'orders',
      targetId: order.id,
      details: `Order ${order.orderNumber} cancelled before preparation.`,
    });
  } catch (err) {
    if (err instanceof Error && !err.message.startsWith('{')) throw err;
    handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
  }
}

export async function removeOrderItemBeforePreparing(
  order: Order,
  itemIdToRemove: string,
  actor: UserProfile
) {
  const today = order.dailyDate || getNairobiDateString();
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'orders', order.id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Order not found.');
      const live = snap.data() as Order;
      if (live.status !== 'paid') {
        throw new Error('Only paid orders not yet preparing can be edited.');
      }
      if (live.items.length <= 1) {
        throw new Error('Use Cancel Order to remove the last remaining item.');
      }

      const removed = live.items.find((i) => i.itemId === itemIdToRemove);
      if (!removed) throw new Error('Item not found in order.');
      if (live.paymentSplit.mpesa > 0) {
        throw new Error('M-Pesa paid orders cannot be reduced (cancel order for admin review instead).');
      }

      const credit = removed.price * removed.quantity;
      let nextAllowance = live.paymentSplit.allowance;
      let nextCash = live.paymentSplit.cash;
      let nextCashBackDue = live.cashBackDue || 0;

      if (nextAllowance > 0 && nextCash > 0) {
        const restoreAll = Math.min(nextAllowance, credit);
        const cashBack = credit - restoreAll;
        nextAllowance -= restoreAll;
        nextCash = Math.max(0, nextCash - cashBack);
        nextCashBackDue += cashBack;
        if (restoreAll > 0 && live.customerUid !== 'walk_in') {
          const usageRef = doc(db, 'allowanceUsage', `${live.customerUid}_${today}`);
          const usageSnap = await tx.get(usageRef);
          if (usageSnap.exists()) {
            tx.update(usageRef, {
              used: Math.max(0, Number(usageSnap.data().used || 0) - restoreAll),
              updatedAt: serverTimestamp(),
            });
          }
        }
      } else if (nextAllowance > 0) {
        const restoreAll = Math.min(nextAllowance, credit);
        nextAllowance -= restoreAll;
        if (restoreAll > 0 && live.customerUid !== 'walk_in') {
          const usageRef = doc(db, 'allowanceUsage', `${live.customerUid}_${today}`);
          const usageSnap = await tx.get(usageRef);
          if (usageSnap.exists()) {
            tx.update(usageRef, {
              used: Math.max(0, Number(usageSnap.data().used || 0) - restoreAll),
              updatedAt: serverTimestamp(),
            });
          }
        }
      } else if (nextCash > 0) {
        nextCash = Math.max(0, nextCash - credit);
        nextCashBackDue += credit;
      }

      const nextItems = live.items.filter((i) => i.itemId !== itemIdToRemove);
      tx.update(ref, {
        items: nextItems,
        totalAmount: Math.max(0, live.totalAmount - credit),
        paymentSplit: { allowance: nextAllowance, mpesa: live.paymentSplit.mpesa, cash: nextCash },
        cashBackDue: nextCashBackDue,
        updatedAt: serverTimestamp(),
      });
    });

    await logAudit({
      action: 'ORDER_EDITED',
      actor,
      targetType: 'orders',
      targetId: order.id,
      details: `Removed item ${itemIdToRemove} from order ${order.orderNumber} before preparation.`,
    });
  } catch (err) {
    if (err instanceof Error && !err.message.startsWith('{')) throw err;
    handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
  }
}

export async function markCashBackPaid(order: Order, cashier: UserProfile) {
  try {
    await updateDoc(doc(db, 'orders', order.id), {
      cashBackPaid: true,
      cashBackPaidAt: serverTimestamp(),
      cashBackPaidBy: cashier.displayName,
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      action: 'CASHBACK_PAID',
      actor: cashier,
      targetType: 'orders',
      targetId: order.id,
      details: `Paid out KSh ${order.cashBackDue || 0} cash back for order ${order.orderNumber}.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
  }
}

export async function escalateOrderToCashier(orderId: string) {
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      escalatedToCashier: true,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
  }
}

export async function adminSaveMenuItem(
  item: {
    id?: string;
    name: string;
    category: MenuCategory;
    price: number;
    active: boolean;
    soldOut?: boolean;
    sortOrder: number;
  },
  admin: UserProfile
) {
  const cleanName = item.name.trim().slice(0, 100);
  if (!cleanName) throw new Error('Dish name is required.');
  const cleanPrice = Math.min(100000, Math.max(0, Math.round(Number(item.price) || 0)));

  const id =
    item.id ||
    `${item.category.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')}_${Date.now().toString(36)}`.slice(0, 120);
  try {
    await setDoc(
      doc(db, 'menuItems', id),
      {
        id,
        name: cleanName,
        category: item.category,
        price: cleanPrice,
        active: item.active,
        soldOut: Boolean(item.soldOut),
        sortOrder: Math.max(0, Math.round(item.sortOrder)),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    await logAudit({
      action: item.id ? 'MENU_UPDATED' : 'MENU_CREATED',
      actor: admin,
      targetType: 'menuItems',
      targetId: id,
      details: `${item.id ? 'Updated' : 'Created'} ${cleanName} (${item.category}) at KSh ${cleanPrice}.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `menuItems/${id}`);
  }
}

export async function adminDeleteMenuItem(item: MenuItem, admin: UserProfile) {
  try {
    await deleteDoc(doc(db, 'menuItems', item.id));
    await logAudit({
      action: 'MENU_DELETED',
      actor: admin,
      targetType: 'menuItems',
      targetId: item.id,
      details: `Deleted menu item ${item.name}.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `menuItems/${item.id}`);
  }
}

export async function adminUpdateCafeteriaSettings(
  settings: Omit<CafeteriaSettings, 'updatedAt'>,
  admin: UserProfile
) {
  try {
    await setDoc(doc(db, 'settings', 'cafeteria'), {
      ...settings,
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      action: 'SETTINGS_UPDATED',
      actor: admin,
      targetType: 'settings',
      targetId: 'cafeteria',
      details: `Hours ${settings.openTime}-${settings.closeTime} (cutoff ${settings.cutoffMinutesBeforeClose}m), daily allowance KSh ${settings.dailyAllowance}.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/cafeteria');
  }
}

export async function adminUpdateMpesaSettings(
  settings: Omit<MpesaSettings, 'updatedAt'>,
  admin: UserProfile
) {
  try {
    await setDoc(doc(db, 'settings', 'mpesa'), {
      ...settings,
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      action: 'MPESA_SETTINGS_UPDATED',
      actor: admin,
      targetType: 'settings',
      targetId: 'mpesa',
      details: `M-Pesa env=${settings.env}, till=${settings.tillNumber}, type=${settings.transactionType}.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/mpesa');
  }
}

export async function adminUpdateUserRole(
  targetUser: UserProfile,
  updates: {
    role: UserRole;
    studentType?: StudentType;
    studentNumber?: string;
    newPin?: string;
  },
  admin: UserProfile
) {
  try {
    const cleanStudentNo =
      updates.studentNumber !== undefined
        ? updates.studentNumber.trim().toUpperCase()
        : targetUser.studentNumber;
    const nextStudentType = updates.studentType || targetUser.studentType || 'full_board';
    const nextPinHash =
      updates.newPin && updates.newPin.trim().length >= 4
        ? await hashPin(updates.newPin.trim())
        : targetUser.pinHash;

    const payload: Record<string, unknown> = {
      role: updates.role,
      studentType: nextStudentType,
      updatedAt: serverTimestamp(),
    };
    if (cleanStudentNo) payload.studentNumber = cleanStudentNo;
    if (nextPinHash) payload.pinHash = nextPinHash;

    await updateDoc(doc(db, 'users', targetUser.uid), payload);

    if (cleanStudentNo && nextPinHash) {
      const lookupId = sanitizeLookupId(cleanStudentNo);
      await setDoc(doc(db, 'studentLookup', lookupId), {
        uid: targetUser.uid,
        studentNumber: cleanStudentNo,
        displayName: targetUser.displayName,
        studentType: nextStudentType,
        pinHash: nextPinHash,
        updatedAt: serverTimestamp(),
      });
    }

    await logAudit({
      action: 'ROLE_UPDATED',
      actor: admin,
      targetType: 'users',
      targetId: targetUser.uid,
      details: `${targetUser.displayName} updated -> role=${updates.role}, plan=${nextStudentType}${
        cleanStudentNo ? `, student#=${cleanStudentNo}` : ''
      }.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${targetUser.uid}`);
  }
}

export async function adminResetStudentAllowance(
  targetUser: UserProfile,
  dailyLimit: number,
  admin: UserProfile
) {
  const today = getNairobiDateString();
  const usageId = `${targetUser.uid}_${today}`;
  try {
    await setDoc(doc(db, 'allowanceUsage', usageId), {
      uid: targetUser.uid,
      date: today,
      used: 0,
      reserved: 0,
      dailyLimit,
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      action: 'ALLOWANCE_RESET',
      actor: admin,
      targetType: 'allowanceUsage',
      targetId: usageId,
      details: `Reset today's full-board allowance (KSh ${dailyLimit}) for ${targetUser.displayName}.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `allowanceUsage/${usageId}`);
  }
}

