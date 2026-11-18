import * as crypto from 'node:crypto';
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, Firestore, Timestamp } from 'firebase-admin/firestore';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';

if (!getApps().length) {
  initializeApp();
}

const MPESA_CONSUMER_KEY = defineSecret('MPESA_CONSUMER_KEY');
const MPESA_CONSUMER_SECRET = defineSecret('MPESA_CONSUMER_SECRET');
const MPESA_PASSKEY = defineSecret('MPESA_PASSKEY');

const DEFAULT_SHORTCODE = '1334820';
const DEFAULT_TILL_NUMBER = '1804698';

const FIRESTORE_DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID || 'ai-studio-704d1da9-c7ca-41fc-9076-f027c78516a2';

function getDb(): Firestore {
  return getFirestore(getApp(), FIRESTORE_DATABASE_ID);
}

function getProjectId(): string {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;
  try {
    const cfg = JSON.parse(process.env.FIREBASE_CONFIG || '{}') as { projectId?: string };
    if (cfg.projectId) return cfg.projectId;
  } catch {
    // ignore invalid FIREBASE_CONFIG
  }
  return 'jawaka-project';
}

function deriveCallbackToken(passkey: string): string {
  const explicit = process.env.MPESA_CALLBACK_TOKEN?.trim();
  if (explicit) return explicit;
  return crypto
    .createHmac('sha256', passkey)
    .update(`${getProjectId()}:jawaka-mpesa-cb`)
    .digest('hex')
    .slice(0, 32);
}

