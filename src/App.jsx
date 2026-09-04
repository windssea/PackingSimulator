import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Scene3D from './components/Scene3D';
import ContainerPanel from './components/ContainerPanel';
import BoxList from './components/BoxList';
import OptionsPanel from './components/OptionsPanel';
import ResultPanel from './components/ResultPanel';
import PlansBar from './components/PlansBar';
import ShoppingList from './components/ShoppingList';
import ShareModal from './components/ShareModal';
import { packBoxes, CANDY_COLORS } from './lib/packing';
import { exportPlanImage } from './lib/exportImage';
import {
  loadPlansStore,
  savePlansStore,
  nextPlanNumber,
  exportPlansJson,
  mergePlans,
  decodePlanHash,
} from './lib/plans';
import styles from './App.module.css';

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

const freshPlan = (n) => ({
  id: `p${n}`,
  name: `方案 ${n}`,
  container: { ...INITIAL_CONTAINER },
  specs: INITIAL_SPECS.map((s) => ({ ...s })),
  gap: 0.5,
  strategy: 'tidy',
  allowRotate: false,
});

export default function App() {
  // 只在首次渲染时读一次方案库（含 v1 老数据迁移）
  const [initialStore] = useState(() => {
    const loaded = loadPlansStore();
    return loaded ?? { plans: [freshPlan(1)], activeId: 'p1' };
  });

  const [plans, setPlans] = useState(initialStore.plans);
  const [activeId, setActiveId] = useState(initialStore.activeId);
  const activePlan = plans.find((p) => p.id === activeId) ?? plans[0];

  const [container, setContainer] = useState(activePlan.container);
  const [specs, setSpecs] = useState(activePlan.specs);
  const [gap, setGap] = useState(activePlan.gap);
  const [strategy, setStrategy] = useState(activePlan.strategy);
  const [allowRotate, setAllowRotate] = useState(activePlan.allowRotate);
  const [viewMode, setViewMode] = useState('iso');
  const [viewNonce, setViewNonce] = useState(0); // 每次点视角按钮都 +1，强制重新取景（拖走相机后点同一个按钮也能回位）
  const [explode, setExplode] = useState(0);
  const [activeLayer, setActiveLayer] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [showList, setShowList] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [toast, setToast] = useState('');

  const sceneRef = useRef(null);
  const firstRunRef = useRef(true);
  const planNumRef = useRef(nextPlanNumber(initialStore.plans));
  // 盒子 id 计数从所有方案的最大编号接着走，避免撞 id
  const idRef = useRef(
    Math.max(
      4,
      ...initialStore.plans.flatMap((p) => p.specs).reduce((acc, s) => {
        const n = Number(String(s?.id ?? '').replace(/\D/g, ''));
        if (n) acc.push(n);
        return acc;
      }, [])
    )
  );

  // 编辑中的字段实时同步回当前方案
  useEffect(() => {
    setPlans((prev) =>
      prev.map((p) =>
        p.id === activeId ? { ...p, container, specs, gap, strategy, allowRotate } : p
      )
    );
  }, [container, specs, gap, strategy, allowRotate, activeId]);

  // 方案库变化时自动持久化
  useEffect(() => {
    savePlansStore({ plans, activeId });
  }, [plans, activeId]);

  /** 把某个方案的字段载入编辑器 */
  const loadPlanIntoEditor = (plan) => {
    setContainer(plan.container);
    setSpecs(plan.specs);
    setGap(plan.gap);
    setStrategy(plan.strategy);
    setAllowRotate(plan.allowRotate);
    setActiveLayer(null);
    setExplode(0);
  };

  const switchPlan = (id) => {
    const target = plans.find((p) => p.id === id);
    if (!target || id === activeId) return;
    loadPlanIntoEditor(target);
    setActiveId(id);
  };

  const newPlan = () => {
    const plan = freshPlan(planNumRef.current);
    planNumRef.current += 1;
    setPlans((prev) => [...prev, plan]);
    loadPlanIntoEditor(plan);
    setActiveId(plan.id);
    setToast(`已新建「${plan.name}」`);
    setTimeout(() => setToast(''), 2000);
  };

  const renamePlan = (id, name) => {
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  };

  /** 打开分享链接：#p= 里的方案并入方案库并切换过去（数据全在链接里）
   *  首次挂载和 hashchange 都处理——已打开应用时再点分享链接是 hash 变化，不重载页面 */
  useEffect(() => {
    const consume = () => {
      if (!location.hash.startsWith('#p=')) return;
      const plan = decodePlanHash(location.hash);
      // 先消费掉 hash，避免刷新或再次 hashchange 时重复导入
      history.replaceState(null, '', location.pathname + location.search);
      if (plan) {
        setPlans((prev) => (prev.some((p) => p.id === plan.id) ? prev : [...prev, plan]));
        loadPlanIntoEditor(plan);
        setActiveId(plan.id);
        setToast(`已打开分享的方案「${plan.name}」`);
        setTimeout(() => setToast(''), 2600);
      }
    };
    consume();
    window.addEventListener('hashchange', consume);
    return () => window.removeEventListener('hashchange', consume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deletePlan = (id) => {
    if (plans.length <= 1) return;
    const remaining = plans.filter((p) => p.id !== id);
    setPlans(remaining);
    if (id === activeId) {
      loadPlanIntoEditor(remaining[0]);
      setActiveId(remaining[0].id);
    }
    setToast('方案已删除');
    setTimeout(() => setToast(''), 2000);
  };

  /** 复制当前方案：量一排相似柜子时省得重填 */
  const duplicatePlan = (id) => {
    const src = plans.find((p) => p.id === id);
    if (!src) return;
    const n = planNumRef.current;
    planNumRef.current += 1;
    const copy = {
      ...src,
      id: `p${n}`,
      name: `${src.name} 副本`,
      container: { ...src.container },
      specs: src.specs.map((s) => ({ ...s })),
    };
    setPlans((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
    loadPlanIntoEditor(copy);
    setActiveId(copy.id);
    setToast(`已复制为「${copy.name}」`);
    setTimeout(() => setToast(''), 2000);
  };

  const exportJson = () => {
    exportPlansJson(plans);
    setToast(`已导出 ${plans.length} 个方案的备份`);
    setTimeout(() => setToast(''), 2000);
  };

  const importPlans = (imported) => {
    setPlans((prev) => mergePlans(prev, imported));
    setToast(`已导入 ${imported.length} 个方案`);
    setTimeout(() => setToast(''), 2200);
  };

  const importError = (msg) => {
    setToast(`导入失败：${msg}`);
    setTimeout(() => setToast(''), 2600);
  };

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

  /** 重置当前方案为默认设置（不影响其他方案） */
  const resetAll = () => {
    setContainer({ ...INITIAL_CONTAINER });
    setSpecs(INITIAL_SPECS.map((s) => ({ ...s })));
    setGap(0.5);
    setStrategy('tidy');
    setAllowRotate(false);
    setViewMode('iso');
    setExplode(0);
    setActiveLayer(null);
    setToast('当前方案已重置');
    setTimeout(() => setToast(''), 2000);
  };

  const layerCount = result.stats.layers.length;
  const safeLayer = activeLayer !== null && activeLayer < layerCount ? activeLayer : null;

  return (
    <div className={`${styles.app} app-root`}>
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
        <div className={styles.headerActions}>
          <button className={styles.listBtn} onClick={() => setShowList(true)}>
            购物清单
          </button>
          <button className={styles.reset} onClick={resetAll}>
            重置本方案
          </button>
        </div>
      </header>

      <main className={styles.main}>
        {/* 手机端吸顶结果条：量柜子时滚到哪都能看到能装几个 */}
        <div className={styles.mobileSummary}>
          能装 <b>{result.stats.total}</b> 个 · 利用率{' '}
          {Math.round(result.stats.utilization * 100)}% · 装到{' '}
          {result.stats.filledHeight.toFixed(1)} cm
        </div>

        <aside className={styles.left}>
          <PlansBar
            plans={plans}
            activeId={activeId}
            onSwitch={switchPlan}
            onNew={newPlan}
            onRename={renamePlan}
            onDelete={deletePlan}
            onDuplicate={duplicatePlan}
            onExportJson={exportJson}
            onImport={importPlans}
            onImportError={importError}
            onShare={() => setShowShare(true)}
          />
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
      {showList && <ShoppingList plans={plans} onClose={() => setShowList(false)} />}
      {showShare && (
        <ShareModal
          plan={{ ...activePlan, container, specs, gap, strategy, allowRotate }}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
