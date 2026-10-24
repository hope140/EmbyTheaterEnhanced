# 首页、缓存管理与手动更新组合候选

本候选从已发布 v0.4.1 的 `44d524e4b5cfdd018e0da80cfa1e667e7f6751c7` 整合，保留该版本九项缺陷修复与两个固定 Native 渲染选项隐藏。新增来源为首页/缓存管理 `4ebde9195ce88fce06bf6d6988d7522b5c13147b`、手动更新 `cb51c8875eb60ae05127231cf8800d5529f19986`；源分支不改。内部开发版本继续为 0.4.1，不能凭相同版本号把旧发布包当本候选。准确来源必须按新包 sourceCommit/provenance 核对。

这是独立测试集成，尚未完成 Windows 整包和用户验收，不是新 Release。已发布 v0.4.1、main 与旧附件保持原样；不包含原生预览、视频范围缓存或其他功能分支。

## 合同与合并边界

- 首页布局 DTO 缓存默认关闭，Home 编排默认 baseline；retain/sections 和布局缓存分别由原有限隔离参数开启，没有新产品默认策略。只复用同 URL、同身份的原驻留视图，最多三槽；返回仍刷新 Items，未永久缓存用户播放进度。设置前向返回使用同一 Home owner，身份变化/淘汰/原生失效仍重建。见 [首页合同](HOME_FLOW.md)。
- 设置中的独立“缓存管理”页分别读取实际布局 owner 和当前窗口 session 的 HTTP 总量，支持各自及组合清理；不清登录、设置、`embydata` 或视频，不把 HTTP 总量说成图片独占用量。About 仅保留迁移说明，不恢复失效的旧入口。见 [缓存管理](CACHE_MANAGEMENT.md)。
- About 保留安全说明链接解析模块；通道默认正式、仅保存本地选择，进入不自动检查。测试通道按 SemVer 选最高正式/prerelease，拒绝降级；切换退休旧检查、候选及链接，下载期间锁通道。链接经窄 IPC 请求系统浏览器，测试不实际启动浏览器或安装程序。见 [更新合同](MANUAL_APP_UPDATE.md)。
- 实际 Alameda 回归还修正独立缓存页扩展名依赖，并以 app 中的单一 `ete-home-layout-cache` 别名连接原 Home 布局模块，避免绝对插件 URL 另建空 owner；固定 app overlay 输出 SHA 按准确生成字节同步。About 的单一 destroy 同时退休信息/内核请求和更新工作、移除进度监听，然后调用原 BaseView destroy 一次。独立缓存页继续独立拥有其管理器。主进程同时等待 maintenance 与 HTTP-cache 的所属清理；播放器/Session/seek 归属保持。
- 固定 vendor、许可、API/缩略图 overlay 与构建来源门禁不放松；libmpv adapter 相对发布基线只增加缓存设置路由，不覆盖原 owner、暂停意图和真实 seek 完成修复。

## 自动检查与证据边界

全仓 Node、显式材料、JavaScript/PowerShell 语法、固定材料与打包输入来源检查分别记录。九项修复与固定渲染选项的既有用户反馈仍有效，但不能由此声称新的组合 Windows 包或真实双端 EWT 已通过。

使用已安装的 Chromium/Playwright，可运行以下无界面检查，不安装浏览器、不占工作桌面，也不接触真实 profile：

```sh
node tools/check-home-cache-update-renderer.cjs /absolute/path/to/chromium /new/absolute/evidence-directory
node tools/check-home-route-renderer.cjs /absolute/path/to/chromium /another/new/evidence-directory
node tools/check-cache-settings-renderer.cjs /absolute/path/to/chromium
```

组合检查执行固定 Alameda 的真实插件 URL/相对依赖解析，以及维护 About、独立缓存页、原 BaseView、组合 router/viewmanager/Home/卡片/设置源码。覆盖设置→首页驻留恢复、原生设置入口→缓存页及组合清理→About、通道保存且不自动检查、说明链接、下载锁通道和离页取消/解绑。外部 API、Electron IPC、系统浏览器、目录选择和下载为受控替身；不是 Windows Electron、真实 session HTTP 缓存、实际网络下载或真实服务器验收。

## 打包与最短验收

由协调者对独立整合分支的准确提交安排现有 `public-ci.yml` 手动工作流，`release_package=false`。保持原精确 checkout、Host 构建验证、runtime/provenance、更新器包内离线 selftest 及安装器解包比对门禁，不替换旧 artifact、不发布 Release。普通推送的 CI 与手动测试打包须分开记录。

新包验证解包后，沿 [隔离启动](PAGE_CACHE_TEST_ENTRY.md) 直接运行包内 Electron，跳过普通 Host/安装入口。例如：

```powershell
& (Join-Path $trialRuntime 'x64/electron/electron.exe') `
  (Join-Path $trialRuntime 'electronapp') `
  '--ete-page-cache-test=enabled' `
  '--ete-page-cache-ttl-ms=10000' `
  '--ete-page-cache-max-entries=2' `
  '--ete-page-cache-max-bytes=1048576' `
  '--ete-page-cache-home-flow=sections'
```

这些数值只是本轮显式试验配置。关闭布局缓存对照把 enabled 改 disabled；首页编排可分别选 baseline/retain/sections。每次启动分配新 profile，启动时隔离 appData/userData/sessionData、APPDATA/LOCALAPPDATA、MPV_HOME 和临时目录，不复制已有登录。PREPARED 回执不等于 GUI/命中验收。

1. 先核对新 artifact、来源 SHA 与隔离路径，确认正式数据未变；Windows 专属 ADS、进程和真实 GUI 项独立记录。
2. 同身份首页→设置→首页，检查卡片不重建闪白、后台刷新后进度更新、滚动/焦点与遥控可用；切换身份不能显示旧内容。分别比较 baseline/sections，不从一次体验推断普遍性能提升。
3. 原生设置入口打开独立缓存管理页，刷新、各自清理及组合清理；HTTP 数值可因新请求回升。确认登录/设置保留，离页无迟到改写。
4. About 进入不检查；切测试/正式通道后需主动检查，离页重入保留选择；说明链接只打开系统浏览器，不在客户端跳页。当前版本不低于渠道时不提供降级；无合适更高版本时不虚构真实下载通过。
5. 简单复查播放开始/Stop/下一项、暂停时 Seek（含 0）、缩略图和视频设置页；历史难触发竞态继续留待真实环境观察。实际更新下载、NTFS Zone 3、目录选择及真实双端 EWT 需相应环境，不把替身通过填为实测。
