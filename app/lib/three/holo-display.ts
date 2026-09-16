/** 全息显示 WebXR polyfill；须在 ENTER CJHoloDisplay 之前加载，勿在主页 WebGL 创建前加载。 */

import type * as THREE from "three";
import { HOLO_DEVICE_CONFIG_URLS } from "./holo-device";

declare global {
  interface Window {
    __holoDisplayReady?: Promise<void>;
    /** 全息输出到副屏后，主页面保留独立 2D 预览 */
    __holoKeepMainPreview?: boolean;
    __holoRenderMainPreview?: (() => void) | null;
    __holoMainCanvasSize?: { w: number; h: number; pr: number };
    /** 进入全息前冻结的 3D 视图宽高比，投屏触摸映射用 */
    __holoViewAspect?: number;
    /** blit 后通过 Three.js API 恢复主 canvas 缓冲，避免直接改 width 导致缩放错乱 */
    __holoRestoreMainCanvas?: (() => void) | null;
    /** CJHoloDisplay 视角控制，由 polyfill 初始化后挂载 */
    __holoDisplayConfig?: {
      trackballX: number;
      trackballY: number;
      targetX: number;
      targetY: number;
      targetZ: number;
      targetDiam: number;
      vcCanvas?: HTMLCanvasElement | null;
      popup?: Window | null;
    };
    __holoTouchOnInteract?: (() => void) | null;
    __holoPickAt?: ((x: number, y: number) => void) | null;
    __holoPickAtNormalized?: ((nx: number, ny: number) => void) | null;
    __holoTouchCalibration?: { offsetX: number; offsetY: number; scaleX: number; scaleY: number };
    __holoShowTouchCalibration?: (() => void) | null;
    __holoTouchDebug?: Record<string, unknown>;
    /** 弹窗 bridge 环境快照（排查触摸） */
    __holoTouchDescribeEnv?: () => Record<string, unknown>;
  }
}

/** 将 2D 轨道相机同步到全息屏（方位 + 目标点 + 可见范围） */
export function syncHoloViewFromOrbit(
  position: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
  orbitFovDeg: number,
  orbitZoom = 1,
) {
  const cfg = typeof window !== "undefined" ? window.__holoDisplayConfig : undefined;
  if (!cfg) return;

  const dx = position.x - target.x;
  const dy = position.y - target.y;
  const dz = position.z - target.z;
  const horizontal = Math.sqrt(dx * dx + dz * dz) || 1e-6;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;

  cfg.trackballX = Math.atan2(dx, dz);
  // HoloDisplay 内部对 trackballY 取负，此处用 +dy 与 2D 上下方向一致
  cfg.trackballY = Math.atan2(dy, horizontal);
  cfg.targetX = target.x;
  cfg.targetY = target.y;
  cfg.targetZ = target.z;
  // targetDiam = 2D 视锥在该距离处的可见高度，使全息模型比例与主预览一致
  const effectiveFov = orbitFovDeg / Math.max(orbitZoom, 1e-6);
  cfg.targetDiam = 2 * distance * Math.tan((effectiveFov * Math.PI) / 360);
}

