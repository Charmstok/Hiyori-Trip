import { useState } from 'react';
import type { FormEvent } from 'react';
import { Check, MapPin, Minus, Plus } from 'lucide-react';
import { CATEGORIES } from '../types';
import type { Activity, Day } from '../types';
import { findPlace } from '../data/places';
import { UNSCHEDULED } from '../lib/trips';
import { CityOptions } from './CityOptions';
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
  const [customCity, setCustomCity] = useState(!!activity.city && !findPlace(activity.city));
  const update = <K extends keyof Activity>(key: K, value: Activity[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
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
      await onSave(
        { ...draft, title: draft.title.trim(), coordinates: findPlace(draft.city)?.coordinates },
        target,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        isNew ? (dayId === UNSCHEDULED ? '收藏一个想去的地方' : '把期待加入这一天') : '编辑这段安排'
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
          <label>
            城市
            <div className="input-with-icon">
              <MapPin size={16} />
              <select
                aria-label="城市"
                value={customCity ? '__custom_city__' : draft.city}
                onChange={(e) => {
                  if (e.target.value === '__custom_city__') {
                    setCustomCity(true);
                    update('city', '');
                  } else {
                    setCustomCity(false);
                    update('city', e.target.value);
                  }
                }}
              >
                <option value="">请选择城市</option>
                <CityOptions />
                <option value="__custom_city__">其他城市（手动填写）</option>
              </select>
            </div>
            {customCity && (
              <input
                aria-label="自定义城市"
                maxLength={100}
                value={draft.city}
                onChange={(e) => update('city', e.target.value)}
                placeholder="输入城市名称"
                className="custom-city-input"
              />
            )}
          </label>
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
  );
}
