# 测试与验收

<a id="terminal-media-error"></a>
## 当前代次终止性媒体错误

```powershell
node --test tests/terminal-read-error.test.cjs tests/native-helper-diagnostics-playback.test.cjs tests/native-helper-client.test.cjs tests/native-helper-service.test.cjs tests/playbackmanager-request-session.test.cjs tests/seek-eof-diagnostics.test.cjs
```

新增回归加载真实 adapter AMD 和 renderer bridge；IPC、浏览器及服务为夹具。生成 PlaybackManager 联合回归验证终止错误无转码/媒体重试、无下一集且仅一次退出；普通 EOF 用真实首项 adapter 驱动队列，后续媒体传输由夹具承接。`ETE_TEST_SOURCE_ROOT` 可给启动夹具指定另一份准确源码中的 adapter，保持断言不变做修前对照，默认读取当前工作树。

覆盖当前/旧 generation、同媒体重开、同步错误监听器接纳新 Play、重复错误/EOF、缺少归属或类型证据、可恢复诊断、正常片尾、短视频、未知/错误时长、直播和近尾 Seek。普通 EOF 先于可靠错误时不回滚已发生的队列决定；上下文日志及显著剩余时长不当作终止证明。该限制意味着只有 `eof-reached` 的现场仍可能误跳。测试不证明原始读流根因已修好，也不代替 Native Helper、实际客户端、真实媒体、显示或安装验收。

<a id="playback-error-dialog-history"></a>
## Playback error dialog history

The explicit browser probe requires an already available Playwright module and an absolute Chromium-compatible executable. It launches headless with a fresh temporary profile and synthetic origin; it does not start ETE, connect a media server, install dependencies or touch the current user's foreground app. Supply an existing module search path externally if needed.

```powershell
node tools/check-playback-error-dialog-renderer.cjs <absolute-Chromium-executable>
node tools/check-playback-error-dialog-renderer.cjs <absolute-Chromium-executable> --patch-ref=825c7c7faad7c7e40490cf77d3244d12e9161d2a --expect=regression
node --test tests/playbackmanager-request-session.test.cjs tests/playback-lifecycle-patchers.test.cjs tests/plugin-dialogclose-material-selftest.cjs tests/videoosd-lifecycle-material-selftest.cjs
```

The baseline expectation asserts the defect, rather than treating it as correct product behavior. The probe checks each frozen component against runtime-manifest, applies the chosen committed/current PlaybackManager generator to the frozen manager, and reports input/output hashes and worktree status. Actual alert/dialog/helper/DOM/input modules run with real browser history; OSD stop/exit and manager error-display functions are sourced excerpts. Router, focus, services, UI dependency loading and root exit are fixture adapters. A source-bound dedicated notice is loaded directly for the fixed path. Animation capability is exercised both ways, while the local notice intentionally closes without a shared helper animation/timer.

Cases cover OSD return before/after notice creation, repeated confirmation and retained close callbacks, Escape, original input-manager Back, backdrop dismissal, immediate owner retirement, late/duplicate loader delivery, a newer notice, ordinary alert confirmation/Back, an error over an ordinary dialog, and normal navigation reaching the synthetic exit adapter. Full generated-manager tests separately verify admission retirement and synchronous stop-listener reentry. The existing shutdown regressions below verify fake app/child cleanup. None of these tests establishes field causality, real media playback, visible native video or an actual installed application exit.

退出收尾的定向回归可运行：

```powershell
node --test tests/native-helper-process-exit.test.cjs tests/app-shutdown-drain.test.cjs tests/native-helper-terminal-join.test.cjs tests/playback-power-main.test.cjs tests/refresh-rate-lifecycle.test.cjs
```

新增两份回归使用真实源码与fake app/child，覆盖有PID error不代替exit、无PID启动失败、重复事件、单项清理throw/reject及其他阶段pending、全部结算后quit一次。测试可用`ETE_TEST_SOURCE_ROOT`指向只包含同路径源码的基线快照进行相同断言的修前对照；默认始终读取当前工作树。这些用例不加载真实Native Helper或执行系统退出，不能代替进程残留、安装与播放验收。

