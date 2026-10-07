# Windowed transition observation

2026-10-07 用户补充：切集黑屏很快消失，仅测试窗口模式，全屏尚未覆盖。当前生产源码停在 `456df8e` 的 PreviousTrack 入口修正；本轮新增的是 test-only 观察工具，没有改变图片加载或 Native Helper 呈现策略。

## Fixture and evidence levels

原 pipeline 的队列没有 ImageTags，媒体是所有帧相同的单一 Y4M，且播放参数固定 fullscreen；它验证播放逻辑与无海报 fallback，不覆盖这次带海报的窗口模式现象。

新模式复用真实 PlaybackManager / libmpv / Native Helper，以临时 profile 和 localhost 假 API 播放两段不同颜色、逐帧变化的 Y4M。A 为红色主导、B 为绿色主导；海报由本地紫色 SVG 提供。它执行 A→B next、B→A previous，记录三层独立证据：

- renderer：动作、overlay 插入 / fade / 移除、海报 load / decode、core-playing。`core-playing` 始终标为逻辑代理。
- main/helper：Stop、显示请求和处理返回、surface-sync，以及内部 start-file / file-loaded / end-file / core-idle。事件的 `atMs` 是本测试观察到它的时间，不是原生呈现时间。
- 合成屏幕 ROI：在精确显示器和可信测试窗口内，通过连续 screen stream 采中心区域；只保留 96×54 采样的 FNV-1a 32-bit 哈希、均色、亮度、时间和采样质量，不保存整屏录制或原始像素。

像素观察按每动作 2 秒、最多 120 条限制。失焦、窗口 / 显示器变化、API 不可用或采样不足均保持 INCONCLUSIVE；不会由 `time-pos`、IPC ack 或没有采到黑色来宣布画面正常。结束时停止 stream tracks、移除测试 video 并重置测试 session handler。

## Bounded runs

诊断 runtime 为 `dist/track-visual-diagnostic`，source commit `456df8e`，build / provenance / package VerifyOnly 通过（2140 payload files）。以下为调试过程中当时工作树观察器版本产生的实验记录，不能当作最终观察器提交的重复构建证明。

| 方法 / case | 观察 | 结论 |
|---|---|---|
| console 动作桥初版 | 逻辑检查通过，未启动像素任务 | INCONCLUSIVE；随后改成仅测试模式启用、校验 sender 的明确 IPC |
| 逐次 desktop thumbnail | 每动作仅 6/7 样本，最大间隔 377/379ms，末次请求还可能跨出观察窗 | 不适合捕捉短闪；此路径已退出工具默认实现 |
| 连续流，海报响应延迟 0ms | next 66 样本、最大间隔 80ms，捕获 2 次黑色；previous 64 样本、最大间隔 66ms，捕获海报和对应视频颜色 | 受控场景的首段黑色阳性证据；未捕获尾黑不表示尾黑不存在 |
| 连续流，海报响应延迟 150ms | next 60 样本、最大间隔 84ms，捕获 3 次黑色；previous 58 样本、最大间隔 67ms | 同样观察到首段黑色；清理成功、进程残留 0 |
| 追加稳定旧画面前置条件的单次探针 | 未取得所需的新鲜 A 红 / B 绿前置证据，fixture 未完成切集 | INCONCLUSIVE / fixture incomplete；没有把它作为生产播放回归 |

0ms case 的 next 在 overlay 插入后、海报像素可见前出现黑色采样；poster load / decode 的逻辑记录与这一段相邻。150ms case 同样出现旧视频颜色→黑色→海报→新视频颜色。这支持“海报未就绪时黑底先呈现”的机制，但没有闭合真实片源的全部呈现根因。

两次初步连续流尚未在动作前强制等待旧视频颜色稳定，因此对照范围有限。最终工具增加可用的 `currentColor()` 前置检查，并把缺少旧视频证据与逻辑播放结果分开；严格前置 probe 的失败保留，不重复放松门槛求绿。只有首段黑色取得受控阳性证据，用户报告的海报后短黑仍待定位。

## Reproduce the diagnostic mode

从目标 worktree 执行；使用新的 fixture 输出目录，生成器拒绝覆盖既有文件：

```powershell
node tools/make-transition-fixtures.cjs .work/transition-fixtures
$env:ETE_TEST_TRANSITION_TIMELINE = '1'
$env:ETE_TEST_ARTWORK_DELAY_MS = '150'
$env:ETE_TEST_MEDIA_A = (Resolve-Path .work/transition-fixtures/transition-a.y4m).Path
$env:ETE_TEST_MEDIA_B = (Resolve-Path .work/transition-fixtures/transition-b.y4m).Path
powershell -NoProfile -ExecutionPolicy Bypass -File tools/test-runtime.ps1 -RuntimeName track-visual-diagnostic -Visible -TestPipeline
```

仅在用户已允许可见测试窗口的阶段运行。窗口必须保持在同一显示器且有焦点；工具不更改 focus、置顶或全屏算法。失败时读取 `electron-smoke.json` 的 `state.pipeline.failure`、`pixelPrerequisite`、`pixel.classification` 和 cleanup 字段。默认 pipeline 不带该环境变量时保留原行为。

## Follow-up decision

上一集入口修正已完成源码和回归验证；首段短黑的候选方案是只在内存中预备当前队列相邻两项的封面，仍保持视频播放不等待图片。该策略会提前发生图片请求，尚待用户接受；本轮不自动加入产品。不得把缓存预热 / CD2 / 视频预取纳入这项图片策略。

尾黑没有稳定复现证据，当前不改 Native Helper、显示协议或 fixed-delay。仍需把图像、surface 和实际合成像素分开观察。

## Tooling validation

最终完整 Node suite 为 347/347 PASS；采样约束专项 7/7 PASS，原默认 fake CD2 pipeline 回归 PASS。visible smoke 的原静态断言更新为：默认可见 smoke 仍保存 renderer startup screenshot；timeline 模式使用合成流统计。已保持 hidden 模式无需 capture surface 的边界。

本节的 Node / 默认 pipeline 结果只验证工具与原测试流程；上表的严格像素前置 probe 仍为 INCONCLUSIVE，不被这些 PASS 覆盖。
