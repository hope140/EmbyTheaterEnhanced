# Emby Theater Enhanced

面向 **Windows x64** 的非官方 Emby Theater 社区增强版，用于连接自己的 Emby 服务器，重点改善 STRM 网盘播放、页面浏览和日常使用体验。项目与 Emby 官方无隶属、合作或认可关系。

[下载安装](#下载安装) · [开始使用](#开始使用) · [主要功能](#主要功能) · [开发与构建](#开发与构建) · [文档索引](docs/README.md)

## 下载安装

截至 2026-11-11，正式版与最新公开测试版如下。只需使用客户端时，下载安装包即可，无需准备源码和构建工具。

| 渠道 | 下载 | 校验 |
| --- | --- | --- |
| 正式版 · [v0.4.0（Latest）](https://github.com/hope140/EmbyTheaterEnhanced/releases/latest) | [Windows x64 安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.0/EmbyTheaterEnhanced-0.4.0-win-x64-setup.exe) | [SHA-256](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.0/EmbyTheaterEnhanced-0.4.0-win-x64-setup.exe.sha256) |
| 测试版 · [v0.4.21（Pre-release）](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.21) | [Windows x64 安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.21/EmbyTheaterEnhanced-0.4.21-win-x64-setup.exe) | [SHA-256](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.21/EmbyTheaterEnhanced-0.4.21-win-x64-setup.exe.sha256) |

从同一 Release 下载安装包和校验文件，核对 SHA-256 后，正常退出客户端再安装。`Source code` 压缩包不是安装包。安装程序未签名，Windows 可能提示未知发布者；校验值用于核对下载字节。

**v0.4.2 起**可在“关于 Enhanced”主动选择正式／测试通道、检查并下载安装包。v0.4.2–v0.4.4 下载后需自行退出并安装；**v0.4.5 起**，主动下载并完成校验后会正常退出客户端，再打开安装向导，由用户完成安装。应用不在后台自动检查，不静默安装，也不提供降级下载；详见[更新指南](docs/USER_GUIDE.md#手动检查更新与通道)。

**v0.4.12** 改进运行中客户端的更新退出与安装交接；从旧客户端升级到它的当次交接仍由旧客户端执行。另增加提前 EOF 的脱敏定位日志，尚未确定现场根因，也没有自动恢复。

**v0.4.19** 修复外挂字幕先加载后的内嵌选轨、改善首页刷新与返回位置，并补充配置／CD2 诊断。**v0.4.20 测试版** 已发布，包含播放错误提示的历史隔离与幂等关闭、普通／详细有界诊断、原生优先误报回退修复及客户端说明文字整理。当前播放成功率退化和提前 EOF 的现场根因仍未确认，115 并发原因也未证实；没有新增 EOF 保护、自动重试或 keep-open 改动。本轮继续边使用边验证，后续正式版号及日期未定，见[当前范围](docs/NEXT_RELEASE_SCOPE.md#本轮正式版与验收边界)。

**v0.4.21 测试版已发布**：在准确映射可用时提前选择默认内嵌字幕，保留外挂／内嵌切换；补齐明确终止错误的无重试传递。验收反馈为字幕起播不再卡顿，本地播放和被控端 CD2 直链暂时正常，其他稳定性继续观察。没有明确错误的提前 EOF 仍可能自动下一集，原始读流根因未确认。发行来源、检查结果与安装包哈希见[本版记录](docs/V0421_RELEASE_VERIFICATION.md)，下载见上表。

## 开始使用

1. 下载并校验安装包，按[安装与升级步骤](docs/USER_GUIDE.md#安装与升级)完成安装；升级前备份重要配置。
2. 打开客户端，连接自己的 Emby 服务器并登录。普通媒体可直接使用，无需配置 STRM 增强。
3. 使用 STRM／CloudDrive2 时，在设置中的“智能解析”保存服务地址、Token 和路径映射，测试后重启。三种路径的示例见[配置指南](docs/USER_GUIDE.md#strm-与-clouddrive2)。

遇到连接、更新或播放问题，先看[常见问题](docs/USER_GUIDE.md#常见问题)与[已知限制](docs/KNOWN_ISSUES.md)。

## 主要功能

- **STRM 智能解析**：通过 CloudDrive2 获取媒体直链，也可使用本机挂载路径；失败时继续尝试原有播放源。路径映射助手可根据样本生成规则建议，新资源明确找不到时有界刷新父目录并重查。
- **页面与设置维护**：按服务器配置显示首页分区，改善详情、搜索及部分插件设置页的控件和导航；兼容范围见[已知问题](docs/KNOWN_ISSUES.md)。
- **mpv 内核管理**：手动导入内核候选包，选择后下次启动生效；来源与兼容校验的边界见[用户指南](docs/USER_GUIDE.md#mpv-内核候选管理)。
- **诊断导出**：导出播放与错误信息，对已知敏感格式脱敏；反馈前仍需自行检查内容。

测试版在以上基础上增加：

- **v0.4.2 页面缓存与缓存管理**：再次打开近期详情时先显示有限静态信息，再更新服务器数据；可分别或一并清理资源缓存与页面缓存，保留登录和设置。缓存不能代替授权、最新进度或真实播放数据。
- **v0.4.2 手动更新与通道选择**：保存正式／测试通道，主动检查和下载更新。
- **v0.4.3 Windows 媒体集成**：任务栏缩略图和 Peek 显示一秒采样的视频预览，控制集中到系统媒体卡片；原任务栏两个控制按钮已移除。预览是低频截图，不承诺连续流畅视频，也不合成字幕。
- **v0.4.3 使用修正**：修复退出异常及 Host 残留，缓存清理按钮文字居中，设置展示名简化为“智能解析”。
- **v0.4.4 浏览与诊断修正**：改善详情布局和海报交接、返回首页时的驻留内容复用，补充脱敏播放诊断；移除不再使用的包内 Anime4K shader。
- **v0.4.5 首页、字幕与更新修正**：修复重复进入主页空白、单条删除请求和透明字幕背景；首页数据刷新后保持有效滚动位置，更新支持复用已校验安装包和退出后的安装向导交接。
- **v0.4.6 配置保存修正**：保存失败时清理本次临时文件，规则存储仅在写盘成功后切换状态；补充安装、更新与构建文档。
- **v0.4.7 在线提前下载**：记住下载目录，支持单片、全剧／本季和下载管理；按来源条件续传，服务器在线时优先播放已下载文件。完成提示显示具体片名或季集号，不提供离线媒体库。
- **v0.4.8 已看集数筛选**：全剧／本季默认跳过当前账户已看完的集数，部分观看保留，也可选择下载全部；精简下载管理提示，任务状态保持自动更新。
- **v0.4.9 确认框焦点修复**：更新到固定Electron44.5.0，修复Windows原生确认框关闭后输入／下拉失去响应，保留0.4.8下载功能。
- **v0.4.10 片头修复与定位诊断**：修复旧片头信息／点击跨播放生效及越界终点，增加脱敏定位与结束诊断；普通拖进度后提前结束的现场根因仍待确认。
- **v0.4.11 字幕语言多选**：按选择顺序保存首选语言；实际默认字幕轨道仍取决于服务器返回的选轨结果。
- **v0.4.12 更新交接与 EOF 定位**：改进更新退出和安装器交接，加入低频、脱敏的缓存 EOF 观察日志；未加入自动恢复或切线路。
- **v0.4.13 语言偏好排序**：首选音轨语言可多选，音轨与字幕的已选语言可在原选择弹窗中调整顺序；实际播放轨道仍由服务器决定。

各版范围见[变更记录](CHANGELOG.md)与[实际 Release](https://github.com/hope140/EmbyTheaterEnhanced/releases)。下一集预载／预加载、播放／缓冲暂存及最近搜索已取消；提前下载继续保留。飞牛认证继续独立开发，安排在本轮正式版之后发布，真实认证和播放仍待验证，详见[功能取舍](docs/NEXT_RELEASE_SCOPE.md#功能取舍与后续范围)。

## 开发与构建

维护代码位于 `src/` 与 `native/`，构建和校验工具位于 `tools/`，回归用例位于 `tests/`；`vendor/` 保存固定输入，不能手工修改。先阅读 [AGENTS.md](AGENTS.md) 和[贡献指南](docs/CONTRIBUTING.md)。

源码检查使用 **Node.js 24.18.1**、Git 和 PowerShell 7（`pwsh`）。克隆后在仓库根目录安装锁定依赖并运行公开离线回归：

```sh
git clone https://github.com/hope140/EmbyTheaterEnhanced.git
cd EmbyTheaterEnhanced
npm ci --ignore-scripts
node tools/ci-public-tests.cjs
```

这组检查不启动客户端，明确排除材料依赖用例；Linux 也会跳过 Windows 专属集成。完整检查命令见[贡献指南](docs/CONTRIBUTING.md#源码检查与完整测试)。根 `package.json` 是开发工具声明，没有 `npm start` 或 `npm run build`。

完整 Windows x64 安装包还需要锁定的 Electron、Host、libmpv 和编译／打包材料。使用现有 Actions 手动测试包入口，或按[Windows 构建与打包](docs/CONTRIBUTING.md#windows-构建与打包)准备后执行；源码回归通过不代表已完成构建、实际播放或安装验收。

## 文档与反馈

- [用户指南](docs/USER_GUIDE.md)：校验、安装、更新、配置和常见问题。
- [已知问题](docs/KNOWN_ISSUES.md) · [反馈步骤](docs/USER_GUIDE.md#问题反馈) · [GitHub Issues](https://github.com/hope140/EmbyTheaterEnhanced/issues)。
- [贡献指南](docs/CONTRIBUTING.md)：项目结构、依赖、检查与构建入口。
- [文档索引](docs/README.md)：技术合同、来源材料及历史发行记录。

## 许可与来源

维护层按 [GPL-2.0-only](LICENSE) 发布；第三方组件适用各自条款。保留或发布材料不表示其授权、来源及完整对应源码均已核验。必要通知与未决事项见[许可与来源说明](docs/LICENSING.md)和[第三方通知](THIRD_PARTY_NOTICES.md)。
