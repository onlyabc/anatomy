/** 将 app/lib/three/holo-display-shader.ts 同步到 public/vendor/CJHoloDisplay.js */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Shader } from "../app/lib/three/holo-display-shader";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const vendorPath = path.join(root, "public/vendor/CJHoloDisplay.js");

let content = fs.readFileSync(vendorPath, "utf8");
const start = content.indexOf("function Shader(cfg) {");
const end = content.indexOf("const DefaultEyeHeight = 1.6;");
if (start < 0 || end < 0) {
  throw new Error("无法在 CJHoloDisplay.js 中定位 Shader 函数");
}

const src = Shader.toString().trim();
// toString 含 function 声明，需剥离后再包一层，避免重复 function Shader
const body = src.replace(/^function\s+Shader\s*\([^)]*\)\s*\{/, "").replace(/\}\s*$/, "");
const newShader = `function Shader(cfg) {\n${body}\n}\n`;

content = content.slice(0, start) + newShader + content.slice(end);
fs.writeFileSync(vendorPath, content);
console.log("已同步 Shader ->", vendorPath);
