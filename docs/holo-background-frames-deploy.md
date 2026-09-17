# CJView 背景框 × Anatomy 全息联动 — 部署说明

Anatomy 通过 BFF 代理 CJView CMS 的横屏 `frame2d` 背景框，用户可在 3D 查看器内切换全息 quilt 背景。

## 架构

```
浏览器 → Anatomy /api/holo/background-frames
       → CJView /api/external/anatomy/background-frames（或 /api/materials 回退）
       → PostgreSQL assets (type=FRAME2D)

切换背景 → Anatomy /api/holo/background-frames/:id/file
         → CJView /api/external/two-d-frames/:id/file
```

## 1. Media（CJView CMS）侧

### 1.1 代码变更

- `server/src/controllers/anatomy-background-frame.controller.ts`
- `server/src/services/anatomy-background-frame.service.ts`
- `server/src/dtos/anatomy-background-frame.dto.ts`

### 1.2 构建与重启

在 Media 项目根目录：

```bash
cd /path/to/mediaForWindows
npm run build:server   # 或项目惯用的 server 构建命令
pm2 restart cjview-cms  # 按实际进程名
```

### 1.3 创建 Anatomy 服务 API Key

**API Key 不是在 `.env` 里“生成”的**，而是在 **CJView CMS 后端**创建，创建完成后把密钥**复制**到 Anatomy 服务器的 `.env` / PM2 环境变量里。

> **重要：CJView 改版后的「账户设置」里没有 API Key**
>
> 你截图里的 **系统管理 → 账户设置**（`/system-management/account`）是 CJView 自定义页面，只有改密码、角色权限、设备列表，**没有** API 密钥入口。
>
> API Key 功能仍在 Immich 遗留页面 **`/user-settings`** 里，只是顶栏菜单没链过去。

#### 在哪里建？（三种方式）

**方式 A — 直接打开遗留页面（最快）**

登录 CMS 后，浏览器地址栏访问：

```text
https://media.cjview3d.com/user-settings
```

展开 **「API 密钥 / API Keys」** → 新建 → 复制只显示一次的 secret。

**方式 B — 用接口创建（适合运维）**

已登录 CMS 的情况下，用浏览器 Cookie 或 Postman 调：

```http
POST https://media.cjview3d.com/api/api-keys
Content-Type: application/json
Cookie: <你的登录 Cookie>

{"name":"anatomy-holo-bff","permissions":["all"]}
```

响应里的 `secret` 即为 `CJVIEW_API_KEY`。

**方式 C — 让开发在「账户设置」页补上 API Key 区块**

若希望和其他设置在同一页，需在 Media 项目的 `system-management-account-page.svelte` 增加 API Key 管理（当前代码库尚未做）。

#### 填到哪里？

把复制到的密钥写到 **Anatomy 服务器**的环境变量（不是 CMS 的 `.env`）：

```env
CJVIEW_API_KEY=这里粘贴刚才复制的密钥
```

#### 用哪个账号建？

- 建议使用 **能看到 CMS 里横屏背景框** 的账号（管理员或素材库有权限的账号）
- Anatomy 只会读到该账号有权访问的 `frame2d` 素材

#### 和 `.env` 的关系（一句话）

| 位置 | 作用 |
|------|------|
| **CMS** `/user-settings` → API Keys | **创建**密钥（生成一次） |
| **CMS** `/system-management/account` | 改密码/看权限，**不能**建 API Key |
| **Anatomy 服务器** `.env` 的 `CJVIEW_API_KEY` | **存放**密钥（给 BFF 调 CMS 用） |
| **Anatomy 服务器** `.env` 的 `CJVIEW_API_BASE` | CMS 后端 API 地址，不是密钥 |

### 1.4 聚合接口（可选，Anatomy 会自动回退）

```http
GET /api/external/anatomy/background-frames?orientation=landscape&layout=5x9&page=1&limit=50
Header: x-api-key: <密钥>
```

响应字段：

| 字段 | 说明 |
|------|------|
| `items[].id` | 素材 UUID |
| `items[].name` | 背景框名称 |
| `items[].filePath` | 原图路径（相对 CMS） |
| `items[].previewPath` | 预览图路径 |
| `items[].thumbnailPath` | 缩略图路径 |

