import { useState } from 'react';
import { BOX_PRESETS, CANDY_COLORS } from '../lib/packing';
import styles from './Panel.module.css';

const nextColor = (used) => CANDY_COLORS.find((c) => !used.includes(c)) || CANDY_COLORS[0];

export default function BoxList({ specs, onChange, onAdd, onRemove, onUpdate }) {
  const [presetIndex, setPresetIndex] = useState(0);

  const usedColors = specs.map((s) => s.color);

  const patch = (id, key, value) => {
    onUpdate(id, { [key]: key === 'count' ? value : Number(value) || 0 });
  };

  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>
        <span className={styles.badge}>2</span>
        内部盒子
      </h2>

      {specs.map((spec) => (
        <div key={spec.id} className={styles.specRow}>
          <button
            className={styles.swatch}
            style={{ background: spec.color }}
            title="点击换个颜色"
            onClick={() => {
              const idx = CANDY_COLORS.indexOf(spec.color);
              const next = CANDY_COLORS[(idx + 1) % CANDY_COLORS.length];
              onUpdate(spec.id, { color: next });
            }}
          />
          <div className={styles.specMain}>
            <input
              className={styles.specName}
              value={spec.name}
              placeholder="盒子名称"
              onChange={(e) => patch(spec.id, 'name', e.target.value)}
            />
            <div className={styles.specDims}>
              <input
                className={`${styles.input} ${styles.inputSm}`}
                type="number"
                min="0"
                value={spec.w || ''}
                placeholder="长"
                onChange={(e) => patch(spec.id, 'w', e.target.value)}
              />
              <input
                className={`${styles.input} ${styles.inputSm}`}
                type="number"
                min="0"
                value={spec.d || ''}
                placeholder="宽"
                onChange={(e) => patch(spec.id, 'd', e.target.value)}
              />
              <input
                className={`${styles.input} ${styles.inputSm}`}
                type="number"
                min="0"
                value={spec.h || ''}
                placeholder="高"
                onChange={(e) => patch(spec.id, 'h', e.target.value)}
              />
              <input
                className={`${styles.input} ${styles.inputSm}`}
                type="number"
                min="0"
                value={spec.count}
                placeholder="自动"
                title="填数量按定量摆放，留空则由系统算最多能塞几个"
                onChange={(e) => patch(spec.id, 'count', e.target.value)}
              />
            </div>
          </div>
          <button className={styles.del} title="删除" onClick={() => onRemove(spec.id)}>
            ×
          </button>
        </div>
      ))}

      <div className={styles.addRow}>
        <select
          className={styles.select}
          value={presetIndex}
          onChange={(e) => setPresetIndex(Number(e.target.value))}
        >
          {BOX_PRESETS.map((p, i) => (
            <option key={p.name} value={i}>
              {p.name} · {p.w}×{p.d}×{p.h}
            </option>
          ))}
        </select>
        <button className={styles.addBtn} onClick={() => onAdd(BOX_PRESETS[presetIndex], nextColor(usedColors))}>
          添加
        </button>
      </div>

      <p className={styles.note}>
        数量为「自动」时，系统会一直塞到放不下为止；填了数字就按这个数摆，装不下的会列在结果里。
      </p>
    </section>
  );
}
