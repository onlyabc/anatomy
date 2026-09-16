export type HoloBackgroundFrame = {
  id: string;
  name: string;
  layout: string | null;
  layoutLabel: string | null;
  thumbnailUrl: string;
  fileUrl: string;
};

export type HoloBackgroundFrameList = {
  items: HoloBackgroundFrame[];
  total: number;
};

export const DEFAULT_HOLO_BACKGROUND = {
  id: null as string | null,
  name: "default",
  fileUrl: "/frame_5x9_quilt_bg.jpg",
};

export const HOLO_BACKGROUND_STORAGE_KEY = "anatomy:holo-bg-frame";

export async function fetchHoloBackgroundFrames(): Promise<HoloBackgroundFrameList> {
  const response = await fetch("/api/holo/background-frames", { cache: "no-store" });
  if (!response.ok) {
    return { items: [], total: 0 };
  }
  return response.json() as Promise<HoloBackgroundFrameList>;
}

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
