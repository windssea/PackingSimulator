import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import styles from './Scene3D.module.css';

/** 卡通渐变贴图：让 MeshToonMaterial 呈现 3 阶明暗，而不是硬邦邦的两级 */
function makeToonGradient(steps = 3) {
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i += 1) {
    data[i] = Math.round(255 * (0.55 + 0.45 * (i / (steps - 1))));
  }
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeOutBack = (t) => {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

const VIEW_DIRECTIONS = {
  iso: [1, 0.78, 1.15],
  top: [0.001, 1.6, 0.001],
  front: [0, 0.25, 1.5],
  side: [1.5, 0.25, 0.001],
};

const ANIM_DURATION = 2.4; // 整场填充动画时长（秒）
const DROP_SPAN = 0.18; // 单个盒子下落占总进度的比例

/**
 * 卡通风格的三维收纳场景
 * - 房间：地板、两面墙、踢脚线、盆栽、地毯、挂画
 * - 容器：半透明薄壁 + 木色底板，能看清内部
 * - 盒子：卡通材质 + 描边，支持逐个放入动画、爆炸展开、分层查看
 */
const Scene3D = forwardRef(function Scene3D(
  { container, placed, viewMode = 'iso', viewNonce = 0, explode = 0, activeLayer = null, onProgress },
  ref
) {
  const mountRef = useRef(null);
  const tipRef = useRef(null);
  const storeRef = useRef({});
  const paramsRef = useRef({ explode: 0, activeLayer: null, viewMode: 'iso' });
  const animRef = useRef({ progress: 1, playing: false, lastReported: -1 });
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  paramsRef.current = { explode, activeLayer, viewMode };

  useImperativeHandle(ref, () => ({
    play() {
      if (animRef.current.progress >= 1) animRef.current.progress = 0;
      animRef.current.playing = true;
    },
    pause() {
      animRef.current.playing = false;
    },
    reset() {
      animRef.current.progress = 0;
      animRef.current.playing = false;
    },
    setProgress(p) {
      animRef.current.progress = Math.min(1, Math.max(0, p));
      animRef.current.playing = false;
    },
    isPlaying: () => animRef.current.playing,
    getProgress: () => animRef.current.progress,
    /** 截一张当前场景的图：先把所有盒子摆到位再渲染，免得截到半空的箱子 */
    snapshot() {
      const s = storeRef.current;
      if (!s.renderer) return null;
      animRef.current.progress = 1;
      animRef.current.playing = false;
      onProgressRef.current?.(1);
      updateBoxes(s, 1, paramsRef.current);
      s.renderer.render(s.scene, s.camera);
      return s.renderer.domElement.toDataURL('image/png');
    },
  }));

  /* ---------- 初始化场景 ---------- */
  useEffect(() => {
    const mount = mountRef.current;
    const store = storeRef.current;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true, // snapshot() 里要 toDataURL，得保住绘制缓冲
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xfdf3e6, 30, 70);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    camera.position.set(9, 8, 12);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 3;
    controls.maxDistance = 44;

    scene.add(new THREE.HemisphereLight(0xffffff, 0xe0cdb4, 1.0));
    const sun = new THREE.DirectionalLight(0xfff3dd, 0.85);
    sun.position.set(7, 13, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 55;
    sun.shadow.bias = -0.0012;
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16 });
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xcfe3ff, 0.26);
    fill.position.set(-8, 6, -6);
    scene.add(fill);

    const gradient = makeToonGradient(3);

    /* ---- 房间 ---- */
    const room = new THREE.Group();
    scene.add(room);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 70),
      new THREE.MeshToonMaterial({ color: 0xf0dcc0, gradientMap: gradient })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    room.add(floor);

    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(6.6, 44),
      new THREE.MeshToonMaterial({ color: 0xf7d9e3, gradientMap: gradient })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.01;
    rug.receiveShadow = true;
    room.add(rug);

    const wallMat = new THREE.MeshToonMaterial({ color: 0xfdf1e0, gradientMap: gradient });
    const skirtMat = new THREE.MeshToonMaterial({ color: 0xe8d3b4, gradientMap: gradient });
    const makeWall = (width, x, z, ry) => {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, 24), wallMat);
      wall.position.set(x, 12, z);
      wall.rotation.y = ry;
      wall.receiveShadow = true;
      room.add(wall);
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(width, 0.9, 0.35), skirtMat);
      skirt.position.set(x, 0.45, z);
      skirt.rotation.y = ry;
      room.add(skirt);
    };
    makeWall(52, 0, -14, 0);
    makeWall(52, -14, 0, Math.PI / 2);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 2.2, 0.2),
      new THREE.MeshToonMaterial({ color: 0xd9a05b, gradientMap: gradient })
    );
    frame.position.set(-6, 7.6, -13.85);
    room.add(frame);
    const art = new THREE.Mesh(
      new THREE.PlaneGeometry(2.25, 1.65),
      new THREE.MeshToonMaterial({ color: 0x9fd8c8, gradientMap: gradient })
    );
    art.position.set(-6, 7.6, -13.72);
    room.add(art);

    const plant = new THREE.Group();
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.66, 1.15, 16),
      new THREE.MeshToonMaterial({ color: 0xd98b5f, gradientMap: gradient })
    );
    pot.position.y = 0.575;
    pot.castShadow = true;
    plant.add(pot);
    [
      [0, 1.6, 0, 1.08],
      [0.52, 2.2, 0.22, 0.78],
      [-0.48, 2.05, -0.26, 0.68],
      [0.12, 2.62, 0.06, 0.56],
    ].forEach(([x, y, z, r]) => {
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(r, 14, 12),
        new THREE.MeshToonMaterial({ color: 0x6fbf73, gradientMap: gradient })
      );
      leaf.position.set(x, y, z);
      leaf.castShadow = true;
      plant.add(leaf);
    });
    plant.position.set(8.2, 0, -6.8);
    room.add(plant);

    /* ---- 容器与盒子节点 ---- */
    const unitGroup = new THREE.Group();
    scene.add(unitGroup);
    const shellGroup = new THREE.Group();
    const boxGroup = new THREE.Group();
    unitGroup.add(shellGroup);
    unitGroup.add(boxGroup);

    const hoverOutline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0x2f2b26, transparent: true, opacity: 0.85 })
    );
    hoverOutline.visible = false;
    unitGroup.add(hoverOutline);

    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    const edgeGeometry = new THREE.EdgesGeometry(boxGeometry);

    Object.assign(store, {
      renderer,
      scene,
      camera,
      controls,
      unitGroup,
      shellGroup,
      boxGroup,
      hoverOutline,
      boxGeometry,
      edgeGeometry,
      edgeMaterial: new THREE.LineBasicMaterial({
        color: 0x3a352e,
        transparent: true,
        opacity: 0.3,
      }),
      gradient,
      boxMaterials: new Map(),
      boxes: [],
      desiredCam: new THREE.Vector3(9, 8, 12),
      camTarget: new THREE.Vector3(0, 1, 0),
      viewTransition: true, // 是否正在做预设视角的平滑过渡
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(-2, -2),
      pointerPx: { x: 0, y: 0 },
      containerSize: { w: 1, h: 1, d: 1 },
      scale: 0.1,
      tipEl: tipRef.current,
      userControlled: false,
    });

    /* ---- 交互 ---- */
    const onPointerMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      store.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      store.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      store.pointerPx = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onPointerLeave = () => {
      store.pointer.set(-2, -2);
      store.hoverOutline.visible = false;
      if (tipRef.current) tipRef.current.style.opacity = '0';
    };
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);

    // 用户任何交互（拖拽 / 平移 / 缩放）都立即取消视角过渡，避免和插值打架
    const onUserInteract = () => {
      store.viewTransition = false;
      store.userControlled = true;
    };
    controls.addEventListener('start', onUserInteract);

    /* ---- 自适应 ---- */
    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // 视口比例变化后，若用户没手动调整过视角，重新按新比例取景，防止容器被裁
      if (!store.userControlled) {
        applyView(store, paramsRef.current.viewMode, containerDistance(store));
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    /* ---- 主循环 ---- */
    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const delta = Math.min(clock.getDelta(), 0.05);
      const anim = animRef.current;

      if (anim.playing) {
        anim.progress += delta / ANIM_DURATION;
        if (anim.progress >= 1) {
          anim.progress = 1;
          anim.playing = false;
        }
        const pct = Math.round(anim.progress * 100);
        if (pct !== anim.lastReported) {
          anim.lastReported = pct;
          onProgress?.(anim.progress);
        }
      }

      updateBoxes(store, anim.progress, paramsRef.current);
      updateHover(store, camera);

      // 只在预设视角过渡期间插值；用户一旦开始拖/滚轮，立刻停手把控制权交还
      if (store.viewTransition) {
        camera.position.lerp(store.desiredCam, 0.12);
        controls.target.lerp(store.camTarget, 0.12);
        if (
          camera.position.distanceTo(store.desiredCam) < 0.05 &&
          controls.target.distanceTo(store.camTarget) < 0.05
        ) {
          store.viewTransition = false;
        }
      }
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      controls.removeEventListener('start', onUserInteract);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [onProgress]);

  /* ---------- 容器外壳 ---------- */
  useEffect(() => {
    const store = storeRef.current;
    if (!store.renderer) return;
    const group = store.shellGroup;
    while (group.children.length) {
      const c = group.children.pop();
      c.geometry?.dispose();
      if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
      else c.material?.dispose();
    }

    const w = Math.max(0.5, Number(container.w) || 1);
    const h = Math.max(0.5, Number(container.h) || 1);
    const d = Math.max(0.5, Number(container.d) || 1);
    const S = 9 / Math.max(w, h, d); // 不同尺寸的容器统一到相近的视觉大小
    store.scale = S;
    const CW = w * S;
    const CH = h * S;
    const CD = d * S;
    store.containerSize = { w: CW, h: CH, d: CD };
    const t = Math.min(0.4, Math.max(0.1, Math.min(CW, CD) * 0.045));

    store.unitGroup.position.set(-CW / 2, 0, -CD / 2);
    store.camTarget.set(0, CH / 2, 0); // 对准容器几何中心

    const wallMat = new THREE.MeshToonMaterial({
      color: 0xfffaf0,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      side: THREE.DoubleSide,
      gradientMap: store.gradient,
    });
    const woodMat = new THREE.MeshToonMaterial({ color: 0xe4c49a, gradientMap: store.gradient });

    const base = new THREE.Mesh(new THREE.BoxGeometry(CW + t * 2, t, CD + t * 2), woodMat);
    base.position.set(CW / 2, -t / 2, CD / 2);
    base.receiveShadow = true;
    base.castShadow = true;
    group.add(base);

    [
      { g: [t, CH, CD], p: [-t / 2, CH / 2, CD / 2] },
      { g: [t, CH, CD], p: [CW + t / 2, CH / 2, CD / 2] },
      { g: [CW, CH, t], p: [CW / 2, CH / 2, -t / 2] },
      { g: [CW, CH, t], p: [CW / 2, CH / 2, CD + t / 2] },
    ].forEach(({ g, p }) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...g), wallMat);
      m.position.set(...p);
      group.add(m);
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(m.geometry),
        new THREE.LineBasicMaterial({ color: 0xb99b73, transparent: true, opacity: 0.5 })
      );
      edge.position.set(...p);
      group.add(edge);
    });

    applyView(store, paramsRef.current.viewMode, containerDistance(store));
  }, [container.w, container.h, container.d]);

  /* ---------- 盒子 ---------- */
  useEffect(() => {
    const store = storeRef.current;
    if (!store.renderer) return;
    store.boxGroup.clear();
    store.boxes = [];
    store.boxMaterials.forEach((m) => m.dispose());
    store.boxMaterials.clear();
    store.hoverOutline.visible = false;

    const S = store.scale;
    const { w: CW, h: CH, d: CD } = store.containerSize;
    const dropHeight = CH * 1.8 + 4;

    const layerIndex = new Map();
    [...new Set(placed.map((b) => b.y))]
      .sort((a, b) => a - b)
      .forEach((y, i) => layerIndex.set(y, i));

    placed.forEach((b, index) => {
      const bw = b.w * S;
      const bh = b.h * S;
      const bd = b.d * S;
      let mat = store.boxMaterials.get(b.specId);
      if (!mat) {
        mat = new THREE.MeshToonMaterial({
          color: new THREE.Color(b.color),
          gradientMap: store.gradient,
        });
        store.boxMaterials.set(b.specId, mat);
      }

      const target = new THREE.Vector3(
        (b.x + b.w / 2) * S,
        (b.y + b.h / 2) * S,
        (b.z + b.d / 2) * S
      );
      const layer = layerIndex.get(b.y) ?? 0;

      const mesh = new THREE.Mesh(store.boxGeometry, mat);
      mesh.castShadow = true;
      mesh.position.copy(target);
      mesh.userData = {
        target,
        baseScale: new THREE.Vector3(bw, bh, bd),
        start: new THREE.Vector3(target.x, target.y + dropHeight, target.z - CD * 0.12),
        delay: (index / Math.max(1, placed.length)) * 0.82,
        layer,
        offset: new THREE.Vector3(target.x - CW / 2, target.y - CH / 2, target.z - CD / 2),
        info: { name: b.name, w: b.w.toFixed(1), h: b.h.toFixed(1), d: b.d.toFixed(1), layer },
      };
      store.boxGroup.add(mesh);

      const edges = new THREE.LineSegments(store.edgeGeometry, store.edgeMaterial);
      store.boxGroup.add(edges);

      store.boxes.push({ mesh, edges, delay: mesh.userData.delay, layer });
    });

    updateBoxes(store, animRef.current.progress, paramsRef.current);
  }, [placed, container.w, container.h, container.d]); // 容器尺寸变化会改变缩放比例，盒子必须跟着重建

  /* ---------- 视角切换（viewNonce 变化时也重新取景，拖走后点同一按钮可回位） ---------- */
  useEffect(() => {
    const store = storeRef.current;
    if (!store.renderer) return;
    applyView(store, viewMode, containerDistance(store));
  }, [viewMode, viewNonce]);

  return (
    <div className={styles.wrap}>
      <div className={styles.canvas} ref={mountRef} />
      <div className={styles.tip} ref={tipRef} />
      <div className={styles.hint}>左键拖动旋转 · 右键平移 · 滚轮缩放 · 悬停看规格</div>
    </div>
  );
});

