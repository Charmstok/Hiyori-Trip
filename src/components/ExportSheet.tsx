import type { Trip } from '../types';
import type { ImagePage } from '../lib/image-pages';
import { dateAt, dateLabel } from '../lib/trips';

export function SheetBrand() {
  return (
    <div className="sheet-brand">
      <span className="sheet-wordmark">
        hiyori<span>旅</span>
      </span>
      <span>YOUR JOURNEY, YOUR RHYTHM</span>
    </div>
  );
}
export function SheetFooter({ label }: { label: string }) {
  return (
    <div className="sheet-footer">
      <span>日和旅 · HIYORI TRIP</span>
      <span>好日子，从一点小小的计划开始。</span>
      <span>{label}</span>
    </div>
  );
}
export interface SheetFlow {
  first: boolean;
  last: boolean;
  minHeight: number;
  summary: string;
  label: string;
}
export function ExportSheet({
  trip,
  page,
  flow,
}: {
  trip: Trip;
  page: ImagePage;
  flow?: SheetFlow;
}) {
  const pending = page.dayIndex < 0;
  const day = pending ? { title: '待规划 · 想去的地方' } : trip.days[page.dayIndex];
  return (
    <div
      className={`export-sheet ${flow ? 'long-section' : ''} ${flow?.first ? 'long-section-first' : ''}`}
      style={flow ? { minHeight: flow.minHeight } : undefined}
    >
      {(!flow || flow.first) && (
        <>
          <SheetBrand />
          <div className="sheet-trip-name">{trip.title}</div>
        </>
      )}
      {flow?.first && <p className="sheet-trip-summary">{flow.summary}</p>}
      {(!flow || page.part === 1 || flow.first) && (
        <>
          <div className="sheet-day-number">
            {pending ? 'SOMEDAY, SOMEWHERE' : `DAY ${String(page.dayIndex + 1).padStart(2, '0')}`}
            <span>
              {pending ? '日期未定' : dateLabel(dateAt(trip.startDate, page.dayIndex), true)}
            </span>
          </div>
          <h2>
            {day.title || '把时间留给喜欢的事'}
            {page.part > 1 && <small> / 续 {page.part}</small>}
          </h2>
        </>
      )}
      <div className="sheet-activities">
        {page.activities.map((a, i) => (
          <div className="sheet-activity" key={`${a.id}-${i}`}>
            <div className="sheet-time">
              {a.time || '自由安排'}
              <span>{a.category}</span>
            </div>
            <div className="sheet-activity-body">
              <h3>{a.title}</h3>
              <div className="sheet-activity-meta">
                {[a.city, a.duration, a.cost > 0 ? `JPY ${a.cost.toLocaleString('zh-CN')}` : '']
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              {a.address && <p className="sheet-address">{a.address}</p>}
              {a.notes && <p>{a.notes}</p>}
            </div>
          </div>
        ))}
      </div>
      {page.activities.length === 0 && !page.notes && (
        <div className="sheet-empty">留白，也是旅行的一部分。</div>
      )}
      {page.notes && (
        <div className="sheet-notes">
          <span>这一天的随手记</span>
          <p>{page.notes}</p>
        </div>
      )}
      {(!flow || flow.last) && (
        <SheetFooter
          label={
            flow
              ? flow.label
              : `${pending ? '待规划' : String(page.dayIndex + 1).padStart(2, '0')}${page.part > 1 ? `-${page.part}` : ''}`
          }
        />
      )}
    </div>
  );
}
