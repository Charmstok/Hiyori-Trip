// A small, user-triggered client for Photon's public demo. No background or bulk lookup.
export function createPlaceSearch({
  fetcher = fetch,
  endpoint = process.env.HIYORI_PHOTON_URL || 'https://photon.komoot.io/api/',
} = {}) {
  const cache = new Map();
  const pending = new Map();
  let queue = Promise.resolve();
  let nextRequest = 0;
  function normalize(feature) {
    const p = feature?.properties;
    const coordinates = feature?.geometry?.coordinates;
    if (
      !p ||
      p.countrycode !== 'JP' ||
      !Array.isArray(coordinates) ||
      coordinates.length !== 2 ||
      coordinates.some((c) => typeof c !== 'number' || !Number.isFinite(c)) ||
      coordinates[0] < 122 ||
      coordinates[0] > 154 ||
      coordinates[1] < 20 ||
      coordinates[1] > 46
    )
      return;
    const city = String(p.city || p.town || p.county || p.state || '').slice(0, 100);
    const address = [
      ...new Set(
        [p.postcode, p.state, p.city, p.district, p.locality, p.street, p.housenumber].filter(
          Boolean,
        ),
      ),
    ]
      .join(' · ')
      .slice(0, 500);
    const value = p.osm_value;
    const category = ['restaurant', 'cafe', 'fast_food', 'bar', 'food_court'].includes(value)
      ? '餐饮'
      : ['hotel', 'hostel', 'guest_house'].includes(value)
        ? '住宿'
        : ['station', 'halt', 'bus_stop', 'airport'].includes(value)
          ? '交通'
          : p.osm_key === 'shop'
            ? '购物'
            : '景点';
    return {
      id: `${p.osm_type || ''}${p.osm_id || coordinates.join(',')}`,
      name: String(p.name || p.street || city || '地图上的地点').slice(0, 200),
      address,
      city,
      coordinates,
      category,
      source: 'search',
    };
  }
  return async function search(parameters) {
    const query = (parameters.get('q') || '').trim();
    if (query.length < 2 || query.length > 200)
      throw new Error('请输入 2–200 个字符的地点名称或地址。');
    const lon = Number(parameters.get('lon')),
      lat = Number(parameters.get('lat'));
    const biased =
      parameters.has('lon') &&
      parameters.has('lat') &&
      Number.isFinite(lon) &&
      Number.isFinite(lat) &&
      lon >= 122 &&
      lon <= 154 &&
      lat >= 20 &&
      lat <= 46;
    const key = JSON.stringify([query, biased ? lon.toFixed(2) : '', biased ? lat.toFixed(2) : '']);
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 4) throw new Error('地点搜索繁忙，请稍后再试。');
    const task = queue.then(async () => {
      const wait = Math.max(0, nextRequest - Date.now());
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      nextRequest = Date.now() + 1100;
      const url = new URL(endpoint);
      url.searchParams.set('q', query);
      url.searchParams.set('limit', '12');
      url.searchParams.set('bbox', '122,20,154,46');
      if (biased) {
        url.searchParams.set('lon', String(lon));
        url.searchParams.set('lat', String(lat));
      }
      let response;
      try {
        response = await fetcher(url, {
          signal: AbortSignal.timeout(12000),
          headers: {
            'User-Agent': 'HiyoriTrip/0.1 (+https://github.com/Charmstok/Hiyori-Trip)',
            Accept: 'application/json',
          },
        });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!Array.isArray(data.features)) throw new Error();
        const seen = new Set();
        const places = data.features
          .slice(0, 30)
          .map(normalize)
          .filter((p) => p && !seen.has(p.id) && seen.add(p.id))
          .slice(0, 10);
        const value = { places };
        if (cache.size >= 100) cache.delete(cache.keys().next().value);
        cache.set(key, { value, expires: Date.now() + 3600_000 });
        return value;
      } catch {
        throw new Error(
          '暂时无法连接地点搜索。可以稍后重试、换用日文或英文名称，或直接在地图上选点。',
        );
      }
    });
    pending.set(key, task);
    queue = task.catch(() => {});
    try {
      return await task;
    } finally {
      pending.delete(key);
    }
  };
}
