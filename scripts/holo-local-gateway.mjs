#!/usr/bin/env node
/**
 * 全息屏本地网关：把远程 anatomy 与本地 device_config 合并为同源 origin。
 *
 * 解决 Chrome Private Network Access — 公网 HTTP 页面无法 fetch localhost:8080。
 * 接全息屏的电脑运行本脚本后，请用 http://127.0.0.1:3010 打开站点（勿用公网 IP）。
 *
 * 用法:
 *   node scripts/holo-local-gateway.mjs
 *   HOLO_REMOTE=http://121.199.173.176:3010 HOLO_GATEWAY_PORT=3010 node scripts/holo-local-gateway.mjs
 */

import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

const REMOTE = process.env.HOLO_REMOTE ?? "http://121.199.173.176:3010";
const LISTEN_HOST = process.env.HOLO_GATEWAY_HOST ?? "127.0.0.1";
const LISTEN_PORT = Number(process.env.HOLO_GATEWAY_PORT ?? 3010);
const DEVICE_URL = process.env.HOLO_DEVICE_URL ?? "http://127.0.0.1:8080/device_config";

function proxyToRemote(req, res) {
  const remote = new URL(req.url ?? "/", REMOTE);
  const headers = { ...req.headers, host: remote.host };
  delete headers.connection;

  const transport = remote.protocol === "https:" ? https : http;
  const upstream = transport.request(
    {
      hostname: remote.hostname,
      port: remote.port || (remote.protocol === "https:" ? 443 : 80),
      path: remote.pathname + remote.search,
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on("error", (err) => {
    console.error("[HoloGateway] 上游失败:", err.message);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bad gateway");
    }
  });

  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const path = (req.url ?? "").split("?")[0];
  if (path === "/device_config") {
    fetch(DEVICE_URL, { cache: "no-store" })
      .then(async (deviceRes) => {
        const body = await deviceRes.text();
        res.writeHead(deviceRes.status, {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(body);
      })
      .catch((err) => {
        console.error("[HoloGateway] device_config 失败:", err.message);
        res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("device_config unavailable");
      });
    return;
  }

  proxyToRemote(req, res);
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`[HoloGateway] http://${LISTEN_HOST}:${LISTEN_PORT}`);
  console.log(`[HoloGateway] 页面代理 -> ${REMOTE}`);
  console.log(`[HoloGateway] /device_config -> ${DEVICE_URL}`);
  console.log("[HoloGateway] 请在浏览器打开上述地址（不要用公网 IP）");
});