function timingSafeMatch(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function getNairobiDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

function getDarajaTimestamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}${get('second')}`;
}

function normalizeKenyanPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  throw new HttpsError('invalid-argument', 'Phone must be a valid Kenyan mobile number (e.g. 0712345678).');
}

function buildAccountReference(orderNumber: unknown, orderId: string): string {
  const rawOrderNo = typeof orderNumber === 'string' ? orderNumber.trim() : '';
  const cleanedOrderNo = rawOrderNo.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (rawOrderNo && rawOrderNo !== 'PENDING' && cleanedOrderNo.length > 0) {
    return `JWK${cleanedOrderNo}`.slice(0, 12);
  }
  const cleanId = orderId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `JWK${cleanId.slice(0, 9)}`.slice(0, 12);
}

function getDarajaBaseUrl(env: string): string {
  return env === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

async function fetchDarajaToken(env: string): Promise<string> {
  const key = MPESA_CONSUMER_KEY.value().trim();
  const secret = MPESA_CONSUMER_SECRET.value().trim();
  if (!key || !secret) {
    throw new HttpsError('failed-precondition', 'Daraja consumer credentials are not configured in Firebase Secrets.');
  }
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const res = await fetch(`${getDarajaBaseUrl(env)}/oauth/v1/generate?grant_type=client_credentials`, {
    method: 'GET',
    headers: { Authorization: `Basic ${auth}` },
  });
  const rawBody = await res.text();
  if (!res.ok) {
    throw new HttpsError('unavailable', `Daraja OAuth failed (${res.status}): ${rawBody}`);
  }
  let data: { access_token?: string } = {};
  try {
    data = JSON.parse(rawBody) as { access_token?: string };
  } catch {
    throw new HttpsError('unavailable', 'Invalid JSON returned by Daraja OAuth endpoint.');
  }
  if (!data.access_token) {
    throw new HttpsError('unavailable', 'Daraja OAuth response missing access_token.');
  }
  return data.access_token;
}

async function settlePaymentTransaction(params: {
  db: Firestore;
  checkoutRequestId: string;
  resultCode: number;
  resultDesc: string;
  mpesaReceiptNumber?: string;
  paidAmount?: number;
}) {
  const { db, checkoutRequestId, resultCode, resultDesc, mpesaReceiptNumber, paidAmount } = params;
  const paymentRef = db.collection('payments').doc(checkoutRequestId);

  return db.runTransaction(async (tx) => {
    const paymentSnap = await tx.get(paymentRef);
    if (!paymentSnap.exists) {
      return { status: 'not_found' };
    }
    const payment = paymentSnap.data()!;
    // Idempotency guard: ignore duplicate callbacks once no longer pending
    if (payment.status !== 'pending') {
      return { status: 'already_settled', paymentStatus: payment.status };
    }

    const orderRef = db.collection('orders').doc(payment.orderId);
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) {
      return { status: 'order_missing' };
    }
    const order = orderSnap.data()!;
    const now = Timestamp.now();

    if (resultCode === 0) {
      if (typeof paidAmount === 'number' && !Number.isNaN(paidAmount) && Math.round(paidAmount) !== Math.round(payment.amount)) {
        tx.update(paymentRef, {
          status: 'failed',
          resultCode: 400,
          resultDesc: `Amount mismatch: expected ${payment.amount}, got ${paidAmount}`,
          updatedAt: now,
        });
        return { status: 'amount_mismatch' };
      }

      const dailyDate = order.dailyDate || getNairobiDateString();
      const counterRef = db.collection('dailyCounters').doc(dailyDate);
      const counterSnap = await tx.get(counterRef);
      const prevSeq = counterSnap.exists ? (counterSnap.data()!.lastOrderSeq as number) : 0;
      const nextSeq = order.orderSeq > 0 ? order.orderSeq : prevSeq + 1;
      const orderNumber =
        order.orderSeq > 0 ? order.orderNumber : `#${String(nextSeq).padStart(3, '0')}`;

      if (order.orderSeq === 0) {
        tx.set(
          counterRef,
          { date: dailyDate, lastOrderSeq: nextSeq, updatedAt: now },
          { merge: true }
        );
      }

      // Confirm reserved allowance if applicable
      const allowancePortion = Number(order.paymentSplit?.allowance || 0);
      if (allowancePortion > 0 && order.customerUid && order.customerUid !== 'walk_in' && order.status === 'pending_payment') {
        const usageRef = db.collection('allowanceUsage').doc(`${order.customerUid}_${dailyDate}`);
        const usageSnap = await tx.get(usageRef);
        if (usageSnap.exists) {
          const u = usageSnap.data()!;
          const newReserved = Math.max(0, Number(u.reserved || 0) - allowancePortion);
          const newUsed = Number(u.used || 0) + allowancePortion;
          tx.update(usageRef, { reserved: newReserved, used: newUsed, updatedAt: now });
        }
      }

      tx.update(paymentRef, {
        status: 'completed',
        mpesaReceiptNumber: mpesaReceiptNumber || '',
        resultCode: 0,
        resultDesc: resultDesc.slice(0, 240),
        updatedAt: now,
      });

      const nextStatus = 'paid';
      tx.update(orderRef, {
        orderNumber,
        orderSeq: nextSeq,
        status: nextStatus,
        mpesaReceiptNumber: mpesaReceiptNumber || '',
        mpesaCheckoutRequestId: checkoutRequestId,
        paidAt: order.paidAt || now,
        updatedAt: now,
      });

      tx.set(db.collection('boardOrders').doc(order.id), {
        orderId: order.id,
        orderNumber,
        dailyDate,
        status: nextStatus,
        paidAtMillis: order.paidAt ? order.paidAt.toMillis() : now.toMillis(),
        updatedAt: now,
      });

      return { status: 'completed', orderNumber };
    }

    // Failure or cancellation -> release reserved allowance if order was pending_payment
    const allowancePortion = Number(order.paymentSplit?.allowance || 0);
    if (allowancePortion > 0 && order.customerUid && order.customerUid !== 'walk_in' && order.status === 'pending_payment') {
      const dailyDate = order.dailyDate || getNairobiDateString();
      const usageRef = db.collection('allowanceUsage').doc(`${order.customerUid}_${dailyDate}`);
      const usageSnap = await tx.get(usageRef);
      if (usageSnap.exists) {
        const u = usageSnap.data()!;
        const newReserved = Math.max(0, Number(u.reserved || 0) - allowancePortion);
        tx.update(usageRef, { reserved: newReserved, updatedAt: now });
      }
    }

    tx.update(paymentRef, {
      status: resultCode === 1037 ? 'timeout' : 'failed',
      resultCode,
      resultDesc: resultDesc.slice(0, 240),
      updatedAt: now,
    });

    if (order.status === 'pending_payment') {
      tx.update(orderRef, {
        status: 'cancelled',
        updatedAt: now,
      });
    }

    return { status: resultCode === 1037 ? 'timeout' : 'failed', resultDesc };
  });
}

