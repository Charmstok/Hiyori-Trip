import type { Activity } from '../types';

export const isLocated = (activity: Activity) =>
  !!activity.coordinates && !!activity.locationSource;
export function distanceKm(a: [number, number], b: [number, number]) {
  const radians = (v: number) => (v * Math.PI) / 180;
  const x =
    Math.sin(radians(b[1] - a[1]) / 2) ** 2 +
    Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(radians(b[0] - a[0]) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(Math.min(1, x)), Math.sqrt(Math.max(0, 1 - x)));
}
export function navigationUrl(activity: Activity, previous?: Activity) {
  const destination = isLocated(activity)
    ? `${activity.coordinates![1]},${activity.coordinates![0]}`
    : `${activity.title} ${activity.address || activity.city} 日本`;
  const parameters = new URLSearchParams({ api: '1', destination, travelmode: 'transit' });
  if (previous && isLocated(previous))
    parameters.set('origin', `${previous.coordinates![1]},${previous.coordinates![0]}`);
  return `https://www.google.com/maps/dir/?${parameters}`;
}