/** 相机距离：用容器包围球 + 视口宽高比计算，保证任何比例下容器都完整居中显示 */
function containerDistance(store) {
  const { w, h, d } = store.containerSize;
  const radius = Math.hypot(w, h, d) / 2; // 包围球半径，任何朝向都不会超出
  const vFov = THREE.MathUtils.degToRad(store.camera.fov / 2);
  const aspect = store.camera.aspect || 1;
  const hFov = Math.atan(Math.tan(vFov) * aspect); // 水平半视角，窄视口更小
  const distV = radius / Math.sin(vFov);
  const distH = radius / Math.sin(hFov);
  return Math.max(distV, distH) * 1.08; // 8% 边距，容器不贴边
}

/** 切换预设视角：开启一段平滑过渡，期间若用户上手则立即中止 */
function applyView(store, mode, dist) {
  const dir = VIEW_DIRECTIONS[mode] || VIEW_DIRECTIONS.iso;
  store.desiredCam
    .set(dir[0], dir[1], dir[2])
    .normalize()
    .multiplyScalar(dist)
    .add(store.camTarget);
  store.viewTransition = true;
  store.userControlled = false; // 回到预设取景，清除「用户已接管」标记
}

/**
 * 根据播放进度更新每个盒子的位置、缩放与可见性
 * 盒子从上方依次落下，带一点回弹；explode > 0 时沿容器中心向外扩散
 */
