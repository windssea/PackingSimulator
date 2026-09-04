import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Scene3D from './components/Scene3D';
import ContainerPanel from './components/ContainerPanel';
import BoxList from './components/BoxList';
import OptionsPanel from './components/OptionsPanel';
import ResultPanel from './components/ResultPanel';
import { packBoxes, CANDY_COLORS } from './lib/packing';
import { exportPlanImage } from './lib/exportImage';
import styles from './App.module.css';

const STORAGE_KEY = 'shouna-planner-v1';
const INITIAL_CONTAINER = { w: 60, d: 45, h: 40 };
const INITIAL_SPECS = [
  { id: 's1', name: '衣物百纳箱', w: 30, d: 22, h: 14, color: CANDY_COLORS[0], count: '' },
  { id: 's2', name: '内衣收纳格', w: 22, d: 15, h: 10, color: CANDY_COLORS[1], count: '' },
  { id: 's3', name: '小物分格盒', w: 14, d: 10, h: 7, color: CANDY_COLORS[2], count: '' },
];

const VIEWS = [
  { id: 'iso', label: '等轴' },
  { id: 'top', label: '俯视' },
  { id: 'front', label: '正视' },
  { id: 'side', label: '侧视' },
];

const STRATEGY_LABEL = { tidy: '整齐码放', maximal: '极限填充' };

