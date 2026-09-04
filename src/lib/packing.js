/**
 * 3D 装箱引擎
 *
 * 算法：空间分割法（3D Guillotine / Space Split）
 *  - 维护一组互不重叠的「自由空间」，初始只有容器本身；
 *  - 每放入一个盒子，就把它所在的自由空间切成右、上、前三块；
 *  - 太小、放不下任何盒子的碎空间会被丢弃，防止空间数量爆炸。
 *
 * 物理约束（保证「落下累计」，不悬空）：
 *  - 间隙只加在水平方向（抽拉用），垂直方向贴叠，上层直接落在下层顶面上；
 *  - 直接放置要求底面重心落在地板或某盒子顶面上；
 *  - 地板悬空的候选位不直接放弃，而是尝试「下落」：穿过空档落到盒柱内
 *    最高且能托住重心的支撑上，并同步把盒子从被穿透的空间中扣除（防碰撞）。
 *
 * 两种策略：
 *  - tidy    整齐码放：不旋转（保持标签朝上），按 y→z→x 顺序挑最下最里最左的位置，
 *            同规格连续摆放时会自然形成网格状，最贴近真实收纳习惯。
 *  - maximal 极限填充：尝试 6 种朝向，优先塞进「体积最小的可用空间」，
 *            把大空间留给大盒子，见缝插针，装载率更高。
 *
 * 单位约定：入参/出参一律 cm，内部统一转成整数 mm 计算，避免浮点误差。
 */

const MM = 10; // 1 cm = 10 mm
const AUTO_LIMIT = 240; // 自动模式下单规格最多尝试的盒子数量
const MAX_SPACES = 1200; // 自由空间数量上限

/** 6 种朝向：[长, 宽, 高] 三个维度的排列组合 */
const ORIENTATIONS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

const toMm = (v) => Math.round((Number(v) || 0) * MM);
const toCm = (v) => v / MM;
const volL = (w, h, d) => (w * h * d) / 1e6; // mm³ → 升

/** 按 z→y→x 排序：优先使用最低、最后、最左的空间 */
function sortSpaces(spaces) {
  spaces.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
  return spaces;
}

/**
 * 在一个自由空间中放入盒子后，把剩余空间切成三块
 * 盒子始终贴着空间的 (x, y, z) 最小角放置
 *
 * 切分本身不负责防悬空——上块向深处延伸后，块内地板可能只有一部分
 * 被下层盒子顶面托住。防悬空由放置时的「重心支撑校验」负责
 * （见 packBoxes 里的 isCenterSupported）：盒子底面中心落在地板或某个
 * 已放盒子的顶面上才算站稳，允许合理外挑，但绝不允许整体悬空。
 */
function splitSpace(space, iw, ih, id) {
  const { x, y, z, w, h, d } = space;
  return [
    // 右侧：全高全深
    { x: x + iw, y, z, w: w - iw, h, d },
    // 上方：盒子宽度 × 剩余高度 × 全深
    { x, y: y + ih, z, w: iw, h: h - ih, d },
    // 前方：盒子宽高，剩余进深
    { x, y, z: z + id, w: iw, h: ih, d: d - id },
  ].filter((s) => s.w > 0 && s.h > 0 && s.d > 0);
}

/** 把盒子拆成待放置的个体（自动模式用一个足够大的上界） */
function expandUnits(specs) {
  const units = [];
  specs.forEach((spec, specIndex) => {
    const w = toMm(spec.w);
    const h = toMm(spec.h);
    const d = toMm(spec.d);
    if (w <= 0 || h <= 0 || d <= 0) return;
    const limit = spec.count > 0 ? Math.min(spec.count, AUTO_LIMIT) : AUTO_LIMIT;
    const auto = !(spec.count > 0);
    for (let i = 0; i < limit; i += 1) {
      units.push({
        specIndex,
        specId: spec.id,
        name: spec.name,
        color: spec.color,
        dims: [w, h, d],
        auto,
        volume: w * h * d,
      });
    }
  });
  // 体积降序：先放大盒子，剩下的缝隙用小盒子补
  units.sort((a, b) => b.volume - a.volume || b.dims[2] - a.dims[2]);
  return units;
}

