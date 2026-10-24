import { useState } from 'react';
import type { FormEvent } from 'react';
import { Check, MapPin, Minus, Plus } from 'lucide-react';
import { CATEGORIES } from '../types';
import type { Activity, Day, MapPlace } from '../types';
import { cityValueForName } from '../lib/cities';
import { UNSCHEDULED } from '../lib/trips';
import { isLocated } from '../lib/locations';
import { LocationPicker } from './LocationPicker';
import { CitySelector } from './CitySelector';
import { Modal } from './Modal';

export function ActivityForm({
  activity,
  dayId,
  days,
  onClose,
  onSave,
  isNew,
}: {
  activity: Activity;
  dayId: string;
  days: Day[];
  onClose: () => void;
  onSave: (a: Activity, toDay: string) => Promise<void>;
  isNew: boolean;
}) {
  const [draft, setDraft] = useState({ ...activity });
  const [target, setTarget] = useState(dayId);
  const [busy, setBusy] = useState(false);
  const [pickingLocation, setPickingLocation] = useState(false);
  const update = <K extends keyof Activity>(key: K, value: Activity[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  function changeCity(city: string) {
    setDraft((d) => ({ ...d, city, coordinates: undefined, locationSource: undefined }));
  }
  function chooseLocation(place: MapPlace) {
    const city = cityValueForName(place.city, place.address) || draft.city;
    setDraft((d) => ({
      ...d,
      title: d.title.trim() || (place.source === 'search' ? place.name : ''),
      city,
      address: place.address || d.address,
      coordinates: place.coordinates,
      locationSource: place.source,
      category: isNew ? place.category : d.category,
    }));
    setPickingLocation(false);
  }
  function changeCost(amount: number) {
    update(
      'cost',
      Math.min(1_000_000_000, Math.max(0, Math.round((draft.cost + amount) * 100) / 100)),
    );
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !draft.title.trim()) return;
    setBusy(true);
    try {
      await onSave({ ...draft, title: draft.title.trim() }, target);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Modal
        title={
          isNew
            ? dayId === UNSCHEDULED
              ? '收藏一个想去的地方'
              : '把期待加入这一天'
            : '编辑这段安排'
        }
        eyebrow="A MOMENT TO REMEMBER"
        onClose={onClose}
      >
        <form className="form-stack" onSubmit={submit}>
          <label>
            安排名称
            <input
              autoFocus
              required
              maxLength={200}
              value={draft.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="去哪里，做点什么？"
            />
          </label>
          <div className="form-row">
            <label>
              日期
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value={UNSCHEDULED}>待规划 · 稍后安排日期</option>
                {days.map((d, i) => (
                  <option key={d.id} value={d.id}>
                    Day {i + 1}
                    {d.title ? ` · ${d.title}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              类型
              <select
                value={draft.category}
                onChange={(e) => update('category', e.target.value as Activity['category'])}
              >
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              开始时间
              <input
                type="time"
                value={draft.time}
                onChange={(e) => update('time', e.target.value)}
              />
            </label>
            <label>
              预计停留
              <input
                maxLength={100}
                value={draft.duration}
                onChange={(e) => update('duration', e.target.value)}
                placeholder="例如：1.5 小时"
              />
            </label>
          </div>
          <div className="form-row">
            <CitySelector value={draft.city} onChange={changeCity} />
            <label>
              预计花费 <span className="optional">日元</span>
              <div className="cost-stepper">
                <button
                  type="button"
                  aria-label="减少100日元"
                  title="减少 100 日元"
                  onClick={() => changeCost(-100)}
                  disabled={draft.cost <= 0}
                >
                  <Minus size={15} />
                </button>
                <input
                  type="number"
                  min={0}
                  max={1000000000}
                  step="any"
                  required
                  value={draft.cost}
                  aria-label="预计花费 日元"
                  onChange={(e) => update('cost', Number(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      changeCost(e.key === 'ArrowUp' ? 100 : -100);
                    }
                  }}
                />
                <button
                  type="button"
                  aria-label="增加100日元"
                  title="增加 100 日元"
                  onClick={() => changeCost(100)}
                  disabled={draft.cost >= 1000000000}
                >
                  <Plus size={15} />
                </button>
              </div>
              <small className="field-hint">每次增减 100 日元，可手动输入金额</small>
            </label>
          </div>
          <label>
            地址 <span className="optional">可选</span>
            <input
              maxLength={500}
              value={draft.address}
              onChange={(e) => update('address', e.target.value)}
              placeholder="详细地址、车站或集合地点"
            />
          </label>
          <div className="activity-location-field">
            <div>
              <strong>
                <MapPin size={14} />
                地图位置
              </strong>
              <p>
                {isLocated(draft)
                  ? `${draft.coordinates![1].toFixed(6)}, ${draft.coordinates![0].toFixed(6)}`
                  : '尚未定位到具体地点'}
              </p>
            </div>
            <button
              type="button"
              className="button secondary small"
              onClick={() => setPickingLocation(true)}
            >
              {isLocated(draft) ? '调整位置' : '选择地图位置'}
            </button>
            {isLocated(draft) && (
              <button
                type="button"
                className="button text small"
                onClick={() =>
                  setDraft((d) => ({ ...d, coordinates: undefined, locationSource: undefined }))
                }
              >
                清除定位
              </button>
            )}
          </div>
          <label>
            随手记 <span className="optional">可选</span>
            <textarea
              maxLength={5000}
              rows={3}
              value={draft.notes}
              onChange={(e) => update('notes', e.target.value)}
              placeholder="预约信息、想吃的店、路上的小提醒……"
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={onClose}>
              取消
            </button>
            <button disabled={busy} className="button primary">
              <Check size={17} />
              {busy
                ? '正在保存…'
                : isNew
                  ? target === UNSCHEDULED
                    ? '加入待规划'
                    : '加入行程'
                  : '保存安排'}
            </button>
          </div>
        </form>
      </Modal>
      {pickingLocation && (
        <LocationPicker
          activity={draft}
          onClose={() => setPickingLocation(false)}
          onSelect={chooseLocation}
        />
      )}
    </>
  );
}