export const initiateStkPush = onCall(
  {
    region: 'europe-west1',
    cors: true,
    secrets: [MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_PASSKEY],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required to initiate M-Pesa payment.');
    }

    const { orderId, phone, extraAmountOnly } = (request.data || {}) as {
      orderId?: string;
      phone?: string;
      extraAmountOnly?: number;
    };

    if (!orderId || !phone) {
      throw new HttpsError('invalid-argument', 'orderId and phone are required.');
    }

    const db = getDb();
    const normalizedPhone = normalizeKenyanPhone(phone);

    const [orderSnap, mpesaSnap] = await Promise.all([
      db.collection('orders').doc(orderId).get(),
      db.collection('settings').doc('mpesa').get(),
    ]);

    if (!orderSnap.exists) {
      throw new HttpsError('not-found', 'Order not found.');
    }
    const order = orderSnap.data()!;
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerRole = callerSnap.exists ? callerSnap.data()!.role : 'student';
    const isStaff = callerRole === 'cashier' || callerRole === 'admin';

    if (order.customerUid !== request.auth.uid && !isStaff) {
      throw new HttpsError('permission-denied', 'Not authorized to pay for this order.');
    }

    // Server-side amount computation: never trust client amount
    const allowance = Number(order.paymentSplit?.allowance || 0);
    const cash = Number(order.paymentSplit?.cash || 0);
    const computedAmount =
      typeof extraAmountOnly === 'number' && extraAmountOnly > 0 && order.status === 'needs_attention'
        ? Math.ceil(extraAmountOnly)
        : Math.max(0, Math.ceil(Number(order.totalAmount) - allowance - cash));

    if (computedAmount <= 0) {
      throw new HttpsError('failed-precondition', 'No M-Pesa balance due on this order.');
    }
    const serverMpesaAmount = Math.max(1, computedAmount);

    const mpesaCfg = mpesaSnap.exists
      ? mpesaSnap.data()!
      : {
          env: 'production',
          tillNumber: DEFAULT_TILL_NUMBER,
          shortcode: DEFAULT_SHORTCODE,
          transactionType: 'CustomerBuyGoodsOnline',
          mockOutcome: 'success',
        };

    const env = String(mpesaCfg.env || 'production');
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(now.toMillis() + 2 * 60 * 1000);

    if (env === 'mock') {
      const checkoutRequestId = `MOCK_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await db.collection('payments').doc(checkoutRequestId).set({
        checkoutRequestId,
        orderId,
        orderNumber: order.orderNumber || 'PENDING',
        customerUid: order.customerUid,
        amount: serverMpesaAmount,
        phone: normalizedPhone,
        env: 'mock',
        status: 'pending',
        expiresAt,
        createdAt: now,
        updatedAt: now,
      });
      await db.collection('orders').doc(orderId).update({
        mpesaCheckoutRequestId: checkoutRequestId,
        phone: normalizedPhone,
        updatedAt: now,
      });
      return { checkoutRequestId, amount: serverMpesaAmount, env: 'mock' };
    }

    const shortcode = String(mpesaCfg.shortcode || DEFAULT_SHORTCODE).trim();
    const tillNumber = String(mpesaCfg.tillNumber || DEFAULT_TILL_NUMBER).trim();
    const transactionType = String(mpesaCfg.transactionType || 'CustomerBuyGoodsOnline').trim();
    const passkey = MPESA_PASSKEY.value().trim();
    if (!passkey) {
      throw new HttpsError('failed-precondition', 'Daraja MPESA_PASSKEY is not configured in Firebase Secrets.');
    }

    const projectId = getProjectId();
    const callbackToken = deriveCallbackToken(passkey);
    const callbackUrl = `https://europe-west1-${projectId}.cloudfunctions.net/mpesaCallback?token=${encodeURIComponent(
      callbackToken
    )}`;

    const timestamp = getDarajaTimestamp();
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    const token = await fetchDarajaToken(env);

    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: transactionType,
      Amount: serverMpesaAmount,
      PartyA: normalizedPhone,
      PartyB: transactionType === 'CustomerBuyGoodsOnline' ? tillNumber : shortcode,
      PhoneNumber: normalizedPhone,
      CallBackURL: callbackUrl,
      AccountReference: buildAccountReference(order.orderNumber, orderId),
      TransactionDesc: 'Jawaka Meal',
    };

    const stkRes = await fetch(`${getDarajaBaseUrl(env)}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const stkRaw = await stkRes.text();
    let stkJson: {
      CheckoutRequestID?: string;
      ResponseCode?: string;
      ResponseDescription?: string;
      errorMessage?: string;
    } = {};
    try {
      stkJson = JSON.parse(stkRaw) as typeof stkJson;
    } catch {
      throw new HttpsError('unavailable', `Daraja STK response invalid (${stkRes.status}): ${stkRaw}`);
    }

    if (!stkRes.ok || stkJson.ResponseCode !== '0' || !stkJson.CheckoutRequestID) {
      throw new HttpsError(
        'unavailable',
        stkJson.errorMessage || stkJson.ResponseDescription || `Daraja STK Push failed (${stkRes.status}).`
      );
    }

    const checkoutRequestId = stkJson.CheckoutRequestID;
    await db.collection('payments').doc(checkoutRequestId).set({
      checkoutRequestId,
      orderId,
      orderNumber: order.orderNumber || 'PENDING',
      customerUid: order.customerUid,
      amount: serverMpesaAmount,
      phone: normalizedPhone,
      env,
      status: 'pending',
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    await db.collection('orders').doc(orderId).update({
      mpesaCheckoutRequestId: checkoutRequestId,
      phone: normalizedPhone,
      updatedAt: now,
    });

    return { checkoutRequestId, amount: serverMpesaAmount, env };
  }
);

