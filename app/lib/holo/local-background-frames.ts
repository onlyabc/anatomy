/** 本地 5×9 quilt 凹槽背景（立体凹槽，非 Media 2D 前景框） */

export type HoloBackgroundFrame = {
  id: string;
  name: string;
  layout: string;
  layoutLabel: string;
  thumbnailUrl: string;
  fileUrl: string;
};

export type HoloBackgroundFrameList = {
  items: HoloBackgroundFrame[];
  total: number;
};

export const DEFAULT_HOLO_BACKGROUND = {
  id: "light_pine",
  name: "浅色木框",
  fileUrl: "/frame_5x9_quilt_bg.jpg",
};

/** 与 public/frame_5x9_*.jpg 一一对应，由 scripts/generate-quilt-backgrounds.py 生成 */
export const LOCAL_HOLO_BACKGROUNDS: HoloBackgroundFrame[] = [
  {
    id: "walnut",
    name: "胡桃木",
    layout: "5x9",
    layoutLabel: "5×9",
    thumbnailUrl: "/frame_5x9_walnut.jpg",
    fileUrl: "/frame_5x9_walnut.jpg",
  },
  {
    id: "ash",
    name: "灰白蜡木",
    layout: "5x9",
    layoutLabel: "5×9",
    thumbnailUrl: "/frame_5x9_ash.jpg",
    fileUrl: "/frame_5x9_ash.jpg",
  },
  {
    id: "brushed_steel",
    name: "拉丝金属",
    layout: "5x9",
    layoutLabel: "5×9",
    thumbnailUrl: "/frame_5x9_brushed_steel.jpg",
    fileUrl: "/frame_5x9_brushed_steel.jpg",
  },
  {
    id: "warm_brass",
    name: "暖色黄铜",
    layout: "5x9",
    layoutLabel: "5×9",
    thumbnailUrl: "/frame_5x9_warm_brass.jpg",
    fileUrl: "/frame_5x9_warm_brass.jpg",
  },
  {
    id: "marble",
    name: "大理石",
    layout: "5x9",
    layoutLabel: "5×9",
    thumbnailUrl: "/frame_5x9_marble.jpg",
    fileUrl: "/frame_5x9_marble.jpg",
  },
  {
    id: "slate",
    name: "深灰岩板",
    layout: "5x9",
    layoutLabel: "5×9",
    thumbnailUrl: "/frame_5x9_slate.jpg",
    fileUrl: "/frame_5x9_slate.jpg",
  },
];

export function getLocalHoloBackgroundFrames(): HoloBackgroundFrameList {
  return { items: LOCAL_HOLO_BACKGROUNDS, total: LOCAL_HOLO_BACKGROUNDS.length };
}

export const HOLO_BACKGROUND_STORAGE_KEY = "anatomy:holo-bg-frame";

export function readStoredHoloBackground(): { id: string | null; fileUrl: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(HOLO_BACKGROUND_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string | null; fileUrl?: string };
    if (!parsed.fileUrl) return null;
    return { id: parsed.id ?? null, fileUrl: parsed.fileUrl };
  } catch {
    return null;
  }
}

export function storeHoloBackground(frame: { id: string | null; fileUrl: string }) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HOLO_BACKGROUND_STORAGE_KEY, JSON.stringify(frame));
}

/** 校验本地缓存是否仍指向有效静态资源 */
export function resolveStoredHoloBackground(): { id: string | null; fileUrl: string } {
  const stored = readStoredHoloBackground();
  const known = new Set([
    DEFAULT_HOLO_BACKGROUND.fileUrl,
    ...LOCAL_HOLO_BACKGROUNDS.map((f) => f.fileUrl),
  ]);
  if (stored && known.has(stored.fileUrl)) return stored;
  return { id: DEFAULT_HOLO_BACKGROUND.id, fileUrl: DEFAULT_HOLO_BACKGROUND.fileUrl };
}
