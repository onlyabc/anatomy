/** CJ 全息屏 device_config（默认 http://localhost:8080/device_config） */

export type HoloDeviceConfig = {
  center: number;
  dpi: number;
  height: number;
  pitch: number;
  sn: string;
  tilt: number;
  width: number;
};

declare global {
  interface Window {
    /** CJHoloDisplay 读取的原始响应文本 */
    __holoDeviceConfigRaw?: string;
    /** 解析后的 device_config，供 vendor 与页面共用 */
    __holoDeviceConfig?: HoloDeviceConfig;
    /** 可选：覆盖 device_config 拉取地址列表 */
    __holoDeviceConfigUrls?: string[];
  }
}

const CACHE_KEY = "anatomy:holo-device-config";

/**
 * device_config 拉取顺序：
 * 1. 同源 /device_config — 配合本地网关 scripts/holo-local-gateway.mjs，绕过 PNA
 * 2. 127.0.0.1 / localhost — 页面本身在 localhost 或 HTTPS+PNA 允许时可用
 */
export const HOLO_DEVICE_CONFIG_URLS = [
  "/device_config",
  "http://127.0.0.1:8080/device_config",
  "http://localhost:8080/device_config",
] as const;

/** 解析 CJ 本地服务返回的校准文本 */
export function parseHoloDeviceConfigText(text: string): HoloDeviceConfig {
  const json = text.replace(/^\/device_config:ok:/, "");
  return JSON.parse(json) as HoloDeviceConfig;
}

function readCachedHoloDeviceConfig(): HoloDeviceConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as HoloDeviceConfig;
  } catch {
    return null;
  }
}

function cacheHoloDeviceConfig(config: HoloDeviceConfig, rawText: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(config));
  } catch {
    /* 隐私模式等场景可能无法写入 */
  }
  window.__holoDeviceConfigRaw = rawText;
  window.__holoDeviceConfig = config;
}

/** 依次尝试多个 URL，成功则写入 window 缓存供 CJHoloDisplay 使用 */
export async function fetchHoloDeviceConfig(): Promise<HoloDeviceConfig | null> {
  if (typeof window === "undefined") return null;

  const cached = readCachedHoloDeviceConfig();
  if (cached) {
    window.__holoDeviceConfig = cached;
    return cached;
  }

  const urls = window.__holoDeviceConfigUrls?.length
    ? window.__holoDeviceConfigUrls
    : [...HOLO_DEVICE_CONFIG_URLS];

  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const text = await res.text();
      const config = parseHoloDeviceConfigText(text);
      cacheHoloDeviceConfig(config, text);
      return config;
    } catch (err) {
      console.warn("[HoloDevice] device_config 拉取失败:", url, err);
    }
  }

  return null;
}

/** 同步读取已缓存的 device_config（对应 HoloDisplayConfig.calibration.screenW/screenH 来源） */
export function getCachedHoloDeviceConfig(): HoloDeviceConfig | null {
  return readCachedHoloDeviceConfig();
}

/** 进入 CJHoloDisplay 前预取，避免 vendor 内同步 XHR 被 PNA 拦截 */
export async function primeHoloDeviceConfig(): Promise<HoloDeviceConfig | null> {
  return fetchHoloDeviceConfig();
}

/** 根据分辨率推断 quilt 序列号前缀，供 CJHoloDisplay 选择 quilt 尺寸 */
export function inferHoloSerial(config: HoloDeviceConfig): string {
  if (config.width >= 7680) return `CJHD-8K-${config.sn}`;
  if (config.width >= 3840) return `CJHD-4K-${config.sn}`;
  return `CJHD-2K-${config.sn}`;
}

/** 在用户手势内预请求多屏权限，便于弹窗定位到全息副屏 */
export async function ensureHoloScreenPermission(): Promise<void> {
  if (!("getScreenDetails" in window)) return;
  try {
    await (window as Window & { getScreenDetails(): Promise<unknown> }).getScreenDetails();
  } catch (err) {
    console.warn("未获得多屏窗口权限，全息窗可能无法自动定位到副屏", err);
  }
}

/** 公网 HTTP 访问时 PNA 会拦截 localhost，给出可操作的提示文案 */
export function holoDeviceConfigHelpMessage(): string {
  return [
    "无法读取全息本地服务 device_config（Chrome 私网访问限制）。",
    "请在接全息屏的电脑上：",
    "1. 运行 node scripts/holo-local-gateway.mjs",
    "2. 用 http://127.0.0.1:3010 打开本站（不要用公网 IP）",
    "或改用 HTTPS 域名访问，并确保 CJ 本地 8080 服务已开启 CORS / Private-Network 响应头。",
  ].join("\n");
}
