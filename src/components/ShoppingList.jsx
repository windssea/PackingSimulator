import { useEffect, useMemo, useState } from 'react';
import { packBoxes } from '../lib/packing';
import { copyText } from '../lib/clipboard';
import styles from './ShoppingList.module.css';

/**
 * 购物清单：把全部方案的装箱结果按盒子尺寸合并，
 * 得出「一共要买几种盒子、各买几个」，一键复制去下单。
 */

/** 对所有方案分别跑一遍装箱，按 长×宽×高 合并数量 */
function aggregatePlans(plans) {
  const map = new Map();
  plans.forEach((plan) => {
    const specs = plan.specs.map((s) => ({ ...s, count: Number(s.count) || 0 }));
    const r = packBoxes({
      container: plan.container,
      specs,
      gap: plan.gap,
      strategy: plan.strategy,
      allowRotate: plan.allowRotate,
    });
    r.stats.bySpec.forEach((s) => {
      if (!s.count) return;
      const spec = specs.find((sp) => sp.id === s.specId);
      if (!spec) return;
      const key = `${spec.w}×${spec.d}×${spec.h}`;
      const cur =
        map.get(key) ?? {
          key,
          name: spec.name,
          w: spec.w,
          d: spec.d,
          h: spec.h,
          color: spec.color,
          total: 0,
          detail: [],
        };
      cur.total += s.count;
      cur.detail.push({ plan: plan.name, count: s.count });
      map.set(key, cur);
    });
  });
  return [...map.values()].sort((a, b) => b.total - a.total);
}

function buildText(rows, planCount) {
  const lines = [`购物清单（${planCount} 个方案汇总）`, ''];
  rows.forEach((r) => {
    const detail = r.detail.map((d) => `${d.plan}×${d.count}`).join('、');
    lines.push(`${r.name} ${r.w}×${r.d}×${r.h}cm × ${r.total}（${detail}）`);
  });
  lines.push('', `合计 ${rows.reduce((n, r) => n + r.total, 0)} 个`);
  return lines.join('\n');
}

export default function ShoppingList({ plans, onClose }) {
  const rows = useMemo(() => aggregatePlans(plans), [plans]);
  const grandTotal = rows.reduce((n, r) => n + r.total, 0);
  const [copied, setCopied] = useState(false);

  // Esc 关闭
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleCopy = async () => {
    const ok = await copyText(buildText(rows, plans.length));
    setCopied(ok);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`${styles.overlay} shopping-list-overlay`} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>购物清单</h2>
            <p className={styles.sub}>
              {plans.length} 个方案汇总 · 相同尺寸的盒子已合并 · 共 {grandTotal} 个
            </p>
          </div>
          <button className={`${styles.close} no-print`} onClick={onClose} title="关闭">
            ×
          </button>
        </div>

        <div className={styles.body}>
          {rows.length === 0 && <p className={styles.empty}>各方案还都装不下任何盒子。</p>}
          {rows.map((r) => (
            <div key={r.key} className={styles.row}>
              <span className={styles.dot} style={{ background: r.color }} />
              <div className={styles.rowMain}>
                <div className={styles.rowTop}>
                  <b>{r.name}</b>
                  <span className={styles.dims}>
                    {r.w} × {r.d} × {r.h} cm
                  </span>
                </div>
                <div className={styles.detail}>
                  {r.detail.map((d) => `${d.plan} ×${d.count}`).join('　·　')}
                </div>
              </div>
              <span className={styles.total}>×{r.total}</span>
            </div>
          ))}
        </div>

        <div className={`${styles.foot} no-print`}>
          <button className={styles.copyBtn} onClick={handleCopy} disabled={!rows.length}>
            {copied ? '已复制到剪贴板 ✓' : '复制清单'}
          </button>
          <button className={styles.printBtn} onClick={() => window.print()} disabled={!rows.length}>
            打印
          </button>
          <button className={styles.ghostBtn} onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
