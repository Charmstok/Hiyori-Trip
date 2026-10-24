import { useEffect, useRef, useState } from 'react';
import { cityRegions, findCity, prefectures } from '../lib/cities';

export function CitySelector({
  value,
  onChange,
  label = '城市',
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const selected = findCity(value);
  const [region, setRegion] = useState(selected?.prefecture.region || '');
  const [prefectureName, setPrefectureName] = useState(selected?.prefecture.name || '');
  const [manual, setManual] = useState(!!value && !selected);
  const emitted = useRef<string | undefined>(undefined);
  function change(value: string) {
    emitted.current = value;
    onChange(value);
  }
  useEffect(() => {
    if (emitted.current === value) {
      emitted.current = undefined;
      return;
    }
    emitted.current = undefined;
    if (!value) return;
    const city = findCity(value);
    if (city) {
      setRegion(city.prefecture.region);
      setPrefectureName(city.prefecture.name);
      setManual(false);
    } else setManual(true);
  }, [value]);
  const prefecture = prefectures.find((p) => p.name === prefectureName && p.region === region);
  return (
    <fieldset className="city-cascade">
      <legend>
        {label} <span className="optional">可选</span>
      </legend>
      {!manual ? (
        <div className="city-cascade-fields">
          <select
            aria-label={`${label}所在地区`}
            value={region}
            onChange={(e) => {
              setRegion(e.target.value);
              setPrefectureName('');
              change('');
            }}
          >
            <option value="">选择地区</option>
            {cityRegions.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
          <select
            aria-label={`${label}所在都道府县`}
            value={prefectureName}
            disabled={!region}
            onChange={(e) => {
              setPrefectureName(e.target.value);
              change('');
            }}
          >
            <option value="">选择都道府县</option>
            {prefectures
              .filter((p) => p.region === region)
              .map((p) => (
                <option key={p.name}>{p.name}</option>
              ))}
          </select>
          <select
            aria-label={label}
            disabled={!prefecture}
            value={selected?.prefecture.name === prefectureName ? selected.value : ''}
            onChange={(e) => change(e.target.value)}
          >
            <option value="">选择城市 / 市区町村</option>
            {prefecture?.cities.map((city) => (
              <option key={city.value} value={city.value}>
                {city.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input
          aria-label={`自定义${label}`}
          value={value}
          maxLength={100}
          placeholder="输入城市名称"
          onChange={(e) => change(e.target.value)}
        />
      )}
      <button
        className="city-input-mode"
        type="button"
        onClick={() => {
          setManual(!manual);
          change('');
        }}
      >
        {manual ? '返回地区选择' : '手动填写其他地名'}
      </button>
    </fieldset>
  );
}
