/**
 * 多方案存储（v2）
 *
 * 真实收纳整理要量好几处柜子：每个柜子一个「方案」，各自保存容器尺寸、
 * 盒子规格、间隙与策略。全部方案存在 localStorage 的 v2 键下，
 * 打开页面时自动回到上次编辑的那个方案。
 *
 * 兼容：老版本（v1，单方案键）的数据在首次加载时自动迁移为「默认方案」。
 */

const V2_KEY = 'shouna-planner-v2';
const V1_KEY = 'shouna-planner-v1';

const isValidPlan = (p) =>
  p && typeof p.id === 'string' && typeof p.container?.w === 'number' && Array.isArray(p.specs);

/**
 * 读取方案库。返回 { plans, activeId }；没有可用数据时返回 null（调用方用默认值）
 */
export function loadPlansStore() {
  try {
    const raw = localStorage.getItem(V2_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.plans) && data.plans.length && data.plans.every(isValidPlan)) {
        const activeId = data.plans.some((p) => p.id === data.activeId)
          ? data.activeId
          : data.plans[0].id;
        return { plans: data.plans, activeId };
      }
    }
  } catch {
    /* v2 坏了就往下走迁移 */
  }

  // v1 → v2 迁移
  try {
    const raw = localStorage.getItem(V1_KEY);
    if (!raw) return null;
    const v1 = JSON.parse(raw);
    if (v1 && typeof v1.container?.w === 'number' && Array.isArray(v1.specs)) {
      const plan = { id: 'p1', name: '默认方案', ...v1 };
      return { plans: [plan], activeId: 'p1' };
    }
  } catch {
    /* 老数据也坏了，交给调用方回退 */
  }
  return null;
}

/** 保存方案库；隐私模式等写不进就静默放弃，不影响使用 */
export function savePlansStore(store) {
  try {
    localStorage.setItem(V2_KEY, JSON.stringify(store));
  } catch {
    /* 写不进就算了 */
  }
}

/** 从已有方案 id 里推出下一个可用编号，避免删除再新建时撞 id */
export function nextPlanNumber(plans) {
  return (
    plans.reduce((max, p) => {
      const n = Number(String(p.id).replace(/\D/g, ''));
      return Number.isFinite(n) && n > max ? n : max;
    }, 0) + 1
  );
}