function updateBoxes(store, progress, { explode = 0, activeLayer = null } = {}) {
  if (!store.boxes) return;
  const filter = activeLayer === null || activeLayer === undefined ? null : activeLayer;

  store.boxes.forEach(({ mesh, edges, delay, layer }) => {
    const hidden = (filter !== null && layer !== filter) || progress <= 0;
    const local = Math.min(1, Math.max(0, (progress - delay) / DROP_SPAN));
    if (hidden || local <= 0) {
      mesh.visible = false;
      edges.visible = false;
      return;
    }
    mesh.visible = true;
    edges.visible = true;

    const { target, start, baseScale, offset } = mesh.userData;
    const t = easeOutCubic(local);
    const grow = 0.4 + 0.6 * easeOutBack(local);

    mesh.position.set(
      target.x + (start.x - target.x) * (1 - t) + offset.x * explode * 0.55,
      target.y + (start.y - target.y) * (1 - t) + offset.y * explode * 0.55,
      target.z + (start.z - target.z) * (1 - t) + offset.z * explode * 0.55
    );
    mesh.scale.set(baseScale.x * grow, baseScale.y * grow, baseScale.z * grow);
    edges.position.copy(mesh.position);
    edges.scale.copy(mesh.scale);
  });
}

/** 悬停检测：高亮描边 + 跟随鼠标的提示气泡 */
function updateHover(store, camera) {
  if (store.pointer.x < -1.5 || !store.boxes.length) return;
  store.raycaster.setFromCamera(store.pointer, camera);
  const meshes = [];
  store.boxes.forEach((b) => {
    if (b.mesh.visible) meshes.push(b.mesh);
  });
  const hit = store.raycaster.intersectObjects(meshes, false)[0];
  const tip = store.tipEl;
  if (hit) {
    const { info } = hit.object.userData;
    store.hoverOutline.visible = true;
    store.hoverOutline.position.copy(hit.object.position);
    store.hoverOutline.scale.copy(hit.object.scale).multiplyScalar(1.03);
    if (tip) {
      tip.innerHTML = `<b>${info.name}</b><i>${info.w} × ${info.d} × ${info.h} cm</i><i>第 ${info.layer + 1} 层</i>`;
      tip.style.transform = `translate(${store.pointerPx.x + 16}px, ${store.pointerPx.y + 14}px)`;
      tip.style.opacity = '1';
    }
  } else {
    store.hoverOutline.visible = false;
    if (tip) tip.style.opacity = '0';
  }
}

export default Scene3D;