/**
 * 主入口
 * @param {object} options
 * @param {{w:number,h:number,d:number}} options.container 容器内部可用尺寸 (cm)
 * @param {Array} options.specs 盒子规格 [{id,name,w,h,d,color,count}]
 * @param {number} options.gap 盒间间隙 (cm)
 * @param {'tidy'|'maximal'} options.strategy 摆放策略
 * @param {boolean} options.allowRotate 是否允许旋转（侧放/竖放）
 */
export function packBoxes({ container, specs, gap = 0, strategy = 'tidy', allowRotate = false }) {
  const W = toMm(container.w);
  const H = toMm(container.h);
  const D = toMm(container.d);
  const G = Math.max(0, toMm(gap));

  const emptyResult = {
    placed: [],
    unplaced: [],
    stats: buildStats([], [], { W, H, D }, specs),
  };
  if (W <= 0 || H <= 0 || D <= 0) return emptyResult;

  const units = expandUnits(specs);
  if (!units.length) return emptyResult;

  // 所有盒子的最小边长：小于它的自由空间直接丢弃
  const minSide = Math.min(...units.flatMap((u) => u.dims));
  const containerVolume = W * H * D;

  let spaces = sortSpaces([{ x: 0, y: 0, z: 0, w: W, h: H, d: D }]);
  const placed = [];
  const failedSpecs = new Set(); // 自动模式下已放不下的规格，后续直接跳过
  const remainingBySpec = new Map(); // 定量规格的剩余数量
  specs.forEach((s) => {
    if (s.count > 0) remainingBySpec.set(s.id, s.count);
  });

  // 各高度上「已放盒子的顶面」列表，用于重心支撑校验
  const topsByY = new Map();
  /**
   * 重心支撑校验：盒子底面中心必须落在地板（y=0）或某个已放盒子的顶面上。
   * 这保证了「落下累计」——盒子要么落地、要么重心压在下层盒子上，
   * 允许合理外挑，但不会整体悬空。
   */
  const isCenterSupported = (cx, cz, floorY) => {
    if (floorY === 0) return true;
    const tops = topsByY.get(floorY);
    if (!tops) return false;
    for (let i = 0; i < tops.length; i += 1) {
      const t = tops[i];
      if (cx >= t.x1 && cx <= t.x2 && cz >= t.z1 && cz <= t.z2) return true;
    }
    return false;
  };

  /* ---- 已放盒子的网格索引（x/z 平面分格），用于下落落点计算与碰撞校验 ---- */
  const CELL = 20; // mm
  const gridD = Math.max(1, Math.ceil(D / CELL));
  const grid = new Map();
  const gridAdd = (rec) => {
    const cx1 = Math.floor(rec.x / CELL);
    const cx2 = Math.floor((rec.x + rec.w - 1e-9) / CELL);
    const cz1 = Math.floor(rec.z / CELL);
    const cz2 = Math.floor((rec.z + rec.d - 1e-9) / CELL);
    for (let gx = cx1; gx <= cx2; gx += 1) {
      for (let gz = cz1; gz <= cz2; gz += 1) {
        const k = gx * gridD + gz;
        let arr = grid.get(k);
        if (!arr) {
          arr = [];
          grid.set(k, arr);
        }
        arr.push(rec);
      }
    }
  };
  const gridQuery = (x1, z1, x2, z2) => {
    const out = new Set();
    const cx1 = Math.max(0, Math.floor(x1 / CELL));
    const cx2 = Math.floor((x2 - 1e-9) / CELL);
    const cz1 = Math.max(0, Math.floor(z1 / CELL));
    const cz2 = Math.floor((z2 - 1e-9) / CELL);
    for (let gx = cx1; gx <= cx2; gx += 1) {
      for (let gz = cz1; gz <= cz2; gz += 1) {
        const arr = grid.get(gx * gridD + gz);
        if (arr) arr.forEach((r) => out.add(r));
      }
    }
    return [...out];
  };
  const overlaps = (r, x1, y1, z1, x2, y2, z2) =>
    r.x < x2 && x1 < r.x + r.w && r.y < y2 && y1 < r.top && r.z < z2 && z1 < r.z + r.d;

  /**
   * 下落落点：地板悬空的候选位，让盒子穿过空档，落到盒柱范围内最高的支撑上
   * （地板 y=0 或某个已放盒子的顶面）。规则与直接放置一致：
   * 落点高度的支撑面必须托住盒子重心，且落点到空间顶之间不得有遮挡。
   */
  const findLanding = (space, ow, oh, od) => {
    const x1 = space.x;
    const x2 = space.x + ow;
    const z1 = space.z;
    const z2 = space.z + od;
    const cx = space.x + ow / 2;
    const cz = space.z + od / 2;
    const obstacles = gridQuery(x1, z1, x2, z2).filter((r) =>
      overlaps(r, x1, -Infinity, z1, x2, Infinity, z2)
    );
    const ceiling = space.y + space.h;
    const tops = [0];
    obstacles.forEach((b) => {
      if (b.top <= space.y) tops.push(b.top);
    });
    tops.sort((a, b) => b - a);
    for (const t of tops) {
      if (t + oh > ceiling) continue;
      // 重心必须被该高度的支撑托住（地板除外）
      if (t > 0) {
        const supported = obstacles.some(
          (b) => b.top === t && cx >= b.x && cx <= b.x + b.w && cz >= b.z && cz <= b.z + b.d
        );
        if (!supported) continue;
      }
      let blocked = false;
      for (const b of obstacles) {
        if (b.y < t + oh && b.top > t) {
          blocked = true;
          break;
        }
      }
      if (!blocked) return t;
    }
    return null;
  };

  /** 从空间 S 中减去盒子 B 占据的部分，返回剩余的若干子空间（标准三维分割） */
  const subtract = (S, B) => {
    const x1 = Math.max(S.x, B.x);
    const x2 = Math.min(S.x + S.w, B.x + B.w);
    const y1 = Math.max(S.y, B.y);
    const y2 = Math.min(S.y + S.h, B.y + B.h);
    const z1 = Math.max(S.z, B.z);
    const z2 = Math.min(S.z + S.d, B.z + B.d);
    const out = [];
    if (S.x < x1) out.push({ x: S.x, y: S.y, z: S.z, w: x1 - S.x, h: S.h, d: S.d });
    if (x2 < S.x + S.w) out.push({ x: x2, y: S.y, z: S.z, w: S.x + S.w - x2, h: S.h, d: S.d });
    if (S.z < z1) out.push({ x: x1, y: S.y, z: S.z, w: x2 - x1, h: S.h, d: z1 - S.z });
    if (z2 < S.z + S.d) out.push({ x: x1, y: S.y, z: z2, w: x2 - x1, h: S.h, d: S.z + S.d - z2 });
    if (S.y < y1) out.push({ x: x1, y: S.y, z: z1, w: x2 - x1, h: y1 - S.y, d: z2 - z1 });
    if (y2 < S.y + S.h) out.push({ x: x1, y: y2, z: z1, w: x2 - x1, h: S.y + S.h - y2, d: z2 - z1 });
    return out.filter((s) => s.w > 0 && s.h > 0 && s.d > 0);
  };

  /** 下落放置后修补空间表：把落进去的盒子从所有相交空间中扣除，部件必须无碰撞 */
  const repairSpaces = (B) => {
    const next = [];
    for (const S of spaces) {
      const hit =
        S.x < B.x + B.w && B.x < S.x + S.w &&
        S.y < B.y + B.h && B.y < S.y + S.h &&
        S.z < B.z + B.d && B.z < S.z + S.d;
      if (!hit) {
        next.push(S);
        continue;
      }
      for (const part of subtract(S, B)) {
        const free = !gridQuery(part.x, part.z, part.x + part.w, part.z + part.d).some((r) =>
          overlaps(r, part.x, part.y, part.z, part.x + part.w, part.y + part.h, part.z + part.d)
        );
        if (free) next.push(part);
      }
    }
    spaces = next;
  };

  for (const unit of units) {
    if (failedSpecs.has(unit.specId)) continue;

    const candidates = allowRotate ? ORIENTATIONS : [ORIENTATIONS[0]];
    let best = null;

    for (let si = 0; si < spaces.length; si += 1) {
      const space = spaces[si];
      for (const o of candidates) {
        // 间隙只加在水平方向（抽拉用）；垂直方向贴叠，上层直接落在下层顶面上
        const iw = unit.dims[o[0]] + G;
        const ih = unit.dims[o[1]];
        const id = unit.dims[o[2]] + G;
        if (iw > space.w || ih > space.h || id > space.d) continue;

        const ow = iw - G;
        const od = id - G;
        const cx = space.x + ow / 2;
        const cz = space.z + od / 2;

        let plan = null;
        if (isCenterSupported(cx, cz, space.y)) {
          plan = { mode: 'floor', si, space, iw, ih, id, o, y: space.y };
        } else {
          // 地板悬空 → 尝试下落：穿过空档落到盒柱内最高支撑上（落下累计）
          const land = findLanding(space, ow, ih, od);
          if (land !== null) plan = { mode: 'drop', si, space, iw, ih, id, o, y: land };
        }
        if (!plan) continue;

        const score = space.w * space.h * space.d; // 极限填充：优先塞进最小的可容纳空间
        if (!best || score < best.score) {
          best = { ...plan, score };
        }
        if (strategy === 'tidy') break; // 整齐码放：用第一个可行的位置，马上收工
      }
      if (best && strategy === 'tidy') break;
    }

    if (!best) {
      // 放不下：自动模式的规格标记为结束；定量规格计入未放入
      if (unit.auto) failedSpecs.add(unit.specId);
      continue;
    }

    const { space, iw, ih, id, o } = best;
    const ow = iw - G;
    const od = id - G;
    // 输出统一换算回 cm（y 用落点高度，不一定是空间地板）
    const box = {
      specId: unit.specId,
      name: unit.name,
      color: unit.color,
      x: toCm(space.x),
      y: toCm(best.y),
      z: toCm(space.z),
      w: toCm(unit.dims[o[0]]),
      h: toCm(unit.dims[o[1]]),
      d: toCm(unit.dims[o[2]]),
      rotated: o[0] !== 0 || o[1] !== 1 || o[2] !== 2,
    };
    placed.push(box);
    if (remainingBySpec.has(unit.specId)) {
      remainingBySpec.set(unit.specId, remainingBySpec.get(unit.specId) - 1);
    }

    // 登记顶面与网格记录，供后续支撑校验、落点计算与碰撞校验
    const topY = best.y + ih;
    if (!topsByY.has(topY)) topsByY.set(topY, []);
    topsByY.get(topY).push({ x1: space.x, z1: space.z, x2: space.x + ow, z2: space.z + od });
    gridAdd({ x: space.x, y: best.y, z: space.z, w: ow, h: ih, d: od, top: topY });

    if (best.mode === 'floor') {
      spaces.splice(best.si, 1);
      spaces.push(...splitSpace(space, iw, ih, id));
    } else {
      repairSpaces({ x: space.x, y: best.y, z: space.z, w: ow, h: ih, d: od });
    }
    spaces = sortSpaces(spaces.filter((s) => s.w >= minSide && s.h >= minSide && s.d >= minSide));
    if (spaces.length > MAX_SPACES) spaces.length = MAX_SPACES;
  }

  const unplaced = [];
  remainingBySpec.forEach((count, specId) => {
    if (count > 0) {
      const spec = specs.find((s) => s.id === specId);
      unplaced.push({ specId, name: spec?.name ?? '', color: spec?.color ?? '#888', count });
    }
  });

  return {
    placed,
    unplaced,
    stats: buildStats(placed, unplaced, { W, H, D }, specs, spaces, minSide, containerVolume),
  };
}

