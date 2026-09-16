import { proxyBackgroundFrameAsset } from "../../../../../lib/cjview/background-frames-server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 代理 CJView 2D 框预览图，供选择器缩略图使用 */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return new Response("invalid id", { status: 400 });
  }
  return proxyBackgroundFrameAsset(id, "preview");
}
