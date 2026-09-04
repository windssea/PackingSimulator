import { useState } from 'react';
import styles from './Panel.module.css';

/**
 * 方案管理条：切换 / 新建 / 重命名 / 删除方案
 * 家里几处柜子各存一个方案，互不覆盖
 */
export default function PlansBar({ plans, activeId, onSwitch, onNew, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const active = plans.find((p) => p.id === activeId) ?? plans[0];

  const commit = () => {
    const name = draft.trim();
    if (name) onRename(active.id, name);
    setEditing(false);
  };

  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>
        <span className={`${styles.badge} ${styles.badgeMint}`}>✓</span>
        我的方案
      </h2>

      <div className={styles.planRow}>
        {editing ? (
          <input
            className={`${styles.input} ${styles.inputSm}`}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <select
            className={`${styles.select} ${styles.planSelect}`}
            value={active.id}
            onChange={(e) => onSwitch(e.target.value)}
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <button
          className={styles.planBtn}
          title="重命名当前方案"
          onClick={() => {
            setDraft(active.name);
            setEditing(true);
          }}
        >
          ✎
        </button>
        <button className={styles.planBtn} title="新建方案" onClick={onNew}>
          ＋
        </button>
        <button
          className={`${styles.planBtn} ${plans.length <= 1 ? styles.planBtnOff : ''}`}
          title={plans.length <= 1 ? '至少保留一个方案' : '删除当前方案'}
          onClick={() => plans.length > 1 && onDelete(active.id)}
        >
          ×
        </button>
      </div>

      <p className={styles.note}>
        当前方案：容器 {active.container.w}×{active.container.d}×{active.container.h} cm ·{' '}
        {active.specs.length} 种盒子。每个方案独立保存，切换自动保留。
      </p>
    </section>
  );
}
