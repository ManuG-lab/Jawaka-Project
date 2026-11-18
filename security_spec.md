# Jawaka Catering — Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Role Integrity**: No user may assign themselves `cashier`, `kitchen`, or `admin` during profile creation. Self-registration is strictly locked to `role == 'student'` unless performed by a verified `admin` (including bootstrapped admin `gmannu2055@gmail.com`).
2. **PII Isolation**: `users/{uid}` contains `email`, `phone`, and `studentNumber`; only the owning user, `cashier` (for walk-up lookup), or `admin` may read it. The public `/board` view reads exclusively from `boardOrders/{orderId}`, which contains zero PII.
3. **Order Ownership & Queue Integrity**: Students may only create orders with `customerUid == request.auth.uid`, `entryPoint == 'student_app'`, and cannot tamper with another student's order. Only `kitchen`, `cashier`, or `admin` may advance orders to `preparing`, `ready`, or `served`.
4. **Menu & Settings Protection**: Only `admin` may create/delete menu items or modify `settings/*`. `kitchen` staff may only toggle `soldOut`, `soldOutBy`, `soldOutAt`, `updatedAt` on `menuItems/*`.
5. **Audit Immutability**: `auditLogs` are append-only; updates and deletes are strictly forbidden.
6. **Strict Validation & Timestamps**: Every create validates `createdAt == request.time`, every update validates `updatedAt == request.time`, every string validates `.size()`, and every ID validates `^[a-zA-Z0-9_\-]+$`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Self-Admin Escalation**: `POST /users/attacker` with `role: 'admin'`. -> `PERMISSION_DENIED`
2. **Unverified Email Admin Spoof**: `email: 'gmannu2055@gmail.com'` with `email_verified: false`. -> `PERMISSION_DENIED`
3. **PII Cross-Student Read**: Student A attempts `GET /users/studentB`. -> `PERMISSION_DENIED`
4. **Ghost Field Injection on Order**: Student creates order with extra key `isAdminOverride: true`. -> `PERMISSION_DENIED`
5. **Identity Spoofing on Order**: Student A creates order with `customerUid: 'studentB'`. -> `PERMISSION_DENIED`
6. **Student Skipping Status to Ready**: Student updates their own order `status: 'ready'`. -> `PERMISSION_DENIED`
7. **Kitchen Price Tampering**: Kitchen updates `menuItems/ugali` changing `price: 1` instead of `soldOut`. -> `PERMISSION_DENIED`
8. **Student Editing Allowance Usage Directly for Another UID**: Student A writes `allowanceUsage/studentB_2026-11-18`. -> `PERMISSION_DENIED`
9. **Audit Log Deletion / Tampering**: Cashier or Student attempts `DELETE /auditLogs/log1` or `UPDATE /auditLogs/log1`. -> `PERMISSION_DENIED`
10. **Terminal State Mutation**: Student attempts to edit an order whose `status` is `'served'` or `'cancelled'`. -> `PERMISSION_DENIED`
11. **Oversized ID Poisoning**: Client writes `/orders/aaa...(1500 chars)...`. -> `PERMISSION_DENIED`
12. **Client-Side Timestamp Forgery**: Client creates an order with `createdAt` set to yesterday instead of `request.time`. -> `PERMISSION_DENIED`
