import { CONTAINER_PRESETS } from '../lib/packing';
import styles from './Panel.module.css';

const FIELDS = [
  { key: 'w', label: '宽' },
  { key: 'd', label: '进深' },
  { key: 'h', label: '高' },
];

export default function ContainerPanel({ value, onChange }) {
  const setField = (key, raw) => {
    const n = Number(raw);
    onChange({ ...value, [key]: Number.isFinite(n) && n > 0 ? n : 0 });
  };

  const matchPreset = (p) => value.w === p.w && value.d === p.d && value.h === p.h;

  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>
        <span className={styles.badge}>1</span>
        收纳空间
      </h2>

      <div className={styles.chips}>
        {CONTAINER_PRESETS.map((p) => (
          <button
            key={p.id}
            className={`${styles.chip} ${matchPreset(p) ? styles.chipActive : ''}`}
            onClick={() => onChange({ w: p.w, d: p.d, h: p.h })}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className={styles.grid3}>
        {FIELDS.map((f) => (
          <label key={f.key} className={styles.field}>
            <span className={styles.label}>{f.label} (cm)</span>
            <input
              className={styles.input}
              type="number"
              min="0"
              step="1"
              value={value[f.key] || ''}
              onChange={(e) => setField(f.key, e.target.value)}
            />
          </label>
        ))}
      </div>

      <p className={styles.note}>填内部可用尺寸。量柜子时用卷尺量内壁，别量外框。</p>
    </section>
  );
}
