# v0.2.9 第一阶段 A：外挂字幕最新选择归属

本页保留实验阶段的历史状态；2026-10-11 的独立审核、真实 Emby 验收复用与整合记录见 [字幕修复整合](V029_SUBTITLE_INTEGRATION.md)。

基线 `v0.2.8/main@888310de`，独立分支 `codex/v029-subtitle-race-exp`，父提交为只读研究文档 `a512a07`。这是未整合的实验修复，尚无真实用户播放验收。

## 旧证据复核与正式 RED

此前 3/3 虚拟时钟实验从 `b139d87` 的 Git blob 直接执行原始 `enableInternalSubtitleStream`/`setSubtitleStream`，观察 External A→Internal B、External A→External B、External A→Off 后旧 `sub-add` 仍提交。v0.2.8 与该候选的 `src/electronapp/plugins/libmpv.js` Git blob 均为 `63d28b8803433951d76183315706ebd862a135d0`，因此原函数输入在这条调用链上保持一致。原 3/3 是函数级命令顺序证据，不是可见画面。

新增 `tests/subtitle-selection-ownership.test.cjs` 加载完整 v0.2.8 AMD 模块，经真实 `player.play()` 建立 Play/MediaSource，再从公开 `player.setSubtitleStreamIndex()` 入口选择字幕；只把浏览器、Native Helper 响应与时钟替成确定性夹具。修复前正式 RED 为 **8 tests / 4 pass / 4 fail，exit 1**：A→B、A→Internal B、A→Off、A→B→A 均实际记录到旧 `sub-add`。单次 A、Stop、换集及延迟命令拒绝原本通过。原始 TAP 和退出码保存在本工作树忽略目录 `.work/v029-subtitle-red.*`，未纳入公开文件。

## 最小实验修复与 GREEN

只在 `src/electronapp/plugins/libmpv.js` 的播放器实例中增加 `subtitleSelectionSequence`；每次 `setSubtitleStream` 入口递增，延迟回调提交前同时校验当前 Play、最新选择序号和当前 `mediaSource` 身份。原 700ms 等待、`sub-add cached` 参数、`sid`/`aid`、PlaybackManager、Session、Native Helper 与缓存配置均未改。

修复后正式测试加入“timer 已触发但 Promise callback 未运行时选择 Off”和“Play 默认外挂字幕后选择 Off”，**10/10 PASS**；相关 `native-helper-diagnostics-playback` 与 `native-helper-service` 合计 **51/51 PASS**。单次外挂字幕在 699ms 未提交、700ms 提交一次；A→Off 无旧命令；被拒绝的 `sub-add` 继续产生匿名 `subtitle-command-failed` 诊断。`node --check`（源码/测试）和 `git diff --check` 通过。GREEN TAP/退出码保存在 `.work/v029-subtitle-green.*`。

## 安全影响与未验收

改动只增加同一播放器实例中的整数序号及提交前引用比较，没有扩大 IPC/协议、网络请求、日志字段或凭据处理。旧回调被丢弃时没有发往 Helper；已经提交给 mpv 的命令不能由本门槛撤销。测试证明 JavaScript 提交顺序，**未证明**真实外置字幕下载、mpv 选中与画面显示；真实 STRM/115、Emby Session/远控、安装版本、可见字幕和多种格式的验收仍 `NOT_EXECUTED`。保持实验分支，不进入正式整合。
