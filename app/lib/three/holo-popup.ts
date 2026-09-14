import { fetchHoloDeviceConfig, type HoloDeviceConfig } from "./holo-device";

declare global {
  interface Window {
    /** 在用户点击时同步打开的弹窗，供 CJHoloDisplay 复用 */
    __holoPreparedPopup?: Window | null;
  }
}

type ScreenWithAvail = Screen & { availLeft?: number; availTop?: number };

function secondaryScreenLeft(): number {
  const screen = window.screen as ScreenWithAvail;
  return (screen.availLeft ?? 0) + window.screen.availWidth;
}
type ScreenDetailsLike = {
  screens: Array<{ label?: string; left: number; top: number; width: number; height: number }>;
  currentScreen: { left: number; top: number; width: number; height: number };
};

/** 根据 device_config 分辨率匹配全息副屏 */
export function pickHoloDisplayScreen(
  screenDetails: ScreenDetailsLike,
  targetW: number,
  targetH: number,
) {
  const { screens, currentScreen } = screenDetails;
  const labeled = screens.find((s) => s.label?.includes("CJHD"));
  if (labeled) return labeled;

  const byRes = screens.filter((s) => s.width === targetW && s.height === targetH);
  if (byRes.length === 1) return byRes[0];
  if (byRes.length > 1) {
    const other = byRes.find((s) => s !== currentScreen);
    return other ?? byRes[0];
  }

  const others = screens
    .filter((s) => s !== currentScreen)
    .sort((a, b) => b.width * b.height - a.width * a.height);
  return others[0] ?? null;
}

function popupFeatures(left: number, top: number, width: number, height: number) {
  return [
    `left=${left}`,
    `top=${top}`,
    `width=${width}`,
    `height=${height}`,
    "menubar=no",
    "toolbar=no",
    "location=no",
    "status=no",
    "scrollbars=no",
    "resizable=no",
  ].join(",");
}

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
};

/** 初始化弹窗文档（须在 window.open 同一同步调用栈内） */
export function primeHoloPopupDocument(popup: Window): void {
  const doc = popup.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#000;touch-action:none}
  </style></head><body></body></html>`);
  doc.close();
}

/** 在用户点击手势内同步请求全屏（异步结果仅记录日志） */
export function requestHoloPopupFullscreenSync(popup: Window | null, reason = ""): void {
  if (!popup || popup.closed) {
    console.warn("[HoloTouch] 同步全屏跳过：弹窗不存在", { reason });
    return;
  }
  const target = popup.document.documentElement as FullscreenElement;
  const req = target.requestFullscreen?.bind(target) ?? target.webkitRequestFullscreen?.bind(target);
  if (!req) {
    console.warn("[HoloTouch] 同步全屏 API 不可用", { reason });
    return;
  }
  console.log("[HoloTouch] 同步 requestFullscreen", { reason });
  void req({ navigationUI: "hide" })
    .then(() => {
      console.log("[HoloTouch] 同步全屏成功", { reason });
      removeHoloFullscreenOverlay(popup.document);
    })
    .catch((err) => {
      console.warn("[HoloTouch] 同步全屏失败（首次触摸弹窗时会再试）", { reason, err });
    });
}

/**
 * 必须在用户点击的同步阶段调用 window.open，否则弹窗/全屏会被浏览器拦截。
 */
export function openHoloPopupSync(device?: HoloDeviceConfig | null): Window | null {
  const w = device?.width ?? 3840;
  const h = device?.height ?? 2160;
  const left = secondaryScreenLeft();
  // 复用同名窗口会落到错误页面（如 /zh），先关闭旧弹窗
  if (window.__holoPreparedPopup && !window.__holoPreparedPopup.closed) {
    window.__holoPreparedPopup.close();
  }
  window.__holoPreparedPopup = null;
  const popup = window.open("about:blank", "CJHoloDisplay", popupFeatures(left, 0, w, h));
  if (!popup) return null;

  window.__holoPreparedPopup = popup;
  primeHoloPopupDocument(popup);
  requestHoloPopupFullscreenSync(popup, "open-sync");
  popup.focus();
  return popup;
}

/** 拿到多屏权限后，把已打开的弹窗移动到全息副屏 */
export async function repositionHoloPopup(
  popup: Window | null,
  device?: HoloDeviceConfig | null,
): Promise<void> {
  if (!popup || popup.closed) return;
  const w = device?.width ?? 3840;
  const h = device?.height ?? 2160;

  if ("getScreenDetails" in window) {
    try {
      const details = (await (
        window as Window & { getScreenDetails(): Promise<ScreenDetailsLike> }
      ).getScreenDetails()) as ScreenDetailsLike;
      const target = pickHoloDisplayScreen(details, w, h);
      if (target) {
        popup.moveTo(target.left, target.top);
        popup.resizeTo(target.width, target.height);
        popup.focus();
        return;
      }
    } catch (err) {
      console.warn("移动全息弹窗到副屏失败", err);
    }
  }

  popup.moveTo(secondaryScreenLeft(), 0);
  popup.resizeTo(w, h);
  popup.focus();
}

export function clearPreparedHoloPopup(): void {
  const popup = window.__holoPreparedPopup;
  window.__holoPreparedPopup = null;
  if (popup && !popup.closed) popup.close();
}

/** 移除 vendor 全屏遮罩 */
export function removeHoloFullscreenOverlay(doc: Document) {
  doc.querySelectorAll("button").forEach((btn) => {
    const text = btn.textContent ?? "";
    if (text.includes("全屏") || text.includes("Fullscreen")) btn.remove();
  });
}

/** 弹窗进入全屏后清理遮罩（不再模拟点击） */
export function watchHoloPopupFullscreen(popup: Window | null): () => void {
  if (!popup || popup.closed) return () => {};
  let stopped = false;
  let attempts = 0;

  const tick = () => {
    if (stopped || popup.closed) return;
    const doc = popup.document;
    const fsElement = doc.fullscreenElement ?? (doc as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement;
    if (fsElement) {
      console.log("[HoloTouch] 弹窗已全屏，移除遮罩");
      removeHoloFullscreenOverlay(doc);
      return;
    }
    attempts += 1;
    if (attempts < 300) requestAnimationFrame(tick);
  };

  tick();
  return () => {
    stopped = true;
  };
}

/** 点击 ENTER 时的完整弹窗准备流程 */
export async function prepareHoloPopupForSession(): Promise<Window | null> {
  const device = await fetchHoloDeviceConfig();
  const popup = openHoloPopupSync(device);
  if (!popup) return null;
  await repositionHoloPopup(popup, device);
  return popup;
}
