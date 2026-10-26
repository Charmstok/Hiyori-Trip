import type { Trip } from '../types';
import {
  scopeFilename,
  scopeSummary,
  type ExportScope,
  type ImageSection,
} from '../lib/export-scope';
import { ExportSheet, SheetBrand, SheetFooter } from './ExportSheet';

export function ExportLongSection({
  trip,
  section,
  scope,
  first,
  last,
  minHeight = 0,
}: {
  trip: Trip;
  section: ImageSection;
  scope: ExportScope;
  first: boolean;
  last: boolean;
  minHeight?: number;
}) {
  const flow = {
    first,
    last,
    minHeight,
    summary: scopeSummary(trip, scope),
    label: scopeFilename(scope),
  };
  if (section.kind === 'day') return <ExportSheet trip={trip} page={section.page} flow={flow} />;
  return (
    <div
      className={`export-sheet long-section ${first ? 'long-section-first' : ''}`}
      style={{ minHeight }}
    >
      {first && (
        <>
          <SheetBrand />
          <div className="sheet-trip-name">{trip.title}</div>
          <p className="sheet-trip-summary">{flow.summary}</p>
        </>
      )}
      <h2 className="sheet-journal-title">
        旅程随手记{section.part > 1 ? <small> / 续 {section.part}</small> : ''}
      </h2>
      <div className="sheet-notes">
        <p>{section.notes}</p>
      </div>
      {last && <SheetFooter label={flow.label} />}
    </div>
  );
}
