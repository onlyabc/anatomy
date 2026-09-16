import { fetchBackgroundFrameList } from "../../../lib/cjview/background-frames-server";

export const dynamic = "force-dynamic";

/** 全息背景框列表（代理 CJView CMS） */
export async function GET() {
  try {
    const data = await fetchBackgroundFrameList();
    return Response.json(data);
  } catch (error) {
    console.error("[holo/background-frames]", error);
    return Response.json({ items: [], total: 0, error: "fetch_failed" }, { status: 502 });
  }
}
