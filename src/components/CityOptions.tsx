import { cityGroups } from '../data/places';

export function CityOptions() {
  return cityGroups.map((group) => (
    <optgroup key={group.name} label={group.name}>
      {group.cities.map((city) => (
        <option key={city.name} value={city.name}>
          {city.name} · {city.ja}
        </option>
      ))}
    </optgroup>
  ));
}
