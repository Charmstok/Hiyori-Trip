import type { Activity, Trip } from '../types';

export interface ImagePage {
  dayIndex: number;
  part: number;
  activities: Activity[];
  notes: string;
}
export function imagePages(trip: Trip): ImagePage[] {
  const groups = [
    ...trip.days,
    ...(trip.unscheduled.length
      ? [{ title: '待规划', notes: '', activities: trip.unscheduled }]
      : []),
  ];
  return groups.flatMap((day, index) => {
    const dayIndex = index === trip.days.length ? -1 : index;
    const result: ImagePage[] = [];
    let activities: Activity[] = [];
    let used = 0;
    const push = () => {
      result.push({ dayIndex, part: result.length + 1, activities, notes: '' });
      activities = [];
      used = 0;
    };
    for (const activity of day.activities) {
      const chunks = activity.notes.match(/[\s\S]{1,650}/gu) || [''];
      for (const [i, notes] of chunks.entries()) {
        const a = {
          ...activity,
          notes,
          ...(i > 0 ? { title: `${activity.title}（续）`, cost: 0, time: '' } : {}),
        };
        const weight =
          180 + a.title.length * 2 + a.address.length + a.duration.length + notes.length;
        if (activities.length && (activities.length >= 6 || used + weight > 1650)) push();
        activities.push(a);
        used += weight;
      }
    }
    if (activities.length || result.length === 0) push();
    const notes = day.notes.match(/[\s\S]{1,1200}/gu) || [];
    if (notes.length) {
      const first = notes[0];
      const last = result.at(-1)!;
      const lastWeight = last.activities.reduce(
        (sum, a) =>
          sum + 180 + a.title.length * 2 + a.address.length + a.duration.length + a.notes.length,
        0,
      );
      if (first && first.length <= 700 && lastWeight + first.length <= 2100) {
        last.notes = notes.shift()!;
      }
      notes.forEach((note) =>
        result.push({ dayIndex, part: result.length + 1, activities: [], notes: note }),
      );
    }
    return result;
  });
}
