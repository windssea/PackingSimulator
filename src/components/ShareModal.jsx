import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { encodePlanHash } from '../lib/plans';
import { copyText } from '../lib/clipboard';
import styles from './ShoppingList.module.css';

/**
 * 分享当前方案：把方案数据编码进 URL hash 生成二维码，
 * 手机扫码即打开同一个方案（数据全在链接里，不经过服务器）
 */
export default function ShareModal({ plan, onClose }) {
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);

  const url = useMemo(
    () => `${location.origin}${location.pathname}#p=${encodePlanHash(plan)}`,
    [plan]
  );

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, {
      width: 440,
      margin: 2,
      color: { dark: '#4A423A', light: '#FFFDF9' },
    })
      .then((dataUrl) => alive && setQr(dataUrl))
      .catch(() => alive && setQr(''));
    return () => {
      alive = false;
    };
  }, [url]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleCopy = async () => {
    const ok = await copyText(url);
    setCopied(ok);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>分享「{plan.name}」</h2>
            <p className={styles.sub}>
              容器 {plan.container.w}×{plan.container.d}×{plan.container.h} cm ·{' '}
              {plan.specs.length} 种盒子 · 数据全在链接里
            </p>
          </div>
          <button className={styles.close} onClick={onClose} title="关闭">
            ×
          </button>
        </div>

        <div className={styles.body} style={{ textAlign: 'center' }}>
          {qr ? (
            <img
              src={qr}
              alt="方案二维码"
              style={{ width: 220, height: 220, borderRadius: 12 }}
            />
          ) : (
            <p className={styles.empty}>二维码生成中…</p>
          )}
          <p className={styles.sub} style={{ marginTop: 10 }}>
            手机扫码或复制链接，打开就是这套方案
          </p>
          <div
            style={{
              marginTop: 10,
              padding: '8px 12px',
              borderRadius: 10,
              background: 'var(--cream)',
              fontSize: 11,
              color: 'var(--ink-faint)',
              wordBreak: 'break-all',
              textAlign: 'left',
              maxHeight: 64,
              overflow: 'hidden',
            }}
          >
            {url}
          </div>
        </div>

        <div className={styles.foot}>
          <button className={styles.copyBtn} onClick={handleCopy}>
            {copied ? '已复制链接 ✓' : '复制链接'}
          </button>
          <button className={styles.ghostBtn} onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