/** 汇总统计：数量、利用率、剩余空间、各规格数量、分层信息 */
function buildStats(placed, unplaced, size, specs, spaces = [], minSide = 0, containerVolume = 0) {
  const { W, H, D } = size;
  // placed 已是 cm，这里统一用 cm³ 计算体积，1 L = 1000 cm³
  const cv = containerVolume || W * H * D; // mm³
  const containerCm3 = (W / MM) * (H / MM) * (D / MM);
  const usedCm3 = placed.reduce((sum, b) => sum + b.w * b.h * b.d, 0);

  const bySpec = new Map();
  placed.forEach((b) => {
    const cur = bySpec.get(b.specId) || { specId: b.specId, name: b.name, color: b.color, count: 0, volumeL: 0 };
    cur.count += 1;
    cur.volumeL += (b.w * b.h * b.d) / 1000;
    bySpec.set(b.specId, cur);
  });
  // 未放入的规格也要出现在清单里
  unplaced.forEach((u) => {
    if (!bySpec.has(u.specId)) {
      bySpec.set(u.specId, { specId: u.specId, name: u.name, color: u.color, count: 0, volumeL: 0 });
    }
  });

  // 自动模式撞到计算上限时标记一下，真实数量只会更多
  const bySpecList = [...bySpec.values()].map((s) => {
    const spec = specs.find((sp) => sp.id === s.specId);
    const auto = !(spec && spec.count > 0);
    return { ...s, hitLimit: auto && s.count >= AUTO_LIMIT };
  });

  // 最小盒子的体积：用来估算剩余空间还能不能再塞点东西
  const smallest = specs
    .map((s) => toMm(s.w) * toMm(s.h) * toMm(s.d))
    .filter((v) => v > 0)
    .sort((a, b) => a - b)[0] || 0;
  const largestFree = spaces.reduce((max, s) => Math.max(max, s.w * s.h * s.d), 0);

  return {
    container: { w: toCm(W), h: toCm(H), d: toCm(D) },
    containerVolumeL: containerCm3 / 1000,
    usedVolumeL: usedCm3 / 1000,
    remainingVolumeL: Math.max(0, containerCm3 - usedCm3) / 1000,
    utilization: containerCm3 > 0 ? usedCm3 / containerCm3 : 0,
    total: placed.length,
    bySpec: bySpecList,
    layers: buildLayers(placed),
    filledHeight: placed.length ? Math.max(...placed.map((b) => b.y + b.h)) : 0,
    leftoverSpaces: spaces.length,
    canFitMore: smallest > 0 && largestFree >= smallest,
  };
}

