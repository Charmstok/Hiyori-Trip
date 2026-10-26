import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CircleHelp,
  Download,
  Flower2,
  HardDrive,
  LoaderCircle,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { RecentlyDeleted } from './components/RecentlyDeleted';
import { Home } from './components/Home';
import { Editor } from './components/Editor';
import { TripForm } from './components/TripForm';
import { Modal } from './components/Modal';
import { ExportModal } from './components/ExportModal';
import { useTrips } from './lib/store';
import { backupDatabase } from './lib/db';
import type { SavedFile } from './lib/db';
import { cloneTrip, sampleTrip } from './lib/trips';
import type { Trip } from './types';

export default function App() {
  const {
    trips,
    trash,
    busyIds,
    ready,
    pending,
    error,
    storageFailed,
    load,
    save,
    remove,
    restore,
    purge,
    retry,
  } = useTrips();
  const [view, setView] = useState<'home' | 'trash'>('home');
  const [homeTarget, setHomeTarget] = useState<'journeys'>();
  const [selectedId, setSelectedId] = useState<string>();
  const [tripForm, setTripForm] = useState<{ trip?: Trip; city?: string }>();
  const [exporting, setExporting] = useState(false);
  const [savedFile, setSavedFile] = useState<SavedFile>();
  const [help, setHelp] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    action: () => void;
    confirmLabel?: string;
    danger?: boolean;
  }>();
  const [toast, setToast] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const trip = trips.find((t) => t.id === selectedId);
  useEffect(() => {
    if (!homeTarget || !ready || view !== 'home' || trip) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(homeTarget)?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
        block: 'start',
      });
      setHomeTarget(undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [homeTarget, ready, view, trip?.id]);
  useEffect(() => {
    void load();
    return () => clearTimeout(timer.current);
  }, [load]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pending || storageFailed) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending, storageFailed]);
  function notify(message: string) {
    clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => setToast(''), 4200);
  }
  function showSaved(file: SavedFile) {
    setExporting(false);
    setHelp(false);
    setSavedFile(file);
  }
  async function backup() {
    if (backingUp || storageFailed) {
      notify('请先重试未保存的修改，再备份数据库。');
      return;
    }
    setBackingUp(true);
    try {
      showSaved(await backupDatabase());
    } catch (error) {
      notify(error instanceof Error ? error.message : '数据库备份失败，请重试。');
    } finally {
      setBackingUp(false);
    }
  }
  const goHome = () => {
    setHomeTarget(undefined);
    setView('home');
    setSelectedId(undefined);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const goJourneys = () => {
    setView('home');
    setSelectedId(undefined);
    setHomeTarget('journeys');
  };
  const openTrip = (id: string) => {
    setHomeTarget(undefined);
    setView('home');
    setSelectedId(id);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand" onClick={goHome} aria-label="日和旅首页">
          <span className="brand-symbol">
            <Sun size={23} strokeWidth={1.5} />
          </span>
          <span className="brand-name">
            hiyori<span className="brand-cn">日和旅</span>
          </span>
        </button>
        <nav className="main-nav" aria-label="主导航">
          <button className={view === 'home' && !trip ? 'active' : ''} onClick={goJourneys}>
            我的旅程
          </button>
          <button
            className={view === 'trash' ? 'active' : ''}
            onClick={() => {
              setSelectedId(undefined);
              setView('trash');
              window.scrollTo({ top: 0, behavior: 'instant' });
            }}
          >
            最近删除{trash.length > 0 && <span className="nav-count">{trash.length}</span>}
          </button>
        </nav>
        <div className="header-tools">
          <span className={`save-status ${storageFailed ? 'failed' : ''}`} role="status">
            {pending ? (
              <LoaderCircle size={13} className="spin" />
            ) : storageFailed ? (
              <HardDrive size={13} />
            ) : (
              <span className="status-dot" />
            )}
            {pending ? '正在保存' : storageFailed ? '保存异常' : '已自动保存'}
          </span>
          <button
            className="button small secondary"
            disabled={backingUp || !ready || storageFailed}
            onClick={() => void backup()}
          >
            {backingUp ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />}
            <span>备份数据库</span>
          </button>
          <button
            className="icon-button help-button"
            aria-label="使用说明"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={19} />
          </button>
        </div>
      </header>
      {error && (
        <div className="storage-error" role="alert">
          <HardDrive size={18} />
          <span>{error}</span>
          <button disabled={!!pending} onClick={() => void retry()}>
            重试
          </button>
        </div>
      )}
      {!ready ? (
        <div className="loading-screen">
          <Flower2 className="spin" size={30} strokeWidth={1} />
          <p>打开属于你的旅程…</p>
        </div>
      ) : view === 'trash' ? (
        <RecentlyDeleted
          trips={trash}
          busyIds={busyIds}
          onBack={goJourneys}
          onRestore={(t) => {
            void (async () => {
              if (await restore(t.id)) notify('旅程已恢复，可以在“我的旅程”继续规划。');
            })();
          }}
          onDelete={(t) =>
            setConfirmation({
              title: '永久删除这段旅程？',
              description: `「${t.title}」及其全部日期、安排和备注将被永久删除，无法恢复。`,
              confirmLabel: '永久删除',
              danger: true,
              action: () => {
                void (async () => {
                  if (await purge(t.id)) notify('旅程已永久删除。');
                })();
              },
            })
          }
        />
      ) : trip ? (
        <Editor
          key={trip.id}
          trip={trip}
          onBack={goJourneys}
          onEditTrip={() => setTripForm({ trip })}
          onExport={() => setExporting(true)}
          onBackup={() => void backup()}
          notify={notify}
          confirm={(title, description, action) => setConfirmation({ title, description, action })}
        />
      ) : (
        <main className="home-main">
          <Home
            trips={trips}
            onNew={(city) => setTripForm({ city })}
            onOpen={openTrip}
            onSample={() => {
              void (async () => {
                const t = sampleTrip();
                if (await save(t)) {
                  openTrip(t.id);
                  notify('已添加示例旅程，可以自由修改。');
                }
              })();
            }}
            onDelete={(t) => {
              void (async () => {
                if (await remove(t.id)) notify('已移到最近删除，可以在其中恢复。');
              })();
            }}
            onClone={(t) => {
              void (async () => {
                if (await save(cloneTrip(t))) notify('已复制旅程。');
              })();
            }}
            onBackup={() => void backup()}
          />
        </main>
      )}
      <footer className="site-footer">
        <span>
          © {new Date().getFullYear()} HIYORI TRIP{' '}
          <span className="footer-jp">旅する日も、いい日和。</span>
        </span>
        <button onClick={() => setHelp(true)}>
          <CircleHelp size={14} />
          使用说明
        </button>
      </footer>
      {tripForm && (
        <TripForm
          trip={tripForm.trip}
          initialCity={tripForm.city}
          onClose={() => setTripForm(undefined)}
          onSave={async (t) => {
            if (!(await save(t))) return false;
            setTripForm(undefined);
            openTrip(t.id);
            notify(tripForm.trip ? '旅程信息已更新。' : '新旅程已创建。');
            return true;
          }}
        />
      )}
      {exporting && trip && (
        <ExportModal trip={trip} onClose={() => setExporting(false)} onSaved={showSaved} />
      )}
      {savedFile && (
        <Modal
          title="文件已保存"
          eyebrow="READY FOR YOUR JOURNEY"
          onClose={() => setSavedFile(undefined)}
        >
          <div className="saved-file-message">
            <Check size={24} />
            <p>文件已保存到：</p>
          </div>
          <p className="saved-file-path">{savedFile.path}</p>
          <p className="form-hint">
            可以在系统文件管理器中前往此路径查看。同名文件会自动编号，不会覆盖已有文件。
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => {
                void navigator.clipboard
                  .writeText(savedFile.path)
                  .then(() => notify('路径已复制。'))
                  .catch(() => notify('请选中上方路径复制。'));
              }}
            >
              复制路径
            </button>
            <button className="button primary" onClick={() => setSavedFile(undefined)}>
              知道了
              <Check size={16} />
            </button>
          </div>
        </Modal>
      )}
      {confirmation && (
        <Modal title={confirmation.title} onClose={() => setConfirmation(undefined)}>
          <p className="confirm-description">{confirmation.description}</p>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setConfirmation(undefined)}>
              取消
            </button>
            <button
              className={`button ${confirmation.danger ? 'danger' : 'primary'}`}
              onClick={() => {
                confirmation.action();
                setConfirmation(undefined);
              }}
            >
              {confirmation.confirmLabel || '确认'}
              {confirmation.danger ? <Trash2 size={16} /> : <ArrowRight size={16} />}
            </button>
          </div>
        </Modal>
      )}
      {help && (
        <Modal
          title="从一座城市，开始一段旅程"
          eyebrow="A LITTLE HELP ALONG THE WAY"
          onClose={() => setHelp(false)}
        >
          <div className="help-content">
            <h3>选地区，再选城市</h3>
            <p>
              点击地区会放大地图，城市卡片通过引线连接到所在位置；点击卡片或圆点即可选择目的地。点击“全部”可回到全日本。旅程名称可留空，默认使用第一站城市名。
            </p>
            <h3>按日期慢慢安排</h3>
            <p>
              选择出发和返回日期，自动生成每天的行程。拖动手柄可以排序，也可以拖到左侧其他日期。还没想好日期时，先加入“待规划”，之后再拖到某一天；已安排的地点也能拖回来。每日主题、随手记和旅程备注会在输入时自动保存。
            </p>
            <h3>误删后可以恢复</h3>
            <p>
              整段旅程删除后会移到“最近删除”，其中的日期、待规划和备注一并保留。恢复后可继续编辑；只有在最近删除中再次确认永久删除，才会清除旅程数据。最近删除不会自动清空。
            </p>
            <h3>数据自动落盘</h3>
            <p>
              行程写入项目的 <code>.local-data/hiyori.sqlite</code>，无需手动保存或导出
              JSON。清除浏览器数据或更换浏览器后，仍可读取同一份行程。升级时会自动迁移当前浏览器中旧版保存的旅程。
            </p>
            <h3>导出与备份</h3>
            <p>
              选择整趟行程或指定日期后，可保存最短为 A4 高度的 PNG 长图，或带页码的 A4 分页
              PDF；也可将图片分段打包。文件保存在当前用户的下载目录，macOS 为 ~/Downloads，Linux
              优先使用系统设置的下载目录；SQLite 备份保存在项目的 exports/
              目录。成功后会显示完整路径。需要恢复数据库时，先停止程序并保留现有 .local-data
              文件夹，再将备份放入新建的同名文件夹，命名为 hiyori.sqlite。
            </p>
            <h3>关于地图</h3>
            <p>
              主页使用 Natural Earth
              示意地图，冲绳以插图表示。编辑器可展开详细地图，搜索具体地点或手动选点；地址与准确坐标随安排保存。旧版城市中心坐标会显示为待定位。地图名称与安排联动，虚线只表示安排顺序，交通方案可点击“交通路线”在
              Google 地图查看。
            </p>
            <p>
              详细底图由 OpenStreetMap 提供，地点搜索由 Photon
              提供，均需要联网。地点选择弹窗输入停顿后自动显示候选，搜索仅发送地点关键词和城市附近坐标，不发送行程日期、备注和费用；服务不可用时仍能编辑已有安排。地点名称建议使用日文或英文，开放时间与预约请自行核实。
            </p>
            <button
              className="button primary"
              disabled={backingUp || storageFailed}
              onClick={() => void backup()}
            >
              <Download size={16} />
              备份 SQLite 数据库
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button onClick={() => setToast('')} aria-label="关闭提示">
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