/** 从全息 cfg 反推轨道相机，使 touch / vcCanvas 操作能驱动 Three.js 场景 */
export function applyHoloConfigToOrbit(
  cfg: NonNullable<Window["__holoDisplayConfig"]>,
  camera: { position: THREE.Vector3; lookAt: (target: THREE.Vector3) => void; updateMatrixWorld: () => void },
  target: THREE.Vector3,
  orbitFovDeg: number,
  orbitZoom = 1,
) {
  const effectiveFov = orbitFovDeg / Math.max(orbitZoom, 1e-6);
  const distance = cfg.targetDiam / (2 * Math.tan((effectiveFov * Math.PI) / 360));
  const horizontal = distance * Math.cos(cfg.trackballY);
  const dx = Math.sin(cfg.trackballX) * horizontal;
  const dz = Math.cos(cfg.trackballX) * horizontal;
  const dy = Math.sin(cfg.trackballY) * distance;

  target.set(cfg.targetX, cfg.targetY, cfg.targetZ);
  camera.position.set(cfg.targetX + dx, cfg.targetY + dy, cfg.targetZ + dz);
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

/**
 * 只推拉焦平面：移动 target，并改 targetDiam 使虚拟相机世界坐标不变。
 * 模型在屏上的大小不变，只改变零视差面远近。
 */
export function shiftHoloFocalPlane(
  cfg: NonNullable<Window["__holoDisplayConfig"]>,
  direction: 1 | -1,
  stepScale = 0.08,
  orbitFovDeg = 34,
  orbitZoom = 1,
) {
  const effectiveFov = orbitFovDeg / Math.max(orbitZoom, 1e-6);
  const halfTan = Math.tan((effectiveFov * Math.PI) / 360);
  let distance = cfg.targetDiam / (2 * Math.max(halfTan, 1e-6));
  const step = cfg.targetDiam * stepScale;

  const tx = cfg.trackballX;
  const ty = cfg.trackballY;
  const ky = direction;
  cfg.targetX += -Math.sin(tx) * Math.cos(ty) * ky * step;
  cfg.targetY += -Math.sin(ty) * ky * step;
  cfg.targetZ += -Math.cos(tx) * Math.cos(ty) * ky * step;

  distance = Math.max(0.35, distance + ky * step);
  cfg.targetDiam = 2 * distance * halfTan;
}

/** 沿当前视线方向平移目标点（全息 W/S 同款，用于向内/向外移动） */
export function moveHoloAlongView(cfg: NonNullable<Window["__holoDisplayConfig"]>, direction: 1 | -1, stepScale = 0.08) {
  const tx = cfg.trackballX;
  const ty = cfg.trackballY;
  const ky = direction;
  const dx = -Math.sin(tx) * Math.cos(ty) * ky;
  const dy = -Math.sin(ty) * ky;
  const dz = -Math.cos(tx) * Math.cos(ty) * ky;
  const step = cfg.targetDiam * stepScale;
  cfg.targetX += dx * step;
  cfg.targetY += dy * step;
  cfg.targetZ += dz * step;
}

/** @deprecated 使用 syncHoloViewFromOrbit */
export function syncHoloTrackballFromOrbit(
  position: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
) {
  syncHoloViewFromOrbit(position, target, 34);
}

let ready: Promise<void> | null = null;

export function ensureHoloDisplay(): Promise<void> {
  // 仅浏览器端加载；避免 Next/Turbopack 在 SSR 阶段解析 vendor 脚本。
  if (typeof window === "undefined") return Promise.resolve();
  if (ready) return ready;
  if (window.__holoDisplayReady) {
    ready = window.__holoDisplayReady;
    return ready;
  }

  ready = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.textContent = `
      window.__holoKeepMainPreview = true;
      window.__holoDeviceConfigUrls = ${JSON.stringify([...HOLO_DEVICE_CONFIG_URLS])};
      for (const url of window.__holoDeviceConfigUrls) {
        try {
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok) continue;
          const text = await res.text();
          window.__holoDeviceConfigRaw = text;
          window.__holoDeviceConfig = JSON.parse(text.replace(/^\\/device_config:ok:/, ""));
          break;
        } catch (_) {}
      }
      import { HoloDisplayWebXRPolyfill, HoloDisplayConfig } from "/vendor/CJHoloDisplay.js";
      await HoloDisplayWebXRPolyfill.init({
        targetX: 0,
        targetY: 0,
        targetZ: 0,
        targetDiam: 3.8,
        fovy: (14 * Math.PI) / 180,
        // 不在主 canvas 上叠全息预览，主页面由 viewer 自行渲染
        inlineView: 0,
      });
      window.__holoDisplayConfig = HoloDisplayConfig;
      window.dispatchEvent(new Event("holo-display-ready"));
    `;
    script.onerror = () => reject(new Error("无法加载 CJHoloDisplay.js"));
    window.addEventListener("holo-display-ready", () => resolve(), { once: true });
    document.head.appendChild(script);
  });

  window.__holoDisplayReady = ready;
  return ready;
}
