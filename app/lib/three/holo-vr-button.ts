import type { WebGLRenderer } from "three";
import { ensureHoloDisplay } from "./holo-display";
import { ensureHoloScreenPermission, fetchHoloDeviceConfig } from "./holo-device";
import { clearPreparedHoloPopup, openHoloPopupSync, repositionHoloPopup, removeHoloFullscreenOverlay, watchHoloPopupFullscreen } from "./holo-popup";

/**
 * 强制 Three.js 走 XRWebGLLayer（HoloDisplay polyfill 兼容路径）。
 * 不能把 createProjectionLayer 设为 undefined——`in` 运算符仍会判定为存在。
 */
async function setHoloXrSession(renderer: WebGLRenderer, session: XRSession) {
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
    clearPreparedHoloPopup();
  }

  button.onclick = () => {
    if (currentSession) {
      currentSession.end();
      return;
    }
    if (!navigator.xr || startingSession) return;
    startingSession = true;

    // 同步开窗：await 之后再 open 会失去用户手势，导致无法全屏
    const popup = openHoloPopupSync();
    if (!popup) {
      console.error("弹窗被拦截，请允许此站点弹出窗口");
      startingSession = false;
      return;
    }

    fullscreenWatchCleanup?.();
    fullscreenWatchCleanup = watchHoloPopupFullscreen(popup);

    void (async () => {
      try {
        await ensureHoloDisplay();
        await ensureHoloScreenPermission();
        const device = await fetchHoloDeviceConfig();
        await repositionHoloPopup(popup, device);
        removeHoloFullscreenOverlay(popup.document);
        popup.focus();
        // 在 XR 改写相机之前冻结当前 2D 视角
        onBeforeSession?.();
        const session = await navigator.xr!.requestSession("immersive-vr", sessionOptions);
        await onSessionStarted(session);
      } catch (err) {
        console.error("无法进入 CJHoloDisplay 会话", err);
        clearPreparedHoloPopup();
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
