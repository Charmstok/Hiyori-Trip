import type { Trip, DeletedTrip } from '../types';

export interface SavedFile {
  path: string;
  name: string;
}

export async function localRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      signal: AbortSignal.timeout(30_000),
      ...options,
      headers: { 'X-Hiyori-Local': '1', ...options.headers },
    });
  } catch {
    throw new Error('无法连接本地服务，请确认日和旅仍在运行，然后重试。');
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '无法连接本地服务，请检查日和旅是否仍在运行。');
  return data as T;
}
let queue = Promise.resolve<unknown>(undefined);
export function writeLocal<T>(write: () => Promise<T>): Promise<T> {
  const task = queue.then(write);
  queue = task.catch(() => undefined);
  return task;
}
export const readTrips = () => localRequest<{ trips: Trip[]; trash: DeletedTrip[] }>('trips');
export const putTrip = (trip: Trip) =>
  writeLocal(() =>
    localRequest('trips', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trip),
    }),
  );
export const deleteTrip = (id: string) =>
  writeLocal(() =>
    localRequest<{ trip: DeletedTrip }>(`trips/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  );
export const restoreTrip = (id: string) =>
  writeLocal(() =>
    localRequest<{ trip: Trip }>(`trips/${encodeURIComponent(id)}/restore`, { method: 'POST' }),
  );
export const purgeTrip = (id: string) =>
  writeLocal(() => localRequest(`trash/${encodeURIComponent(id)}`, { method: 'DELETE' }));
export const saveFile = (blob: Blob, name: string) =>
  localRequest<SavedFile>(`exports?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': blob.type },
    body: blob,
  });
export const backupDatabase = () =>
  writeLocal(() => localRequest<SavedFile>('backup', { method: 'POST' }));

// SQLite remembers imported IDs, including deleted trips, so old browser data never resurrects them.
// The original browser data stays intact until the user chooses to clear it themselves.
export async function migrateLegacyTrips() {
  const trips = await new Promise<Trip[]>((resolve, reject) => {
    const request = indexedDB.open('hiyori-trip');
    let absent = false;
    request.onupgradeneeded = () => {
      absent = true;
      request.transaction?.abort();
    };
    request.onerror = () => (absent ? resolve([]) : reject(request.error));
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('trips')) {
        database.close();
        resolve([]);
        return;
      }
      const transaction = database.transaction('trips', 'readonly');
      const rows = transaction.objectStore('trips').getAll();
      transaction.oncomplete = () => {
        database.close();
        resolve(rows.result);
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error);
      };
    };
  });
  if (trips.length)
    await localRequest('migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trips),
    });
}
