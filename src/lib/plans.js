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

export { isValidPlan };

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

/* ---------- JSON 导入导出：备份 / 跨设备分享 ---------- */

/** 把方案库打包成 JSON 文件并触发下载 */
export function exportPlansJson(plans) {
  const payload = {
    app: 'shouna-box-planner',
    version: 2,
    exportedAt: new Date().toISOString(),
    plans,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `收纳方案备份-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 解析导入的 JSON：只接受本应用导出的结构，逐个校验方案合法性
 * @returns {Array} 合法的方案数组
 * @throws {Error} 结构不对时抛出可读的错误信息
 */
export function parsePlansJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('文件不是有效的 JSON');
  }
  const plans = Array.isArray(data) ? data : data?.plans;
  if (!Array.isArray(plans) || !plans.length) {
    throw new Error('文件里没有方案数据');
  }
  const valid = plans.filter(isValidPlan);
  if (!valid.length) {
    throw new Error('方案数据不完整（缺少容器尺寸或盒子清单）');
  }
  return valid;
}

/**
 * 合并导入的方案：id 撞了就用新编号，名字撞了就加「(导入)」后缀
 * 不覆盖现有方案——导入只做追加，避免误删用户已有数据
 */
export function mergePlans(existing, imported) {
  const usedIds = new Set(existing.map((p) => p.id));
  const usedNames = new Set(existing.map((p) => p.name));
  let n = nextPlanNumber(existing);
  const merged = imported.map((p) => {
    let { id, name } = p;
    if (usedIds.has(id)) {
      id = `p${n}`;
      n += 1;
    }
    usedIds.add(id);
    if (usedNames.has(name)) name = `${name}(导入)`;
    usedNames.add(name);
    return { ...p, id, name };
  });
  return [...existing, ...merged];
}

/* ---------- 链接分享：把方案编码进 URL hash，扫码即开 ---------- */

/** 方案 → base64url 字符串（放进 #p= 后面） */
export function encodePlanHash(plan) {
  const json = JSON.stringify(plan);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** #p=xxxx → 方案对象；坏了返回 null（忽略坏链接，不影响启动） */
export function decodePlanHash(hash) {
  try {
    const s = hash.replace(/^#p=/, '').replace(/-/g, '+').replace(/_/g, '/');
    const plan = JSON.parse(decodeURIComponent(escape(atob(s))));
    return isValidPlan(plan) ? plan : null;
  } catch {
    return null;
  }
}
