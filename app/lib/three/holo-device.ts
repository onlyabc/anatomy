/** CJ 全息屏 device_config 接口（http://localhost:8080/device_config） */

export type HoloDeviceConfig = {
  center: number;
  dpi: number;
  height: number;
  pitch: number;
  sn: string;
  tilt: number;
  width: number;
};

const DEVICE_CONFIG_URL = "http://localhost:8080/device_config";

/** 解析本地全息服务返回的校准数据 */
export async function fetchHoloDeviceConfig(): Promise<HoloDeviceConfig | null> {
  try {
    const res = await fetch(DEVICE_CONFIG_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const text = await res.text();
    const json = text.replace(/^\/device_config:ok:/, "");
    return JSON.parse(json) as HoloDeviceConfig;
  } catch {
    return null;
  }
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
