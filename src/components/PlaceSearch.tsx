import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, LoaderCircle, MapPin, Search } from 'lucide-react';
import { localRequest } from '../lib/db';
import type { MapPlace } from '../types';

export function PlaceSearch({
  center,
  initialQuery = '',
  suggestAsYouType = false,
  onSelect,
}: {
  center: [number, number];
  initialQuery?: string;
  suggestAsYouType?: boolean;
  onSelect: (place: MapPlace) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<MapPlace[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [open, setOpen] = useState(false);
  const [edited, setEdited] = useState(false);
  const [composing, setComposing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const sequence = useRef(0);
  const request = useRef<AbortController | undefined>(undefined);
  const timer = useRef<number | undefined>(undefined);
  const composition = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const resultsId = useId();

  const cancel = useCallback(() => {
    window.clearTimeout(timer.current);
    sequence.current++;
    request.current?.abort();
    request.current = undefined;
    setBusy(false);
  }, []);
  const dismiss = useCallback(() => {
    cancel();
    setOpen(false);
    setEdited(false);
    setActiveIndex(-1);
  }, [cancel]);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) dismiss();
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.clearTimeout(timer.current);
      sequence.current++;
      request.current?.abort();
    };
  }, [dismiss]);

  const search = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (request.current || composition.current || query.trim().length < 2) return;
    const token = ++sequence.current;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setOpen(true);
    setError('');
    setResults([]);
    setActiveIndex(-1);
    setSearched(false);
    try {
      const parameters = new URLSearchParams({
        q: query.trim(),
        lon: String(center[0]),
        lat: String(center[1]),
      });
      const { places } = await localRequest<{ places: MapPlace[] }>(`maps/search?${parameters}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
      });
      if (sequence.current === token) {
        setResults(places);
        setSearched(true);
      }
    } catch (e) {
      if (sequence.current === token && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : '地点搜索失败，请重试。');
    } finally {
      if (sequence.current === token) {
        request.current = undefined;
        setBusy(false);
      }
    }
  }, [query, center[0], center[1]]);

  useEffect(() => {
    if (suggestAsYouType && edited && !composing && query.trim().length >= 2)
      timer.current = window.setTimeout(() => void search(), 600);
    return () => window.clearTimeout(timer.current);
  }, [suggestAsYouType, edited, composing, search]);

  useEffect(() => {
    const option = list.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!option || !list.current) return;
    const item = option.getBoundingClientRect(),
      viewport = list.current.getBoundingClientRect();
    if (item.top < viewport.top) list.current.scrollTop -= viewport.top - item.top;
    else if (item.bottom > viewport.bottom) list.current.scrollTop += item.bottom - viewport.bottom;
  }, [activeIndex]);

  function choose(place: MapPlace) {
    dismiss();
    setQuery(place.name);
    setResults([]);
    setSearched(false);
    onSelect(place);
  }
  return (
    <div className="place-search" ref={root}>
      <form
        className="place-search-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!composition.current) void search();
        }}
      >
        <Search size={16} />
        <input
          aria-label="搜索具体地点"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && results.length > 0}
          aria-controls={open && results.length ? resultsId : undefined}
          aria-activedescendant={
            open && activeIndex >= 0 ? `${resultsId}-${activeIndex}` : undefined
          }
          autoComplete="off"
          value={query}
          maxLength={200}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            cancel();
            setQuery(e.target.value);
            setResults([]);
            setSearched(false);
            setError('');
            setEdited(true);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onCompositionStart={() => {
            composition.current = true;
            setComposing(true);
            cancel();
          }}
          onCompositionEnd={(e) => {
            composition.current = false;
            setComposing(false);
            setQuery(e.currentTarget.value);
            setEdited(true);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (composition.current || e.nativeEvent.isComposing) return;
            if (e.key === 'Escape' && open) {
              e.preventDefault();
              e.stopPropagation();
              dismiss();
            } else if (e.key === 'Tab') dismiss();
            else if (results.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              e.preventDefault();
              setOpen(true);
              setActiveIndex((index) =>
                index < 0
                  ? e.key === 'ArrowDown'
                    ? 0
                    : results.length - 1
                  : (index + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length,
              );
            } else if (e.key === 'Enter' && open && activeIndex >= 0) {
              e.preventDefault();
              choose(results[activeIndex]);
            }
          }}
          placeholder="景点、车站、餐厅或地址"
        />
        <button type="submit" disabled={busy || query.trim().length < 2} aria-label="搜索地点">
          {busy ? <LoaderCircle size={16} className="spin" /> : '搜索'}
        </button>
      </form>
      <p className="place-search-note">
        {suggestAsYouType
          ? '输入后自动查找地点，日文或英文名称通常更准确。'
          : '搜索日本境内地点，日文或英文名称通常更准确。'}
      </p>
      {open && busy && (
        <p className="place-search-status" role="status">
          正在查找地点……
        </p>
      )}
      {open && error && (
        <p className="place-search-error" role="alert">
          {error}
        </p>
      )}
      {open && searched && !results.length && (
        <p className="place-search-error" role="status">
          没有找到地点。试试日文、英文或更完整的名称，也可以在地图上选点。
        </p>
      )}
      {open && !!results.length && (
        <div
          className="place-results"
          id={resultsId}
          ref={list}
          role="listbox"
          aria-label="地点搜索结果"
          data-map-overlay
        >
          {results.map((place, index) => (
            <button
              type="button"
              role="option"
              id={`${resultsId}-${index}`}
              aria-selected={index === activeIndex}
              tabIndex={-1}
              key={place.id}
              onClick={() => choose(place)}
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
