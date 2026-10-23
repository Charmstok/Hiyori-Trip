import { ArrowLeft, CalendarDays, LoaderCircle, RotateCcw, Route, Trash2 } from 'lucide-react';
import type { DeletedTrip } from '../types';
import { dateRange, totalActivities } from '../lib/trips';

export function RecentlyDeleted({
  trips,
  busyIds,
  onRestore,
  onDelete,
  onBack,
}: {
  trips: DeletedTrip[];
  busyIds: string[];
  onRestore: (trip: DeletedTrip) => void;
  onDelete: (trip: DeletedTrip) => void;
  onBack: () => void;
}) {
  return (
    <main className="recent-main">
      <button className="button text recent-back" onClick={onBack}>
        <ArrowLeft size={15} />
        我的旅程
      </button>
      <div className="recent-heading">
        <p className="eyebrow">RECENTLY DELETED</p>
        <h1>
          最近删除 <span className="count-pill">{trips.length}</span>
        </h1>
        <p>旅程会一直保留在这里，可随时恢复。只有永久删除才会清除数据。</p>
      </div>
      {trips.length ? (
        <div className="deleted-list">
          {trips.map((trip) => {
            const busy = busyIds.includes(trip.id);
            return (
              <article key={trip.id} className="deleted-trip">
                <div className="deleted-trip-symbol">
                  <Trash2 size={21} strokeWidth={1.5} />
                </div>
                <div className="deleted-trip-info">
                  <h2>{trip.title}</h2>
                  <p className="deleted-trip-meta">
                    <span>
                      <CalendarDays size={13} />
                      {dateRange(trip)}
                    </span>
                    <span>
                      <Route size={13} />
                      {totalActivities(trip)} 段安排
                    </span>
                  </p>
                  <p className="deleted-trip-time">
                    删除于{' '}
                    {new Intl.DateTimeFormat('zh-CN', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(trip.deletedAt))}
                  </p>
                </div>
                <div className="deleted-trip-actions">
                  <button
                    className="button secondary small"
                    disabled={busy}
                    onClick={() => onRestore(trip)}
                    aria-label={`恢复${trip.title}`}
                  >
                    {busy ? <LoaderCircle size={15} className="spin" /> : <RotateCcw size={15} />}
                    恢复旅程
                  </button>
                  <button
                    className="button text danger-text small"
                    disabled={busy}
                    onClick={() => onDelete(trip)}
                    aria-label={`永久删除${trip.title}`}
                  >
                    <Trash2 size={15} />
                    永久删除
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="recent-empty">
          <span>
            <Trash2 size={30} strokeWidth={1} />
          </span>
          <h2>最近删除为空</h2>
          <p>从“我的旅程”删除的旅程，会先保留在这里。</p>
          <button className="button secondary" onClick={onBack}>
            <ArrowLeft size={15} />
            返回我的旅程
          </button>
        </div>
      )}
    </main>
  );
}
