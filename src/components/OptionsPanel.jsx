import styles from './Panel.module.css';

const STRATEGIES = [
  {
    id: 'tidy',
    name: '整齐码放',
    desc: '不倒放、不侧放，同类盒子连成一片，摆出来最规整',
  },
  {
    id: 'maximal',
    name: '极限填充',
    desc: '允许翻转朝向，见缝插针，能多塞几个但摆放较杂',
  },
];

export default function OptionsPanel({ strategy, onStrategyChange, gap, onGapChange, allowRotate, onRotateChange }) {
  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>
        <span className={`${styles.badge} ${styles.badgeSky}`}>3</span>
        摆放方式
      </h2>

      <div className={styles.strategies}>
        {STRATEGIES.map((s) => (
          <button
            key={s.id}
            className={`${styles.strategy} ${strategy === s.id ? styles.strategyActive : ''}`}
            onClick={() => onStrategyChange(s.id)}
          >
            <span className={styles.strategyName}>{s.name}</span>
            <span className={styles.strategyDesc}>{s.desc}</span>
          </button>
        ))}
      </div>

      <div className={styles.switch} onClick={() => onRotateChange(!allowRotate)}>
        <span className={`${styles.switchBox} ${allowRotate ? styles.switchBoxOn : ''}`}>
          <span className={`${styles.switchDot} ${allowRotate ? styles.switchDotOn : ''}`} />
        </span>
        允许侧放 / 竖放（六个朝向都试）
      </div>

      <div className={styles.sliderRow}>
        <div className={styles.sliderHead}>
          <span>盒子之间留的缝</span>
          <b>{gap} cm</b>
        </div>
        <input
          className={styles.slider}
          type="range"
          min="0"
          max="3"
          step="0.5"
          value={gap}
          onChange={(e) => onGapChange(Number(e.target.value))}
        />
      </div>

      <p className={styles.note}>留 0.5 cm 左右最好抽拉，硬纸盒可以留 0。</p>
    </section>
  );
}
