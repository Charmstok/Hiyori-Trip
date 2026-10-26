import { randomUUID } from 'node:crypto';
import { parseTrip } from '../src/lib/validation.ts';

const text = (max = 5000) => ({ type: 'string', maxLength: max });
const object = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const activitySchema = object({
  title: text(200),
  time: text(5),
  duration: text(100),
  category: { type: 'string', enum: ['景点', '餐饮', '交通', '住宿', '购物', '其他'] },
  city: text(100),
  address: text(500),
  notes: text(),
  cost: { type: 'number', minimum: 0, maximum: 1e9 },
  locationId: text(200),
});
export const planSchema = object({
  title: text(100),
  summary: text(200),
  days: {
    type: 'array',
    minItems: 1,
    maxItems: 30,
    items: object({
      title: text(200),
      notes: text(),
      activities: { type: 'array', maxItems: 20, items: activitySchema },
    }),
  },
  unscheduled: { type: 'array', maxItems: 30, items: activitySchema },
  notes: text(),
  assumptions: { type: 'array', maxItems: 15, items: text(500) },
  warnings: { type: 'array', maxItems: 15, items: text(500) },
});
const string = (value, max = 5000) => {
  if (typeof value !== 'string' || value.length > max)
    throw new Error('草案包含过长或缺失的文字。');
  return value;
};
export function normalizePlan(value, { startDate, days, verified = new Map() }) {
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray(value.days) ||
    value.days.length !== days ||
    !Array.isArray(value.unscheduled) ||
    value.unscheduled.length > 30
  )
    throw new Error(`草案必须恰好包含 ${days} 天，并包含待规划列表。`);
  let count = 0;
  const activity = (a) => {
    if (++count > 250) throw new Error('草案安排过多，请缩小规划范围。');
    if (!a || typeof a !== 'object') throw new Error('安排内容无效。');
    const place = verified.get(a.locationId);
    return {
      id: randomUUID(),
      title: string(a.title, 200),
      time: string(a.time, 5),
      duration: string(a.duration, 100),
      category: a.category,
      city: string(a.city, 100),
      address: place?.address || string(a.address, 500),
      notes: string(a.notes),
      cost: a.cost,
      ...(place ? { coordinates: place.coordinates, locationSource: 'search' } : {}),
    };
  };
  const day = (d) => {
    if (!d || !Array.isArray(d.activities) || d.activities.length > 20)
      throw new Error('每天最多规划 20 段安排。');
    const result = {
      id: randomUUID(),
      title: string(d.title, 200),
      notes: string(d.notes),
      activities: d.activities.map(activity),
    };
    let previous = '';
    for (const a of result.activities)
      if (a.time) {
        if (previous && a.time < previous) throw new Error('一天内的安排时间须按顺序排列。');
        previous = a.time;
      }
    return result;
  };
  const notes = string(value.notes);
  const now = new Date().toISOString();
  const trip = parseTrip({
    id: randomUUID(),
    title: string(value.title, 100),
    subtitle: string(value.summary, 200),
    startDate,
    days: value.days.map(day),
    unscheduled: value.unscheduled.map(activity),
    notes,
    color: 'green',
    createdAt: now,
    updatedAt: now,
  });
  trip.destination = trip.days.flatMap((d) => d.activities).find((a) => a.city)?.city || '';
  const list = (items) => {
    if (!Array.isArray(items) || items.length > 15) throw new Error('请提供假设与提醒列表。');
    return items.map((item) => string(item, 500));
  };
  return {
    trip,
    summary: trip.subtitle,
    assumptions: list(value.assumptions),
    warnings: [
      ...list(value.warnings),
      '交通耗时与费用为估算，营业时间、休息日和预约要求请以官方信息为准。',
    ],
  };
}
export function planningRequest(value) {
  if (!value || typeof value !== 'object') throw new Error('规划请求无效。');
  const startDate = string(value.startDate, 10),
    endDate = string(value.endDate, 10);
  const valid = (date) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date &&
    date >= '1900-01-01' &&
    date <= '2200-12-31';
  if (!valid(startDate) || !valid(endDate)) throw new Error('请选择有效的出发与返回日期。');
  const days = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000) + 1;
  if (days < 1 || days > 30) throw new Error('一次可规划 1–30 天，请检查返回日期。');
  const materials = value.materials;
  if (!Array.isArray(materials) || materials.length > 5) throw new Error('一次最多使用 5 份材料。');
  let size = 0,
    images = 0;
  const sanitized = materials.map((m) => {
    const name = string(m.name, 200),
      text = string(m.text, 40_000);
    size += text.length;
    if (m.kind === 'image') {
      if (
        ++images > 4 ||
        typeof m.image !== 'string' ||
        m.image.length > 12 * 1024 * 1024 ||
        !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(m.image)
      )
        throw new Error('图片格式无效，一次最多使用 4 张图片。');
      size += m.image.length;
      return { name, text, kind: 'image', image: m.image };
    }
    const url = m.url ? string(m.url, 2500) : undefined;
    if (url && !/^https?:\/\//.test(url)) throw new Error('材料链接格式不正确。');
    return { name, text, kind: m.kind === 'link' ? 'link' : 'text', ...(url ? { url } : {}) };
  });
  if (size > 46 * 1024 * 1024) throw new Error('材料总量过大，请减少附件。');
  const instruction = string(value.instruction, 12_000).trim();
  if (!instruction && !sanitized.length && !value.refine)
    throw new Error('请描述旅行想法，或添加至少一份参考材料。');
  return {
    startDate,
    endDate,
    days,
    instruction,
    destination: string(value.destination || '', 100),
    materials: sanitized,
    refine: value.refine === true,
    locate: value.locate !== false,
  };
}
