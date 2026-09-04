/**
 * 装箱引擎测试套件
 *
 * 覆盖三类不变量与全部边界：
 *  - 几何合法：两两不重叠、全部在容器内
 *  - 物理合法：离地盒子的底面重心必须有支撑（地板或某盒子顶面）——「落下累计」
 *  - 统计自洽：总数 = 各规格数量之和、利用率 = 已用体积 / 容器体积
 *
 * 运行：npm test
 */
import { describe, it, expect } from 'vitest';
import { packBoxes } from './packing.js';

const EPS = 1e-6;

/** 通用不变量断言：任何结果都必须满足 */
function assertValid(result, container) {
  const { placed, stats } = result;

  // 不重叠 & 不越界 & 不悬空
  for (let i = 0; i < placed.length; i += 1) {
    const a = placed[i];
    expect(a.x, `盒子 ${i} x 越界`).toBeGreaterThanOrEqual(-EPS);
    expect(a.y, `盒子 ${i} y 越界`).toBeGreaterThanOrEqual(-EPS);
    expect(a.z, `盒子 ${i} z 越界`).toBeGreaterThanOrEqual(-EPS);
    expect(a.x + a.w, `盒子 ${i} 右缘越界`).toBeLessThanOrEqual(container.w + EPS);
    expect(a.y + a.h, `盒子 ${i} 顶缘越界`).toBeLessThanOrEqual(container.h + EPS);
    expect(a.z + a.d, `盒子 ${i} 前缘越界`).toBeLessThanOrEqual(container.d + EPS);

    if (a.y > EPS) {
      const cx = a.x + a.w / 2;
      const cz = a.z + a.d / 2;
      const supported = placed.some(
        (b) =>
          b !== a &&
          Math.abs(b.y + b.h - a.y) < EPS &&
          cx >= b.x - EPS &&
          cx <= b.x + b.w + EPS &&
          cz >= b.z - EPS &&
          cz <= b.z + b.d + EPS
      );
      expect(supported, `盒子 ${i} 悬空（y=${a.y}，重心 ${cx.toFixed(1)},${cz.toFixed(1)}）`).toBe(true);
    }

    for (let j = i + 1; j < placed.length; j += 1) {
      const b = placed[j];
      const overlap =
        a.x < b.x + b.w - EPS &&
        b.x < a.x + a.w - EPS &&
        a.y < b.y + b.h - EPS &&
        b.y < a.y + a.h - EPS &&
        a.z < b.z + b.d - EPS &&
        b.z < a.z + a.d - EPS;
      expect(overlap, `盒子 ${i} 与 ${j} 重叠`).toBe(false);
    }
  }

  // 统计自洽
  const bySpecSum = stats.bySpec.reduce((n, s) => n + s.count, 0);
  expect(bySpecSum, '各规格数量之和 ≠ 总数').toBe(stats.total);
  expect(stats.total).toBe(placed.length);
  if (stats.containerVolumeL > 0) {
    expect(stats.utilization).toBeCloseTo(stats.usedVolumeL / stats.containerVolumeL, 9);
  }
}

const spec = (id, name, w, d, h, count = 0) => ({ id, name, w, d, h, color: '#888', count });

describe('默认场景（App 初始方案）', () => {
  const input = {
    container: { w: 60, d: 45, h: 40 },
    specs: [
      spec('s1', '衣物百纳箱', 30, 22, 14),
      spec('s2', '内衣收纳格', 22, 15, 10),
      spec('s3', '小物分格盒', 14, 10, 7),
    ],
    gap: 0.5,
    strategy: 'tidy',
    allowRotate: false,
  };
  const r = packBoxes(input);

  it('几何与物理全部合法', () => assertValid(r, input.container));

  it('能装 15 个以上', () => {
    expect(r.stats.total).toBeGreaterThanOrEqual(15);
  });

  it('橙盒落下累计：至少 4 个，且形成 0/7/14cm 的逐层堆叠', () => {
    const oranges = r.placed.filter((b) => b.specId === 's3');
    expect(oranges.length).toBeGreaterThanOrEqual(4);
    const ys = new Set(oranges.map((b) => Math.round(b.y * 10) / 10));
    expect(ys.has(0), '底层应有橙盒（y=0）').toBe(true);
    expect(ys.has(7), 'y=7 应有橙盒叠上').toBe(true);
    expect(ys.has(14), 'y=14 应有橙盒继续叠').toBe(true);
  });
});