export const mpesaCallback = onRequest(
  {
    region: 'europe-west1',
    secrets: [MPESA_PASSKEY],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const tokenParam = String(req.query.token || '');
    const expectedToken = deriveCallbackToken(MPESA_PASSKEY.value().trim());
    if (!expectedToken || !timingSafeMatch(tokenParam, expectedToken)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const stkCallback = req.body?.Body?.stkCallback;
    if (!stkCallback || typeof stkCallback.CheckoutRequestID !== 'string') {
      res.status(400).json({ error: 'Invalid callback payload' });
      return;
    }

    const checkoutRequestId = stkCallback.CheckoutRequestID as string;
    const resultCode = Number(stkCallback.ResultCode);
    const resultDesc = String(stkCallback.ResultDesc || 'Processed');

    let mpesaReceiptNumber = '';
    let paidAmount: number | undefined;
    const items = Array.isArray(stkCallback.CallbackMetadata?.Item)
      ? stkCallback.CallbackMetadata.Item
      : [];

    for (const item of items) {
      if (item.Name === 'MpesaReceiptNumber' && item.Value) {
        mpesaReceiptNumber = String(item.Value);
      }
      if (item.Name === 'Amount' && item.Value !== undefined) {
        paidAmount = Number(item.Value);
      }
    }

    const db = getDb();
    const outcome = await settlePaymentTransaction({
      db,
      checkoutRequestId,
      resultCode,
      resultDesc,
      mpesaReceiptNumber,
      paidAmount,
    });

    res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted', outcome });
  }
);

export const queryStkStatus = onCall(
  {
    region: 'europe-west1',
    cors: true,
    secrets: [MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_PASSKEY],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required.');
    }
    const { checkoutRequestId } = (request.data || {}) as { checkoutRequestId?: string };
    if (!checkoutRequestId) {
      throw new HttpsError('invalid-argument', 'checkoutRequestId required.');
    }

    const db = getDb();
    const paymentSnap = await db.collection('payments').doc(checkoutRequestId).get();
    if (!paymentSnap.exists) {
      throw new HttpsError('not-found', 'Payment not found.');
    }
    const payment = paymentSnap.data()!;

    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerRole = callerSnap.exists ? callerSnap.data()!.role : 'student';
    const isStaff = callerRole === 'cashier' || callerRole === 'admin';
    if (payment.customerUid !== request.auth.uid && !isStaff) {
      throw new HttpsError('permission-denied', 'Not authorized to query this payment.');
    }

    if (payment.status !== 'pending') {
      return { status: payment.status };
    }

    if (payment.env === 'mock') {
      return settlePaymentTransaction({
        db,
        checkoutRequestId,
        resultCode: 1037,
        resultDesc: 'STK Push timed out awaiting customer PIN.',
      });
    }

    const mpesaSnap = await db.collection('settings').doc('mpesa').get();
    const shortcode = String(mpesaSnap.data()?.shortcode || DEFAULT_SHORTCODE).trim();
    const passkey = MPESA_PASSKEY.value().trim();
    const timestamp = getDarajaTimestamp();
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    const token = await fetchDarajaToken(payment.env);

    const qRes = await fetch(`${getDarajaBaseUrl(payment.env)}/mpesa/stkpushquery/v1/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      }),
    });

    const qRaw = await qRes.text();
    let qJson: {
      ResultCode?: string | number;
      ResultDesc?: string;
      errorCode?: string;
      errorMessage?: string;
    } = {};
    try {
      qJson = JSON.parse(qRaw) as typeof qJson;
    } catch {
      return { status: 'pending', message: 'Awaiting Safaricom confirmation...' };
    }

    const hasResultCode =
      qJson.ResultCode !== undefined &&
      qJson.ResultCode !== null &&
      String(qJson.ResultCode).trim() !== '';

    if (!hasResultCode) {
      // e.g. Daraja returns 500.001.1001 "The transaction is being processed" while PIN modal is still active
      return {
        status: 'pending',
        message: qJson.errorMessage || 'Awaiting customer M-Pesa PIN confirmation on phone.',
      };
    }

    const code = Number(qJson.ResultCode);
    const desc = String(qJson.ResultDesc || 'Payment verified via STK Query');

    return settlePaymentTransaction({
      db,
      checkoutRequestId,
      resultCode: code,
      resultDesc: desc,
    });
  }
);

export const expireStalePayments = onSchedule(
  {
    schedule: 'every 1 minutes',
    region: 'europe-west1',
    secrets: [MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_PASSKEY],
  },
  async () => {
    const db = getDb();
    const now = Timestamp.now();
    const staleSnap = await db
      .collection('payments')
      .where('status', '==', 'pending')
      .where('expiresAt', '<=', now)
      .limit(25)
      .get();

    for (const docSnap of staleSnap.docs) {
      const payment = docSnap.data();
      if (payment.env === 'mock') {
        await settlePaymentTransaction({
          db,
          checkoutRequestId: docSnap.id,
          resultCode: 1037,
          resultDesc: 'Payment window expired (2 minutes).',
        });
        continue;
      }

      const pastGraceWindow =
        payment.expiresAt && typeof payment.expiresAt.toMillis === 'function'
          ? now.toMillis() - payment.expiresAt.toMillis() > 90_000
          : true;

      try {
        const mpesaSnap = await db.collection('settings').doc('mpesa').get();
        const shortcode = String(mpesaSnap.data()?.shortcode || DEFAULT_SHORTCODE).trim();
        const passkey = MPESA_PASSKEY.value().trim();
        const timestamp = getDarajaTimestamp();
        const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
        const token = await fetchDarajaToken(payment.env);

        const qRes = await fetch(`${getDarajaBaseUrl(payment.env)}/mpesa/stkpushquery/v1/query`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            BusinessShortCode: shortcode,
            Password: password,
            Timestamp: timestamp,
            CheckoutRequestID: docSnap.id,
          }),
        });
        const qJson = (await qRes.json()) as {
          ResultCode?: string | number;
          ResultDesc?: string;
        };

        const hasResultCode =
          qJson.ResultCode !== undefined &&
          qJson.ResultCode !== null &&
          String(qJson.ResultCode).trim() !== '';

        if (hasResultCode) {
          await settlePaymentTransaction({
            db,
            checkoutRequestId: docSnap.id,
            resultCode: Number(qJson.ResultCode),
            resultDesc: String(qJson.ResultDesc || 'Verified after STK window.'),
          });
        } else if (pastGraceWindow) {
          await settlePaymentTransaction({
            db,
            checkoutRequestId: docSnap.id,
            resultCode: 1037,
            resultDesc: 'Expired awaiting M-Pesa PIN confirmation.',
          });
        }
      } catch {
        if (pastGraceWindow) {
          await settlePaymentTransaction({
            db,
            checkoutRequestId: docSnap.id,
            resultCode: 1037,
            resultDesc: 'STK Query fallback expired.',
          });
        }
      }
    }

    // Also escalate needs_attention orders older than 5 minutes to cashier
    const fiveMinAgo = Timestamp.fromMillis(now.toMillis() - 5 * 60 * 1000);
    const attentionSnap = await db
      .collection('orders')
      .where('status', '==', 'needs_attention')
      .where('escalatedToCashier', '==', false)
      .where('needsAttentionAt', '<=', fiveMinAgo)
      .limit(25)
      .get();

    for (const orderDoc of attentionSnap.docs) {
      await orderDoc.ref.update({
        escalatedToCashier: true,
        updatedAt: now,
      });
    }
  }
);
