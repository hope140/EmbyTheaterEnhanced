# v0.4.2 第一批测试版发布准备

## 来源与范围

独立 `integration/first-batch-v042` 以 main `3efd8c5514539ef8ac9a7c40782e9bc46d959681` 为基线，三方合入详情最终来源 `398635171fa462c7b0ea5e58020982ce2e97e190`。该详情来源已包含首页／缓存管理／手动更新组合 `d8870fbd692ea1f952fd06325f0dbda0d57011c6` 和 v0.4.1 修复来源 `44d524e4b5cfdd018e0da80cfa1e667e7f6751c7`。

保留 main 已合入的构建输入批读、文件内隔离测试种子、计时诊断与正常 package/release dispatch 路由；不混入后续 Native 系统控制／退出、Native 性能、视频范围缓存／预载或 FN 功能。

用户已确认第一批验收通过，包括详情最终修复对应的 [Windows 包运行 40093883618](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40093883618)及实际覆盖安装体验。本次不要求重新验整套；原反馈只代表当时准确包与实际体验，不能自动写成本次 main／版本整合后的新 Windows 构建通过。

详情持久缓存普通入口按既有合同自动工作；首页布局缓存仍需显式配置、编排仍默认 baseline。此轮仅保留已验收实现，不新增首页持久化策略或擅自改变默认值；参见[详情缓存](DETAIL_PAGE_CACHE.md)、[首页合同](HOME_FLOW.md)及[更新通道](MANUAL_APP_UPDATE.md)。

## 合并与版本合同

代码冲突仅在 `ci-windows-test-package.ps1` 的 runtime assemble/verify 与更新器离线 selftest 相邻区域：保留 main 原计时与失败处理，再执行包内八项更新器 selftest，匹配 sourceCommit、模块 manifest、零真实网络／profile／安装执行及所属临时文件清理。Framework 精确来源／微软有效签名预检及其回执保持；没有放松哈希门禁。两份状态文档保留双方历史记录。

根 package.json、package-lock.json 根及 packages[""].version 一致准备为 0.4.2。运行时 package、build manifest 和 installer 继续由原 builder 派生；不改固定上游模板、组件或依赖版本。Release 标题为 **v0.4.2 测试版**，`prerelease=true`、`make_latest=false`，v0.4.0 Latest 与旧附件保持。

## 检查与发布顺序

组合源码需执行全仓回归、显式材料、JS／PowerShell 语法、来源／打包输入及原 Alameda 详情入口／缓存管理／更新组合浏览器回归。单元与合成 Chromium 结果不代表新 Windows 包已经完成；发布者另核准确最终提交的构建、Host、runtime、安装器解包对照和五附件。

由发布协调者正常推送本分支并经 PR 合 main，取最终合并来源 **M**。脚本不要求预先存在 Tag；必须使 workflow checkout HEAD 等于该 run 的 GITHUB_SHA，并让包内来源、installer provenance、校验文件和 notes 全部绑定 M。

推荐先固定 Tag `v0.4.2` 到经检查的 M，再在该 Tag 上手动运行现有 `public-ci.yml`，参数 `release_package=true`、`build_input_benchmark=false`；也可在 main 上运行，但须立即回读 run.head_sha=M，不能用 benchmark_expected_sha 冒充普通 package 的来源锁。普通 push CI 与手动 release 附件构建分别核对。

工作流只构建并上传 artifact，不发布 GitHub Release。五附件核对通过后，由协调者创建标题“v0.4.2 测试版”的 prerelease，并显式不设 Latest；链接只引用该次真实附件，不猜测尚不存在的下载 URL。不复用验收包改名或覆盖 v0.4.1／v0.4.0 附件，不从当前准备阶段声称发布完成。

面向用户正文取自[Release 说明](RELEASE_NOTES.md)，仅保留用户变化、测试提醒、下载与必要项目声明。精确新包与公开 CI 结果须在发布后按实际来源补记，既有验收反馈保持。
