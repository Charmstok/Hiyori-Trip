export const CATEGORIES = ['景点', '餐饮', '交通', '住宿', '购物', '其他'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Activity {
  id: string;
  title: string;
  time: string;
  duration: string;
  category: Category;
  city: string;
  address: string;
  notes: string;
  cost: number;
  coordinates?: [number, number];
}
export interface Day {
  id: string;
  title: string;
  notes: string;
  activities: Activity[];
}
export interface Trip {
  id: string;
  title: string;
  subtitle: string;
  destination?: string;
  startDate: string;
  days: Day[];
  unscheduled: Activity[];
  notes: string;
  color: 'green' | 'clay' | 'blue';
  createdAt: string;
  updatedAt: string;
}
export interface DeletedTrip extends Trip {
  deletedAt: string;
}

export interface Place {
  name: string;
  ja: string;
  en: string;
  region: string;
  coordinates: [number, number];
  description: string;
  spots: string[];
}
