/** 全息投屏触摸屏坐标校准（持久化到 localStorage） */

export type HoloTouchCalibration = {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
};

const STORAGE_KEY = "anatomy-holo-touch-calibration";
const DEFAULT: HoloTouchCalibration = { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 };

declare global {
  interface Window {
    __holoTouchCalibration?: HoloTouchCalibration;
  }
}

export function loadHoloTouchCalibration(): HoloTouchCalibration {
  if (typeof window === "undefined") return DEFAULT;
  if (window.__holoTouchCalibration) return window.__holoTouchCalibration;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as HoloTouchCalibration;
      window.__holoTouchCalibration = { ...DEFAULT, ...parsed };
      return window.__holoTouchCalibration;
    }
  } catch {
    /* 忽略损坏数据 */
  }
  window.__holoTouchCalibration = { ...DEFAULT };
  return window.__holoTouchCalibration;
}

export function saveHoloTouchCalibration(cal: HoloTouchCalibration): void {
  if (typeof window === "undefined") return;
  window.__holoTouchCalibration = cal;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cal));
  } catch {
    /* 忽略存储失败 */
  }
}

/** 将浏览器触摸坐标转换为 vcCanvas 像素坐标 */
export function mapHoloTouchPoint(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  cal = loadHoloTouchCalibration(),
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const nx = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
  const ny = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
  const x = nx * canvas.width * cal.scaleX - cal.offsetX;
  const y = ny * canvas.height * cal.scaleY - cal.offsetY;
  return { x, y };
}

/** 根据「点击视觉中心」与「浏览器上报坐标」计算偏移 */
export function computeCalibrationOffset(
  tapClientX: number,
  tapClientY: number,
  canvas: HTMLCanvasElement,
  targetCanvasX = canvas.width / 2,
  targetCanvasY = canvas.height / 2,
): HoloTouchCalibration {
  const rect = canvas.getBoundingClientRect();
  const nx = rect.width > 0 ? (tapClientX - rect.left) / rect.width : 0;
  const ny = rect.height > 0 ? (tapClientY - rect.top) / rect.height : 0;
  const prev = loadHoloTouchCalibration();
  return {
    ...prev,
    offsetX: nx * canvas.width * prev.scaleX - targetCanvasX,
    offsetY: ny * canvas.height * prev.scaleY - targetCanvasY,
  };
}
