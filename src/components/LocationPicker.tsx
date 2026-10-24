import { useState } from 'react';
import { Check, MapPin } from 'lucide-react';
import type { Activity, MapPlace } from '../types';
import { findPlace } from '../data/places';
import { cityCenter } from '../lib/cities';
import { isLocated } from '../lib/locations';
import { MapCanvas } from './MapCanvas';
import { PlaceSearch } from './PlaceSearch';
import { Modal } from './Modal';

export function LocationPicker({
  activity,
  onClose,
  onSelect,
}: {
  activity: Activity;
  onClose: () => void;
  onSelect: (place: MapPlace) => void;
}) {
  const center = cityCenter(activity.city) ||
    findPlace(activity.city)?.coordinates ||
    activity.coordinates || [139.7671, 35.6812];
  const [selected, setSelected] = useState<MapPlace | undefined>(
    isLocated(activity)
      ? {
          id: activity.id,
          name: activity.title,
          address: activity.address,
          city: activity.city,
          coordinates: activity.coordinates!,
          category: activity.category,
          source: activity.locationSource!,
        }
      : undefined,
  );
  const [picking, setPicking] = useState(false);
  return (
    <Modal title="为安排选择准确位置" eyebrow="A PLACE, NOT JUST A NAME" wide onClose={onClose}>
      <div className="location-picker">
        <PlaceSearch
          center={center as [number, number]}
          initialQuery={activity.title}
          onSelect={(place) => {
            setSelected(place);
            setPicking(false);
          }}
        />
        <div className="map-picker-tools">
          <span>查找地点后选择结果，或直接在地图上选点。</span>
          <button
            type="button"
            className={`button ${picking ? 'primary' : 'secondary'} small`}
            onClick={() => setPicking(!picking)}
          >
            <MapPin size={14} />
            {picking ? '取消选点' : '地图选点'}
          </button>
        </div>
        <MapCanvas
          center={center as [number, number]}
          points={
            selected
              ? [{ id: selected.id, title: selected.name, coordinates: selected.coordinates }]
              : []
          }
          selectedId={selected?.id}
          route={false}
          picking={picking}
          onPick={(coordinates) => {
            setSelected({
              id: 'pin',
              name: activity.title || '地图上的地点',
              address: '',
              city: activity.city,
              coordinates,
              category: activity.category,
              source: 'pin',
            });
            setPicking(false);
          }}
        />
        <div className="location-choice" aria-live="polite">
          {selected ? (
            <>
              <strong>{selected.name}</strong>
              <p>{selected.address || '手动选点，可在安排中补充地址。'}</p>
              <small>
                {selected.coordinates[1].toFixed(6)}, {selected.coordinates[0].toFixed(6)}
              </small>
            </>
          ) : (
            <p>还没有选择具体位置。</p>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="button primary"
            disabled={!selected}
            onClick={() => selected && onSelect(selected)}
          >
            <Check size={16} />
            使用这个位置
          </button>
        </div>
      </div>
    </Modal>
  );
}
