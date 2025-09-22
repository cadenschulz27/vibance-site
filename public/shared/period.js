// public/shared/period.js
// ------------------------------------------------------------
// Period & date range helpers for budgeting / rollups
// Supported period types: 'monthly', 'weekly', 'custom'
// ------------------------------------------------------------

export function startOfDay(d) { const x = new Date(d); return new Date(x.getFullYear(), x.getMonth(), x.getDate(), 0,0,0,0); }
export function endOfDay(d) { const x = new Date(d); return new Date(x.getFullYear(), x.getMonth(), x.getDate(), 23,59,59,999); }

export function monthlyKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

export function weeklyKey(date = new Date()) {
  const d = new Date(date);
  // ISO week number
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7; // Mon=1..Sun=7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2,'0')}`;
}

export function customKey(startDate, endDate) {
  const s = new Date(startDate); const e = new Date(endDate);
  return `C${s.toISOString().slice(0,10)}_${e.toISOString().slice(0,10)}`;
}

export function periodKey(type, dateOrStart, maybeEnd) {
  if (type === 'monthly') return monthlyKey(dateOrStart);
  if (type === 'weekly') return weeklyKey(dateOrStart);
  if (type === 'custom') return customKey(dateOrStart, maybeEnd || dateOrStart);
  throw new Error(`Unsupported period type: ${type}`);
}

export function periodRangeFromKey(type, key) {
  if (type === 'monthly') {
    const [y,m] = key.split('-');
    const start = new Date(Number(y), Number(m)-1, 1,0,0,0,0);
    const end = new Date(Number(y), Number(m), 0,23,59,59,999);
    return { start, end };
  } else if (type === 'weekly') {
    const [y, wPart] = key.split('-W');
    const w = Number(wPart);
    // ISO week -> date (Mon)
    const simple = new Date(Date.UTC(Number(y), 0, 1 + (w - 1) * 7));
    const dayOfWeek = simple.getUTCDay();
    const ISOweekStart = new Date(simple);
    if (dayOfWeek <= 4) ISOweekStart.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
    else ISOweekStart.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
    const start = new Date(ISOweekStart.getTime());
    const end = new Date(start.getTime() + 6 * 86400000);
    end.setHours(23,59,59,999);
    return { start, end };
  } else if (type === 'custom') {
    if (!key.startsWith('C')) throw new Error('Bad custom key');
    const body = key.slice(1);
    const [s,e] = body.split('_');
    const start = startOfDay(s);
    const end = endOfDay(e);
    return { start, end };
  }
  throw new Error('Unsupported period type');
}

export function daysInRange(start, end) {
  const s = startOfDay(start).getTime();
  const e = startOfDay(end).getTime();
  return Math.max(1, Math.round((e - s) / 86400000) + 1);
}

export function currentPeriodInfo(type, date = new Date()) {
  const key = periodKey(type, date);
  const { start, end } = periodRangeFromKey(type, key);
  return { type, key, start, end, days: daysInRange(start, end) };
}

export function shiftPeriod(type, key, offset) {
  if (type === 'monthly') {
    const [y,m] = key.split('-');
    const base = new Date(Number(y), Number(m)-1 + offset, 1);
    return periodKey('monthly', base);
  }
  if (type === 'weekly') {
    const [y,wPart] = key.split('-W');
    const w = Number(wPart) + offset;
    const jan4 = new Date(Date.UTC(Number(y),0,4));
    const start = new Date(jan4.getTime() + (w-1)*7*86400000);
    return weeklyKey(start);
  }
  throw new Error('shiftPeriod only supports monthly/weekly right now');
}

export default {
  startOfDay, endOfDay, monthlyKey, weeklyKey, customKey, periodKey,
  periodRangeFromKey, daysInRange, currentPeriodInfo, shiftPeriod,
};
