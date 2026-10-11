# v0.3.0 Together 修复整合独立审查

审查日期：2026-10-12（UTC+8）。最终对象 `68a0026b6fa65e965aa5a7d6ce7cdf91f6de8545`，初审对象 `c27755cf6c5ccdef0246dcd822afaea2890c8e73`，基线 `a8ba606c0bb4d8c4540ff7f9ad17eccb3d35db50`（已包含安装器 PR #28）。原产品修复 `31d11073fb33dad17bbaefec37f7260dafb8d50e` 在该基线上对应 `5288fb9`；后续观测/证据提交对应 `c27755c`，Helper 测试补齐为 `53df90c`、`51e9fb5`。

最终结论：初审发现 1 项 P2，主线程最小修正后已由本代理独立关闭；指定最终 SHA 的审查范围内未发现其他明确产品问题。真实 Together 与全屏验收仍未完成。

Task Risk / Uncertainty / Scope / Playback Impact：中 / 中 / PlaybackManager → libmpv adapter → native presentation / 涉及异步替换与 Stop 归属，因此按 Tier 2 核心审查。审查代理继承主线程模型；没有模型路由变更。独立 branch 为 `codex/v030-independent-review-20261012`。只允许新增本报告，未修改产品、测试、vendor、安装器或依赖。

## 问题

### [P2，已关闭] 重叠 Audio 替换仍会准备旧视频持帧

初审 `c27755c` 的 `tools/patch-playbackmanager.cjs:151-155` 在公开 Play 同步 admission 时，只要存在 intent 就转移到新 request。`217-226` 的替换边界在非 Video 情况仅跳过新建 presentation hook，没有清掉此前 admission 接管的 intent。因此同一个 libmpv player 的 Audio 替换仍进入 `src/electronapp/plugins/libmpv.js:1177-1188`，执行 `beforeTeardown()` / `stopForPresentation()`。这违反同 player **Video** 替换的范围，造成 Audio 播放也进行额外旧视频捕获、准备等待和原生持帧租期；最终可由失败或期限清理，不代表永久遮挡。

确定性内存 probe 复用了该 SHA 的真实 patched manager、现有 `makeStopBoundaryFixture` 与真实 `createNative()`，没有写入 probe 文件：

1. 公开播放 A Video，完成 A metadata 和 started session。
2. 播放 B Video，停在 B PlaybackInfo deferred promise。token 1 prepare 成功。
3. 公开播放 C Audio，复用同 player。fixture 补齐 Audio 路径所需 `CodecProfiles: []` 与 `getAudioStreamUrl()`。
4. C fulfilled，player.play 顺序为 A Video、C Audio，current item 为 Audio；native preparations 却为 `[{token:1,ready:true},{token:2,ready:true}]`，物理 Stop 为 `[[false],[false]]`。随后释放迟到 B metadata，B 未加载。

最初 probe 未补 Audio fixture，后续在 Audio profile 阶段失败，不能作为成功播放证据；上述补齐后的 probe 已成功完成 Audio。建议在已确定新媒体类型的替换边界、物理 Stop 前释放当前 Audio request 继承的 intent，并补 B Video pending → C Audio 回归。由主线程决定最小修正，本代理未修改产品。

主线程修正 `68a0026` 在 `tools/patch-playbackmanager.cjs:226-229` 按当前 request ID 清理非 Video 替换继承的 intent，先于物理 Stop。直接 ID 清理正确绕过公开 options 与 playInternal clone 的 WeakMap key 差异；旧请求有序失效检查仍先执行，Video 与 terminal 分支保持。新增 Audio 回归和本代理重复执行相同成功 probe 均 GREEN：仅 `[{token:1,ready:true}]`，cancelled tokens `[2,1]`，Audio fulfilled、current Audio、B stale 未播放。故该 P2 在最终 SHA 已关闭。

