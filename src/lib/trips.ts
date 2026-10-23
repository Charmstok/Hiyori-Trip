import type { Activity, Day, Trip } from '../types';
import { findPlace } from '../data/places.ts';

export const UNSCHEDULED = 'unscheduled';
export const activitiesIn = (trip: Trip, containerId: string) =>
  containerId === UNSCHEDULED
    ? trip.unscheduled
    : trip.days.find((d) => d.id === containerId)?.activities;
export const allActivities = (trip: Trip) => [
  ...trip.days.flatMap((d) => d.activities),
  ...(trip.unscheduled || []),
];

export const id = () => crypto.randomUUID();
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export function dateAt(start: string, offset: number) {
  const d = new Date(`${start}T12:00:00`);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function inclusiveDays(start: string, end: string) {
  return (
    Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1
  );
}
export const dateLabel = (date: string, full = false) =>
  new Intl.DateTimeFormat(
    'zh-CN',
    full
      ? { year: 'numeric', month: 'long', day: 'numeric' }
      : { month: 'long', day: 'numeric', weekday: 'short' },
  ).format(new Date(`${date}T12:00:00`));
export const dateRange = (trip: Trip) =>
  `${trip.startDate.replaceAll('-', '.')} — ${dateAt(trip.startDate, trip.days.length - 1).replaceAll('-', '.')}`;
export const newDay = (title = ''): Day => ({ id: id(), title, notes: '', activities: [] });
export function newActivity(city = ''): Activity {
  return {
    id: id(),
    title: '',
    time: '09:00',
    duration: '',
    category: '景点',
    city,
    address: '',
    notes: '',
    cost: 0,
    ...(findPlace(city) ? { coordinates: findPlace(city)!.coordinates } : {}),
  };
}
export function createTrip(title: string, startDate: string, count: number, city = ''): Trip {
  const now = new Date().toISOString();
  return {
    id: id(),
    title: title.trim() || city || '我的日本之旅',
    subtitle: city ? `${city}，慢慢走。` : '把旅程排成喜欢的样子。',
    destination: city,
    startDate,
    days: Array.from({ length: count }, (_, i) => newDay(i === 0 && city ? `初见${city}` : '')),
    unscheduled: [],
    notes: '',
    color: 'green',
    createdAt: now,
    updatedAt: now,
  };
}
export function cloneTrip(trip: Trip): Trip {
  const now = new Date().toISOString();
  return {
    ...structuredClone(trip),
    id: id(),
    title: `${trip.title.slice(0, 95)} · 副本`,
    createdAt: now,
    updatedAt: now,
    unscheduled: (trip.unscheduled || []).map((a) => ({ ...a, id: id() })),
    days: trip.days.map((day) => ({
      ...day,
      id: id(),
      activities: day.activities.map((a) => ({ ...a, id: id() })),
    })),
  };
}
export const totalActivities = (trip: Trip) => allActivities(trip).length;
export const totalCost = (trip: Trip) => allActivities(trip).reduce((n, a) => n + a.cost, 0);
export const tripCities = (trip: Trip) => {
  const cities = [
    ...new Set(
      allActivities(trip)
        .map((a) => a.city)
        .filter(Boolean),
    ),
  ];
  return cities.length ? cities : trip.destination ? [trip.destination] : [];
};
export function moveActivity(
  trip: Trip,
  activityId: string,
  fromId: string,
  toId: string,
  index?: number,
): Trip {
  const copy = structuredClone(trip);
  const from = activitiesIn(copy, fromId);
  const to = activitiesIn(copy, toId);
  if (!from || !to) return trip;
  if (fromId !== toId && to.length >= 200) return trip;
  const origin = from.findIndex((a) => a.id === activityId);
  if (origin < 0) return trip;
  const [activity] = from.splice(origin, 1);
  to.splice(index === undefined ? to.length : Math.max(0, Math.min(index, to.length)), 0, activity);
  return copy;
}
export function sampleTrip(): Trip {
  const trip = createTrip('关西，慢慢走', today(), 4, '京都');
  trip.subtitle = '京都 · 奈良 · 大阪';
  trip.notes = '给喜欢的地方多留一点时间。\n出发前确认预约、开放时间与交通安排。';
  const plan: [string, string, string, string][] = [
    ['东山的一日散步', '京都', '清水寺', '祇园'],
    ['沿着鸟居与河川', '京都', '伏见稻荷大社', '鸭川'],
    ['和鹿一起散步', '奈良', '奈良公园', '东大寺'],
    ['把美味留到最后', '大阪', '大阪城公园', '道顿堀'],
  ];
  trip.days = plan.map(([title, city, a, b]) => ({
    ...newDay(title),
    activities: [
      {
        ...newActivity(city),
        title: a,
        time: '09:30',
        duration: '2 小时',
        notes: '早一点出发，留时间慢慢走。',
      },
      {
        ...newActivity(city),
        title: city === '大阪' ? '黑门市场' : city === '奈良' ? '奈良町' : '当地午餐',
        time: '12:00',
        category: '餐饮',
        cost: 1800,
        duration: '1 小时',
      },
      { ...newActivity(city), title: b, time: '14:30', duration: '2 小时' },
    ],
  }));
  return trip;
}