公开离线集合由 tools/ci-public-tests.cjs 实际发现 tests/*.test.cjs 并排除固定的材料依赖文件；不是完整产品验收。运行命令见 [贡献指南](CONTRIBUTING.md)，具体排除与流程见 [公开 CI](PUBLIC_CI.md)。

具有完整固定输入的环境可运行 npm test；部分用例需要 vendor、prepared preload 或 Windows native 工具链。缺少材料应报告未执行或失败，不能删断言或伪造 PASS。

插件材料合同还需显式运行 `node --test tests/plugin-*-material-selftest.cjs`，覆盖 Alameda 实例身份、真实冻结导航/路由、菜单和关闭别名顺序。它们不在 `npm test` 或公开离线自动发现集合中；具有固定材料的发行环境必须另行核对，原断言保持。

当前独立材料准备及 `prepare-preload.cjs` 完成后，可运行完整显式材料集合：

```powershell
node tools/validate-build-materials.cjs .
node --test --test-concurrency=1 tests/*-material-selftest.cjs
```

导航用例直接读取已校验的 `vendor/web-snapshot`，保留冻结缺陷与当前修复的行为断言；缺少材料或 patcher 会失败，不再因旧 Carnival 路径缺失而跳过。runtime 基线用例按独立组件 manifest 构造参考产物，先比较原始基底，再比较共同生产变换后的完整中间产物，逐项核对路径、大小与 SHA256。该集合不需要完整旧 Carnival/patch 树，也不运行 Windows 应用或安装器。

原完整历史包对照保留为可选外部参考审计 `tests/audits/runtime-base-legacy-oracle.cjs`，不在上述集合或 `tests/*.test.cjs` 中。只有已持有原始完整参考材料时，显式设置 `ETE_LEGACY_RUNTIME_ORACLE_ROOT` 与 `ETE_LEGACY_LIBMPV_ORACLE_FILE` 后运行 `node --test tests/audits/runtime-base-legacy-oracle.cjs`。缺参、缺件或身份不符均失败，不自动下载旧包。当前组件回归不能替代该独立历史等价结论；未运行审计时应明确报告未执行。

详情页菜单材料自测需显式运行 `node --test tests/item-select-menus-material-selftest.cjs`；它直接读取固定 vendor HTML、布局 CSS 与冻结 Emby select 模块，不属于公开离线自动发现集合。外置播放器详情页合同需运行 `node tests/external-player-item-material-selftest.cjs`，覆盖原控件退役和详情菜单 overlay 输出哈希。首页固定材料自测需运行 `node tests/home-server-rendering-material-selftest.cjs`，覆盖冻结 HomeTab 与首页 overlay 接线合同。

## 证据与失败记录

验收分层记录：单元/假服务验证逻辑；隔离 runtime 验证打包组件；真实 Emby/CD2 验证媒体、Session、远控；可见呈现验证视频区域；Windows 安装生命周期验证安装/升级/卸载/重装及权限。各层不能替代。真实组件配合合成服务或受控浏览器的测试仍须说明夹具边界，不能写成完整客户端或真实 NAS 验收。

每次报告绑定准确源码 SHA、未提交差异、运行时／包身份、实际命令、环境、结果和未覆盖项；CI 另按[准确来源要求](PUBLIC_CI.md#result-identity-and-handoff)核对。失败分别说明产品行为、测试夹具、环境／材料或权限原因；根因未确认时保留未知，不把推测写成结论。保留初次失败与修正后的独立复验，不以删断言、放宽生产守卫、替换未核验来源或降低门禁掩盖失败。平台跳过与材料排除分别列出，均不计为通过。

代理分工和交接见[协作细则](AGENT_WORKFLOW.md)。原始日志与真实环境细节保存在仓库外，公开只提交可复现方法、合成 fixture 和必要脱敏结论。历史用户反馈和限制见[项目状态](PROJECT_STATUS.md)；用户反馈保留其来源，不能改记为独立机器实测。

<a id="initial-subtitle-preloaded"></a>
## Initial subtitle preloaded validation

Run the production AMD ownership and bridge suites with:

```powershell
node --test tests/subtitle-selection-ownership.test.cjs tests/native-helper-diagnostics-playback.test.cjs tests/native-helper-service.test.cjs tests/native-helper-client.test.cjs
```

The explicit native test requires a full helper compiled from the candidate, the pinned DLL (SHA256 965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c), a hidden HWND parent compiled from tests/helpers/hidden-subtitle-parent.cpp, and local synthetic fixtures. The MKV fixture has subtitle ff-index 0, video 1, subtitle 2 and subtitle 3, and duration beyond start=481; supply a local SRT for external insertion. Nothing discovers installed clients or accesses real media. Set absolute ETE_SUBTITLE_TEST_HELPER, ETE_SUBTITLE_TEST_DLL, ETE_SUBTITLE_TEST_MEDIA, ETE_SUBTITLE_TEST_SUBTITLE and ETE_SUBTITLE_TEST_PARENT paths, optionally ETE_SUBTITLE_TEST_REPORT, then run:

```powershell
node --test tests/initial-subtitle-native.test.cjs
```

Without explicit inputs this gate is reported as skipped, not passed. It executes the actual controller and complete helper against mpv and checks selected identity, cancellation, stale messages and mid-play switches. The test parent is hidden and each owned child is drained even on failure. Kernel refresh-seek experiments and complete helper tests are separate evidence layers: production diagnostic collection is bounded and cannot prove absence of every kernel log. The pinned-DLL experiment using the exact production mapping function observed on_preloaded selection before file-loaded/core-playing with no refresh seek in six cases; post-core and file-loaded selection controls do refresh. Synthetic correct HTTP Range responses did not reproduce MKV corruption. Null/hidden output and preview capture are not first visible frame or user stutter measurements.

Mappings with incomplete tables, missing hooks, count mismatch, stale identity or failed readback retain the post-load operation; this optimization does not promise to remove every initial refresh seek. Ordinary external and manual internal switching retain their required native operation. No original-media acceptance, package provenance build, remote CI or released repair is implied by these checks.

Final local validation: 2812 full-suite tests, 2806 passed, 6 explicitly skipped, zero failed; all 136 material self-tests passed. JavaScript syntax (596 tracked files), PowerShell syntax (53 files), secret scan (693 tracked files) and diff checks passed. The skipped full-suite gates require the separately acquired official55 Host sources (3), explicit hosted Windows exit/relay validation (2), or Unix transport (1). No remote CI, installer build, actual application exit or real-media acceptance was run. Initial missing material/toolchain failures and successful reruns are recorded separately; pinned public inputs were acquired into this isolated task only.
