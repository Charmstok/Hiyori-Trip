import { CATEGORIES } from '../types.ts';
import type { Trip, Day, Activity } from '../types.ts';

const bad = (message = '行程数据的格式不正确。') => {
  throw new Error(message);
};
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : bad();
function string(value: unknown, max = 5000): string {
  return typeof value === 'string' && value.length <= max ? value : bad();
}
function validId(value: unknown): string {
  const result = string(value, 100);
  return result.trim() ? result : bad();
}
function parseActivity(value: unknown): Activity {
  const a = record(value);
  if (!CATEGORIES.includes(a.category as Activity['category'])) bad();
  if (typeof a.cost !== 'number' || !Number.isFinite(a.cost) || a.cost < 0 || a.cost > 1e9) bad();
  const time = string(a.time, 5);
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) bad();
  const coordinates = a.coordinates;
  if (
    a.locationSource !== undefined &&
    (!['search', 'pin'].includes(a.locationSource as string) || coordinates === undefined)
  )
    bad();
  if (
    coordinates !== undefined &&
    (!Array.isArray(coordinates) ||
      coordinates.length !== 2 ||
      coordinates.some((c) => typeof c !== 'number' || !Number.isFinite(c)) ||
      Math.abs(coordinates[0]) > 180 ||
      Math.abs(coordinates[1]) > 90)
  )
    bad();
  return {
    id: validId(a.id),
    title: string(a.title, 200),
    time,
    duration: string(a.duration, 100),
    category: a.category as Activity['category'],
    city: string(a.city, 100),
    address: string(a.address, 500),
    notes: string(a.notes),
    cost: a.cost as number,
    ...(coordinates ? { coordinates: coordinates as [number, number] } : {}),
    ...(a.locationSource ? { locationSource: a.locationSource as Activity['locationSource'] } : {}),
  };
}
function parseDay(value: unknown): Day {
  const d = record(value);
  if (!Array.isArray(d.activities) || d.activities.length > 200) bad();
  return {
    id: validId(d.id),
    title: string(d.title, 200),
    notes: string(d.notes),
    activities: (d.activities as unknown[]).map(parseActivity),
  };
}
export function parseTrip(value: unknown): Trip {
  const t = record(value);
  const startDate = string(t.startDate, 10);
  const parsed = new Date(`${startDate}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== startDate ||
    startDate < '1900-01-01' ||
    startDate > '2200-12-31'
  )
    bad('行程中包含无效的日期。');
  if (!Array.isArray(t.days) || t.days.length < 1 || t.days.length > 60) bad();
  if (!['green', 'clay', 'blue'].includes(t.color as string)) bad();
  if (t.unscheduled !== undefined && (!Array.isArray(t.unscheduled) || t.unscheduled.length > 200))
    bad();
  const result: Trip = {
    id: validId(t.id),
    title: string(t.title, 100),
    subtitle: string(t.subtitle, 200),
    ...(t.destination !== undefined ? { destination: string(t.destination, 100) } : {}),
    startDate,
    days: (t.days as unknown[]).map(parseDay),
    unscheduled: ((t.unscheduled || []) as unknown[]).map(parseActivity),
    notes: string(t.notes),
    color: t.color as Trip['color'],
    createdAt: string(t.createdAt, 40),
    updatedAt: string(t.updatedAt, 40),
  };
  if (
    !result.title.trim() ||
    !Number.isFinite(Date.parse(result.createdAt)) ||
    !Number.isFinite(Date.parse(result.updatedAt))
  )
    bad();
  const ids = [
    ...result.days.map((d) => d.id),
    ...result.days.flatMap((d) => d.activities.map((a) => a.id)),
    ...result.unscheduled.map((a) => a.id),
  ];
  if (new Set(ids).size !== ids.length) bad('行程中包含重复的条目标识。');
  return result;
}
