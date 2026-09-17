import type { WebGLRenderer } from "three";
import { ensureHoloDisplay } from "./holo-display";
import { ensureHoloScreenPermission, fetchHoloDeviceConfig, getCachedHoloDeviceConfig, holoDeviceConfigHelpMessage } from "./holo-device";
import {
  clearPreparedHoloPopup,
  maximizeHoloPopup,
  openHoloPopupSync,
  removeMainPageFullscreenPrompt,
  repositionHoloPopup,
  removeHoloFullscreenOverlay,
  watchHoloPopupFullscreen,
} from "./holo-popup";

/**
 * 强制 Three.js 走 XRWebGLLayer（HoloDisplay polyfill 兼容路径）。
 * 不能把 createProjectionLayer 设为 undefined——`in` 运算符仍会判定为存在。
 */
async function setHoloXrSession(renderer: WebGLRenderer, session: XRSession) {
  // HTTP 等非安全上下文没有原生 XRWebGLBinding，Three.js 会走 XRWebGLLayer，无需 patch
  if (typeof XRWebGLBinding === "undefined") {
    await renderer.xr.setSession(session);
    return;
  }

  const bindingProto = XRWebGLBinding.prototype as {
    createProjectionLayer?: XRWebGLBinding["createProjectionLayer"];
  };
  const savedCreateProjectionLayer = bindingProto.createProjectionLayer;
  const hadProjectionLayer = "createProjectionLayer" in bindingProto;

  if (hadProjectionLayer) {
    Reflect.deleteProperty(bindingProto, "createProjectionLayer");
  }

  try {
    await renderer.xr.setSession(session);
  } finally {
    if (hadProjectionLayer && savedCreateProjectionLayer) {
      bindingProto.createProjectionLayer = savedCreateProjectionLayer;
    }
  }
}

/**
 * CJHoloDisplay 专用按钮：不请求 layers/bounded-floor，并兼容 HoloDisplay polyfill 会话。
 */
export function createHoloDisplayButton(
  renderer: WebGLRenderer,
  onBeforeSession?: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.id = "VRButton";
  button.type = "button";
  button.textContent = "ENTER CJHoloDisplay";
  button.disabled = true;

  let currentSession: XRSession | null = null;
  let startingSession = false;
  let fullscreenWatchCleanup: (() => void) | null = null;

  const sessionOptions: XRSessionInit = {
    optionalFeatures: ["local-floor"],
  };

  async function onSessionStarted(session: XRSession) {
    if (currentSession) return;
    session.addEventListener("end", onSessionEnded);
    await setHoloXrSession(renderer, session);
    button.textContent = "EXIT CJHoloDisplay";
    currentSession = session;
    startingSession = false;
  }

  function onSessionEnded() {
    currentSession?.removeEventListener("end", onSessionEnded);
    button.textContent = "ENTER CJHoloDisplay";
    currentSession = null;
    fullscreenWatchCleanup?.();
    fullscreenWatchCleanup = null;
    removeMainPageFullscreenPrompt();
    clearPreparedHoloPopup();
  }

  button.onclick = () => {
    if (currentSession) {
      currentSession.end();
      return;
    }
    if (startingSession) return;
    startingSession = true;

    // 同步阶段尽早申请多屏权限，避免 async 后丢失用户手势
    const screenPerm = ensureHoloScreenPermission();
    // 同步开窗：用缓存的 calibration 尺寸；await 之后再 open 会失去用户手势
    const popup = openHoloPopupSync(getCachedHoloDeviceConfig());
    if (!popup) {
      console.error("[HoloDisplay] 弹窗被拦截，请允许此站点弹出窗口");
      alert("弹窗被浏览器拦截，请允许弹出窗口后重试");
      startingSession = false;
      return;
    }

    fullscreenWatchCleanup?.();
    fullscreenWatchCleanup = watchHoloPopupFullscreen(popup);

    void (async () => {
      try {
        // polyfill 在点击后才加载，不能在此处之前判断 navigator.xr
        await ensureHoloDisplay();
        if (!navigator.xr) {
          throw new Error("全息 WebXR 未就绪，请刷新页面后重试");
        }
        await screenPerm;
        const device = await fetchHoloDeviceConfig();
        if (!device) {
          throw new Error(holoDeviceConfigHelpMessage());
        }
        await repositionHoloPopup(popup, device);
        removeHoloFullscreenOverlay(popup.document);
        popup.focus();
        // 在 XR 改写相机之前冻结当前 2D 视角
        onBeforeSession?.();
        const session = await navigator.xr.requestSession("immersive-vr", sessionOptions);
        await onSessionStarted(session);
        // 出图会话就绪后，再最大化一次（仅铺满当前所在屏，不 exitFullscreen）
        const livePopup = window.__holoDisplayConfig?.popup ?? popup;
        if (livePopup && !livePopup.closed) {
          const s = livePopup.screen;
          maximizeHoloPopup(
            livePopup,
            {
              left: (s as Screen & { availLeft?: number }).availLeft ?? 0,
              top: (s as Screen & { availTop?: number }).availTop ?? 0,
              width: s.width,
              height: s.height,
              availLeft: (s as Screen & { availLeft?: number }).availLeft,
              availTop: (s as Screen & { availTop?: number }).availTop,
              availWidth: s.availWidth,
              availHeight: s.availHeight,
            },
            "after-session",
          );
        }
      } catch (err) {
        console.error("[HoloDisplay] 无法进入 CJHoloDisplay 会话", err);
        alert(err instanceof Error ? err.message : "无法进入全息投屏，请查看控制台日志");
        clearPreparedHoloPopup();
        removeMainPageFullscreenPrompt();
        startingSession = false;
      }
    })();
  };

  // 仅检测全息硬件，不在此处加载 polyfill，避免破坏主预览 WebGL
  void fetchHoloDeviceConfig().then((device) => {
    if (!device) {
      button.style.display = "none";
      return;
    }
    button.disabled = false;
  });

  return button;
}
