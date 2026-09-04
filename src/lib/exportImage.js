/**
 * 把当前方案画成一张可以保存 / 转发的 PNG
 * 内容：标题、参数摘要、三维摆放图、关键数字、逐层俯视图
 * 纯 Canvas 2D 绘制，不依赖任何库
 */

const F = (size, bold = false) =>
  `${bold ? '700' : '400'} ${size}px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif`;

const INK = '#4A423A';
const SOFT = '#8B8074';
const FAINT = '#B6AB9D';
const CREAM = '#FDF6EC';
const LINE = '#EFE0CC';

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const one = (v) => (Math.round(v * 10) / 10).toFixed(1);

/** 单层的俯视小图：x 向右、z 向下，和三维场景一致 */
function drawLayer(ctx, layer, container, x, y, w, h, label) {
  ctx.font = F(15, true);
  ctx.fillStyle = INK;
  ctx.fillText(label, x, y + 12);

  const cw = Math.max(container.w, 1);
  const cd = Math.max(container.d, 1);
  const k = Math.min(w / cw, h / cd);
  const ox = x + (w - cw * k) / 2;
  const oy = y + 26 + (h - cd * k) / 2;

  ctx.fillStyle = '#FFF6E9';
  ctx.strokeStyle = '#E6D2B8';
  ctx.lineWidth = 2;
  ctx.fillRect(ox, oy, cw * k, cd * k);
  ctx.strokeRect(ox, oy, cw * k, cd * k);

  layer.boxes.forEach((b) => {
    const bx = ox + b.x * k;
    const bz = oy + b.z * k;
    const bw = Math.max(1, b.w * k - 1);
    const bd = Math.max(1, b.d * k - 1);
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = b.color;
    ctx.fillRect(bx, bz, bw, bd);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(58,53,46,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, bz, bw, bd);
  });
}

function drawMetric(ctx, x, y, w, h, label, value, unit, color) {
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.stroke();

  ctx.font = F(14);
  ctx.fillStyle = SOFT;
  ctx.fillText(label, x + 18, y + 28);

  ctx.font = F(32, true);
  ctx.fillStyle = color || INK;
  ctx.fillText(value, x + 18, y + 68);
  if (unit) {
    const vw = ctx.measureText(value).width;
    ctx.font = F(15);
    ctx.fillStyle = SOFT;
    ctx.fillText(unit, x + 22 + vw, y + 68);
  }
}

/**
 * @param {object} opts
 * @param {string} opts.shot 三维场景截图（dataURL）
 * @param {object} opts.container 容器尺寸 {w,d,h}
 * @param {object} opts.stats 装箱统计
 * @param {string} opts.strategyLabel 策略名称
 * @param {number} opts.gap 间隙
 */
export async function exportPlanImage({ shot, container, stats, strategyLabel, gap }) {
  const img = new Image();
  img.src = shot;
  try {
    await img.decode();
  } catch {
    return false;
  }

  const W = 1080;
  const pad = 44;
  const contentW = W - pad * 2;

  const shotW = contentW;
  const shotH = Math.min(540, Math.round((shotW * img.height) / img.width));

  const layers = stats.layers || [];
  const cols = Math.min(3, Math.max(1, layers.length));
  const rows = Math.ceil(layers.length / cols);
  const gapX = 20;
  const cellW = Math.floor((contentW - (cols - 1) * gapX) / cols);
  const cellH = Math.round(cellW * Math.min(1.1, container.d / container.w)) + 40;

  const H =
    pad * 2 + 92 + shotH + 20 + 104 + 34 + (layers.length ? rows * (cellH + 24) : 0) + 40;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, H);

  let y = pad;
  ctx.font = F(34, true);
  ctx.fillStyle = INK;
  ctx.fillText('收纳装箱方案', pad, y + 30);

  ctx.font = F(15);
  ctx.fillStyle = SOFT;
  ctx.fillText(
    `容器 ${one(container.w)} × ${one(container.d)} × ${one(container.h)} cm（${one(
      stats.containerVolumeL
    )} L） · ${strategyLabel} · 间隙 ${gap} cm`,
    pad,
    y + 58
  );

  y += 92;
  ctx.save();
  roundRect(ctx, pad, y, shotW, shotH, 20);
  ctx.clip();
  ctx.drawImage(img, pad, y, shotW, shotH);
  ctx.restore();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.5;
  roundRect(ctx, pad, y, shotW, shotH, 20);
  ctx.stroke();

  y += shotH + 20;
  const cardW = (contentW - 24) / 3;
  drawMetric(ctx, pad, y, cardW, 96, '能装下', String(stats.total), '个', '#D85A30');
  drawMetric(
    ctx,
    pad + cardW + 12,
    y,
    cardW,
    96,
    '空间利用率',
    `${Math.round(stats.utilization * 100)}`,
    '%',
    stats.utilization >= 0.8 ? '#0F6E56' : stats.utilization >= 0.5 ? '#185FA5' : '#854F0B'
  );
  drawMetric(ctx, pad + (cardW + 12) * 2, y, cardW, 96, '剩余空间', one(stats.remainingVolumeL), 'L', INK);

  y += 96 + 34;
  if (layers.length) {
    ctx.font = F(20, true);
    ctx.fillStyle = INK;
    ctx.fillText('照着摆（俯视图）', pad, y + 6);
    y += 26;
    layers.forEach((layer, i) => {
      const cx = pad + (i % cols) * (cellW + gapX);
      const cy = y + Math.floor(i / cols) * (cellH + 24);
      drawLayer(
        ctx,
        layer,
        container,
        cx,
        cy,
        cellW,
        cellH - 40,
        `第 ${layer.index + 1} 层 · ${layer.count} 个 · 层高 ${one(layer.height)} cm`
      );
    });
    y += rows * (cellH + 24);
  }

  ctx.font = F(13);
  ctx.fillStyle = FAINT;
  ctx.fillText(
    `由收纳装箱模拟器生成 · ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    pad,
    H - pad + 4
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) return resolve(false);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `收纳方案-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve(true);
    }, 'image/png');
  });
}
