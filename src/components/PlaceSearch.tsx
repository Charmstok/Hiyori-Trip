import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, LoaderCircle, MapPin, Search } from 'lucide-react';
import { localRequest } from '../lib/db';
import type { MapPlace } from '../types';

export function PlaceSearch({
  center,
  initialQuery = '',
  onSelect,
}: {
  center: [number, number];
  initialQuery?: string;
  onSelect: (place: MapPlace) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<MapPlace[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const sequence = useRef(0);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  async function search() {
    if (busy || query.trim().length < 2) return;
    const request = ++sequence.current;
    setBusy(true);
    setError('');
    setResults([]);
    setSearched(false);
    try {
      const parameters = new URLSearchParams({
        q: query.trim(),
        lon: String(center[0]),
        lat: String(center[1]),
      });
      const { places } = await localRequest<{ places: MapPlace[] }>(`maps/search?${parameters}`);
      if (sequence.current === request) {
        setResults(places);
        setSearched(true);
      }
    } catch (e) {
      if (sequence.current === request)
        setError(e instanceof Error ? e.message : '地点搜索失败，请重试。');
    } finally {
      if (sequence.current === request) setBusy(false);
    }
  }
  return (
    <div className="place-search">
      <form
        className="place-search-form"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Search size={16} />
        <input
          aria-label="搜索具体地点"
          value={query}
          maxLength={200}
          onChange={(e) => {
            setQuery(e.target.value);
            setResults([]);
            setSearched(false);
            setError('');
            sequence.current++;
            setBusy(false);
          }}
          placeholder="景点、车站、餐厅或地址"
        />
        <button type="submit" disabled={busy || query.trim().length < 2} aria-label="搜索地点">
          {busy ? <LoaderCircle size={16} className="spin" /> : '搜索'}
        </button>
      </form>
      <p className="place-search-note">搜索日本境内地点，日文或英文名称通常更准确。</p>
      {error && (
        <p className="place-search-error" role="alert">
          {error}
        </p>
      )}
      {searched && !results.length && (
        <p className="place-search-error" role="status">
          没有找到地点。试试日文、英文或更完整的名称，也可以在地图上选点。
        </p>
      )}
      {!!results.length && (
        <div className="place-results" aria-label="地点搜索结果" data-map-overlay>
          {results.map((place) => (
            <button
              type="button"
              key={place.id}
              onClick={() => {
                onSelect(place);
                setResults([]);
                setSearched(false);
              }}
            >
              <MapPin size={15} />
              <span>
                <strong>{place.name}</strong>
                <small>{place.address || place.city}</small>
              </span>
              <ArrowUpRight size={13} />
            </button>
          ))}
          <span className="search-attribution">搜索数据 © OpenStreetMap contributors · Photon</span>
        </div>
      )}
    </div>
  );
}
