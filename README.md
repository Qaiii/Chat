# dsh-chat

DSH 桌面版的左侧栏 **Chat** 插件：在应用内直接打开一个可配置的 AI 网页，默认是 [DeepSeek 网页版](https://chat.deepseek.com/)，用来问一些普通问题，不消耗 DSH token。

- **左侧栏一级入口**：和 Mate 一样是全局面板，不需要先打开会话。
- **真正的浏览器页面**：桌面版使用 Electron `<webview>`，不是 iframe，所以不受 `X-Frame-Options` / `frame-ancestors` 限制。
- **地址可配置**：面板工具栏的齿轮 → 修改「网页地址」→ 保存并打开；配置会持久化。
- **轻量工具条**：后退、前进、刷新、回到主页、设置、在系统浏览器打开。

## 为什么不用 iframe

`https://chat.deepseek.com/` 会返回：

```
Content-Security-Policy: frame-ancestors 'none'
```

iframe 一定会被拒绝。插件复用 DSH 桌面版主窗口已经暴露的 lease-scoped browser bridge（`window.dshDesktop.browser`），按内置右侧栏 Browser 相同的方式创建和维护 webview；主机进程仍会执行同一套 sandbox、权限、下载和导航限制。

## 安装（桌面版）

从 GitHub 安装：

```powershell
dsh plugin --profile desktop add -w github:Qaiii/Chat
```

或从本地目录链接安装：

```powershell
dsh plugin --profile desktop add -w D:\CodeProject\Deepseek-Harness-Plugins\Chat
```

然后在插件管理页启用 `dsh-chat`，或让插件管理器的安装流程自动启用。

安装后如果左侧栏没有立即出现 Chat，先刷新页面；仍不出现再重启桌面版。

## 用法

1. 点击左侧栏 **Chat**。
2. 默认打开 DeepSeek 网页版；登录后即可像在浏览器里一样使用。
3. 点工具栏齿轮，把「网页地址」改成其他 AI 网页（例如其他厂商的网页版），点「保存并打开」。
4. 点「恢复默认」可回到 `https://chat.deepseek.com/`。
5. 「在系统浏览器打开」用于站点限制 Electron 环境或登录弹窗无法完成的情况。

## 登录保持

DSH 给 webview 的 partition 是进程级、非持久化的，应用重启后 guest 的 `localStorage` 会丢失。DeepSeek 网页版把登录 token 存在 `localStorage.userToken` 里，所以插件做了 **guest localStorage 快照**：

- 页面加载后，插件读取 guest 的 `localStorage`，按 origin 保存到 DSH 应用自己的 `localStorage`（key：`dsh-chat.guest-storage.v1`）。
- 应用重启后，插件先把快照注入 guest，再刷新一次页面，网页版会直接恢复登录。
- 设置弹窗会显示当前是否已找到保存的登录快照；登录后等几秒再打开设置即可确认。
- 登录 token 会保存在本机 DSH 应用存储里；设置弹窗里提供「清除已保存登录」，点击后下次启动不再自动恢复。
- 这是 best-effort：如果站点改用 HttpOnly cookie 或其他存储、或 DSH 升级改变 webview 机制，自动恢复可能失效；此时仍需重新登录。
- 自动恢复会在应用启动后多触发一次页面刷新（先注入 token，再加载已登录页面）。

## 配置

- 配置文件位置（浏览器 localStorage）：
  - `dsh-chat.config.v1`：`{ "url": "https://chat.deepseek.com/" }`
  - `dsh-chat.guest-storage.v1`：按 origin 保存的 guest localStorage 快照（含登录 token）
  - 面板内直接改地址即可，无需手动编辑。
- `dsh-chat.last-url.v1`（sessionStorage）：切换会话/面板再回来时恢复上次访问的页面；应用重启后回到配置地址。
- 默认地址常量在 `client.js` 的 `DEFAULT_URL`，需要给其他人预置不同地址时可改这里。

## 已知限制

- **仅桌面版可用**：Web 版的 DSH 没有 Electron webview，插件会显示说明和「在系统浏览器打开」。
- **依赖桌面版内部 bridge**：`window.dshDesktop.browser` 是桌面版内部接口，未来 DSH 升级可能变化；插件固定 `engines.dsh`，失败时会显示错误而不是崩溃。
- **登录保持是 best-effort**：见上节；快照存在 DSH 应用 localStorage 里，包含登录 token，请按需使用「清除已保存登录」。
- **切换面板不重新加载**：Chat 面板离开时只是隐藏，webview 和页面内状态保留；再回来直接显示原页面。应用刷新/重启后才会重新创建，并用 sessionStorage 恢复上次 URL。
- **网页环境标识**：DeepSeek 网页版会根据 `navigator.userAgent` 是否包含 `Electron` 弹出「使用环境异常」提示。插件在 guest 加载前设置去掉 Electron 标识的标准 Chrome UA，避免这个误报；guest 本身仍然是 sandbox、无 Node 权限的普通网页，使用的是 DSH 桌面版公开的 webview 机制。
- **权限/下载/弹窗受限**：主进程统一禁止摄像头/麦克风等权限、下载、嵌套 webview 和独立弹窗；依赖这些能力的站点可能只能走系统浏览器。
- 只支持一个可配置页面，没有多页签、历史记录、书签。

## 开发

无构建、无第三方依赖：

```powershell
node --check index.js client.js
node --test --test-isolation=none tests/*.test.mjs
```

`client.js` 必须保持 `window.__ModuleLoader__.load({ id: 'dsh-chat', factory(require) { ... } })` 契约；React 和 `@deepseek-ai/dsh-client-ui-primitives` 走平台基线模块，不打进包。

测试覆盖：
- bundle 契约、左侧栏/主面板注册、8 语言字典与元数据；
- URL 规范化和配置持久化；
- guest localStorage 快照的保存/按 origin 读取/清除；
- webview 控制器的 acquire → 附着 → dom-ready → loadURL → 释放流程；
- 快照恢复、重载、登录态捕获；
- acquire 失败、无 desktop bridge 的降级。

真实 Electron webview 的最终显示和登录流程需要在桌面版中手动验收。
