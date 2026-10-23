import { create } from 'zustand';
import { deleteTrip, migrateLegacyTrips, putTrip, readTrips, restoreTrip, purgeTrip } from './db';
import type { Trip, DeletedTrip } from '../types';

const failed = new Set<string>();
let loading: Promise<void> | undefined;
interface State {
  trips: Trip[];
  trash: DeletedTrip[];
  busyIds: string[];
  ready: boolean;
  pending: number;
  error: string;
  storageFailed: boolean;
  undoStack: { tripId: string; before: Trip }[];
  load: () => Promise<void>;
  save: (trip: Trip, undo?: boolean) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  restore: (id: string) => Promise<boolean>;
  purge: (id: string) => Promise<boolean>;
  retry: () => Promise<void>;
  undo: () => Promise<void>;
}
export const useTrips = create<State>((set, get) => ({
  trips: [],
  trash: [],
  busyIds: [],
  ready: false,
  pending: 0,
  error: '',
  storageFailed: false,
  undoStack: [],
  load: () => {
    if (loading) return loading;
    loading = (async () => {
      try {
        let migrationError = '';
        try {
          await migrateLegacyTrips();
        } catch {
          migrationError = '旧版浏览器行程未能迁移，原数据仍保留。请保持原浏览器，稍后点击重试。';
        }
        const { trips, trash } = await readTrips();
        set({ trips, trash, ready: true, storageFailed: !!migrationError, error: migrationError });
      } catch {
        set({
          ready: true,
          storageFailed: true,
          error: '无法读取 SQLite 数据库，请确认本地服务仍在运行，然后重试。',
        });
      } finally {
        loading = undefined;
      }
    })();
    return loading;
  },
  save: async (trip, undo = true) => {
    const before = get().trips.find((t) => t.id === trip.id);
    const updated = { ...trip, updatedAt: new Date().toISOString() };
    set((s) => ({
      trips: [updated, ...s.trips.filter((t) => t.id !== trip.id)],
      pending: s.pending + 1,
      undoStack:
        undo && before
          ? [...s.undoStack.slice(-19), { tripId: trip.id, before: structuredClone(before) }]
          : s.undoStack,
    }));
    try {
      await putTrip(updated);
      failed.delete(trip.id);
      if (!failed.size) set({ storageFailed: false, error: '' });
      return true;
    } catch {
      failed.add(trip.id);
      set({
        error: '未能写入 SQLite，修改仍留在页面中。请检查本地服务和磁盘空间，然后点击重试。',
        storageFailed: true,
      });
      return false;
    } finally {
      set((s) => ({ pending: s.pending - 1 }));
    }
  },
  remove: async (id) => {
    if (get().busyIds.includes(id)) return false;
    const current = get().trips.find((t) => t.id === id);
    if (!current) return false;
    set((s) => ({ pending: s.pending + 1, busyIds: [...s.busyIds, id] }));
    try {
      // Flush the latest on-screen edits before moving the saved trip to Recently Deleted.
      if (!(await get().save(current, false))) return false;
      const { trip } = await deleteTrip(id);
      failed.delete(id);
      set((s) => ({
        trips: s.trips.filter((t) => t.id !== id),
        trash: [trip, ...s.trash.filter((t) => t.id !== id)],
        undoStack: s.undoStack.filter((x) => x.tripId !== id),
        error: '',
      }));
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '移到最近删除失败，请重试。' });
      return false;
    } finally {
      set((s) => ({ pending: s.pending - 1, busyIds: s.busyIds.filter((x) => x !== id) }));
    }
  },
  restore: async (id) => {
    if (get().busyIds.includes(id)) return false;
    set((s) => ({ pending: s.pending + 1, busyIds: [...s.busyIds, id] }));
    try {
      const { trip } = await restoreTrip(id);
      set((s) => ({
        trips: [trip, ...s.trips.filter((t) => t.id !== id)],
        trash: s.trash.filter((t) => t.id !== id),
        error: '',
      }));
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '恢复失败，请重试。' });
      return false;
    } finally {
      set((s) => ({ pending: s.pending - 1, busyIds: s.busyIds.filter((x) => x !== id) }));
    }
  },
  purge: async (id) => {
    if (get().busyIds.includes(id)) return false;
    set((s) => ({ pending: s.pending + 1, busyIds: [...s.busyIds, id] }));
    try {
      await purgeTrip(id);
      set((s) => ({ trash: s.trash.filter((t) => t.id !== id), error: '' }));
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '永久删除失败，请重试。' });
      return false;
    } finally {
      set((s) => ({ pending: s.pending - 1, busyIds: s.busyIds.filter((x) => x !== id) }));
    }
  },
  retry: async () => {
    if (!failed.size) return get().load();
    for (const id of [...failed]) {
      const trip = get().trips.find((t) => t.id === id);
      if (trip) await get().save(trip, false);
    }
  },
  undo: async () => {
    const entry = get().undoStack.at(-1);
    if (!entry) return;
    set((s) => ({ undoStack: s.undoStack.slice(0, -1) }));
    await get().save(entry.before, false);
  },
}));
