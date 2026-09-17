/** @deprecated 改用 app/lib/holo/local-background-frames.ts（不再从 Media/CJView 拉取） */
export {
  DEFAULT_HOLO_BACKGROUND,
  getLocalHoloBackgroundFrames as fetchHoloBackgroundFrames,
  getLocalHoloBackgroundFrames,
  HOLO_BACKGROUND_STORAGE_KEY,
  LOCAL_HOLO_BACKGROUNDS,
  readStoredHoloBackground,
  resolveStoredHoloBackground,
  storeHoloBackground,
  type HoloBackgroundFrame,
  type HoloBackgroundFrameList,
} from "../holo/local-background-frames";
