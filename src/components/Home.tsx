import { useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Compass,
  Copy,
  Download,
  Flower2,
  MapPin,
  MoreHorizontal,
  Plus,
  Route,
  Trash2,
} from 'lucide-react';
import type { Place, Trip } from '../types';
import { JapanMap } from './JapanMap';
import { regions } from '../data/places';
import { dateRange, totalActivities, tripCities } from '../lib/trips';

interface Props {
  trips: Trip[];
  onNew: (city?: string) => void;
  onOpen: (id: string) => void;
  onSample: () => void;
  onDelete: (trip: Trip) => void;
  onClone: (trip: Trip) => void;
  onBackup: (trip?: Trip) => void;
}
export function Home({ trips, onNew, onOpen, onSample, onDelete, onClone, onBackup }: Props) {
  const [selected, setSelected] = useState<Place>();
  const [region, setRegion] = useState('全部');
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<string>();
  const shown = trips.filter((t) =>
    `${t.title} ${t.subtitle} ${tripCities(t).join(' ')}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <section className="hero" id="explore">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="tiny-line" /> YOUR JOURNEY, YOUR RHYTHM
          </p>
          <h1>
            下一站，
            <br />
            心之
            <span className="hero-word">
              所向
              <svg viewBox="0 0 170 14" aria-hidden="true">
                <path d="M3 9Q80-1 166 7" />
              </svg>
            </span>
            。
          </h1>
          <p className="hero-description">
            把期待写进行程，把时间留给风景。
            <br />
            从日本的一座城市，开始你的下一段故事。
          </p>
          <button className="button primary hero-cta" onClick={() => onNew()}>
            <Plus size={18} />
            规划一段旅程
            <ArrowRight size={17} />
          </button>
          <a className="hero-scroll" href="#journeys">
            <span className="scroll-circle">
              <ArrowDown size={15} />
            </span>
            看看我的旅程
          </a>
          <div className="hero-seal" aria-hidden="true">
            旅<br />日<br />和
          </div>
        </div>
        <div className="hero-map">
          <div className="map-topline">
            <span>
              <span className="status-dot" /> JAPAN, A LITTLE CLOSER
            </span>
            <span>日本を、ゆっくり。</span>
          </div>
          <div className="region-tabs" aria-label="筛选地图地区">
            {regions.map((r) => (
              <button
                key={r}
                className={region === r ? 'active' : ''}
                aria-pressed={region === r}
                onClick={() => {
                  setRegion(r);
                  setSelected(undefined);
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <JapanMap
            selected={selected?.name}
            region={region}
            onSelect={(place) => {
              setSelected(place);
              if (region === '全部') setRegion(place.region);
            }}
          />
          {selected ? (
            <div className="map-place-card">
              <div>
                <p className="eyebrow">
                  {selected.en.toUpperCase()} / {selected.region}
                </p>
                <h3>
                  {selected.name}
                  <span lang="ja">{selected.ja}</span>
                </h3>
                <p>{selected.description}</p>
              </div>
              <button
                className="round-button"
                onClick={() => onNew(selected.name)}
                aria-label={`从${selected.name}开始新旅程`}
              >
                <ArrowUpRight size={22} />
              </button>
            </div>
          ) : (
            <div className="map-invitation">
              <Compass size={18} />
              <span>
                {region === '全部'
                  ? '选一个地区，再挑一座喜欢的城市'
                  : `已放大${region}，点击与圆点相连的城市卡片`}
              </span>
              <span className="map-coordinate">36° N / 138° E</span>
            </div>
          )}
        </div>
      </section>
      <section className="journeys-section" id="journeys">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LITTLE PLANS, LOVELY MEMORIES</p>
            <h2>
              我的旅程{' '}
              <span className="count-pill">{trips.length.toString().padStart(2, '0')}</span>
            </h2>
          </div>
          <div className="section-tools">
            {trips.length > 0 && (
              <input
                aria-label="搜索旅程"
                className="search-input"
                placeholder="找一段旅程…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
            <button className="button text" onClick={() => onNew()}>
              <Plus size={17} />
              新建旅程
            </button>
          </div>
        </div>
        <div className="trip-grid">
          {shown.map((trip, index) => {
            const cities = tripCities(trip);
            return (
              <article className={`trip-card ${trip.color}`} key={trip.id}>
                <div className="trip-card-art">
                  <span className="art-kicker">JOURNEY {String(index + 1).padStart(2, '0')}</span>
                  <div className="mini-landscape" aria-hidden="true">
                    <svg viewBox="0 0 400 130">
                      <circle className="landscape-sun" cx="285" cy="35" r="23" />
                      <path
                        className="mountain-back"
                        d="M0 130 94 55l44 39 85-78 98 99 46-44 33 59Z"
                      />
                      <path
                        className="mountain-front"
                        d="m0 130 52-33 45 13 63-33 71 47 70-29 99 35Z"
                      />
                      <path className="mountain-road" d="M200 130q62-15 18-30t24-23" />
                    </svg>
                  </div>
                  <span className="art-destination">
                    {cities.length ? cities.slice(0, 3).join(' / ') : '旅のはじまり'}
                  </span>
                  <span className="days-badge">{trip.days.length} DAYS</span>
                </div>
                <div className="trip-card-body">
                  <div className="trip-card-title">
                    <button className="title-link" onClick={() => onOpen(trip.id)}>
                      <h3>{trip.title}</h3>
                    </button>
                    <div className="card-menu">
                      <button
                        className="icon-button"
                        aria-label={`${trip.title}的更多操作`}
                        aria-expanded={menu === trip.id}
                        onClick={() => setMenu(menu === trip.id ? undefined : trip.id)}
                      >
                        <MoreHorizontal size={20} />
                      </button>
                      {menu === trip.id && (
                        <div className="dropdown">
                          <button
                            onClick={() => {
                              onClone(trip);
                              setMenu(undefined);
                            }}
                          >
                            <Copy size={15} />
                            复制旅程
                          </button>
                          <button
                            onClick={() => {
                              onBackup(trip);
                              setMenu(undefined);
                            }}
                          >
                            <Download size={15} />
                            备份 SQLite 数据库
                          </button>
                          <button
                            className="danger-text"
                            onClick={() => {
                              onDelete(trip);
                              setMenu(undefined);
                            }}
                          >
                            <Trash2 size={15} />
                            删除旅程
                          </button>
                          <button className="dropdown-close" onClick={() => setMenu(undefined)}>
                            收起
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="trip-subtitle">{trip.subtitle}</p>
                  <p className="trip-date">
                    <CalendarDays size={14} />
                    {dateRange(trip)}
                  </p>
                  <div className="trip-card-bottom">
                    <span>
                      <Route size={14} />
                      {totalActivities(trip)} 段安排
                    </span>
                    <button onClick={() => onOpen(trip.id)}>
                      继续规划
                      <ArrowUpRight size={17} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          {!query && (
            <button className="new-trip-card" onClick={() => onNew()}>
              <span className="new-trip-icon">
                <Plus size={24} strokeWidth={1.4} />
              </span>
              <h3>还有很多地方，值得出发</h3>
              <p>一份空白行程，无限种可能。</p>
              <span>
                写下下一站
                <ArrowRight size={16} />
              </span>
            </button>
          )}
        </div>
        {query && shown.length === 0 && (
          <div className="empty-state">
            <MapPin size={28} />
            <h3>还没找到这段旅程</h3>
            <p>换个关键词试试。</p>
            <button className="button secondary" onClick={() => setQuery('')}>
              清除搜索
            </button>
          </div>
        )}
        {trips.length === 0 && (
          <div className="sample-invitation">
            <Flower2 size={20} />
            <span>还没有想好目的地？先看看一份关西散步行程。</span>
            <button onClick={onSample}>
              添加示例旅程
              <ArrowRight size={15} />
            </button>
          </div>
        )}
      </section>
      <div className="home-bottom">
        <span>GOOD DAYS BEGIN WITH A LITTLE PLAN.</span>
        <p>好日子，从一点小小的计划开始。</p>
        <Flower2 size={23} strokeWidth={1} />
      </div>
    </>
  );
}
