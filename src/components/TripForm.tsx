import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, MapPin, LoaderCircle } from 'lucide-react';
import { Modal } from './Modal';
import { CityOptions } from './CityOptions';
import { createTrip, dateAt, inclusiveDays, newDay, today, tripCities } from '../lib/trips';
import type { Trip } from '../types';

export function TripForm({
  trip,
  initialCity = '',
  onClose,
  onSave,
}: {
  trip?: Trip;
  initialCity?: string;
  onClose: () => void;
  onSave: (trip: Trip) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(trip?.title || '');
  const [startDate, setStartDate] = useState(trip?.startDate || today());
  const [endDate, setEndDate] = useState(
    dateAt(trip?.startDate || today(), (trip?.days.length || 4) - 1),
  );
  const [error, setError] = useState('');
  const days = inclusiveDays(startDate, endDate);
  const [city, setCity] = useState(initialCity);
  const [subtitle, setSubtitle] = useState(trip?.subtitle || '');
  const [color, setColor] = useState<Trip['color']>(trip?.color || 'green');
  const [busy, setBusy] = useState(false);
  const draft = useRef<Trip | undefined>(undefined);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (!Number.isInteger(days) || days < 1 || days > 60) {
      setError('返回日期须不早于出发日期，一段旅程最多 60 天。');
      return;
    }
    if (trip?.days.slice(days).some((d) => d.title || d.notes || d.activities.length)) {
      setError('缩短旅程会移除已有内容。请先在编辑器中调整或删除末尾日期，再更改返回日期。');
      return;
    }
    const tripTitle = title.trim() || (trip ? tripCities(trip)[0] : city) || '我的日本之旅';
    setBusy(true);
    const created = trip ? undefined : createTrip(tripTitle, startDate, days, city);
    if (created && !draft.current) draft.current = created;
    try {
      const saved = await onSave(
        trip
          ? {
              ...trip,
              title: tripTitle,
              startDate,
              subtitle: subtitle.trim(),
              color,
              days: Array.from({ length: days }, (_, i) => trip.days[i] || newDay()),
            }
          : { ...created!, id: draft.current!.id, createdAt: draft.current!.createdAt, color },
      );
      if (!saved) setError('保存未完成，请确认本地服务和磁盘空间后重试。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={trip ? '编辑旅程' : '一段新旅程，从这里开始'}
      eyebrow={trip ? 'YOUR JOURNEY' : 'A NEW CHAPTER'}
      onClose={onClose}
    >
      <form onSubmit={submit} className="form-stack">
        <label>
          旅程名称 <span className="optional">可选</span>
          <input
            autoFocus
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={city || (trip && tripCities(trip)[0]) || '留空时使用第一站的城市名'}
          />
        </label>
        {trip && (
          <label>
            一句话介绍
            <input
              maxLength={200}
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="这次旅行，你想留下什么？"
            />
          </label>
        )}
        <div className="form-row">
          <label>
            出发日期
            <input
              type="date"
              required
              min="1900-01-01"
              max="2200-12-31"
              value={startDate}
              onChange={(e) => {
                const next = e.target.value;
                setStartDate(next);
                if (next && (!endDate || endDate < next))
                  setEndDate(
                    dateAt(next, Math.max(0, Math.min(59, (Number.isFinite(days) ? days : 4) - 1))),
                  );
              }}
            />
          </label>
          <label>
            返回日期
            <input
              required
              type="date"
              min={startDate || '1900-01-01'}
              max={
                startDate
                  ? dateAt(startDate, 59) < '2200-12-31'
                    ? dateAt(startDate, 59)
                    : '2200-12-31'
                  : '2200-12-31'
              }
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
        </div>
        <p className="form-hint">
          {Number.isFinite(days) && days > 0
            ? `共 ${days} 天，包含出发与返回当日。`
            : '请选择出发与返回日期。'}
        </p>
        {!trip && (
          <label>
            第一站 <span className="optional">可选</span>
            <div className="input-with-icon">
              <MapPin size={17} />
              <select value={city} onChange={(e) => setCity(e.target.value)}>
                <option value="">还没决定，慢慢想</option>
                <CityOptions />
              </select>
            </div>
          </label>
        )}
        <fieldset className="color-picker">
          <legend>旅程颜色</legend>
          {(['green', 'clay', 'blue'] as const).map((c, i) => (
            <label key={c} className={`swatch ${c} ${color === c ? 'selected' : ''}`}>
              <input
                type="radio"
                name="color"
                value={c}
                checked={color === c}
                onChange={() => setColor(c)}
              />
              <span>{['山野绿', '陶土红', '海雾蓝'][i]}</span>
            </label>
          ))}
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            再想一想
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}{' '}
            {trip ? '保存修改' : '开启旅程'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
