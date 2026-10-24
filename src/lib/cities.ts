import data from '../data/cities.json' with { type: 'json' };

export const prefectures = data.prefectures;
export const cityRegions = [...new Set(prefectures.map((p) => p.region))];
export const allCities = prefectures.flatMap((prefecture) =>
  prefecture.cities.map((city) => ({ ...city, prefecture })),
);
export type CityRecord = (typeof allCities)[number];
const values = new Map(allCities.map((city) => [city.value, city]));
const aliases = new Map<string, CityRecord[]>();
for (const city of allCities) {
  const names = [city.name, city.ja, city.ja.replace(/^.*郡/, '')];
  if (city.value === '东京') names.push('東京', '東京都', '东京都');
  for (const name of new Set(names)) aliases.set(name, [...(aliases.get(name) || []), city]);
}
export function findCity(value: string, address = ''): CityRecord | undefined {
  if (values.has(value)) return values.get(value);
  const matches = aliases.get(value) || [];
  if (matches.length === 1) return matches[0];
  return matches.find(
    (city) => address.includes(city.prefecture.ja) || address.includes(city.prefecture.name),
  );
}
export function cityValueForName(value: string, address = '') {
  return findCity(value, address)?.value || value;
}
export function cityCenter(value: string): [number, number] | undefined {
  const city = findCity(value);
  return city ? (city.coordinates as [number, number]) : undefined;
}
