/**
 * 将投屏面板像素坐标映射到 3D 视图归一化坐标 (0–1)。
 * 投屏画幅 (如 3840×2160) 与主预览画幅比例不同时，需按 letterbox 反算，不能线性缩放像素。
 */

/** 投屏面板像素 → 视图归一化坐标；outside 表示点在黑边区域 */
export function mapPanelPixelToViewNormalized(
  panelX: number,
  panelY: number,
  panelWidth: number,
  panelHeight: number,
  viewAspect: number,
): { nx: number; ny: number; inside: boolean } {
  if (panelWidth <= 0 || panelHeight <= 0 || viewAspect <= 0) {
    return { nx: 0.5, ny: 0.5, inside: false };
  }

  const panelAspect = panelWidth / panelHeight;
  const u = panelX / panelWidth;
  const v = panelY / panelHeight;

  if (panelAspect > viewAspect) {
    // 投屏更宽：左右留黑边 (pillarbox)
    const contentWidth = viewAspect / panelAspect;
    const offsetX = (1 - contentWidth) / 2;
    const nx = (u - offsetX) / contentWidth;
    const ny = v;
    return { nx, ny, inside: nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1 };
  }

  // 投屏更高：上下留黑边 (letterbox)
  const contentHeight = panelAspect / viewAspect;
  const offsetY = (1 - contentHeight) / 2;
  const nx = u;
  const ny = (v - offsetY) / contentHeight;
  return { nx, ny, inside: nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1 };
}

/** 视图归一化坐标 → 投屏面板像素（用于绘制校准十字等） */
export function mapViewNormalizedToPanelPixel(
  nx: number,
  ny: number,
  panelWidth: number,
  panelHeight: number,
  viewAspect: number,
): { x: number; y: number } {
  const panelAspect = panelWidth / panelHeight;

  if (panelAspect > viewAspect) {
    const contentWidth = viewAspect / panelAspect;
    const offsetX = (1 - contentWidth) / 2;
    return {
      x: (offsetX + nx * contentWidth) * panelWidth,
      y: ny * panelHeight,
    };
  }

  const contentHeight = panelAspect / viewAspect;
  const offsetY = (1 - contentHeight) / 2;
  return {
    x: nx * panelWidth,
    y: (offsetY + ny * contentHeight) * panelHeight,
  };
}