未部署聚合接口时，Anatomy 会回退调用：

```http
GET /api/materials?category=frame2d&orientation=landscape&page=1&pageSize=50
```

### 1.5 CMS 素材规范

- 类型：**背景框 / frame2d**  
- 方向：**横屏**（`landscape`）  
- 全息 quilt 建议使用 **5×9** 整幅 JPG（与 `frame_5x9_quilt_bg.jpg` 同规格）  
- 可在 CMS 素材库用「背景框 + 横屏」筛选验证  

---

## 2. Anatomy 侧

### 2.1 环境变量

在 Anatomy 部署目录创建或更新 `.env.local` / PM2 环境：

```env
# CJView Immich Server API 根地址（需能访问 /api/*）
CJVIEW_API_BASE=http://127.0.0.1:2283

# CMS 后台创建的 API Key
CJVIEW_API_KEY=your-api-key-here

# 默认只拉横屏背景框
CJVIEW_FRAME_ORIENTATION=landscape

# 可选：限制 quilt 布局，留空则不过滤 layout
# CJVIEW_FRAME_LAYOUT=5x9
```

**注意**：若 CMS Web 与 API 同域且 `/api` 已反代，也可填公网 CMS 地址，例如 `https://your-cms.example.com`。

### 2.2 部署

```bash
cd /opt/anatomy
# 同步代码后
npm run build:next
pm2 restart anatomy
```

需同步的主要文件：

- `app/api/holo/background-frames/**`
- `app/lib/cjview/**`
- `app/components/OrganViewer.tsx`
- `app/lib/three/viewer.ts`
- `app/globals.css`
- `app/i18n/**`

### 2.3 Anatomy BFF 接口

| 端点 | 说明 |
|------|------|
| `GET /api/holo/background-frames` | 背景框列表（前端选择器） |
| `GET /api/holo/background-frames/:id/file` | 原图代理 |
| `GET /api/holo/background-frames/:id/preview` | 预览图代理 |

未配置 `CJVIEW_API_BASE` / `CJVIEW_API_KEY` 时，列表为空，仍可使用内置默认背景 `/frame_5x9_quilt_bg.jpg`。

---

## 3. 验证步骤

1. CMS 素材库确认有横屏背景框（截图中「共 10 项素材」）  
2. 用 API Key 测试：

```bash
curl -H "x-api-key: YOUR_KEY" \
  "http://127.0.0.1:2283/api/external/anatomy/background-frames?orientation=landscape"
```

3. 打开 Anatomy：`http://121.199.173.176:3010/zh`  
4. 进入任意器官 3D 视图，点击右侧 **背景框** 按钮  
5. 选择一项 → 进入全息模式（本地网关 `http://127.0.0.1:3010`）观察 quilt 背景是否切换  
6. 刷新页面，确认选择已写入 `localStorage` 键 `anatomy:holo-bg-frame`  

---

## 4. 常见问题

| 现象 | 处理 |
|------|------|
| 列表为空 | 检查 API Key、`CJVIEW_API_BASE`、CMS 是否有横屏 frame2d |
| 502 fetch_failed | Anatomy 服务器无法连 CMS API，查防火墙与端口 |
| 图片加载失败 | 确认 API Key 有 `asset.read`，且 `:id/file` 代理可达 |
| 全息无变化 | 背景需为 5×9 quilt 整图；普通 PNG 边框可能不符合 blit 规格 |
| 跨域 | 浏览器只请求 Anatomy 同源 BFF，不应直连 CMS |

---

## 5. 服务器示例（121.199.173.176）

```bash
# Media：部署 server 变更并重启 cjview-cms
ssh root@121.199.173.176 "cd /opt/cjview && npm run build && pm2 restart cjview-cms"

# Anatomy：写入 env 并重启
ssh root@121.199.173.176 "cd /opt/anatomy && pm2 stop anatomy && npm run build:next && pm2 start anatomy --update-env"
```

请将 `/opt/cjview` 替换为线上 Media 实际路径，并在 Anatomy 的 PM2 ecosystem 或 `.env` 中配置 `CJVIEW_*` 变量。
