import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { syncHoloViewFromOrbit, applyHoloConfigToOrbit, moveHoloAlongView } from "./holo-display";
import { mountHoloTouchWhenReady } from "./holo-touch";
import { loadHoloTouchCalibration } from "./holo-touch-calibration";
import { createHoloDisplayButton } from "./holo-vr-button";
import { removeHoloFullscreenOverlay } from "./holo-popup";
import gsap from "gsap";
import type { Hotspot } from "../../i18n/merge";
import { AnatomyAssetManager, type LoadedOrgan } from "./loaders";
import { HotspotLayer } from "./hotspots";

type ViewerCallbacks = {
  onLoading: (loading: boolean, progress: number) => void;
  onSelect: (hotspot: Hotspot | null) => void;
  /** Quiz mode: every dot press is reported, with no selection toggling. */
  onPick?: (hotspot: Hotspot) => void;
  /** Authoring mode: a point on the mesh surface, in pivot space. */
  onAuthorPoint?: (point: { x: number; y: number; z: number }) => void;
};

const DOT_PIXELS = 34;
const CAMERA_FOV = 34;
const DEPTH_PREPASS = "depth-prepass";
const HOME_CAMERA = { x: 0, y: 1.05, z: 8.2 };
const HOME_TARGET = { x: 0, y: 0.02, z: 0 };
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _orbitOffset = new THREE.Vector3();
const _depthDelta = new THREE.Vector3();

/** React Strict Mode 会双重挂载；延迟销毁以便复用 WebGL 上下文 */
let retainedViewer: AnatomyViewer | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

export function takeRetainedViewer(): AnatomyViewer | null {
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  const viewer = retainedViewer;
  retainedViewer = null;
  return viewer;
}

export function releaseRetainedViewer(viewer: AnatomyViewer) {
  viewer.suspend();
  retainedViewer = viewer;
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => {
    if (retainedViewer === viewer) {
      retainedViewer.dispose();
      retainedViewer = null;
    }
    releaseTimer = null;
  }, 1200);
}

/** 防止 Strict Mode 下并行创建多个 WebGL 上下文 */
let viewerInitPromise: Promise<AnatomyViewer> | null = null;

/** 清理容器内残留 canvas，并释放 Three 持有的 GL 上下文 */
function clearContainerCanvases(container: HTMLElement) {
  container.querySelectorAll("canvas").forEach((node) => {
    const canvas = node as HTMLCanvasElement & { __threeRenderer?: THREE.WebGLRenderer };
    const maybeRenderer = canvas.__threeRenderer;
    const gl = maybeRenderer?.getContext() as WebGLRenderingContext | null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    maybeRenderer?.dispose();
    node.remove();
  });
}

/** 探测当前环境能否创建 WebGL（避免 Three 连续失败刷爆 GPU 上下文上限） */
function probeWebGL(): boolean {
  const canvas = document.createElement("canvas");
  try {
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false })
      ?? canvas.getContext("webgl", { failIfMajorPerformanceCaveat: false });
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function createWebGLRenderer(lowPower: boolean, container: HTMLElement): THREE.WebGLRenderer {
  clearContainerCanvases(container);

  // 优先用 Three.js 自行申请上下文（比手动 getContext 更稳）；失败时降级参数重试
  const attempts: THREE.WebGLRendererParameters[] = [
    {
      antialias: !lowPower,
      alpha: true,
      powerPreference: "high-performance",
      stencil: false,
      depth: true,
      preserveDrawingBuffer: true,
      failIfMajorPerformanceCaveat: false,
    },
    {
      antialias: false,
      alpha: true,
      powerPreference: "default",
      stencil: false,
      depth: true,
      preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: false,
    },
  ];

  let lastError: unknown;
  for (const params of attempts) {
    try {
      const renderer = new THREE.WebGLRenderer(params);
      const canvas = renderer.domElement as HTMLCanvasElement & { __threeRenderer?: THREE.WebGLRenderer };
      canvas.__threeRenderer = renderer;
      container.appendChild(canvas);
      return renderer;
    } catch (error) {
      lastError = error;
      clearContainerCanvases(container);
    }
  }

  throw lastError ?? new Error("无法获取 WebGL 上下文（请确认浏览器已开启硬件加速）");
}