新增 Helper renderer bridge_error 用例覆盖已 load、core-playing 尚未到来的 replacement 失败并释放 token；service 用例覆盖 pending prepare 时 crash、重建新 helper、旧结果迟到，以及新 token Stop/arm 仍有效。真实 product service/client/CPP 未为补测试改变。

## 其余静态审查结论

- 阅读适用 AGENTS、架构/状态/经验相关章节及全部整合 diff；重点复核 patch generator、libmpv adapter、native transition、client/service/controller 和 Helper 持帧/取消/arm/reveal/析构上下文。
- 公开和内部 options 快照、request ID / WeakMap 完成清理与 post-await stale 检查保留；B/C 前置 user/ids/intro 等待的接管避免旧 B settlement 撤下 C 的帧。
- same-player Video 的物理 Stop 前建 intent；首次 Play 无 active intent 不建持帧。其他 player 使用 destroy Stop 清理旧意图；terminal Stop 同步失效请求，并等待原物理 Stop 排空。
- 旧 token / deadline / late preparation 只能清理自己记录；成功 ready 将揭开交给原生 generation / holdId / capture fence。prepared 与 native armed 各自有界，Helper terminal / destroy / 重建清理保留。
- Session / Item / MediaSource / PlaySessionId 报送仍由原 manager 生命周期拥有。静态和专项测试未发现上述领域其他新增明确问题。
- `installer/`、`package.json`、`package-lock.json`、`native/`、`src/electronapp/native-helper/`、`tools/build.ps1`、`tools/package.ps1` 相对基线逐路径 diff 为空。PR #28 安装器行为和依赖声明未被本整合改动；观测注入保持在 tools/tests，没有生产源码引用新增测试 harness。

## 本轮实际验证

Node `v24.18.1`。专项 manager 测试通过 `ETE_PLAYBACKMANAGER_SOURCE` 只读现存原始 Carnival 来源；测试自身在临时目录执行 canonical patch，未改 vendor。

```text
node --test --test-concurrency=2
  tests/playbackmanager-request-session.test.cjs
  tests/nexttrack-native-transition.test.cjs
  tests/native-helper-lifecycle.test.cjs
  tests/native-helper-service.test.cjs
  tests/native-helper-terminal-join.test.cjs
  tests/native-frame-boundary-cases.test.cjs
  tests/transition-timeline-browser.test.cjs
```

初审 `c27755c`：135 / 135 PASS。最终 `68a0026` 同命令增量复验：138 / 138 PASS。两轮 fail / cancel / skip / todo 均 0。其中 frame boundary 是验证器与 harness 合同单测，不是本轮真实 Native Helper 二进制视觉验收。初审 tests 通过仍未覆盖当时 Audio 交错，不能替代独立审查；最终新增 Audio 和 Helper 两项测试已进入上述 138 项。

`node --check` 实际检查 patch generator、libmpv、nexttrack-transition、smoke-electron、pipeline-browser、transition-timeline-browser 共 6 文件通过；`compare-transition.ps1` PowerShell AST 无错误。最终再次检查改变的 patch generator 语法、`git diff --check a8ba606..68a0026` 与安装器/依赖/native/build 路径 diff 均通过。Audio probe 的初次 fixture 失败、成功 RED 与最终 GREEN 如问题章节。

文档提示：`V030_PRESENTATION_COVERAGE.md` 的原 84/84 命令结果属于补 renderer case 后的证据；加入 Audio 用例后部分行号和计数需要主线程最终同步，本代理未扩大唯一报告写入权限。

本轮没有启动桌面/客户端、访问服务器、安装、构建生产包或真实播放验收；没有 push、PR、merge、release。真实 Together 双端、真实媒体、全屏/硬件解码/HDR/多显示器未覆盖。原专项全屏 `INCONCLUSIVE` 保持，历史窗口合成像素证据未重新运行。报告仅为指定 SHA 的独立代码/单测审查，不是发布或安装验收结论。
