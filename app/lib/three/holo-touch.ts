/** 全息投屏触摸：在弹窗 document 内注入 bridge（主页面无法可靠接收副屏触摸） */

import { injectHoloPopupTouchBridge } from "./holo-touch-bridge";
import { removeHoloFullscreenOverlay, watchHoloPopupFullscreen } from "./holo-popup";

export type HoloViewConfig = {
  trackballX: number;
  trackballY: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetDiam: number;
  vcCanvas?: HTMLCanvasElement | null;
  popup?: Window | null;
};

const LOG = "[HoloTouch]";

declare global {
  interface Window {
    __holoPreparedPopup?: Window | null;
    __holoTouchDebug?: Record<string, unknown>;
    /** 弹窗 bridge 回调：暂停主页面自动旋转 */
    __holoTouchOnInteract?: (() => void) | null;
  }
}

function resolveHoloPopup(cfg: HoloViewConfig): Window | null {
  if (cfg.popup && !cfg.popup.closed) return cfg.popup;
  if (typeof window !== "undefined" && window.__holoPreparedPopup && !window.__holoPreparedPopup.closed) {
    return window.__holoPreparedPopup;
  }
  const view = cfg.vcCanvas?.ownerDocument.defaultView;
  if (view && view !== window) return view;
  return null;
}

/** 在投屏弹窗注入交互脚本 */
export function mountHoloTouchControls(
  canvas: HTMLCanvasElement,
  cfg: HoloViewConfig,
  onInteract?: () => void,
): () => void {
  const popup = resolveHoloPopup(cfg);
  console.log(`${LOG} 挂载`, {
    canvas: `${canvas.width}x${canvas.height}`,
    connected: canvas.isConnected,
    canvasDoc: canvas.ownerDocument?.location?.href ?? "unknown",
    popup: Boolean(popup),
    popupHref: popup?.location?.href,
    popupClosed: popup?.closed,
    bridgePresent: Boolean(popup?.document.getElementById("holo-touch-bridge")),
  });

  if (typeof window !== "undefined") {
    window.__holoTouchOnInteract = onInteract ?? null;
  }

  if (popup) {
    removeHoloFullscreenOverlay(popup.document);
    injectHoloPopupTouchBridge(popup, { force: true });
    watchHoloPopupFullscreen(popup);
    popup.focus();
  } else {
    console.warn(`${LOG} 未找到弹窗，无法注入 bridge`);
  }

  return () => {
    if (typeof window !== "undefined") window.__holoTouchOnInteract = null;
    console.log(`${LOG} 卸载`);
  };
}

/** 等待 vcCanvas 挂到投屏弹窗后再注入 bridge */
export function mountHoloTouchWhenReady(cfg: HoloViewConfig, onInteract?: () => void): () => void {
  let cancelled = false;
  let cleanup: (() => void) | null = null;
  let mountedCanvas: HTMLCanvasElement | null = null;
  let attempts = 0;
  const maxAttempts = 900;

  console.log(`${LOG} 等待 vcCanvas`, {
    hasCanvas: Boolean(cfg.vcCanvas),
    hasPopup: Boolean(cfg.popup),
    preparedPopup: Boolean(typeof window !== "undefined" && window.__holoPreparedPopup),
  });

  const tryMount = () => {
    if (cancelled) return;
    const canvas = cfg.vcCanvas;
    const popup = resolveHoloPopup(cfg);

    if (popup && !popup.closed) {
      removeHoloFullscreenOverlay(popup.document);
      injectHoloPopupTouchBridge(popup, { force: attempts === 1 || attempts % 120 === 0 });
    }

    if (canvas?.isConnected && canvas !== mountedCanvas) {
      const onHoloScreen = popup
        ? canvas.ownerDocument === popup.document
        : canvas.ownerDocument !== document;
      if (onHoloScreen || attempts > 60) {
        console.log(`${LOG} 准备注入`, {
          attempts,
          onHoloScreen,
          canvasDoc: canvas.ownerDocument?.location?.href,
          popupHref: popup?.location?.href,
          sameDoc: popup ? canvas.ownerDocument === popup.document : null,
        });
        cleanup?.();
        cleanup = mountHoloTouchControls(canvas, cfg, onInteract);
        mountedCanvas = canvas;
      }
    } else if (attempts % 120 === 0 && canvas) {
      console.log(`${LOG} 等待 canvas`, { connected: canvas.isConnected, attempts });
    }

    attempts += 1;
    if (!cancelled && attempts < maxAttempts) requestAnimationFrame(tryMount);
    else if (attempts >= maxAttempts && !mountedCanvas) {
      console.warn(`${LOG} 注入超时`, {
        hasCanvas: Boolean(cfg.vcCanvas),
        canvasConnected: cfg.vcCanvas?.isConnected,
        canvasDoc: cfg.vcCanvas?.ownerDocument?.location?.href,
        popup: Boolean(resolveHoloPopup(cfg)),
      });
    }
  };

  tryMount();

  return () => {
    cancelled = true;
    cleanup?.();
    cleanup = null;
    mountedCanvas = null;
  };
}
