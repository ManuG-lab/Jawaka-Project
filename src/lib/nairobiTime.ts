import { CafeteriaSettings } from '../types';

export const NAIROBI_TZ = 'Africa/Nairobi';

export function getNairobiDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: NAIROBI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export function getNairobiMinutesSinceMidnight(date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: NAIROBI_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

export function formatNairobiTime(ts: unknown): string {
  if (!ts) return '—';
  let date: Date | null = null;
  if (ts instanceof Date) {
    date = ts;
  } else if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    date = (ts as { toDate: () => Date }).toDate();
  } else if (typeof ts === 'number') {
    date = new Date(ts);
  }
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-KE', {
    timeZone: NAIROBI_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function toMillis(ts: unknown): number {
  if (!ts) return 0;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'object' && ts !== null && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function isCafeteriaOpenForOrders(settings: CafeteriaSettings, now = new Date()): {
  open: boolean;
  reason?: string;
  currentMinutes: number;
  lastOrderTime: string;
} {
  const currentMinutes = getNairobiMinutesSinceMidnight(now);
  const openMin = parseHHMM(settings.openTime || '06:30');
  const closeMin = parseHHMM(settings.closeTime || '20:45');
  const cutoff = Number(settings.cutoffMinutesBeforeClose ?? 15);
  const lastOrderMin = Math.max(openMin, closeMin - cutoff);

  const lastH = String(Math.floor(lastOrderMin / 60)).padStart(2, '0');
  const lastM = String(lastOrderMin % 60).padStart(2, '0');
  const lastOrderTime = `${lastH}:${lastM}`;

  if (currentMinutes < openMin) {
    return {
      open: false,
      reason: `Cafeteria opens at ${settings.openTime} EAT.`,
      currentMinutes,
      lastOrderTime,
    };
  }
  if (currentMinutes > lastOrderMin) {
    return {
      open: false,
      reason: `Ordering closed at ${lastOrderTime} EAT (${cutoff} min before ${settings.closeTime} closing).`,
      currentMinutes,
      lastOrderTime,
    };
  }
  return { open: true, currentMinutes, lastOrderTime };
}

export function normalizeKenyanPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  throw new Error('Enter a valid Kenyan phone number (e.g. 0712 345 678).');
}

export async function hashPin(pin: string): Promise<string> {
  const clean = pin.trim();
  const encoder = new TextEncoder();
  const data = encoder.encode(`jawaka_pin_${clean}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

export function formatKSh(amount: number): string {
  return `KSh ${Math.round(amount).toLocaleString('en-KE')}`;
}
