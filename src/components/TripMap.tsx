import { useEffect, useState } from 'react';
import { ArrowUpRight, MapPin, Navigation, Pencil, Plus, X, ChevronDown } from 'lucide-react';
import type { Activity, MapPlace } from '../types';
import { distanceKm, isLocated, navigationUrl } from '../lib/locations';
import { MapCanvas } from './MapCanvas';
import { PlaceSearch } from './PlaceSearch';

export function TripMap({
  activities,
  center,
  city,
  unscheduled,
  selectedId,
  focusRequest,
  layoutKey,
  onExploreCity,
  onRevealMap,
  onSelect,
  onEdit,
  onAdd,
}: {
  activities: Activity[];
  center: [number, number];
  city: string;
  unscheduled: boolean;
  selectedId?: string;
  focusRequest: number;
  layoutKey: string;
  onExploreCity: () => void;
  onRevealMap: () => void;
  onSelect: (id?: string) => void;
  onEdit: (activity: Activity) => void;
  onAdd: (place: MapPlace) => void;
}) {
  const [candidate, setCandidate] = useState<MapPlace>();
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    setCandidate(undefined);
    setPicking(false);
  }, [focusRequest]);
  const selected = candidate ? undefined : activities.find((a) => a.id === selectedId);
  const index = selected ? activities.indexOf(selected) : -1;
  const previous = index > 0 ? activities[index - 1] : undefined;
  const located = activities.filter(isLocated);
  const points = activities.flatMap((a) =>
    isLocated(a) ? [{ id: a.id, title: a.title, coordinates: a.coordinates! }] : [],
  );
  if (candidate)
    points.push({
      id: 'candidate',
      title: candidate.name,
      coordinates: candidate.coordinates,
    });
  return (
    <div className="trip-detail-map">
      <div className="trip-map-controls" data-map-overlay>
        <PlaceSearch
          center={center}
          onSelect={(place) => {
            onRevealMap();
            setCandidate(place);
            setPicking(false);
          }}
        />
        <div className="map-picker-tools">
          <button className="map-city-button" onClick={onExploreCity} aria-label="选择地图探索城市">
            <MapPin size={12} />
            {city || '日本'}
            <ChevronDown size={12} />
          </button>
          <span>
            {located.length}/{activities.length} 已定位
          </span>
          <button
            className={`button ${picking ? 'primary' : 'secondary'} small`}
            type="button"
            onClick={() => {
              if (!picking) onRevealMap();
              setPicking(!picking);
            }}
          >
            <MapPin size={13} />
            {picking ? '取消选点' : '地图选点'}
          </button>
        </div>
      </div>
      <MapCanvas
        center={center}
        points={points}
        selectedId={candidate ? 'candidate' : selectedId}
        focusRequest={focusRequest}
        avoidOverlays
        layoutKey={layoutKey}
        route={!unscheduled && !candidate}
        picking={picking}
        onSelect={(id) => {
          if (id !== 'candidate') {
            setCandidate(undefined);
            onSelect(id);
          }
        }}
        onPick={(coordinates) => {
          onRevealMap();
          setCandidate({
            id: 'pin',
            name: '地图上的地点',
            address: '',
            city,
            coordinates,
            category: '景点',
            source: 'pin',
          });
          setPicking(false);
        }}
      />
      <p className="detailed-map-caption">
        {unscheduled
          ? '待规划地点仅作收藏，不表示游览顺序。'
          : '点击地点名称查看安排，虚线为已定位地点的顺序示意。'}
      </p>
      {candidate ? (
        <article className="map-place-detail glass-panel" data-map-overlay aria-label="选中的地点">
          <button
            className="map-detail-close icon-button"
            aria-label="关闭地点详情"
            onClick={() => setCandidate(undefined)}
          >
            <X size={15} />
          </button>
          <p className="eyebrow">
            {candidate.source === 'pin' ? 'A SPOT YOU PICKED' : 'FOUND A LITTLE PLACE'}
          </p>
          <h3>{candidate.name}</h3>
          <p>{candidate.address || '已选中地图位置，添加时可以填写名称和地址。'}</p>
          <span className="place-coordinate">
            {candidate.coordinates[1].toFixed(6)}, {candidate.coordinates[0].toFixed(6)}
          </span>
          <div className="map-detail-actions">
            <button
              type="button"
              className="button primary small"
              disabled={activities.length >= 200}
              onClick={() => {
                onAdd(candidate);
                setCandidate(undefined);
              }}
            >
              <Plus size={14} />
              {unscheduled ? '加入待规划' : '加入这一天'}
            </button>
            <button
              type="button"
              className="button text small"
              onClick={() => setCandidate(undefined)}
            >
              取消选择
            </button>
          </div>
        </article>
      ) : selected ? (
        <article className="map-place-detail glass-panel" data-map-overlay aria-label="选中的安排">
          <button
            className="map-detail-close icon-button"
            aria-label="关闭地点详情"
            onClick={() => onSelect(undefined)}
          >
            <X size={15} />
          </button>
          <p className="eyebrow">
            {unscheduled ? 'SOMEDAY, SOMEWHERE' : `STOP ${String(index + 1).padStart(2, '0')}`}
            {selected.time ? ` / ${selected.time}` : ''}
          </p>
          <h3>{selected.title}</h3>
          <p>{selected.address || selected.city || '尚未填写地址'}</p>
          {!isLocated(selected) && (
            <p className="location-missing">还没有准确位置，编辑安排后可搜索定位。</p>
          )}
          {selected.duration && <p>预计停留 {selected.duration}</p>}
          {selected.notes && <p className="map-place-note">{selected.notes}</p>}
          {!unscheduled && previous && isLocated(previous) && isLocated(selected) && (
            <p className="map-distance">
              距上一站直线约 {distanceKm(previous.coordinates!, selected.coordinates!).toFixed(1)}{' '}
              km
            </p>
          )}
          <div className="map-detail-actions">
            <button
              type="button"
              className="button secondary small"
              onClick={() => onEdit(selected)}
            >
              <Pencil size={13} />
              编辑安排
            </button>
            <a
              className="button text small"
              href={navigationUrl(selected, unscheduled ? undefined : previous)}
              target="_blank"
              rel="noreferrer"
            >
              <Navigation size={13} />
              交通路线
              <ArrowUpRight size={12} />
            </a>
          </div>
        </article>
      ) : (
        <div className="map-idle">
          <MapPin size={21} strokeWidth={1.4} />
          <p>
            搜索具体地点，或点击地图上的地点名称。
            <br />
            地址和准确位置会随安排一起保存。
          </p>
        </div>
      )}
    </div>
  );
}
