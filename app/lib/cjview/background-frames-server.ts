/** CJView CMS 背景框 BFF：服务端拉取素材并代理图片 */

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

type CjviewConfig = {
  base: string;
  apiKey: string;
  orientation: string;
  layout: string;
};

type AnatomyAggregateItem = {
  id: string;
  name: string;
  layout?: string | null;
  layoutLabel?: string | null;
  thumbnailPath?: string;
  filePath?: string;
};

type AnatomyAggregateResponse = {
  items: AnatomyAggregateItem[];
  total: number;
};

type MaterialItem = {
  id: string;
  name: string;
  layout: string | null;
  layoutLabel: string | null;
  thumbnailUrl: string;
};

type MaterialListResponse = {
  items: MaterialItem[];
  total: number;
};

export function getCjviewConfig(): CjviewConfig | null {
  const base = process.env.CJVIEW_API_BASE?.replace(/\/$/, "");
  const apiKey = process.env.CJVIEW_API_KEY?.trim();
  if (!base || !apiKey) return null;
  return {
    base,
    apiKey,
    orientation: process.env.CJVIEW_FRAME_ORIENTATION?.trim() || "landscape",
    layout: process.env.CJVIEW_FRAME_LAYOUT?.trim() || "",
  };
}

function cjviewHeaders(apiKey: string): HeadersInit {
  return { "x-api-key": apiKey, Accept: "application/json" };
}

function toProxyFrame(item: { id: string; name: string; layout?: string | null; layoutLabel?: string | null }): HoloBackgroundFrame {
  return {
    id: item.id,
    name: item.name,
    layout: item.layout ?? null,
    layoutLabel: item.layoutLabel ?? null,
    thumbnailUrl: `/api/holo/background-frames/${item.id}/preview`,
    fileUrl: `/api/holo/background-frames/${item.id}/file`,
  };
}

async function fetchAggregateList(config: CjviewConfig): Promise<HoloBackgroundFrameList | null> {
  const params = new URLSearchParams({
    orientation: config.orientation,
    page: "1",
    limit: "50",
  });
  if (config.layout) params.set("layout", config.layout);

  const response = await fetch(`${config.base}/api/external/anatomy/background-frames?${params}`, {
    headers: cjviewHeaders(config.apiKey),
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`CJView aggregate failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const payload = (await response.json()) as AnatomyAggregateResponse;
  return {
    total: payload.total ?? payload.items.length,
    items: payload.items.map((item) => toProxyFrame(item)),
  };
}

async function fetchMaterialList(config: CjviewConfig): Promise<HoloBackgroundFrameList> {
  const params = new URLSearchParams({
    category: "frame2d",
    orientation: config.orientation,
    tab: "all",
    page: "1",
    pageSize: "50",
  });
  if (config.layout) params.set("layout", config.layout);

  const response = await fetch(`${config.base}/api/materials?${params}`, {
    headers: cjviewHeaders(config.apiKey),
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`CJView materials failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const payload = (await response.json()) as MaterialListResponse;
  return {
    total: payload.total ?? payload.items.length,
    items: payload.items.map((item) => toProxyFrame(item)),
  };
}

export async function fetchBackgroundFrameList(): Promise<HoloBackgroundFrameList> {
  const config = getCjviewConfig();
  if (!config) {
    return { items: [], total: 0 };
  }

  const aggregate = await fetchAggregateList(config);
  if (aggregate) return aggregate;
  return fetchMaterialList(config);
}

export async function proxyBackgroundFrameAsset(id: string, kind: "file" | "preview"): Promise<Response> {
  const config = getCjviewConfig();
  if (!config) {
    return new Response("CJView API 未配置", { status: 503 });
  }

  const upstream =
    kind === "file"
      ? `${config.base}/api/external/two-d-frames/${id}/file`
      : `${config.base}/api/external/two-d-frames/${id}/preview`;

  let response = await fetch(upstream, {
    headers: { "x-api-key": config.apiKey },
    cache: "no-store",
  });

  // 预览失败时回退 Immich 缩略图
  if (kind === "preview" && !response.ok) {
    response = await fetch(`${config.base}/api/assets/${id}/thumbnail?size=preview`, {
      headers: { "x-api-key": config.apiKey },
      cache: "no-store",
    });
  }

  if (!response.ok) {
    return new Response(await response.text().catch(() => "upstream error"), { status: response.status });
  }

  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("cache-control", "public, max-age=300");
  return new Response(response.body, { status: 200, headers });
}
