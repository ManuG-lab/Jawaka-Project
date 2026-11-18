# Jawaka Catering — Safaricom Daraja & Firebase Functions Guide

## Overview
Jawaka Catering uses Firebase Authentication, Cloud Firestore (`onSnapshot` real-time queues), and Firebase Cloud Functions (`functions/src/index.ts`, region `europe-west1`) for all Safaricom Daraja Lipa Na M-Pesa Online (STK Push) calls.

- **Live Production BuyGoods Configuration**:
  - `MPESA_ENV`: `production`
  - **Business Shortcode (Store / Head Office)**: `1334820`
  - **Till Number (`PartyB`)**: `1804698`
  - **Transaction Type**: `CustomerBuyGoodsOnline`
- **Currency & Timezone**: `KSh` and `Africa/Nairobi`.

---

## 1. Configure Firebase Secrets (Never in Client Code)
Ensure your Firebase project (`jawaka-project`) is on the **Blaze (Pay-as-you-go)** plan, then log in and store your 3 Safaricom Daraja credentials in Google Cloud Secret Manager via the Firebase CLI:

```bash
firebase login
firebase use jawaka-project

firebase functions:secrets:set MPESA_CONSUMER_KEY
firebase functions:secrets:set MPESA_CONSUMER_SECRET
firebase functions:secrets:set MPESA_PASSKEY
```

Callback verification uses a timing-safe HMAC token automatically derived from `MPESA_PASSKEY` and your Firebase project ID (no 4th manual secret required). Non-secret settings (`env`, `tillNumber`, `shortcode`, `transactionType`) are stored in Firestore at `settings/mpesa` and editable via **Admin -> Hours & M-Pesa**.

---

## 2. Deploy Cloud Functions with Firebase CLI
```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions,firestore:rules
```

After deploying, Firebase outputs the HTTPS URL for `mpesaCallback`:
```
https://europe-west1-jawaka-project.cloudfunctions.net/mpesaCallback
```

---

## 3. Activate Live Mode in Admin Dashboard
1. Open the Jawaka Catering app as Admin (`gmannu2055@gmail.com`).
2. Go to **Admin -> Hours & M-Pesa**.
3. Click **Activate Live Store (1334820 / 1804698)** (or confirm `MPESA_ENV = production`, `Shortcode = 1334820`, `Till Number = 1804698`, `Transaction Type = CustomerBuyGoodsOnline` and click **Save M-Pesa Settings**).
4. `initiateStkPush` automatically sends `CallBackURL` with your verified HMAC token to Safaricom, `queryStkStatus` allows live manual/polling status verification, and `expireStalePayments` checks pending STK requests every minute.
