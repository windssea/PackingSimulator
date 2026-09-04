import styles from './ResultPanel.module.css';

const pct = (v) => `${Math.round(v * 100)}%`;
const num = (v, n = 1) => (Math.round(v * 10 ** n) / 10 ** n).toFixed(n);

export default function ResultPanel({ result, activeLayer, onLayerChange }) {
  const { placed, unplaced, stats } = result;
  const { container } = stats;
  const util = stats.utilization;
  const utilLevel = util >= 0.8 ? 'high' : util >= 0.5 ? 'mid' : 'low';
  const layer = activeLayer === null ? null : stats.layers[activeLayer];

  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>装箱结果</h2>

      <div className={styles.hero}>
        <span className={styles.heroLabel}>能装下</span>
        <div className={styles.heroValue}>
          <b>{stats.total}</b>
          <span>个</span>
        </div>
        <span className={styles.heroSub}>
          容器 {num(container.w, 0)} × {num(container.d, 0)} × {num(container.h, 0)} cm ·{' '}
          {num(stats.containerVolumeL)} L
        </span>
      </div>

      <div className={styles.utilWrap}>
        <div className={styles.utilHead}>
          <span>空间利用率</span>
          <b className={styles[`util_${utilLevel}`]}>{pct(util)}</b>
        </div>
        <div className={styles.bar}>
          <div
            className={`${styles.barFill} ${styles[`bar_${utilLevel}`]}`}
            style={{ width: `${Math.max(2, util * 100)}%` }}
          />
        </div>
        <div className={styles.utilFoot}>
          已用 {num(stats.usedVolumeL)} L · 剩余 {num(stats.remainingVolumeL)} L
        </div>
      </div>

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span>装到高度</span>
          <b>{num(stats.filledHeight)} cm</b>
        </div>
        <div className={styles.metric}>
          <span>分了几层</span>
          <b>{stats.layers.length} 层</b>
        </div>
      </div>

      {!!stats.bySpec.length && (
        <div className={styles.block}>
          <h3 className={styles.subTitle}>各规格数量</h3>
          {stats.bySpec.map((s) => (
            <div key={s.specId} className={styles.specStat}>
              <span className={styles.dot} style={{ background: s.color }} />
              <span className={styles.specStatName}>{s.name}</span>
              <span className={styles.specStatBar}>
                <i style={{ width: `${(s.count / Math.max(1, stats.total)) * 100}%`, background: s.color }} />
              </span>
              <span className={styles.specStatNum}>{s.hitLimit ? `${s.count}+` : s.count}</span>
            </div>
          ))}
          {stats.bySpec.some((s) => s.hitLimit) && (
            <p className={styles.note}>带 + 号的已到单次计算上限，实际还能再塞。</p>
          )}
        </div>
      )}

      {!!unplaced.length && (
        <div className={styles.warn}>
          <b>放不下 {unplaced.reduce((n, u) => n + u.count, 0)} 个</b>
          <span>
            {unplaced.map((u) => `${u.name} ×${u.count}`).join('、')}
            。试试缩小间隙、换成极限填充，或者换个大一点的容器。
          </span>
        </div>
      )}

      {!!stats.layers.length && (
        <div className={styles.block}>
          <h3 className={styles.subTitle}>照着摆（俯视图）</h3>
          <div className={styles.layerChips}>
            <button
              className={`${styles.layerChip} ${activeLayer === null ? styles.layerChipOn : ''}`}
              onClick={() => onLayerChange(null)}
            >
              全部
            </button>
            {stats.layers.map((l) => (
              <button
                key={l.index}
                className={`${styles.layerChip} ${activeLayer === l.index ? styles.layerChipOn : ''}`}
                onClick={() => onLayerChange(activeLayer === l.index ? null : l.index)}
              >
                第 {l.index + 1} 层 · {l.count}
              </button>
            ))}
          </div>

          <LayerView container={container} layer={layer} layers={stats.layers} />
          <p className={styles.layerNote}>
            {layer
              ? `第 ${layer.index + 1} 层离底 ${num(layer.y0)} cm，层高 ${num(layer.height)} cm，共 ${layer.count} 个`
              : `共 ${stats.layers.length} 层，点上面的层号可以单独看某一层怎么摆`}
          </p>
        </div>
      )}

      {stats.total === 0 && (
        <div className={styles.empty}>
          {placed.length === 0 && unplaced.length === 0
            ? '左边填好容器和盒子尺寸，这里就会算出能装几个。'
            : '一个都放不下，检查下盒子是不是比容器还大。'}
        </div>
      )}

      {stats.total > 0 && (
        <div className={styles.tip}>
          {util >= 0.85
            ? '塞得挺满，抽拉会有点紧，建议留 0.5 cm 余量。'
            : util >= 0.6
              ? '摆得挺合理，常用的一层放最好拿的位置就行。'
              : '还剩不少空隙，可以加大盒子尺寸，或者补几个小盒把边角填上。'}
        </div>
      )}
    </section>
  );
}

/** 俯视示意图：x 轴向右、z 轴向下，和三维场景的方向一致 */
function LayerView({ container, layer, layers }) {
  // 看单层时实心显示；看全部时按层递减透明度，越靠上的层越淡
  const groups = layer
    ? [{ boxes: layer.boxes, opacity: 0.88 }]
    : layers.map((l, i) => ({
        boxes: l.boxes,
        opacity: Math.max(0.32, 0.88 - i * 0.11),
      }));

  if (!groups.some((g) => g.boxes.length)) return <div className={styles.layerEmpty} />;

  const cw = Math.max(container.w, 1);
  const cd = Math.max(container.d, 1);
  const sw = Math.max(0.4, cw / 320);
  const pad = Math.min(cw, cd) * 0.012;

  return (
    <div className={styles.layerBox}>
      <svg viewBox={`0 0 ${cw} ${cd}`} preserveAspectRatio="xMidYMid meet" className={styles.layerSvg}>
        <rect x="0" y="0" width={cw} height={cd} rx={cw * 0.02} fill="#fff6e9" stroke="#e6d2b8" strokeWidth={sw} />
        {groups.map((g, gi) =>
          g.boxes.map((b, i) => (
            <rect
              key={`${gi}-${i}`}
              x={b.x}
              y={b.z}
              width={Math.max(0.1, b.w - pad)}
              height={Math.max(0.1, b.d - pad)}
              rx={Math.min(b.w, b.d) * 0.08}
              fill={b.color}
              fillOpacity={g.opacity}
              stroke="rgba(58,53,46,0.35)"
              strokeWidth={sw * 0.7}
            />
          ))
        )}
      </svg>
    </div>
  );
}
