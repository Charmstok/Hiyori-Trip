import { Document, Page, Text, View, Font, StyleSheet, Svg, Path, pdf } from '@react-pdf/renderer';
import type { Trip, Day } from '../types';
import { dateAt, dateLabel, dateRange, totalActivities, totalCost, tripCities } from './trips';
import { mainMapPath, islandMapPath } from './map-geometry';

Font.register({ family: 'Hiyori', src: '/fonts/NotoSansSC-Regular.woff' });
Font.registerHyphenationCallback((word) => Array.from(word));
const styles = StyleSheet.create({
  page: {
    fontFamily: 'Hiyori',
    fontSize: 10,
    color: '#293d33',
    paddingTop: 42,
    paddingBottom: 55,
    paddingHorizontal: 44,
    backgroundColor: '#faf9f4',
  },
  brand: { fontSize: 10, color: '#59715f', letterSpacing: 2, marginBottom: 25 },
  label: { fontSize: 8, color: '#778374', letterSpacing: 1.5, marginBottom: 10 },
  title: { fontSize: 30, lineHeight: 1.5, marginBottom: 12 },
  subtitle: { fontSize: 11, color: '#788171', marginBottom: 18 },
  map: { width: 320, height: 230, alignSelf: 'center', marginTop: 15, marginBottom: 15 },
  overview: { paddingVertical: 10, borderTop: '1 solid #dfe3d7', flexDirection: 'row', gap: 15 },
  dayNumber: { fontSize: 10, color: '#7b8b76', width: 55 },
  overviewTitle: { flex: 1, fontSize: 11 },
  muted: { color: '#7a8475', fontSize: 9 },
  section: { fontSize: 12, marginTop: 20, marginBottom: 10 },
  note: { fontSize: 10, color: '#6e7769', lineHeight: 1.8 },
  dayTitle: { fontSize: 23, lineHeight: 1.5, marginBottom: 10 },
  rule: { borderTop: '1 solid #dfe3d7', marginBottom: 20, marginTop: 5 },
  activity: { paddingBottom: 15, marginBottom: 15, borderBottom: '1 solid #e6e6dc' },
  activityHeading: { flexDirection: 'row', gap: 15, marginBottom: 5 },
  time: { width: 55, color: '#6d7e67', fontSize: 10 },
  activityName: { fontSize: 14, flex: 1, lineHeight: 1.6 },
  detail: { paddingLeft: 70, color: '#778171', fontSize: 9, marginBottom: 4 },
  activityNote: { paddingLeft: 70, fontSize: 10, color: '#53604f', lineHeight: 1.8 },
  dayNote: { marginTop: 15, padding: 15, backgroundColor: '#f0f0e6' },
  // Dynamic page-number text must use default leading: repeated layout can rescale inherited numeric lineHeight.
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 44,
    right: 44,
    fontSize: 8,
    textAlign: 'center',
    color: '#7b8473',
  },
});
const Footer = () => (
  <Text
    style={styles.footer}
    fixed
    render={({ pageNumber, totalPages }) =>
      `日和旅 / HIYORI TRIP                        ${pageNumber} / ${totalPages}`
    }
  />
);

export function TripDocument({ trip }: { trip: Trip }) {
  const sections: { day: Day; index: number }[] = trip.days.map((day, index) => ({ day, index }));
  if (trip.unscheduled.length)
    sections.push({
      day: {
        id: 'unscheduled',
        title: '待规划 · 想去的地方',
        notes: '',
        activities: trip.unscheduled,
      },
      index: -1,
    });
  return (
    <Document title={trip.title} author="Hiyori Trip" subject="本地生成的旅行行程" language="zh-CN">
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>HIYORI / 日和旅</Text>
        <Text style={styles.label}>YOUR JOURNEY, YOUR RHYTHM</Text>
        <Text style={styles.title}>{trip.title}</Text>
        <Text style={styles.subtitle}>{trip.subtitle}</Text>
        <Text style={styles.muted}>
          {dateRange(trip)} · {trip.days.length} 天 · {totalActivities(trip)} 段安排
          {trip.unscheduled.length ? `（${trip.unscheduled.length} 段待规划）` : ''}
        </Text>
        <Svg viewBox="0 0 700 510" style={styles.map}>
          <Path d={mainMapPath} fill="#c8d2be" />
          <Path d={islandMapPath} fill="#c8d2be" />
        </Svg>
        <Text style={styles.muted}>
          {tripCities(trip).join(' / ') || '把时间留给喜欢的事。'}
          {totalCost(trip) > 0 ? ` · 预计花费 JPY ${totalCost(trip).toLocaleString('zh-CN')}` : ''}
        </Text>
        <Text style={styles.section}>旅程一览</Text>
        {trip.days.map((d, i) => (
          <View key={d.id} style={styles.overview} wrap={false}>
            <Text style={styles.dayNumber}>DAY {String(i + 1).padStart(2, '0')}</Text>
            <Text style={styles.overviewTitle}>{d.title || '自由安排'}</Text>
            <Text style={styles.muted}>{dateAt(trip.startDate, i).slice(5).replace('-', '/')}</Text>
          </View>
        ))}
        {trip.unscheduled.length > 0 && (
          <View style={styles.overview} wrap={false}>
            <Text style={styles.dayNumber}>待规划</Text>
            <Text style={styles.overviewTitle}>{trip.unscheduled.length} 个想去的地方</Text>
            <Text style={styles.muted}>日期未定</Text>
          </View>
        )}
        {trip.notes && (
          <View>
            <Text style={styles.section}>旅程随手记</Text>
            <Text style={styles.note}>{trip.notes}</Text>
          </View>
        )}
        <Footer />
      </Page>
      {sections.map(({ day, index: i }) => (
        <Page key={day.id} size="A4" style={styles.page}>
          <Text style={styles.brand} fixed>
            HIYORI / {trip.title}
          </Text>
          <Text style={styles.label}>
            {i < 0
              ? 'SOMEDAY, SOMEWHERE / 日期未定'
              : `DAY ${String(i + 1).padStart(2, '0')} / ${dateLabel(dateAt(trip.startDate, i), true)}`}
          </Text>
          <Text style={styles.dayTitle}>{day.title || '把时间留给喜欢的事'}</Text>
          <Text style={styles.subtitle}>
            {day.activities.length} 段安排 · JPY{' '}
            {day.activities.reduce((n, a) => n + a.cost, 0).toLocaleString('zh-CN')}
          </Text>
          <View style={styles.rule} />
          {day.activities.map((a) => (
            <View key={a.id} style={styles.activity}>
              <View style={styles.activityHeading} wrap={false}>
                <Text style={styles.time}>{a.time || '自由安排'}</Text>
                <Text style={styles.activityName}>{a.title}</Text>
              </View>
              <Text style={styles.detail}>
                {[
                  a.category,
                  a.city,
                  a.duration,
                  a.cost > 0 ? `JPY ${a.cost.toLocaleString('zh-CN')}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {a.address && <Text style={styles.detail}>{a.address}</Text>}
              {a.notes && <Text style={styles.activityNote}>{a.notes}</Text>}
            </View>
          ))}
          {!day.activities.length && <Text style={styles.note}>留白，也是旅行的一部分。</Text>}
          {day.notes && (
            <View style={styles.dayNote}>
              <Text style={styles.label}>这一天的随手记</Text>
              <Text style={styles.note}>{day.notes}</Text>
            </View>
          )}
          <Footer />
        </Page>
      ))}
    </Document>
  );
}
export async function createPdf(trip: Trip): Promise<Blob> {
  return pdf(<TripDocument trip={trip} />).toBlob();
}
