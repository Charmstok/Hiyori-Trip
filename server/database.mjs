import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseTrip } from '../src/lib/validation.ts';

export function openDatabase(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, 'hiyori.sqlite');
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT NOT NULL,
      destination TEXT NOT NULL, start_date TEXT NOT NULL, notes TEXT NOT NULL,
      color TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS days (
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      id TEXT NOT NULL, position INTEGER NOT NULL, title TEXT NOT NULL, notes TEXT NOT NULL,
      PRIMARY KEY (trip_id, id)
    );
    CREATE TABLE IF NOT EXISTS activities (
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE, day_id TEXT, id TEXT NOT NULL,
      position INTEGER NOT NULL, title TEXT NOT NULL, time TEXT NOT NULL,
      duration TEXT NOT NULL, category TEXT NOT NULL, city TEXT NOT NULL,
      address TEXT NOT NULL, notes TEXT NOT NULL, cost REAL NOT NULL,
      longitude REAL, latitude REAL,
      PRIMARY KEY (trip_id, id),
      FOREIGN KEY (trip_id, day_id) REFERENCES days(trip_id, id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS days_order ON days(trip_id, position);
    CREATE INDEX IF NOT EXISTS activities_order ON activities(trip_id, day_id, position);
    CREATE TABLE IF NOT EXISTS migrated_trips (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS purged_trips (id TEXT PRIMARY KEY);

  `);
  // Version 1 required a date for every activity. Migrate in one transaction to allow undated plans.
  if (
    db
      .prepare('PRAGMA table_info(activities)')
      .all()
      .find((c) => c.name === 'day_id')?.notnull
  ) {
    transaction(() =>
      db.exec(`
      CREATE TABLE activities_v2 (
        trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE, day_id TEXT, id TEXT NOT NULL,
        position INTEGER NOT NULL, title TEXT NOT NULL, time TEXT NOT NULL,
        duration TEXT NOT NULL, category TEXT NOT NULL, city TEXT NOT NULL,
        address TEXT NOT NULL, notes TEXT NOT NULL, cost REAL NOT NULL,
        longitude REAL, latitude REAL, PRIMARY KEY (trip_id, id),
        FOREIGN KEY (trip_id, day_id) REFERENCES days(trip_id, id) ON DELETE CASCADE
      );
      INSERT INTO activities_v2 SELECT * FROM activities;
      DROP TABLE activities;
      ALTER TABLE activities_v2 RENAME TO activities;
      CREATE INDEX activities_order ON activities(trip_id, day_id, position);
      PRAGMA user_version = 2;
    `),
    );
  }
  if (
    !db
      .prepare('PRAGMA table_info(trips)')
      .all()
      .some((c) => c.name === 'deleted_at')
  ) {
    transaction(() => db.exec('ALTER TABLE trips ADD COLUMN deleted_at TEXT'));
  }
  db.exec('PRAGMA user_version = 3');
  const putTrip =
    db.prepare(`INSERT INTO trips (id,title,subtitle,destination,start_date,notes,color,created_at,updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title, subtitle=excluded.subtitle,
    destination=excluded.destination, start_date=excluded.start_date, notes=excluded.notes,
    color=excluded.color, updated_at=excluded.updated_at`);
  const deleteActivities = db.prepare('DELETE FROM activities WHERE trip_id = ?');
  const deleteDays = db.prepare('DELETE FROM days WHERE trip_id = ?');
  const putDay = db.prepare('INSERT INTO days VALUES (?, ?, ?, ?, ?)');
  const putActivity = db.prepare(
    'INSERT INTO activities VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function write(trip) {
    putTrip.run(
      trip.id,
      trip.title,
      trip.subtitle,
      trip.destination || '',
      trip.startDate,
      trip.notes,
      trip.color,
      trip.createdAt,
      trip.updatedAt,
    );
    deleteActivities.run(trip.id);
    deleteDays.run(trip.id);
    function writeActivities(activities, dayId) {
      activities.forEach((a, position) =>
        putActivity.run(
          trip.id,
          dayId,
          a.id,
          position,
          a.title,
          a.time,
          a.duration,
          a.category,
          a.city,
          a.address,
          a.notes,
          a.cost,
          a.coordinates?.[0] ?? null,
          a.coordinates?.[1] ?? null,
        ),
      );
    }
    trip.days.forEach((day, index) => {
      putDay.run(trip.id, day.id, index, day.title, day.notes);
      writeActivities(day.activities, day.id);
    });
    writeActivities(trip.unscheduled, null);
  }
  function activityFromRow(a) {
    return {
      id: a.id,
      title: a.title,
      time: a.time,
      duration: a.duration,
      category: a.category,
      city: a.city,
      address: a.address,
      notes: a.notes,
      cost: a.cost,
      ...(a.longitude !== null ? { coordinates: [a.longitude, a.latitude] } : {}),
    };
  }
  const dayRows = db.prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY position');
  const activityRows = db.prepare('SELECT * FROM activities WHERE trip_id = ? ORDER BY position');
  function all(deleted = false) {
    return db
      .prepare(
        deleted
          ? 'SELECT * FROM trips WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'
          : 'SELECT * FROM trips WHERE deleted_at IS NULL ORDER BY updated_at DESC',
      )
      .all()
      .map((t) => {
        const activities = activityRows.all(t.id);
        return {
          id: t.id,
          title: t.title,
          subtitle: t.subtitle,
          destination: t.destination,
          startDate: t.start_date,
          notes: t.notes,
          color: t.color,
          createdAt: t.created_at,
          updatedAt: t.updated_at,
          ...(deleted ? { deletedAt: t.deleted_at } : {}),
          unscheduled: activities.filter((a) => a.day_id === null).map(activityFromRow),
          days: dayRows.all(t.id).map((d) => ({
            id: d.id,
            title: d.title,
            notes: d.notes,
            activities: activities.filter((a) => a.day_id === d.id).map(activityFromRow),
          })),
        };
      });
  }
  return {
    file,
    all: () => all(),
    trash: () => all(true),
    save(value) {
      const trip = parseTrip(value);
      transaction(() => {
        if (db.prepare('SELECT id FROM purged_trips WHERE id = ?').get(trip.id))
          throw new Error('这段旅程已被永久删除，无法再次保存。');
        if (db.prepare('SELECT deleted_at FROM trips WHERE id = ?').get(trip.id)?.deleted_at)
          throw new Error('这段旅程已在最近删除中，请先恢复后编辑。');
        write(trip);
      });
    },
    remove(id) {
      return transaction(() => {
        const existing = db.prepare('SELECT deleted_at FROM trips WHERE id = ?').get(id);
        if (!existing) throw new Error('旅程不存在，请刷新页面后重试。');
        if (!existing.deleted_at)
          db.prepare('UPDATE trips SET deleted_at = ? WHERE id = ?').run(
            new Date().toISOString(),
            id,
          );
        return all(true).find((t) => t.id === id);
      });
    },
    restore(id) {
      return transaction(() => {
        const result = db
          .prepare(
            'UPDATE trips SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL',
          )
          .run(new Date().toISOString(), id);
        if (!result.changes) throw new Error('最近删除中已没有这段旅程，请刷新后重试。');
        return all().find((t) => t.id === id);
      });
    },
    purge(id) {
      transaction(() => {
        const row = db.prepare('SELECT deleted_at FROM trips WHERE id = ?').get(id);
        if (!row?.deleted_at) throw new Error('只能永久删除最近删除中的旅程。');
        db.prepare('INSERT OR IGNORE INTO purged_trips VALUES (?)').run(id);
        db.prepare('INSERT OR IGNORE INTO migrated_trips VALUES (?)').run(id);
        db.prepare('DELETE FROM trips WHERE id = ?').run(id);
      });
    },
    migrate(values) {
      if (!Array.isArray(values)) throw new Error('无法读取旧版行程。');
      const trips = values.map(parseTrip);
      const seen = db.prepare('SELECT id FROM migrated_trips WHERE id = ?');
      const exists = db.prepare('SELECT id FROM trips WHERE id = ?');
      const mark = db.prepare('INSERT INTO migrated_trips VALUES (?)');
      return transaction(() => {
        let count = 0;
        for (const trip of trips) {
          if (
            seen.get(trip.id) ||
            db.prepare('SELECT id FROM purged_trips WHERE id = ?').get(trip.id)
          )
            continue;
          if (!exists.get(trip.id)) {
            write(trip);
            count++;
          }
          mark.run(trip.id);
        }
        return count;
      });
    },
    backup(path) {
      db.exec(`VACUUM INTO '${path.replaceAll("'", "''")}'`);
    },
    close() {
      db.close();
    },
  };
}
