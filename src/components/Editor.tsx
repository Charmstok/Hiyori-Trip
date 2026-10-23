import { useRef, useState } from 'react';
import { DragDropProvider, useDroppable } from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BedDouble,
  Inbox,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Download,
  GripVertical,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Route,
  ShoppingBag,
  StickyNote,
  TrainFront,
  Trash2,
  Undo2,
  Utensils,
  Wallet,
} from 'lucide-react';
import type { Activity, Day, Place, Trip } from '../types';
import {
  activitiesIn,
  UNSCHEDULED,
  dateAt,
  dateLabel,
  dateRange,
  id,
  moveActivity,
  newActivity,
  newDay,
  totalActivities,
  totalCost,
  tripCities,
} from '../lib/trips';
import { findPlace } from '../data/places';
import { useTrips } from '../lib/store';
import { CityOptions } from './CityOptions';
import { ActivityForm } from './ActivityForm';
import { JapanMap } from './JapanMap';
import { Modal } from './Modal';

const CategoryIcon = ({
  category,
  size = 18,
}: {
  category: Activity['category'];
  size?: number;
}) => {
  const Icon =
    category === '餐饮'
      ? Utensils
      : category === '交通'
        ? TrainFront
        : category === '住宿'
          ? BedDouble
          : category === '购物'
            ? ShoppingBag
            : category === '其他'
              ? StickyNote
              : MapPin;
  return <Icon size={size} strokeWidth={1.6} />;
};
function CalendarTarget({
  containerId,
  active,
  label,
  subtitle,
  number,
  count,
  onClick,
}: {
  containerId: string;
  active: boolean;
  label: string;
  subtitle: string;
  number?: number;
  count: number;
  onClick: () => void;
}) {
  const { ref, isDropTarget } = useDroppable({
    id: `calendar:${containerId}`,
    accept: 'activity',
    data: { kind: 'calendar', containerId },
  });
  return (
    <button
      ref={ref}
      className={`day-button ${active ? 'active' : ''} ${isDropTarget ? 'drop-target' : ''} ${containerId === UNSCHEDULED ? 'unscheduled-button' : ''}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      <span className="day-number">
        {number ? String(number).padStart(2, '0') : <Inbox size={20} />}
      </span>
      <span>
        <strong>{label}</strong>
        <small>{isDropTarget ? '松开放入这里' : subtitle}</small>
      </span>
      <span className="day-activity-count">{count}</span>
    </button>
  );
}
function TimelineDrop({
  containerId,
  children,
}: {
  containerId: string;
  children: React.ReactNode;
}) {
  const { ref, isDropTarget } = useDroppable({
    id: `timeline:${containerId}`,
    accept: 'activity',
    collisionPriority: -1,
    data: { kind: 'timeline', containerId },
  });
  return (
    <div ref={ref} className={`timeline ${isDropTarget ? 'timeline-over' : ''}`}>
      {children}
    </div>
  );
}
function ActivityCard({
  activity,
  containerId,
  index,
  onEdit,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  isLast,
}: {
  activity: Activity;
  containerId: string;
  index: number;
  onEdit: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isLast: boolean;
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: activity.id,
    index,
    group: containerId,
    type: 'activity',
    data: { kind: 'activity', containerId },
  });
  return (
    <article ref={ref} className={`activity-card ${isDragging ? 'dragging' : ''}`}>
      <div className="activity-time">
        <span>{activity.time || '自由安排'}</span>
        <i />
      </div>
      <button
        ref={handleRef}
        className="drag-handle"
        aria-label={`拖动${activity.title}排序或换日期`}
      >
        <GripVertical size={17} />
      </button>
      <div className={`category-icon category-${activity.category}`}>
        <CategoryIcon category={activity.category} />
      </div>
      <div className="activity-content">
        <div className="activity-title-line">
          <button className="activity-title" onClick={onEdit}>
            {activity.title}
          </button>
          <span className="category-label">{activity.category}</span>
        </div>
        <div className="activity-meta">
          {activity.city && (
            <span>
              <MapPin size={12} />
              {activity.city}
            </span>
          )}
          {activity.duration && (
            <span>
              <Clock3 size={12} />
              {activity.duration}
            </span>
          )}
          {activity.cost > 0 && <span>¥ {activity.cost.toLocaleString('zh-CN')}</span>}
        </div>
        {activity.address && <p className="activity-address">{activity.address}</p>}
        {activity.notes && <p className="activity-note">{activity.notes}</p>}
        <div className="activity-actions">
          <button onClick={onEdit}>
            <Pencil size={13} />
            编辑 / 移动
          </button>
          <button onClick={onDuplicate} aria-label={`复制${activity.title}`} title="复制安排">
            <Copy size={13} />
          </button>
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            aria-label={`上移${activity.title}`}
            title="上移"
          >
            <ArrowUp size={13} />
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            aria-label={`下移${activity.title}`}
            title="下移"
          >
            <ArrowDown size={13} />
          </button>
          <button
            className="danger-text"
            onClick={onRemove}
            aria-label={`删除${activity.title}`}
            title="删除安排"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </article>
  );
}
interface Props {
  trip: Trip;
  onBack: () => void;
  onEditTrip: () => void;
  onExport: () => void;
  onBackup: () => void;
  notify: (message: string) => void;
  confirm: (title: string, description: string, action: () => void) => void;
}
export function Editor({ trip, onBack, onEditTrip, onExport, onBackup, notify, confirm }: Props) {
  const [dayId, setCurrentDay] = useState(trip.days[0].id);
  const [activityForm, setActivityForm] = useState<{
    activity: Activity;
    dayId: string;
    isNew: boolean;
  }>();
  const [selectedPlace, setSelectedPlace] = useState<Place>();
  const [noteModal, setNoteModal] = useState(false);
  const [tools, setTools] = useState(false);
  const [dragging, setDragging] = useState(false);
  const activeDrag = useRef<{ activityId: string; from: string } | undefined>(undefined);
  function setDayId(value: string) {
    setCurrentDay(value);
    setSelectedPlace(undefined);
  }
  const save = useTrips((s) => s.save),
    undo = useTrips((s) => s.undo),
    canUndo = useTrips((s) => s.undoStack.at(-1)?.tripId === trip.id);
  const dayIndex = Math.max(
    0,
    trip.days.findIndex((d) => d.id === dayId),
  );
  const isUnscheduled = dayId === UNSCHEDULED;
  const day: Day = isUnscheduled
    ? { id: UNSCHEDULED, title: '待规划', notes: '', activities: trip.unscheduled }
    : trip.days[dayIndex];
  const cities = tripCities(trip);
  const dayCities = [...new Set(day.activities.map((a) => a.city).filter(Boolean))];
  const place = selectedPlace || findPlace(dayCities[0] || cities[0] || '京都');
  const updateDay = (updated: Day) =>
    save(
      updated.id === UNSCHEDULED
        ? { ...trip, unscheduled: updated.activities }
        : { ...trip, days: trip.days.map((d) => (d.id === updated.id ? updated : d)) },
    );
  const addActivity = (title = '', city = dayCities[0] || cities[0] || '') =>
    setActivityForm({
      activity: { ...newActivity(city), ...(isUnscheduled ? { time: '' } : {}), title },
      dayId: day.id,
      isNew: true,
    });
  const removeActivity = (activity: Activity) => {
    void updateDay({ ...day, activities: day.activities.filter((a) => a.id !== activity.id) });
    notify('已删除安排，可撤销。');
  };
  const reorder = (activity: Activity, index: number) => {
    void save(moveActivity(trip, activity.id, day.id, day.id, index));
  };
  async function saveActivity(activity: Activity, target: string) {
    const form = activityForm!;
    let result = structuredClone(trip);
    const targetActivities = activitiesIn(result, target);
    if (!targetActivities) return;
    if ((form.isNew || form.dayId !== target) && targetActivities.length >= 200) {
      notify('每个日期和待规划区最多保存 200 段安排。');
      return;
    }
    const old = activitiesIn(result, form.dayId);
    const oldIndex = old?.findIndex((a) => a.id === activity.id) ?? -1;
    if (!form.isNew && oldIndex >= 0) old!.splice(oldIndex, 1);
    targetActivities.splice(
      !form.isNew && form.dayId === target ? oldIndex : targetActivities.length,
      0,
      activity,
    );
    const saved = await save(result);
    setActivityForm(undefined);
    setDayId(target);
    if (saved)
      notify(
        form.isNew
          ? target === UNSCHEDULED
            ? '已加入待规划。'
            : '已加入这一天。'
          : '安排已更新。',
      );
  }
  async function addDay() {
    if (trip.days.length >= 60) return;
    const d = newDay();
    await save({ ...trip, days: [...trip.days, d] });
    setDayId(d.id);
    notify('新的一天，新的期待。');
  }
  function deleteDay() {
    confirm(
      '删除这一天？',
      `第 ${dayIndex + 1} 天的 ${day.activities.length} 段安排和当日备注将一起删除。删除后可以撤销。`,
      () => {
        void save({ ...trip, days: trip.days.filter((d) => d.id !== day.id) });
        setDayId(trip.days[Math.max(0, dayIndex - 1)].id);
        notify('已删除这一天，可撤销。');
      },
    );
  }
  function shiftDay(direction: number) {
    const to = dayIndex + direction;
    if (to < 0 || to >= trip.days.length) return;
    const days = [...trip.days];
    [days[dayIndex], days[to]] = [days[to], days[dayIndex]];
    void save({ ...trip, days });
  }
  return (
    <div className="editor">
      <div className="editor-breadcrumb">
        <button onClick={onBack}>
          <ArrowLeft size={16} />
          我的旅程
        </button>
        <ChevronRight size={13} />
        <span>{trip.title}</span>
      </div>
      <div className="editor-heading">
        <div>
          <p className="eyebrow">YOUR LITTLE TRAVEL JOURNAL</p>
          <button className="editor-trip-title" onClick={onEditTrip}>
            <h1>{trip.title}</h1>
            <Pencil size={18} />
          </button>
          <p className="editor-trip-meta">
            <CalendarDays size={15} />
            {dateRange(trip)}
            <span className="meta-divider" /> {trip.days.length} 天{' '}
            <span className="meta-divider" /> {totalActivities(trip)} 段安排
            {trip.unscheduled.length > 0 ? ` · ${trip.unscheduled.length} 段待规划` : ''}
          </p>
        </div>
        <div className="editor-heading-actions">
          <button
            className="button secondary"
            disabled={!canUndo}
            onClick={() => {
              void undo();
              notify('已撤销上一次修改。');
            }}
          >
            <Undo2 size={16} />
            <span>撤销</span>
          </button>
          <button className="button primary" onClick={onExport}>
            <Download size={16} />
            导出行程
          </button>
          <div className="card-menu">
            <button
              className="icon-button"
              aria-label="旅程工具"
              aria-expanded={tools}
              onClick={() => setTools(!tools)}
            >
              <MoreHorizontal size={22} />
            </button>
            {tools && (
              <div className="dropdown">
                <button
                  onClick={() => {
                    onEditTrip();
                    setTools(false);
                  }}
                >
                  <Pencil size={15} />
                  编辑旅程信息
                </button>
                <button
                  onClick={() => {
                    setNoteModal(true);
                    setTools(false);
                  }}
                >
                  <StickyNote size={15} />
                  整段旅程备注
                </button>
                <button
                  onClick={() => {
                    onBackup();
                    setTools(false);
                  }}
                >
                  <Download size={15} />
                  备份 SQLite 数据库
                </button>
                <button className="dropdown-close" onClick={() => setTools(false)}>
                  收起
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <DragDropProvider
        onBeforeDragStart={(event) => {
          if (document.querySelector('dialog[open]')) event.preventDefault();
        }}
        onDragStart={(event) => {
          const activityId = String(event.operation.source?.id || '');
          const current = useTrips.getState().trips.find((t) => t.id === trip.id);
          const from =
            current &&
            [UNSCHEDULED, ...current.days.map((d) => d.id)].find((key) =>
              activitiesIn(current, key)?.some((a) => a.id === activityId),
            );
          activeDrag.current = from ? { activityId, from } : undefined;
          setDragging(!!from);
        }}
        onDragEnd={(event) => {
          const started = activeDrag.current;
          activeDrag.current = undefined;
          setDragging(false);
          if (event.canceled || !started) return;
          const { source, target } = event.operation;
          if (!source || !target || String(source.id) !== started.activityId) return;
          const current = useTrips.getState().trips.find((t) => t.id === trip.id);
          if (!current) return;
          const from = [UNSCHEDULED, ...current.days.map((d) => d.id)].find((key) =>
            activitiesIn(current, key)?.some((a) => a.id === source.id),
          );
          const to = target.data.containerId as string | undefined;
          if (!from || from !== started.from || !to || !activitiesIn(current, to)) return;
          if (from !== to && activitiesIn(current, to)!.length >= 200) {
            notify('目标区域已达到 200 段安排，请先整理。');
            return;
          }
          if (
            from === to &&
            (target.data.kind === 'calendar' ||
              (isSortable(source) && source.index === source.initialIndex))
          )
            return;
          const index = from === to && isSortable(source) ? source.index : undefined;
          const next = moveActivity(current, String(source.id), from, to, index);
          if (next === current) return;
          void save(next);
          if (from !== to) {
            setDayId(to);
            notify(
              to === UNSCHEDULED
                ? '已移到待规划，可以稍后再安排日期。'
                : '已移到所选日期，可撤销。',
            );
          }
        }}
      >
        <div className="editor-layout">
          <aside className="day-sidebar">
            <div className="sidebar-label">
              <span>旅程日历</span>
              <span>{String(trip.days.length).padStart(2, '0')} DAYS</span>
            </div>
            <p className={`calendar-drop-hint ${dragging ? 'visible' : ''}`}>
              {dragging ? '拖到日期或待规划，松开即可移动' : '先收藏目的地，再安排哪一天去'}
            </p>
            <nav className="day-list" aria-label="选择行程日期或待规划">
              <CalendarTarget
                containerId={UNSCHEDULED}
                active={isUnscheduled}
                label="待规划"
                subtitle="先收藏想去的地方"
                count={trip.unscheduled.length}
                onClick={() => setDayId(UNSCHEDULED)}
              />
              {trip.days.map((d, i) => (
                <CalendarTarget
                  key={d.id}
                  containerId={d.id}
                  active={day.id === d.id}
                  label={`Day ${i + 1}`}
                  subtitle={d.title || dateLabel(dateAt(trip.startDate, i))}
                  number={i + 1}
                  count={d.activities.length}
                  onClick={() => setDayId(d.id)}
                />
              ))}
            </nav>
            <button
              className="add-day"
              onClick={() => void addDay()}
              disabled={trip.days.length >= 60}
            >
              <Plus size={15} />
              再多留一天
            </button>
            <div className="sidebar-summary">
              <p>
                <Wallet size={15} />
                预计花费
              </p>
              <strong>
                <small>JPY</small> {totalCost(trip).toLocaleString('zh-CN')}
              </strong>
              <span>按已填写的安排合计</span>
            </div>
            <button
              className="sidebar-notes"
              onClick={() => {
                setNoteModal(true);
              }}
            >
              <StickyNote size={15} />
              旅程随手记
              <ArrowUpRight size={14} />
            </button>
          </aside>
          <main className="day-main">
            <div className="day-main-heading">
              <div>
                <p className="eyebrow">
                  {isUnscheduled ? (
                    'SOMEDAY, SOMEWHERE'
                  ) : (
                    <>
                      DAY {String(dayIndex + 1).padStart(2, '0')} <span>/</span>{' '}
                      {dateLabel(dateAt(trip.startDate, dayIndex))}
                    </>
                  )}
                </p>
                {isUnscheduled ? (
                  <h2 className="unscheduled-heading">想去的地方，先放这里</h2>
                ) : (
                  <label className="day-title-label">
                    <span className="sr-only">当日主题</span>
                    <input
                      key={`${day.id}:title`}
                      className="day-title-input"
                      value={day.title}
                      placeholder="给这一天起个名字"
                      maxLength={200}
                      onChange={(e) => void updateDay({ ...day, title: e.target.value })}
                    />
                  </label>
                )}
              </div>
              {!isUnscheduled && (
                <div className="day-heading-tools">
                  <button
                    className="icon-button"
                    disabled={dayIndex === 0}
                    onClick={() => shiftDay(-1)}
                    title="将这一天前移"
                    aria-label="将这一天前移"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={dayIndex === trip.days.length - 1}
                    onClick={() => shiftDay(1)}
                    title="将这一天后移"
                    aria-label="将这一天后移"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={trip.days.length === 1}
                    onClick={deleteDay}
                    title="删除这一天"
                    aria-label="删除这一天"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
            <div className="day-overview">
              <span>
                <Route size={14} />
                {day.activities.length} 段安排
              </span>
              {dayCities.length > 0 && (
                <span>
                  <MapPin size={14} />
                  {dayCities.join(' · ')}
                </span>
              )}
              <span className="day-overview-hint">
                <GripVertical size={13} />
                拖动排序，或拖到左侧换日期
              </span>
            </div>
            <TimelineDrop containerId={day.id}>
              {day.activities.map((a, i) => (
                <ActivityCard
                  key={a.id}
                  activity={a}
                  containerId={day.id}
                  index={i}
                  isLast={i === day.activities.length - 1}
                  onEdit={() => setActivityForm({ activity: a, dayId: day.id, isNew: false })}
                  onRemove={() => removeActivity(a)}
                  onDuplicate={() => {
                    if (day.activities.length >= 200) {
                      notify('每个区域最多保存 200 段安排。');
                      return;
                    }
                    const activities = [...day.activities];
                    activities.splice(i + 1, 0, {
                      ...a,
                      id: id(),
                      title: `${a.title.slice(0, 195)} · 副本`,
                    });
                    void updateDay({ ...day, activities });
                    notify('已复制安排。');
                  }}
                  onMoveUp={() => reorder(a, i - 1)}
                  onMoveDown={() => reorder(a, i + 1)}
                />
              ))}
            </TimelineDrop>
            {day.activities.length === 0 && (
              <div className="day-empty">
                <span>
                  <MapPin size={29} strokeWidth={1} />
                </span>
                <h3>{isUnscheduled ? '先收集想去的地方' : '这一天，留给你的期待'}</h3>
                <p>
                  {isUnscheduled
                    ? '把景点和餐厅放进来，想好后拖到左侧某一天。'
                    : '一个景点、一顿午餐，或一段什么都不做的时间。'}
                </p>
              </div>
            )}
            <button
              className="add-activity"
              disabled={day.activities.length >= 200}
              onClick={() => addActivity()}
            >
              <Plus size={18} />
              {isUnscheduled ? '添加想去的地方' : '添加一段安排'}
            </button>
            {day.activities.length >= 200 && <p className="muted">每个区域最多保存 200 段安排。</p>}
            {!isUnscheduled && (
              <div className="day-notes">
                <label htmlFor="day-notes">
                  <StickyNote size={16} />
                  这一天的随手记
                </label>
                <textarea
                  id="day-notes"
                  key={`${day.id}:notes`}
                  value={day.notes}
                  maxLength={5000}
                  rows={3}
                  placeholder="留点空白，记下路上的小期待……"
                  onChange={(e) => void updateDay({ ...day, notes: e.target.value })}
                />
              </div>
            )}
            {!isUnscheduled && (
              <div className="day-pagination">
                <button
                  disabled={dayIndex === 0}
                  onClick={() => setDayId(trip.days[dayIndex - 1].id)}
                >
                  <ArrowLeft size={14} />
                  前一天
                </button>
                <span>
                  {dayIndex + 1} / {trip.days.length}
                </span>
                <button
                  disabled={dayIndex === trip.days.length - 1}
                  onClick={() => setDayId(trip.days[dayIndex + 1].id)}
                >
                  后一天
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
          </main>
          <aside className="editor-map-panel">
            <div className="editor-map-header">
              <span>
                <CompassIcon />
                沿途的风景
              </span>
              <span>JAPAN</span>
            </div>
            <JapanMap
              compact
              selected={place?.name}
              route={dayCities.length ? dayCities : cities}
              onSelect={setSelectedPlace}
            />
            <div className="map-caption">
              <span className="legend-line" />
              行程示意 · 非实际交通路线
            </div>
            <div className="destination-panel">
              <label className="destination-select-label">
                <MapPin size={16} />
                <select
                  aria-label="选择目的地城市"
                  value={place?.name || ''}
                  onChange={(e) => setSelectedPlace(findPlace(e.target.value))}
                >
                  {!place && <option value="">选择目的地城市</option>}
                  <CityOptions />
                </select>
              </label>
              {place && (
                <>
                  <p className="eyebrow">
                    {place.en.toUpperCase()} / {place.region}
                  </p>
                  <h3>{place.name}，慢慢走。</h3>
                  <p className="destination-description">{place.description}</p>
                  <p className="suggestion-label">
                    {isUnscheduled ? '把这里加入待规划' : '把这里加入今天'}
                    <Plus size={13} />
                  </p>
                  <div className="spot-suggestions">
                    {place.spots.map((spot) => (
                      <button
                        key={spot}
                        disabled={day.activities.length >= 200}
                        onClick={() => addActivity(spot, place.name)}
                      >
                        {spot}
                        <Plus size={13} />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <p className="editor-tip">
              <CircleHelp size={14} />
              城市内的安排在地图上共用城市标记。开放时间、预约与交通请在出发前自行确认。
            </p>
          </aside>
        </div>
      </DragDropProvider>
      {activityForm && (
        <ActivityForm
          {...activityForm}
          days={trip.days}
          onClose={() => setActivityForm(undefined)}
          onSave={saveActivity}
        />
      )}
      {noteModal && (
        <Modal title="旅程随手记" eyebrow="NOTES FOR THE ROAD" onClose={() => setNoteModal(false)}>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              setNoteModal(false);
            }}
          >
            <label>
              写给出发前的自己
              <textarea
                autoFocus
                rows={9}
                maxLength={5000}
                value={trip.notes}
                onChange={(e) => void save({ ...trip, notes: e.target.value })}
                placeholder="预约清单、行李、想记住的小事……"
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setNoteModal(false)}
              >
                取消
              </button>
              <button className="button primary">
                <Check size={16} />
                保存备注
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
function CompassIcon() {
  return <MapPin size={15} />;
}
