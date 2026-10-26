import type { Day, Trip } from '../types';
import { imagePages, type ImagePage } from './image-pages';
import { dateAt, dateLabel, dateRange, allActivities } from './trips';

export type ExportScope =
  { kind: 'trip' } | { kind: 'day'; dayIndex: number } | { kind: 'unscheduled' };
export const WHOLE_TRIP: ExportScope = { kind: 'trip' };
export type ImageSection =
  { kind: 'day'; page: ImagePage } | { kind: 'trip-notes'; notes: string; part: number };

export function exportDays(trip: Trip, scope: ExportScope): { day: Day; index: number }[] {
  if (scope.kind === 'day') {
    const day = trip.days[scope.dayIndex];
    if (!Number.isInteger(scope.dayIndex) || !day) throw new Error('请选择有效的行程日期。');
    return [{ day, index: scope.dayIndex }];
  }
  const days = scope.kind === 'trip' ? trip.days.map((day, index) => ({ day, index })) : [];
  if (scope.kind === 'unscheduled' || trip.unscheduled.length)
    days.push({
      day: {
        id: 'unscheduled',
        title: '待规划 · 想去的地方',
        notes: '',
        activities: trip.unscheduled,
      },
      index: -1,
    });
  return days;
}
export function exportImages(trip: Trip, scope: ExportScope): ImageSection[] {
  const allowed = new Set(exportDays(trip, scope).map((d) => d.index));
  const sections: ImageSection[] = imagePages(trip)
    .filter((page) => allowed.has(page.dayIndex))
    .map((page) => ({ kind: 'day', page }));
  if (scope.kind === 'unscheduled' && !sections.length)
    sections.push({ kind: 'day', page: { dayIndex: -1, part: 1, activities: [], notes: '' } });
  if (scope.kind === 'trip')
    (trip.notes.match(/[\s\S]{1,1200}/gu) || []).forEach((notes, index) =>
      sections.push({ kind: 'trip-notes', notes, part: index + 1 }),
    );
  return sections;
}
export function scopeFilename(scope: ExportScope): string {
  return scope.kind === 'trip'
    ? '整趟行程'
    : scope.kind === 'unscheduled'
      ? '待规划'
      : `Day${String(scope.dayIndex + 1).padStart(2, '0')}`;
}
export function sectionLabel(trip: Trip, section: ImageSection): string {
  if (section.kind === 'trip-notes')
    return `旅程随手记${section.part > 1 ? `（续 ${section.part}）` : ''}`;
  const { dayIndex, part } = section.page;
  return `${dayIndex < 0 ? '待规划' : `Day ${dayIndex + 1} · ${trip.days[dayIndex].title || '自由安排'}`}${part > 1 ? `（续 ${part}）` : ''}`;
}
export function scopeSummary(trip: Trip, scope: ExportScope): string {
  const activities =
    scope.kind === 'trip' ? allActivities(trip) : exportDays(trip, scope)[0].day.activities;
  const dates =
    scope.kind === 'trip'
      ? `${dateRange(trip)} · ${trip.days.length} 天`
      : scope.kind === 'day'
        ? dateLabel(dateAt(trip.startDate, scope.dayIndex), true)
        : '日期未定';
  const cost = activities.reduce((sum, activity) => sum + activity.cost, 0);
  return `${dates} · ${activities.length} 段安排${cost ? ` · JPY ${cost.toLocaleString('zh-CN')}` : ''}`;
}
