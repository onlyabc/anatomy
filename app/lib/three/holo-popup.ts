import { fetchHoloDeviceConfig, getCachedHoloDeviceConfig, type HoloDeviceConfig } from "./holo-device";

declare global {
  interface Window {
    /** 在用户点击时同步打开的弹窗，供 CJHoloDisplay 复用 */
    __holoPreparedPopup?: Window | null;
    /** vendor 弹窗全屏失败时，在主页面显示确认按钮 */
    __holoShowMainFullscreenPrompt?: (popup: Window) => void;
    __holoHideMainFullscreenPrompt?: () => void;
  }
}

const MAIN_FULLSCREEN_PROMPT_ID = "holo-main-fullscreen-prompt";

/** 弹窗是否已进入全屏 */
export function isHoloPopupFullscreen(popup: Window | null): boolean {
  if (!popup || popup.closed) return false;
  const doc = popup.document;
  return Boolean(
    doc.fullscreenElement ?? (doc as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement,
  );
}

/** 移除主页面全屏确认按钮 */
export function removeMainPageFullscreenPrompt() {
  document.getElementById(MAIN_FULLSCREEN_PROMPT_ID)?.remove();
}

/** 在主页面显示全屏确认（避免用户到全息副屏点击） */
export function showMainPageFullscreenPrompt(popup: Window) {
  if (popup.closed || isHoloPopupFullscreen(popup)) {
    removeMainPageFullscreenPrompt();
    return;
  }
  removeMainPageFullscreenPrompt();
  const btn = document.createElement("button");
  btn.id = MAIN_FULLSCREEN_PROMPT_ID;
  btn.type = "button";
  btn.textContent = "确认全息屏全屏";
  btn.onclick = () => {
    requestHoloPopupFullscreenSync(popup, "main-confirm");
    window.setTimeout(() => {
      if (isHoloPopupFullscreen(popup)) removeMainPageFullscreenPrompt();
    }, 400);
  };
  document.body.appendChild(btn);
}

/** 未全屏时在主页面展示确认按钮 */
export function ensureMainPageFullscreenPromptIfNeeded(popup: Window | null) {
  if (!popup || popup.closed) return;
  if (isHoloPopupFullscreen(popup)) {
    removeMainPageFullscreenPrompt();
    return;
  }
  showMainPageFullscreenPrompt(popup);
}

if (typeof window !== "undefined") {
  window.__holoShowMainFullscreenPrompt = (popup) => showMainPageFullscreenPrompt(popup);
  window.__holoHideMainFullscreenPrompt = () => removeMainPageFullscreenPrompt();
}

type HoloScreenRect = {
  label?: string;
  left: number;
  top: number;
  width: number;
  height: number;
  availLeft?: number;
  availTop?: number;
  availWidth?: number;
  availHeight?: number;
};

type ScreenDetailsLike = {
  screens: HoloScreenRect[];
  currentScreen: HoloScreenRect;
};

type HoloFullscreenOptions = FullscreenOptions & {
  screen?: HoloScreenRect;
};

/** device_config.width/height 即 HoloDisplayConfig.calibration.screenW/screenH */
function getCalibrationScreenSize(device?: HoloDeviceConfig | null) {
  return {
    screenW: device?.width ?? 3840,
    screenH: device?.height ?? 2160,
  };
}

/** 根据 calibration.screenW × screenH 匹配全息副屏 */
export function pickHoloDisplayScreen(
  screenDetails: ScreenDetailsLike,
  screenW: number,
  screenH: number,
) {
  const { screens, currentScreen } = screenDetails;
  const labeled = screens.find((s) => s.label?.includes("CJHD"));
  if (labeled) return labeled;

  const byRes = screens.filter((s) => s.width === screenW && s.height === screenH);
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
  webkitRequestFullscreen?: (options?: HoloFullscreenOptions) => Promise<void>;
  requestFullscreen: (options?: HoloFullscreenOptions) => Promise<void>;
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

/**
 * 最大化弹窗：resize 铺满目标屏，并 requestFullscreen({ screen })。
 * 不做 exitFullscreen，避免打断已在出图的会话。
 */
export function maximizeHoloPopup(
  popup: Window | null,
  screen?: HoloScreenRect | null,
  reason = "maximize",
): void {
  if (!popup || popup.closed) {
    console.warn("[HoloTouch] 最大化跳过：弹窗不存在", { reason });
    return;
  }

  if (screen) {
    const left = screen.availLeft ?? screen.left;
    const top = screen.availTop ?? screen.top;
    const availW = screen.availWidth ?? screen.width;
    const availH = screen.availHeight ?? screen.height;
    try {
      // 先可用区，再整屏，相当于系统「最大化」
      popup.moveTo(left, top);
      popup.resizeTo(availW, availH);
      popup.moveTo(screen.left, screen.top);
      popup.resizeTo(screen.width, screen.height);
    } catch (err) {
      console.warn("[HoloTouch] 最大化 resize 失败", err);
    }
  }

  const el = popup.document.documentElement as FullscreenElement;
  const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
  if (!req) {
    if (!screen) ensureMainPageFullscreenPromptIfNeeded(popup);
    return;
  }

  const options: HoloFullscreenOptions = { navigationUI: "hide" };
  if (screen) options.screen = screen;

  console.log("[HoloTouch] 请求最大化/全屏", { reason, screen: screen?.label ?? null });
  void req(options)
    .then(() => {
      console.log("[HoloTouch] 最大化/全屏成功", { reason });
      removeHoloFullscreenOverlay(popup.document);
      removeMainPageFullscreenPrompt();
    })
    .catch((err) => {
      console.warn("[HoloTouch] 全屏失败，已保留窗口 resize 铺满", { reason, err });
      if (!screen) ensureMainPageFullscreenPromptIfNeeded(popup);
    });
}

/** 在用户点击手势内同步请求全屏（异步结果仅记录日志） */
export function requestHoloPopupFullscreenSync(popup: Window | null, reason = ""): void {
  maximizeHoloPopup(popup, null, reason || "open-sync");
}

/**
 * 必须在用户点击的同步阶段调用 window.open，否则弹窗/全屏会被浏览器拦截。
 * 初始尺寸使用 calibration.screenW × screenH。
 */
export function openHoloPopupSync(device?: HoloDeviceConfig | null): Window | null {
  const { screenW, screenH } = getCalibrationScreenSize(device);
  const primary = window.screen as Screen & { availLeft?: number };
  const left = (primary.availLeft ?? 0) + window.screen.availWidth;
  // 复用同名窗口会落到错误页面（如 /zh），先关闭旧弹窗
  if (window.__holoPreparedPopup && !window.__holoPreparedPopup.closed) {
    window.__holoPreparedPopup.close();
  }
  window.__holoPreparedPopup = null;
  const popup = window.open("about:blank", "CJHoloDisplay", popupFeatures(left, 0, screenW, screenH));
  if (!popup) return null;

  window.__holoPreparedPopup = popup;
  primeHoloPopupDocument(popup);
  requestHoloPopupFullscreenSync(popup, "open-sync");
  popup.focus();
  return popup;
}

/** 拿到多屏权限后，把弹窗放到 calibration.screenW × screenH 对应屏幕并最大化 */
export async function repositionHoloPopup(
  popup: Window | null,
  device?: HoloDeviceConfig | null,
): Promise<void> {
  if (!popup || popup.closed) return;
  const { screenW, screenH } = getCalibrationScreenSize(device);

  if ("getScreenDetails" in window) {
    try {
      const details = (await (
        window as Window & { getScreenDetails(): Promise<ScreenDetailsLike> }
      ).getScreenDetails()) as ScreenDetailsLike;
      const target = pickHoloDisplayScreen(details, screenW, screenH);
      if (target) {
        maximizeHoloPopup(popup, target, "reposition");
        popup.focus();
        return;
      }
    } catch (err) {
      console.warn("[HoloPopup] 移动全息弹窗到副屏失败", err);
    }
  }

  const primary = window.screen as Screen & { availLeft?: number };
  popup.moveTo((primary.availLeft ?? 0) + window.screen.availWidth, 0);
  popup.resizeTo(screenW, screenH);
  maximizeHoloPopup(popup, null, "reposition-fallback");
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
      removeMainPageFullscreenPrompt();
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
  const popup = openHoloPopupSync(device ?? getCachedHoloDeviceConfig());
  if (!popup) return null;
  await repositionHoloPopup(popup, device);
  return popup;
}