/**
 * 按底面高度把盒子分成若干「层」，用于分层俯视图
 * 层内盒子就是实际摆放的样子，照着摆就行
 */
function buildLayers(placed) {
  if (!placed.length) return [];
  const sorted = [...placed].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
  const layers = [];
  let current = null;
  sorted.forEach((b) => {
    if (!current || b.y > current.y0) {
      current = { index: layers.length, y0: b.y, top: b.y + b.h, boxes: [] };
      layers.push(current);
    }
    current.top = Math.max(current.top, b.y + b.h);
    current.boxes.push(b);
  });
  return layers.map((l) => ({
    index: l.index,
    y0: l.y0,
    height: l.top - l.y0,
    count: l.boxes.length,
    boxes: l.boxes,
  }));
}

/** 常用预设：容器模板 */
export const CONTAINER_PRESETS = [
  { id: 'wardrobe', name: '衣柜格', w: 80, h: 120, d: 55, icon: 'wardrobe' },
  { id: 'drawer', name: '抽屉', w: 60, h: 18, d: 45, icon: 'drawer' },
  { id: 'storage', name: '收纳箱', w: 50, h: 30, d: 40, icon: 'box' },
  { id: 'underbed', name: '床下箱', w: 90, h: 20, d: 50, icon: 'underbed' },
  { id: 'luggage', name: '20寸行李箱', w: 50, h: 24, d: 34, icon: 'luggage' },
  { id: 'shelf', name: '书架隔层', w: 90, h: 30, d: 28, icon: 'shelf' },
];

/** 常用预设：盒子规格 */
export const BOX_PRESETS = [
  { name: '内衣收纳格', w: 32, h: 12, d: 24 },
  { name: '袜子盒', w: 24, h: 10, d: 16 },
  { name: '衣物百纳箱', w: 40, h: 20, d: 30 },
  { name: '小物分格盒', w: 20, h: 8, d: 14 },
  { name: '鞋子盒', w: 30, h: 12, d: 20 },
  { name: '文件盒', w: 24, h: 30, d: 32 },
];

/** 卡通糖果色板 */
export const CANDY_COLORS = [
  '#7F77DD',
  '#1D9E75',
  '#D85A30',
  '#D4537E',
  '#378ADD',
  '#BA7517',
  '#639922',
  '#E24B4A',
];
