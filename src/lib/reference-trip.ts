import type { Activity, Trip } from '../types';
import { referencePlaces } from '../data/reference-places.ts';
import { findPlace } from '../data/places.ts';

export function withReferenceLocation(activity: Activity): Activity {
  const place = referencePlaces.find((p) => p.title === activity.title && p.city === activity.city);
  if (!place || activity.locationSource || activity.address) return activity;
  const center = findPlace(activity.city)?.coordinates;
  if (activity.coordinates && (!center || activity.coordinates.some((n, i) => n !== center[i])))
    return activity;
  return {
    ...activity,
    coordinates: place.coordinates as [number, number],
    address: place.address,
    locationSource: 'search',
  };
}
export function enrichReferenceTrip(trip: Trip): Trip {
  // Only recognize the unchanged built-in template; never infer identity from a title alone.
  const titles = ['东山的一日散步', '沿着鸟居与河川', '和鹿一起散步', '把美味留到最后'];
  const activities = [
    ['清水寺', '当地午餐', '祇园'],
    ['伏见稻荷大社', '当地午餐', '鸭川'],
    ['奈良公园', '奈良町', '东大寺'],
    ['大阪城公园', '黑门市场', '道顿堀'],
  ];
  if (
    trip.title !== '关西，慢慢走' ||
    trip.subtitle !== '京都 · 奈良 · 大阪' ||
    trip.days.length !== 4 ||
    trip.unscheduled.length ||
    trip.days.some(
      (day, i) =>
        day.title !== titles[i] ||
        day.activities.length !== 3 ||
        day.activities.some((a, j) => a.title !== activities[i][j]),
    )
  )
    return trip;
  let changed = false;
  const days = trip.days.map((day) => ({
    ...day,
    activities: day.activities.map((a) => {
      const next = withReferenceLocation(a);
      changed ||= next !== a;
      return next;
    }),
  }));
  return changed ? { ...trip, days } : trip;
}