describe('重压场景', () => {
  it('衣柜 + 三种小盒（整齐码放）', () => {
    const input = {
      container: { w: 80, h: 120, d: 55 },
      specs: [spec('a', '小方盒', 12, 8, 6), spec('b', '迷你盒', 9, 6, 5), spec('c', '薄盒', 15, 10, 4)],
      gap: 0.5,
      strategy: 'tidy',
      allowRotate: false,
    };
    const r = packBoxes(input);
    assertValid(r, input.container);
    expect(r.stats.total).toBeGreaterThanOrEqual(200);
  });

  it('同场景（极限填充 + 旋转）装载率不低于整齐码放的一半', () => {
    const base = {
      container: { w: 80, h: 120, d: 55 },
      specs: [spec('a', '小方盒', 12, 8, 6), spec('b', '迷你盒', 9, 6, 5), spec('c', '薄盒', 15, 10, 4)],
      gap: 0,
    };
    const tidy = packBoxes({ ...base, strategy: 'tidy', allowRotate: false });
    const max = packBoxes({ ...base, strategy: 'maximal', allowRotate: true });
    assertValid(max, base.container);
    expect(max.stats.total).toBeGreaterThanOrEqual(tidy.stats.total * 0.5);
  });

  it('超大容器 8 规格全自动（性能与正确性）', () => {
    const input = {
      container: { w: 200, h: 200, d: 100 },
      specs: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => spec(`s${i}`, `规格${i}`, 5 + i * 3, 4 + i * 2, 3 + i)),
      gap: 0.5,
      strategy: 'tidy',
      allowRotate: false,
    };
    const t0 = performance.now();
    const r = packBoxes(input);
    const ms = performance.now() - t0;
    assertValid(r, input.container);
    expect(r.stats.total).toBeGreaterThanOrEqual(500);
    expect(ms, '装箱耗时应在可接受范围').toBeLessThan(1000);
  });
});

describe('边界与异常输入', () => {
  it('盒子比容器大：放 0 个，定量部分如实报未放入', () => {
    const r = packBoxes({
      container: { w: 40, h: 30, d: 20 },
      specs: [spec('big', '巨盒', 100, 100, 100, 5)],
      gap: 0.5,
      strategy: 'tidy',
      allowRotate: false,
    });
    expect(r.stats.total).toBe(0);
    expect(r.unplaced).toEqual([expect.objectContaining({ specId: 'big', count: 5 })]);
  });

  it('间隙大于盒子本身：不崩、不重叠', () => {
    const input = {
      container: { w: 40, h: 30, d: 20 },
      specs: [spec('tiny', '微盒', 2, 2, 2)],
      gap: 3,
      strategy: 'tidy',
      allowRotate: false,
    };
    const r = packBoxes(input);
    assertValid(r, input.container);
    expect(r.stats.total).toBeGreaterThan(0);
  });

  it('容器为 0 / 负数 / NaN：返回空结果不抛异常', () => {
    const r = packBoxes({
      container: { w: NaN, h: -5, d: 0 },
      specs: [spec('a', '盒', 10, 10, 10, 3)],
      gap: 0.5,
      strategy: 'tidy',
      allowRotate: false,
    });
    expect(r.placed).toEqual([]);
    expect(r.stats.total).toBe(0);
  });

  it('规格含负数 / NaN / 空串边长：坏规格跳过，好规格正常', () => {
    const r = packBoxes({
      container: { w: 50, h: 50, d: 50 },
      specs: [
        spec('a', '负边', -10, 10, 10, 2),
        spec('b', 'NaN边', NaN, 10, 10, 2),
        spec('c', '空串边', '', 10, 10, 2),
        spec('d', '正常盒', 10, 10, 10, 2),
      ],
      gap: 0.5,
      strategy: 'tidy',
      allowRotate: false,
    });
    expect(r.stats.total).toBe(2);
    expect(r.stats.bySpec.find((s) => s.specId === 'd')?.count).toBe(2);
  });

  it('空规格清单：空结果', () => {
    const r = packBoxes({
      container: { w: 50, h: 50, d: 50 },
      specs: [],
      gap: 0,
      strategy: 'tidy',
      allowRotate: false,
    });
    expect(r.placed).toEqual([]);
    expect(r.stats.total).toBe(0);
  });

  it('count 传字符串数字也能按定量摆放', () => {
    const r = packBoxes({
      container: { w: 50, h: 30, d: 40 },
      specs: [spec('a', '盒', 10, 10, 10, '4')],
      gap: 0.5,
      strategy: 'tidy',
      allowRotate: false,
    });
    expect(r.stats.total).toBe(4);
  });

  it('薄抽屉：盒子高度超出但允许侧放时能放下', () => {
    const input = {
      container: { w: 60, d: 18, h: 45 },
      specs: [spec('a', '立式盒', 20, 30, 12)],
      gap: 0,
      strategy: 'maximal',
      allowRotate: true,
    };
    const r = packBoxes(input);
    assertValid(r, input.container);
    expect(r.stats.total).toBeGreaterThan(0);
    expect(r.placed.every((b) => b.rotated), '放下的盒子都应该是旋转过的').toBe(true);
  });
});

describe('纯函数特性', () => {
  it('同输入跑两次，结果完全一致', () => {
    const input = {
      container: { w: 60, d: 45, h: 40 },
      specs: [spec('s1', '衣物百纳箱', 30, 22, 14), spec('s2', '内衣收纳格', 22, 15, 10)],
      gap: 0.5,
      strategy: 'tidy',
      allowRotate: false,
    };
    expect(JSON.stringify(packBoxes(input))).toBe(JSON.stringify(packBoxes(input)));
  });
});