/** 从 localStorage 读取上次的方案；坏了就回退默认值 */
function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (
      !data ||
      typeof data.container?.w !== 'number' ||
      !Array.isArray(data.specs)
    ) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export default function App() {
  // 只在首次渲染时读一次 localStorage
  const [saved] = useState(loadSaved);

  const [container, setContainer] = useState(saved?.container ?? INITIAL_CONTAINER);
  const [specs, setSpecs] = useState(saved?.specs ?? INITIAL_SPECS);
  const [gap, setGap] = useState(saved?.gap ?? 0.5);
  const [strategy, setStrategy] = useState(saved?.strategy ?? 'tidy');
  const [allowRotate, setAllowRotate] = useState(saved?.allowRotate ?? false);
  const [viewMode, setViewMode] = useState('iso');
  const [viewNonce, setViewNonce] = useState(0); // 每次点视角按钮都 +1，强制重新取景（拖走相机后点同一个按钮也能回位）
  const [explode, setExplode] = useState(0);
  const [activeLayer, setActiveLayer] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState('');

  const sceneRef = useRef(null);
  const firstRunRef = useRef(true);
  // id 计数从已加载方案的最大编号接着走，避免删除再添加时撞 id
  const idRef = useRef(
    Math.max(
      4,
      ...(saved?.specs ?? []).reduce((acc, s) => {
        const n = Number(String(s?.id ?? '').replace(/\D/g, ''));
        if (n) acc.push(n);
        return acc;
      }, [])
    )
  );

  // 方案变化时自动保存
  useEffect(() => {
    const payload = { container, specs, gap, strategy, allowRotate };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* 隐私模式等场景写不进就算了，不影响使用 */
    }
  }, [container, specs, gap, strategy, allowRotate]);

  const packSpecs = useMemo(() => specs.map((s) => ({ ...s, count: Number(s.count) || 0 })), [specs]);

  // 拖滑块/改尺寸时先让输入保持流畅，装箱结果随后跟上
  const dContainer = useDeferredValue(container);
  const dSpecs = useDeferredValue(packSpecs);
  const dGap = useDeferredValue(gap);
  const dStrategy = useDeferredValue(strategy);
  const dRotate = useDeferredValue(allowRotate);

  const result = useMemo(
    () =>
      packBoxes({
        container: dContainer,
        specs: dSpecs,
        gap: dGap,
        strategy: dStrategy,
        allowRotate: dRotate,
      }),
    [dContainer, dSpecs, dGap, dStrategy, dRotate]
  );

  // 结果变化时：首次自动播一次填充动画，之后直接呈现最终摆放
  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false;
      setPlaying(true);
      sceneRef.current?.play();
    } else {
      setPlaying(false);
      setProgress(1);
      sceneRef.current?.setProgress(1);
    }
  }, [result]);

  const handleProgress = useCallback((p) => {
    setProgress(p);
    if (p >= 1) setPlaying(false);
  }, []);

  const togglePlay = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (scene.isPlaying()) {
      scene.pause();
      setPlaying(false);
    } else {
      if (progress >= 1) setProgress(0);
      scene.play();
      setPlaying(true);
    }
  };

  const replay = () => {
    setProgress(0);
    sceneRef.current?.setProgress(0);
    sceneRef.current?.play();
    setPlaying(true);
  };

  const updateSpec = (id, patch) =>
    setSpecs((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const addSpec = (preset, color) => {
    idRef.current += 1;
    setSpecs((prev) => [
      ...prev,
      {
        id: `s${idRef.current}`,
        name: preset?.name || '新盒子',
        w: preset?.w || 20,
        d: preset?.d || 14,
        h: preset?.h || 10,
        color,
        count: '',
      },
    ]);
  };

  const removeSpec = (id) => setSpecs((prev) => prev.filter((s) => s.id !== id));

  const changeStrategy = (id) => {
    setStrategy(id);
    setAllowRotate(id === 'maximal');
  };

  const changeLayer = (index) => {
    setActiveLayer(index);
    setViewMode(index === null ? 'iso' : 'top');
    setViewNonce((n) => n + 1);
  };

  /** 导出当前方案为一张 PNG：三维图 + 关键数字 + 逐层俯视图 */
  const handleExport = async () => {
    const scene = sceneRef.current;
    if (!scene || exporting) return;
    setExporting(true);
    try {
      // 先让出一帧给浏览器：把「生成中…」画出来，再干同步的重活，
      // 否则大场景导出时界面会像卡死一样没有任何反馈
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      const shot = scene.snapshot();
      if (!shot) throw new Error('no snapshot');
      const ok = await exportPlanImage({
        shot,
        container: dContainer,
        stats: result.stats,
        strategyLabel: STRATEGY_LABEL[dStrategy] ?? '',
        gap: dGap,
      });
      if (!ok) throw new Error('export failed');
      setToast('方案图已保存到下载');
      setTimeout(() => setToast(''), 2400);
    } catch (e) {
      console.error('导出失败', e);
      setToast('导出失败，再试一次看看');
      setTimeout(() => setToast(''), 2400);
    } finally {
      setExporting(false);
    }
  };

  const resetAll = () => {
    setContainer(INITIAL_CONTAINER);
    setSpecs(INITIAL_SPECS);
    setGap(0.5);
    setStrategy('tidy');
    setAllowRotate(false);
    setViewMode('iso');
    setExplode(0);
    setActiveLayer(null);
    setToast('已恢复默认方案');
    setTimeout(() => setToast(''), 2000);
  };

  const layerCount = result.stats.layers.length;
  const safeLayer = activeLayer !== null && activeLayer < layerCount ? activeLayer : null;

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div>
            <h1 className={styles.h1}>收纳装箱模拟器</h1>
            <p className={styles.sub}>填好柜子和盒子的尺寸，看看这一格到底能塞几个</p>
          </div>
        </div>
        <button className={styles.reset} onClick={resetAll}>
          恢复默认
        </button>
      </header>

      <main className={styles.main}>
        <aside className={styles.left}>
          <ContainerPanel value={container} onChange={setContainer} />
          <BoxList specs={specs} onUpdate={updateSpec} onAdd={addSpec} onRemove={removeSpec} />
          <OptionsPanel
            strategy={strategy}
            onStrategyChange={changeStrategy}
            gap={gap}
            onGapChange={setGap}
            allowRotate={allowRotate}
            onRotateChange={setAllowRotate}
          />
        </aside>

        <section className={styles.center}>
          <div className={styles.stage}>
            <Scene3D
              ref={sceneRef}
              container={container}
              placed={result.placed}
              viewMode={viewMode}
              viewNonce={viewNonce}
              explode={explode}
              activeLayer={safeLayer}
              onProgress={handleProgress}
            />
          </div>

          <div className={styles.toolbar}>
            <button className={styles.playBtn} onClick={togglePlay}>
              {playing ? '暂停' : '播放填充'}
            </button>
            <button className={styles.ghostBtn} onClick={replay}>
              重播
            </button>
            <div className={styles.progress}>
              <i style={{ width: `${progress * 100}%` }} />
            </div>

            <span className={styles.divider} />

            {VIEWS.map((v) => (
              <button
                key={v.id}
                className={`${styles.viewBtn} ${viewMode === v.id ? styles.viewBtnOn : ''}`}
                onClick={() => {
                  setViewMode(v.id);
                  setViewNonce((n) => n + 1);
                }}
              >
                {v.label}
              </button>
            ))}

            <span className={styles.divider} />

            <div className={styles.explode}>
              <span>展开</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={explode}
                onChange={(e) => setExplode(Number(e.target.value))}
              />
            </div>

            <button
              className={`${styles.exportBtn} ${exporting ? styles.exportBtnBusy : ''}`}
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? '生成中…' : '导出方案图'}
            </button>
          </div>
        </section>

        <aside className={styles.right}>
          <ResultPanel result={result} activeLayer={safeLayer} onLayerChange={changeLayer} />
        </aside>
      </main>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