export class AnatomyViewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 100);
  private controls: OrbitControls;
  private assets: AnatomyAssetManager;
  private hotspots = new HotspotLayer();
  private callbacks: ViewerCallbacks;
  private container: HTMLElement;
  private organ: LoadedOrgan | null = null;

  private clock = new THREE.Clock();
  private holoButton: HTMLElement | null = null;
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;
  private clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
  /** Writes depth only — used to resolve a fading organ to one surface. */
  private depthMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, depthTest: true });
  private crossSection = false;
  private isolated = false;

  private width = 1;
  private height = 1;
  private isVisible = true;
  private isPageVisible = true;

  // Render-on-demand bookkeeping: the loop only draws when something moved.
  private dirty = true;
  private busyUntil = 0;
  private loadRequest = 0;

  private basePixelRatio: number;

  private autoRotateWanted = true;
  private interactionUntil = 0;
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  private hoverProbe: { x: number; y: number } | null = null;
  private pointerId: number | null = null;
  private pointerStart = { x: 0, y: 0 };
  private dragged = false;
  private calloutEl: HTMLElement | null = null;
  private fadeTween: gsap.core.Tween | null = null;
  private disposed = false;
  private quizMode = false;
  private authoring = false;
  private authorRaycaster = new THREE.Raycaster();
  /** CJHoloDisplay 期间独立保存轨道相机，避免 XR 每帧改写 camera 后 OrbitControls 失效 */
  private holoOrbit = {
    active: false,
    position: new THREE.Vector3(),
    target: new THREE.Vector3(),
    fov: CAMERA_FOV,
    zoom: 1,
  };
  /** 进入全息前冻结的主页视口，防止 XR 期间容器尺寸抖动 */
  private preHoloViewport: { w: number; h: number } | null = null;
  /** 进入全息前的 OrbitControls 快照，退出时 reset 恢复 */
  private holoControlsSnapshotted = false;
  private holoDampingEnabled = true;
  /** 全息模式下 tick 已消费的 delta，供主预览复用避免重复 getDelta */
  private holoFrameDelta = 0;
  private holoTouchCleanup: (() => void) | null = null;

  /** 带重试的工厂方法，缓解 GPU 上下文尚未释放时的创建失败 */
  static async create(container: HTMLElement, callbacks: ViewerCallbacks): Promise<AnatomyViewer> {
    const retained = takeRetainedViewer();
    if (retained) {
      retained.reattach(container);
      return retained;
    }

    if (viewerInitPromise) {
      const pending = await viewerInitPromise;
      pending.reattach(container);
      return pending;
    }

    viewerInitPromise = (async () => {
      let lastError: unknown;

      // polyfill 仅在点击 ENTER CJHoloDisplay 时加载（见 holo-vr-button），
      // 勿在主页 WebGL 创建前加载，否则会占满 GPU 上下文导致 probeWebGL 失败。
      for (const waitMs of [0, 500]) {
        if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
        clearContainerCanvases(container);
        if (!probeWebGL()) {
          lastError = new Error("WebGL 不可用（GPU 可能被占用或硬件加速已关闭）");
          continue;
        }
        try {
          return new AnatomyViewer(container, callbacks);
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError ?? new Error("无法创建 WebGL 渲染器");
    })();

    try {
      return await viewerInitPromise;
    } finally {
      viewerInitPromise = null;
    }
  }

  /** Strict Mode 重挂载时把 canvas 挂回容器并恢复监听 */
  reattach(container: HTMLElement) {
    if (this.disposed) return;
    this.container = container;
    if (!container.contains(this.renderer.domElement)) {
      container.appendChild(this.renderer.domElement);
    }
    this.resizeObserver.disconnect();
    this.resizeObserver.observe(container);
    this.intersectionObserver.disconnect();
    this.intersectionObserver.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(this.tick);
    this.dirty = true;
  }

  /** 暂挂渲染循环，Strict Mode 卸载间隙避免空转 */
  suspend() {
    this.renderer.setAnimationLoop(null);
  }

  constructor(container: HTMLElement, callbacks: ViewerCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    const lowPower = window.matchMedia("(max-width: 780px)").matches || (navigator.hardwareConcurrency ?? 8) < 6;
    // Fixed, decided once. A dynamic controller used to live here and it was a
    // net negative: frame *intervals* are vsync-quantised, so a brief hitch read
    // as GPU load, dropped the buffer, and — because a vsync-locked 16.7ms never
    // met the step-up threshold — never recovered. The scene renders in ~2ms, so
    // there is nothing to adapt away from.
    this.basePixelRatio = Math.min(window.devicePixelRatio, lowPower ? 1.5 : 2);

    this.renderer = createWebGLRenderer(lowPower, container);
    this.renderer.setPixelRatio(this.basePixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    // Shadow mapping would render every organ twice per frame; a baked contact
    // shadow gives the same read for free.
    this.renderer.shadowMap.enabled = false;
    this.renderer.localClippingEnabled = true;
    // 进入全息前保持 XR 关闭，避免部分驱动在创建上下文时被 XR 干扰
    this.renderer.xr.enabled = false;
    // Localised by the React layer via setCanvasLabel once the dictionary is known.
    this.renderer.domElement.setAttribute("aria-label", "Interactive 3D anatomy model");
    this.renderer.domElement.tabIndex = 0;

    this.camera.position.set(HOME_CAMERA.x, HOME_CAMERA.y, HOME_CAMERA.z);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.enablePan = false;
    this.controls.minDistance = 4.8;
    this.controls.maxDistance = 12;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.65;
    this.controls.target.set(HOME_TARGET.x, HOME_TARGET.y, HOME_TARGET.z);

    this.assets = new AnatomyAssetManager(this.renderer);
    this.buildEnvironment();

    // HoloDisplay 会话期间禁止改画布尺寸，否则会打断 XR 帧缓冲
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.renderer.xr.isPresenting) this.resize();
    });
    this.resizeObserver.observe(container);
    this.intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        this.isVisible = entry.isIntersecting;
        if (this.isVisible) this.dirty = true;
      },
      { rootMargin: "120px" },
    );
    this.intersectionObserver.observe(container);

    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.controls.addEventListener("start", this.onControlStart);
    this.controls.addEventListener("change", this.onControlsChange);
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("keydown", this.onKeyDown);

    this.resize();
    this.publishMainCanvasSize();
    this.renderer.setAnimationLoop(this.tick);

    // HoloDisplay 会话期间需每帧渲染，并在结束后恢复画布尺寸
    this.renderer.xr.addEventListener("sessionstart", this.onXrSessionStart);
    this.renderer.xr.addEventListener("sessionend", this.onXrSessionEnd);

    if (typeof window !== "undefined") {
      window.__holoRenderMainPreview = () => this.renderMainPreview();
      window.__holoRestoreMainCanvas = () => this.restoreMainCanvasBuffer();
      window.__holoPickAt = (x, y) => this.pickHotspotAt(x, y);
      window.__holoPickAtNormalized = (nx, ny) => this.pickHotspotAtNormalized(nx, ny);
      loadHoloTouchCalibration();
    }
  }

  /** 全息投屏触摸点击（归一化视图坐标 0–1，与画幅无关） */
  private pickHotspotAtNormalized(nx: number, ny: number) {
    if (this.disposed || this.quizMode || this.authoring) {
      console.warn("[HoloTouch:main] pick 忽略", { disposed: this.disposed, quizMode: this.quizMode, authoring: this.authoring });
      return;
    }
    const marker = this.hotspots.pickNormalized(nx, ny, this.camera);
    console.log("[HoloTouch:main] pickNormalized", { nx, ny, hit: marker?.hotspot.id ?? null });
    this.select(marker?.hotspot.id ?? null);
    this.dirty = true;
  }

  /** 主预览像素坐标点击（内部会归一化） */
  private pickHotspotAt(x: number, y: number) {
    if (this.disposed || this.quizMode || this.authoring) return;
    const marker = this.hotspots.pick(x, y, this.camera, this.width, this.height);
    this.select(marker?.hotspot.id ?? null);
    this.dirty = true;
  }

  /** 挂载 ENTER CJHoloDisplay 按钮；须为 body 直接子节点，polyfill 才能发现 #VRButton。 */
  mountHoloButton() {
    if (this.holoButton) return;
    this.renderer.xr.enabled = true;
    const existing = document.getElementById("VRButton");
    if (existing) existing.remove();
    this.holoButton = createHoloDisplayButton(this.renderer, () => this.prepareHoloSession());
    document.body.appendChild(this.holoButton);
    window.dispatchEvent(new CustomEvent("holo-vr-button-ready"));
  }

  /** 进入全息前冻结 2D 轨道并同步到全息 trackball，避免 XR 改写相机导致放大/偏移 */
  prepareHoloSession() {
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    this.width = Math.max(size.x, 1);
    this.height = Math.max(size.y, 1);
    this.preHoloViewport = { w: this.width, h: this.height };
    // 保存进入前的完整轨道状态，退出时用 reset 精确恢复
    this.controls.saveState();
    this.holoControlsSnapshotted = true;
    this.holoDampingEnabled = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.captureHoloOrbit();
    this.syncHoloTrackballFromOrbit();
    this.publishMainCanvasSize();
  }

  // ---------------------------------------------------------------- scene

  private buildEnvironment() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.42));
    this.scene.add(new THREE.HemisphereLight(0xfff8ee, 0x33252d, 0.72));

    const key = new THREE.DirectionalLight(0xfff3e7, 3.5);
    key.position.set(4.8, 6.5, 6.8);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xe6ecff, 1.12);
    fill.position.set(-4.5, 1.2, 5.2);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffb7a5, 1.6);
    rim.position.set(-4, 3.5, -5.5);
    this.scene.add(rim);
    const warm = new THREE.PointLight(0xff8d70, 0.72, 11, 2);
    warm.position.set(-3, -1.4, 3.5);
    this.scene.add(warm);
    const glow = new THREE.PointLight(0xee7c6a, 0.5, 8, 2);
    glow.name = "organ-glow";
    glow.position.set(2.8, 0.4, 2.8);
    this.scene.add(glow);

    this.scene.environment = this.buildEnvironmentMap();

    const positions = new Float32Array(48 * 3);
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] = (Math.random() - 0.5) * 9;
      positions[i + 1] = (Math.random() - 0.5) * 6;
      positions[i + 2] = (Math.random() - 0.5) * 5 - 2;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.scene.add(
      new THREE.Points(
        particleGeometry,
        new THREE.PointsMaterial({ color: 0xe7a18e, size: 0.013, transparent: true, opacity: 0.16 }),
      ),
    );
  }

  /** A tiny warm-to-cool gradient probe: better material response than a bare
   *  light rig, and it costs one PMREM bake instead of per-frame work. */
  private buildEnvironmentMap() {
    const width = 16;
    const height = 32;
    const data = new Uint8Array(width * height * 4);
    const top = new THREE.Color(0xfff3e4);
    const bottom = new THREE.Color(0x6b4f45);
    const mixed = new THREE.Color();
    for (let y = 0; y < height; y += 1) {
      mixed.copy(bottom).lerp(top, Math.pow(1 - y / (height - 1), 0.7));
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        data[i] = mixed.r * 255;
        data[i + 1] = mixed.g * 255;
        data[i + 2] = mixed.b * 255;
        data[i + 3] = 255;
      }
    }
    const source = new THREE.DataTexture(data, width, height);
    source.mapping = THREE.EquirectangularReflectionMapping;
    source.colorSpace = THREE.SRGBColorSpace;
    source.needsUpdate = true;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const environment = pmrem.fromEquirectangular(source).texture;
    pmrem.dispose();
    source.dispose();
    return environment;
  }

  // ---------------------------------------------------------------- organs

  prefetch(url: string) {
    this.assets.prefetch(url);
  }

  async setOrgan(modelUrl: string, hotspots: Hotspot[], accent: string) {
    const request = ++this.loadRequest;
    this.select(null);
    this.callbacks.onLoading(true, 0);

    const outgoing = this.organ;
    if (outgoing) {
      // Switching mid-fade would otherwise leave the tween running and the
      // depth proxies attached to a released organ.
      this.fadeTween?.kill();
      this.fadeTween = null;
      this.setDepthPrepass(outgoing, false);
      this.hotspots.clear();
      this.busy(0.8);
      await gsap.to(outgoing.pivot.scale, {
        x: 0.72, y: 0.72, z: 0.72,
        duration: 0.34,
        ease: "power2.in",
        onUpdate: () => (this.dirty = true),
      });
      this.assets.release(outgoing);
      this.organ = null;
      this.dirty = true;
    }

    this.tween(this.camera.position, { z: 9.2, duration: 0.42, ease: "power2.inOut" });

    let organ: LoadedOrgan;
    try {
      organ = await this.assets.load(modelUrl, (progress) => {
        if (request === this.loadRequest) this.callbacks.onLoading(true, progress);
      });
    } catch (error) {
      if (request === this.loadRequest) this.callbacks.onLoading(false, 0);
      throw error;
    }
    if (request !== this.loadRequest || this.disposed) return;

    this.organ = organ;
    organ.pivot.scale.setScalar(1);
    organ.pivot.position.set(0, 0, 0);
    this.scene.add(organ.pivot);
    organ.pivot.updateWorldMatrix(true, true);

    // Anchor the dots while the organ is still invisible, then play the intro.
    this.hotspots.attach(organ.pivot, hotspots, organ.meshes);
    this.hotspots.setPixelSize(DOT_PIXELS, this.height, CAMERA_FOV);
    if (this.crossSection) this.applyClipping(true);

    const glow = this.scene.getObjectByName("organ-glow") as THREE.PointLight | undefined;
    glow?.color.set(accent);

    organ.pivot.scale.setScalar(0.58);
    organ.pivot.position.z = -1.3;
    this.busy(1.4);
    this.fade(organ, 1, 0.72);
    // The organ is on screen from here on, so the load is over as far as the UI
    // is concerned — the intro animation should play in the open, not behind a
    // loading panel.
    this.callbacks.onLoading(false, 1);
    gsap.timeline({ onUpdate: () => (this.dirty = true) })
      .to(organ.pivot.scale, { x: 1, y: 1, z: 1, duration: 0.9, ease: "back.out(1.25)" }, 0)
      .to(organ.pivot.position, { z: 0, duration: 0.85, ease: "power3.out" }, 0)
      .to(this.camera.position, { z: 8.2, duration: 0.9, ease: "power2.out" }, 0.08);
  }

  private materials(organ: LoadedOrgan) {
    const list: THREE.Material[] = [];
    organ.meshes.forEach((mesh) => {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => list.includes(material) || list.push(material));
    });
    return list;
  }

  /**
   * Fades an organ in. Depth writing stays ON throughout: these are solid,
   * closed meshes, and letting them blend in draw order instead of depth order
   * makes the far side and interior show through the front for the length of
   * the tween. A depth prepass keeps the result identical to the opaque pass —
   * only the nearest surface is ever shaded.
   */
  private fade(organ: LoadedOrgan, to: number, duration: number) {
    const materials = this.materials(organ);
    const state = { value: to >= 1 ? 0 : 1 };
    materials.forEach((material) => {
      material.transparent = true;
      material.opacity = state.value;
      material.depthWrite = true;
    });
    this.setDepthPrepass(organ, true);
    this.busy(duration + 0.1);
    this.fadeTween = gsap.to(state, {
      value: to,
      duration,
      ease: "power2.out",
      onUpdate: () => {
        materials.forEach((material) => (material.opacity = state.value));
        this.dirty = true;
      },
      onComplete: () => {
        if (to >= 1) {
          materials.forEach((material) => {
            material.transparent = false;
            material.opacity = 1;
            material.depthWrite = true;
          });
        }
        this.setDepthPrepass(organ, false);
        this.fadeTween = null;
        this.dirty = true;
      },
    });
  }

  /**
   * Lays down depth for the organ before it is shaded, so a partly transparent
   * mesh still resolves to a single nearest surface per pixel. The proxy is
   * parented to the mesh it mirrors, so it inherits the intro animation for
   * free. Opaque, therefore drawn before anything transparent. Alive only while
   * an organ fades; it costs one depth-only pass over ~120k triangles.
   */
  private setDepthPrepass(organ: LoadedOrgan, enabled: boolean) {
    organ.meshes.forEach((mesh) => {
      const existing = mesh.children.find((child) => child.name === DEPTH_PREPASS);
      if (!enabled) {
        existing?.removeFromParent();
        return;
      }
      if (existing) return;
      const proxy = new THREE.Mesh(mesh.geometry, this.depthMaterial);
      proxy.name = DEPTH_PREPASS;
      proxy.frustumCulled = mesh.frustumCulled;
      mesh.add(proxy);
    });
  }

  private captureHoloOrbit() {
    this.holoOrbit.position.copy(this.camera.position);
    this.holoOrbit.target.copy(this.controls.target);
    this.holoOrbit.fov = this.camera.fov;
    this.holoOrbit.zoom = this.camera.zoom;
    this.holoOrbit.active = true;
  }

  private restoreHoloOrbit() {
    if (!this.holoOrbit.active) return;
    this.camera.position.copy(this.holoOrbit.position);
    this.controls.target.copy(this.holoOrbit.target);
    this.camera.fov = this.holoOrbit.fov;
    this.camera.zoom = this.holoOrbit.zoom;
    this.camera.lookAt(this.controls.target);
    this.camera.updateMatrixWorld();
    this.camera.updateProjectionMatrix();
  }

  private persistHoloOrbit() {
    if (!this.holoOrbit.active) return;
    this.holoOrbit.position.copy(this.camera.position);
    this.holoOrbit.target.copy(this.controls.target);
    this.holoOrbit.fov = this.camera.fov;
    this.holoOrbit.zoom = this.camera.zoom;
  }

  private syncHoloTrackballFromOrbit() {
    syncHoloViewFromOrbit(
      this.camera.position,
      this.controls.target,
      this.camera.fov,
      this.camera.zoom,
    );
  }

  /** 全息模式每帧在 XR 渲染前更新轨道，并同步 trackball 驱动 3D 屏 */
  private updateHoloOrbitFrame(delta: number, now: number) {
    const cfg = typeof window !== "undefined" ? window.__holoDisplayConfig : undefined;
    if (cfg) {
      // 先读 cfg（touch / vcCanvas 操作），再叠加自动旋转，最后写回 cfg
      applyHoloConfigToOrbit(cfg, this.camera, this.controls.target, this.camera.fov, this.camera.zoom);
      this.holoOrbit.position.copy(this.camera.position);
      this.holoOrbit.target.copy(this.controls.target);
    } else {
      this.restoreHoloOrbit();
    }

    const wantAuto = this.autoRotateWanted && !this.selectedId && now >= this.interactionUntil;
    if (wantAuto) {
      this.stepHoloAutoRotate(delta);
    }

    this.persistHoloOrbit();
    this.syncHoloTrackballFromOrbit();
  }

  /** XR 模式下 OrbitControls.autoRotate 会被相机覆写，改用手动绕轨旋转 */
  private stepHoloAutoRotate(delta: number) {
    const angle = ((2 * Math.PI) / 60) * this.controls.autoRotateSpeed * delta;
    _orbitOffset.subVectors(this.camera.position, this.controls.target);
    _orbitOffset.applyAxisAngle(Y_AXIS, angle);
    this.camera.position.copy(this.controls.target).add(_orbitOffset);
    this.camera.lookAt(this.controls.target);
  }

  private renderMainPreview = () => {
    if (!this.renderer.xr.isPresenting || this.disposed) return;

    const xrWasEnabled = this.renderer.xr.enabled;
    this.renderer.xr.enabled = false;

    this.publishMainCanvasSize();
    this.restoreMainCanvasBuffer();
    this.restoreHoloOrbit();

    this.renderer.setRenderTarget(null);
    this.renderer.clear(true, true, true);

    const delta = this.holoFrameDelta;
    if (this.hoverProbe) this.resolveHover();
    this.hotspots.update(this.camera, delta, this.selectedId, this.hoveredId);
    this.positionCallout();
    this.renderer.render(this.scene, this.camera);

    this.renderer.xr.enabled = xrWasEnabled;
  };

  /** blit 后恢复主 canvas 缓冲；XR presenting 时 setSize 会被拒绝，必须用 setDrawingBufferSize */
  private restoreMainCanvasBuffer() {
    const w = this.preHoloViewport?.w ?? this.width;
    const h = this.preHoloViewport?.h ?? this.height;
    this.width = w;
    this.height = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.hotspots.setPixelSize(DOT_PIXELS, h, CAMERA_FOV);
    this.renderer.setDrawingBufferSize(w, h, this.basePixelRatio);
  }

  /** 记录主页面 canvas 应有的像素尺寸，供全息 blit 后恢复 */
  private publishMainCanvasSize() {
    if (typeof window === "undefined") return;
    const w = this.preHoloViewport?.w ?? Math.max(this.container.clientWidth, this.width, 1);
    const h = this.preHoloViewport?.h ?? Math.max(this.container.clientHeight, this.height, 1);
    window.__holoMainCanvasSize = { w, h, pr: this.basePixelRatio };
    // 3D 视图宽高比，供投屏触摸做 letterbox 反算（与主预览像素尺寸解耦）
    window.__holoViewAspect = w / h;
  }

  /** 同步逻辑视口尺寸（XR 期间用冻结尺寸，避免容器抖动） */
  private syncViewportSize() {
    if (this.renderer.xr.isPresenting && this.preHoloViewport) {
      this.width = this.preHoloViewport.w;
      this.height = this.preHoloViewport.h;
    } else {
      this.width = Math.max(this.container.clientWidth, 1);
      this.height = Math.max(this.container.clientHeight, 1);
    }
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.hotspots.setPixelSize(DOT_PIXELS, this.height, CAMERA_FOV);
    if (this.renderer.xr.isPresenting) this.publishMainCanvasSize();
  }

  private pointerCoords(event: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * this.width,
      y: ((event.clientY - rect.top) / rect.height) * this.height,
    };
  }

  // ---------------------------------------------------------------- loop

  private tick = () => {
    const presenting = this.renderer.xr.isPresenting;

    // 全息弹窗会把 canvas 移出视口，IntersectionObserver 会误判为不可见
    if (!presenting && (!this.isVisible || !this.isPageVisible)) return;

    const delta = Math.min(this.clock.getDelta(), 0.05);
    const now = performance.now();

    if (presenting) {
      this.holoFrameDelta = delta;
      this.updateHoloOrbitFrame(delta, now);
      if (this.assets.hasAnimation) this.assets.update(delta);
      // 全息屏走 XR 渲染，需在绘制前更新热点与 3D 标签
      this.hotspots.update(this.camera, delta, this.selectedId, this.hoveredId);

      // CJHoloDisplay 要求渲染前绑定 XR 层帧缓冲，否则弹窗 quilt 全黑
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const session = this.renderer.xr.getSession();
      const layer = session?.renderState?.baseLayer as (XRWebGLLayer & {
        framebuffer?: WebGLFramebuffer | null;
      }) | null;
      if (layer?.framebuffer) gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.applyAutoRotate(now);
    const controlsChanged = this.controls.update(delta);
    if (controlsChanged || this.controls.autoRotate) this.dirty = true;
    if (this.assets.hasAnimation) {
      this.assets.update(delta);
      this.dirty = true;
    }
    if (this.hoverProbe) this.resolveHover();
    if (!this.dirty && now >= this.busyUntil) return;

    if (!this.hotspots.update(this.camera, delta, this.selectedId, this.hoveredId)) this.dirty = true;
    else this.dirty = false;
    if (now < this.busyUntil) this.dirty = true;

    this.positionCallout();
    this.renderer.render(this.scene, this.camera);
  };

  private onXrSessionStart = () => {
    if (!this.scene.background) this.scene.background = new THREE.Color(0xf8f2ea);
    // prepareHoloSession 已在 requestSession 前冻结视角；此处仅兜底
    if (!this.holoOrbit.active) this.prepareHoloSession();
    this.publishMainCanvasSize();
    const cfg = typeof window !== "undefined" ? window.__holoDisplayConfig : undefined;
    console.log("[HoloTouch:main] XR sessionstart", {
      hasCfg: Boolean(cfg),
      vcCanvas: cfg?.vcCanvas ? `${cfg.vcCanvas.width}x${cfg.vcCanvas.height}` : null,
      vcConnected: cfg?.vcCanvas?.isConnected,
      vcDoc: cfg?.vcCanvas?.ownerDocument?.location?.href,
      popup: cfg?.popup?.location?.href ?? window.__holoPreparedPopup?.location?.href,
      viewAspect: window.__holoViewAspect,
      mainSize: window.__holoMainCanvasSize,
    });
    const holoPopup = cfg?.popup ?? window.__holoPreparedPopup;
    if (holoPopup && !holoPopup.closed) {
      removeHoloFullscreenOverlay(holoPopup.document);
    }
    if (cfg) {
      loadHoloTouchCalibration();
      this.holoTouchCleanup?.();
      this.holoTouchCleanup = mountHoloTouchWhenReady(cfg, () => {
        console.log("[HoloTouch:main] 触摸交互", {
          trackballX: cfg.trackballX,
          trackballY: cfg.trackballY,
          targetDiam: cfg.targetDiam,
        });
        // 触摸时暂停自动旋转，避免每帧覆盖手势
        this.interactionUntil = performance.now() + 2500;
        this.dirty = true;
      });
    } else {
      console.warn("[HoloTouch:main] 无 __holoDisplayConfig，触摸桥接未挂载");
    }
    this.dirty = true;
  };

  private onXrSessionEnd = () => {
    this.holoTouchCleanup?.();
    this.holoTouchCleanup = null;
    this.holoOrbit.active = false;
    this.preHoloViewport = null;
    this.controls.enableDamping = this.holoDampingEnabled;
    if (this.holoControlsSnapshotted) {
      this.controls.reset();
      this.holoControlsSnapshotted = false;
    }
    this.scene.background = null;
    this.renderer.setPixelRatio(this.basePixelRatio);
    this.resize();
    this.applyAutoRotate(performance.now());
    this.dirty = true;
  };

  private onControlsChange = () => {
    if (this.renderer.xr.isPresenting) {
      this.persistHoloOrbit();
      this.syncHoloTrackballFromOrbit();
    }
  };

  private busy(seconds: number) {
    this.busyUntil = Math.max(this.busyUntil, performance.now() + seconds * 1000);
    this.dirty = true;
  }

  private tween(target: object, vars: gsap.TweenVars) {
    this.busy((vars.duration as number) ?? 0.5);
    return gsap.to(target, { ...vars, onUpdate: () => (this.dirty = true) });
  }

  private applyAutoRotate(now: number) {
    this.controls.autoRotate = this.autoRotateWanted && !this.selectedId && now >= this.interactionUntil;
  }

  private onVisibilityChange = () => {
    this.isPageVisible = !document.hidden;
    if (this.isPageVisible) {
      this.clock.start();
      this.dirty = true;
    }
  };

  private resize() {
    if (this.renderer.xr.isPresenting) return;
    this.width = Math.max(this.container.clientWidth, 1);
    this.height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height, false);
    this.hotspots.setPixelSize(DOT_PIXELS, this.height, CAMERA_FOV);
    this.dirty = true;
  }

  // ---------------------------------------------------------------- input

  private onControlStart = () => {
    this.interactionUntil = performance.now() + 3000;
    this.dirty = true;
  };

  private onPointerDown = (event: PointerEvent) => {
    this.pointerId = event.pointerId;
    this.pointerStart = { x: event.clientX, y: event.clientY };
    this.dragged = false;
  };

  private onPointerMove = (event: PointerEvent) => {
    if (this.pointerId !== null) {
      if (Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y) > 5) this.dragged = true;
      return;
    }
    this.hoverProbe = this.pointerCoords(event);
    this.dirty = true;
  };

  private onPointerUp = (event: PointerEvent) => {
    const wasDragging = this.dragged;
    this.pointerId = null;
    this.dragged = false;
    if (wasDragging) return;

    const { x, y } = this.pointerCoords(event);

    // Authoring takes precedence: it wants a point on the mesh, not a marker.
    if (this.authoring) {
      this.captureAuthorPoint(x, y);
      return;
    }

    const marker = this.hotspots.pick(x, y, this.camera, this.width, this.height);
    if (this.quizMode) {
      // Every press counts as an answer, so no toggling and no sticky selection.
      if (marker) this.callbacks.onPick?.(marker.hotspot);
      return;
    }
    this.select(marker && marker.hotspot.id !== this.selectedId ? marker.hotspot.id : null);
  };

  /**
   * Raycasts the actual mesh and reports the hit in pivot space — the same
   * coordinate system `anatomy-data.ts` authors hotspots in. Only ever runs on
   * a deliberate click in authoring mode, so its cost never touches the
   * interactive path.
   */
  private captureAuthorPoint(px: number, py: number) {
    if (!this.organ) return;
    const ndc = new THREE.Vector2((px / this.width) * 2 - 1, -(py / this.height) * 2 + 1);
    this.authorRaycaster.setFromCamera(ndc, this.camera);
    const hit = this.authorRaycaster.intersectObjects(this.organ.meshes, false)[0];
    if (!hit) return;
    const local = this.organ.pivot.worldToLocal(hit.point.clone());
    this.callbacks.onAuthorPoint?.({
      x: +local.x.toFixed(2),
      y: +local.y.toFixed(2),
      z: +local.z.toFixed(2),
    });
  }

  /** Where a dot currently sits, as a 0–1 fraction of the viewport height.
   *  Lets the UI place feedback away from the structure it is pointing at. */
  hotspotScreenY(id: string): number | null {
    const point = this.hotspots.screenPosition(id, this.camera, this.width, this.height);
    return point ? point.y / this.height : null;
  }

  setQuizMode(enabled: boolean) {
    this.quizMode = enabled;
    this.select(null);
    this.hotspots.clearFlash();
    this.dirty = true;
  }

  setAuthoring(enabled: boolean) {
    this.authoring = enabled;
    this.renderer.domElement.style.cursor = enabled ? "crosshair" : "";
    this.dirty = true;
  }

  /** Green/red ring on a dot after a quiz answer. */
  flash(id: string, correct: boolean) {
    this.hotspots.flash(id, correct);
    this.busy(1.1);
  }

  private onPointerLeave = () => {
    this.pointerId = null;
    this.hoverProbe = null;
    if (this.hoveredId) {
      this.hoveredId = null;
      this.dirty = true;
    }
  };

  private resolveHover() {
    const probe = this.hoverProbe;
    this.hoverProbe = null;
    if (!probe) return;
    const marker = this.hotspots.pick(probe.x, probe.y, this.camera, this.width, this.height);
    const id = marker?.hotspot.id ?? null;
    if (id === this.hoveredId) return;
    this.hoveredId = id;
    this.renderer.domElement.style.cursor = id ? "pointer" : "";
    this.dirty = true;
  }

  private select(id: string | null) {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.busy(0.4);
    const marker = this.hotspots.list.find((item) => item.hotspot.id === id);
    this.callbacks.onSelect(marker?.hotspot ?? null);
  }

  clearSelection() {
    this.select(null);
  }

  /** The callout is positioned imperatively so tracking a spinning model never
   *  triggers a React render. */
  attachCallout(element: HTMLElement | null) {
    this.calloutEl = element;
    this.positionCallout();
    this.dirty = true;
  }

  private positionCallout() {
    if (!this.calloutEl || !this.selectedId) return;
    const point = this.hotspots.screenPosition(this.selectedId, this.camera, this.width, this.height);
    if (!point) return;
    this.calloutEl.style.transform = `translate3d(${Math.round(point.x)}px, ${Math.round(point.y)}px, 0)`;
    this.calloutEl.dataset.side = point.x > this.width * 0.6 ? "left" : "right";
    this.calloutEl.dataset.behind = point.opacity < 0.3 ? "true" : "false";
  }

  private onKeyDown = (event: KeyboardEvent) => {
    const pivot = this.organ?.pivot;
    const isArrow =
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight" ||
      event.key === "ArrowUp" ||
      event.key === "ArrowDown";
    // 方向键旋转标本：左右绕 Y 轴，上下绕 X 轴
    if (event.key === "ArrowLeft" && pivot) pivot.rotation.y -= 0.08;
    if (event.key === "ArrowRight" && pivot) pivot.rotation.y += 0.08;
    if (event.key === "ArrowUp" && pivot) pivot.rotation.x -= 0.08;
    if (event.key === "ArrowDown" && pivot) pivot.rotation.x += 0.08;
    if (event.key === "Escape") this.select(null);
    if (isArrow || event.key === "Escape") event.preventDefault();
    this.dirty = true;
  };

  // ---------------------------------------------------------------- tools

  setCanvasLabel(label: string) {
    this.renderer.domElement.setAttribute("aria-label", label);
  }

  setAutoRotate(enabled: boolean) {
    this.autoRotateWanted = enabled;
    if (enabled) this.interactionUntil = 0;
    if (!this.renderer.xr.isPresenting) {
      this.controls.autoRotate = enabled && !this.selectedId;
    }
    this.dirty = true;
  }

  reset() {
    this.select(null);
    this.tween(this.camera.position, { ...HOME_CAMERA, duration: 0.8, ease: "power3.out" });
    this.tween(this.controls.target, { ...HOME_TARGET, duration: 0.8, ease: "power3.out" });
    if (this.organ) this.tween(this.organ.pivot.rotation, { x: 0.05, y: -0.28, z: 0, duration: 0.8, ease: "power3.out" });
  }

  /** 沿视线平移标本（向内/向外），不改变缩放 */
  moveDepth(direction: 1 | -1) {
    const cfg = typeof window !== "undefined" ? window.__holoDisplayConfig : undefined;
    const step = (cfg?.targetDiam ?? 3.8) * 0.08;

    if (this.renderer.xr.isPresenting && cfg) {
      moveHoloAlongView(cfg, direction);
      applyHoloConfigToOrbit(cfg, this.camera, this.controls.target, this.camera.fov, this.camera.zoom);
      this.persistHoloOrbit();
      this.syncHoloTrackballFromOrbit();
      this.dirty = true;
      return;
    }

    _depthDelta.subVectors(this.camera.position, this.controls.target);
    if (_depthDelta.lengthSq() < 1e-8) _depthDelta.set(0, 0, 1);
    _depthDelta.normalize().multiplyScalar(step * direction);

    this.tween(this.camera.position, {
      x: this.camera.position.x + _depthDelta.x,
      y: this.camera.position.y + _depthDelta.y,
      z: this.camera.position.z + _depthDelta.z,
      duration: 0.45,
      ease: "power2.out",
    });
    this.tween(this.controls.target, {
      x: this.controls.target.x + _depthDelta.x,
      y: this.controls.target.y + _depthDelta.y,
      z: this.controls.target.z + _depthDelta.z,
      duration: 0.45,
      ease: "power2.out",
    });
  }

  toggleIsolate() {
    this.isolated = !this.isolated;
    return this.isolated;
  }

  toggleCrossSection() {
    this.crossSection = !this.crossSection;
    this.applyClipping(this.crossSection);
    gsap.fromTo(
      this.clipPlane,
      { constant: -1.8 },
      {
        constant: this.crossSection ? 0 : -1.8,
        duration: 0.85,
        ease: "power2.inOut",
        onUpdate: () => (this.dirty = true),
      },
    );
    this.busy(0.95);
    return this.crossSection;
  }

  private applyClipping(enabled: boolean) {
    if (!this.organ) return;
    const planes = enabled ? [this.clipPlane] : null;
    [...this.materials(this.organ), this.depthMaterial].forEach((material) => {
      material.clippingPlanes = planes;
      material.needsUpdate = true;
    });
    this.dirty = true;
  }

  toggleLayers() {
    if (!this.organ) return false;
    let enabled = false;
    this.materials(this.organ).forEach((material) => {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.wireframe = !material.wireframe;
        enabled = material.wireframe;
      }
    });
    this.dirty = true;
    return enabled;
  }

  dispose() {
    this.disposed = true;
    this.loadRequest += 1;
    this.renderer.xr.removeEventListener("sessionstart", this.onXrSessionStart);
    this.renderer.xr.removeEventListener("sessionend", this.onXrSessionEnd);
    this.renderer.setAnimationLoop(null);
    this.holoTouchCleanup?.();
    this.holoTouchCleanup = null;
    this.holoButton?.remove();
    this.holoButton = null;
    if (typeof window !== "undefined" && window.__holoRenderMainPreview) {
      window.__holoRenderMainPreview = null;
    }
    if (typeof window !== "undefined" && window.__holoRestoreMainCanvas) {
      window.__holoRestoreMainCanvas = null;
    }
    if (typeof window !== "undefined") {
      window.__holoPickAt = null;
      window.__holoPickAtNormalized = null;
      window.__holoTouchOnInteract = null;
      window.__holoShowTouchCalibration = null;
    }
    gsap.killTweensOf(this.camera.position);
    this.controls.removeEventListener("start", this.onControlStart);
    this.controls.removeEventListener("change", this.onControlsChange);
    this.controls.dispose();
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibilityChange);

    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointerleave", this.onPointerLeave);
    canvas.removeEventListener("keydown", this.onKeyDown);

    this.hotspots.dispose();
    this.depthMaterial.dispose();
    this.assets.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
    canvas.remove();
  }
}
