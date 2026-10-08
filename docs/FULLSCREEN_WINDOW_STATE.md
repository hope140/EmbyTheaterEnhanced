# 全屏窗口修复与验收

2026-10-08，独立本地分支 `codex/fullscreen-state-20261008`。本文相对路径以managed worktree `ete-fullscreen-state-20261008`的项目根目录为基准。

## 当前交付

- 产品sourceCommit：`1e86e512e3293e5c9fb43b3803995af50b802762`。
- runtime入口：`dist/fullscreen-state-final/Emby.Theater.exe`。
- 顶部细条：`HUMAN-ASSISTED VISUAL PASS / USER_REPORTED_RESOLVED`。用户在候选交付后明确反馈“我手动验证了，现在没有那个条了”。按本次用户所测场景记录，未补推媒体、显示器或其它交互的覆盖范围。
- 全屏窗口交互：`FIXED IN LOCAL CANDIDATE / FINAL INTERACTION ACCEPTANCE PENDING`。
- 前后切集保持原实现；此前用户所测场景基本解决，继续观察。

## 复现与修复

基线为 `94d216b`，其产品src/native/vendor与已交付的`6473ecb`相同。旧播放工作树和Settings工作树均保留，未覆盖未提交记录。

Computer Use操作独立窗口顶部边缘，使main从2560x1440变成x=0、y=170、2560x1270。事件序列只有will-resize、resize、move、resized，没有leave-full-screen；renderer仍Fullscreen。surface随main缩小。固定[Electron44.4.2源码](https://github.com/electron/electron/blob/v44.4.2/shell/browser/native_window_views.cc#L762-L832)显示Windows透明窗口全屏先通知、再保存/调整bounds，并不进入widget原生fullscreen。因此isFullScreen=false本身不足以证明应用只做了maximize或应退出全屏。

顶部中央窄区合成图最上方两行物理像素为灰色，renderer对应位置为黑色透明alpha；surface外框比content多约1–2个DIP。在仅改变carrier的thickFrame/resizable/movable配置的实验中，合成顶部恢复为视频颜色，renderer逐行值不变，surface外框与内容尺寸一致。原实验`surface-control`因注入位置无效，实际仍是原配置，作为控制证据保留；有效实验为`surface-frameless`。本次归属为carrier原生窗口框，未将其扩展为所有细条来源。

产品变化仅`src/electronapp/main.js`及`src/electronapp/native-helper/service.js`。main在全屏活动期保存并锁定交互，退出恢复；避免重复全屏或restore覆盖normal bounds；异常geometry失配通过正常退出路径复核状态。Normal请求撤销旧restore intent，全屏最小化后关闭保存原normal bounds。carrier继续沿既有move/resize同步，仅不再拥有自身窗口框和用户移动/缩放能力。

Electron44、apphost命令canonicalization、native CPP、持帧切集、PlaybackManager、Session、Resolver、libmpv未改。无新增依赖、焦点循环或GPU开关。

## 验证与边界

| 层级 | 结果 | 证据 |
|---|---|---|
| 最终全量单测 | 412/412 PASS | `.work/fullscreen-1e86e51-unit.log` |
| 窗口状态及service定向 | 37/37 PASS，含11项窗口case | `.work/final-window-focused.log` |
| 最终build/provenance | PASS，sourceCommit精确绑定 | `.work/fullscreen-final-build.log` |
| package VerifyOnly | PASS，2140 files | `.work/fullscreen-final-package.log` |
| 旧候选拖动复现 | 状态脱节已复现 | `.work/fullscreen-baseline/3-snapshot.json`及`events.json` |
| carrier窄区归属 | 控制组顶部灰色；实验组为视频色 | `.work/fullscreen-surface-control/3-capture-top-pixels.json`、`.work/fullscreen-surface-frameless/3-capture-top-pixels.json` |
| a8aa114阶段可见交互 | 顶边/右边/顶部拖动区未破坏全屏；Normal恢复1000x600；手动缩至852x600；重复全屏与minimize/restore后退出仍恢复852x600 | `.work/fullscreen-candidate-a8aa114/` |
| 最终可见probe | 用户Esc停止Computer Use，未完成完整动作矩阵 | `.work/fullscreen-final-1e86e51/` |
| 顶部细条用户验收 | 用户手动确认已消失 | 本会话2026-10-08用户反馈 |

独立核心复核发现迟到restore重新进入全屏和最小化关闭保存display bounds，两项均已修正并补回归。延迟restore负例在内存移除修正后观察[true,false,true]，仅新case失败；修正后为[true,false]。这些是逻辑测试，不替代实机交互。

最终候选的完整交互、播放中进出全屏、前后切集和Stop合成复测仍未完成；最终真实Emby/CD2、HDR、多显示器也未逐项验收。旧候选401/401、跨编码帧和原生边界结果保持历史身份。此次用户确认只关闭顶部细条项。

## 后续测试入口

用户使用当前runtime的`Emby.Theater.exe`。代理若恢复隔离测试，使用`tools/start-fullscreen-probe.ps1`并提供当前runtime绝对路径、上述ExpectedSourceCommit及新的Label；脚本先校验payload并创建独立profile，不能复用真实profile。可见操作通过Computer Use进行，固定枚举命令和snapshot由test-only observer处理。当前用户反馈记录阶段没有重新启动桌面操作。
