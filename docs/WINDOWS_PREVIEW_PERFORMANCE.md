# 原生预览低成本候选与测量合同

本候选独立于 `feature/windows-native-preview` 的 `4dea85f5`，不覆盖已交付试验包、main或Release。前版按钮记为用户通过；退出尚未确认。双窗口、snapshot owner／退休、固定mpv内核与无字幕的纯视频路线保持。

## 已核实的限制

main timer为1000ms、冷却950ms，helper另有950000us限速。它们约束的是采样上限，不能据此宣称真实呈现FPS为1。实际截图等待、CPU复制、Peek放大、DWM请求／提交／显示之间仍有差别。

Native沿 `screenshot-raw video bgr0` 取得完整帧并验证、复制，再采样到最多160×90 BGR24及base64。输出小不代表GPU读回或整帧复制也小。Peek按窗口尺寸放大，随后toBitmap、建立DIB、拷贝并提交；本次不把它改成另一种渲染架构或提高分辨率。

[WM thumbnail消息](https://learn.microsoft.com/en-us/windows/win32/dwm/wm-dwmsendiconicthumbnail)和[Peek消息](https://learn.microsoft.com/en-us/windows/win32/dwm/wm-dwmsendiconiclivepreviewbitmap)说明该表示正在被请求，但不是持续鼠标悬停状态的独立信号；当前2.5秒recent-request仅是需求租约，可能由本程序invalidate触发。不能将它写成精确的“悬停可见时”开关。[Microsoft提醒](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwminvalidateiconicbitmaps)频繁invalidate会造成性能问题。

## 最小改动

- 相同owner、尺寸和逐字节像素复用NativeImage；缓存字节单独复制，防输入Buffer后续变动造成误判。仍保留必要invalidate反馈，否则静止场景可能在租约过期后永久不再捕获。
- 同一暂停位置验证周期最多2秒；新DWM请求、seek／位置变化、owner变换、恢复及取消暂停不依赖该节流。时间只限制工作量，像素仍须通过原owner检查。并发依旧只有一个所属请求，不追赶积压帧。
- 按源NativeImage身份和精确输出尺寸缓存最多两个缩放结果，合计最多8MiB。大于预算的Peek不保留缓存；clear／dispose退役全部引用。GDI bitmap／DC仍逐次创建和释放，不增加持久GDI句柄。DWM请求仍逐次响应。
- 本轮**不提高采样率**。先清除重复成本并取得真实Windows数据，再考虑默认关闭、上限约2Hz且有成本回退的单独试验；不能承诺视频帧率或显著成本可忽略。

## 单包A/B与只读统计

同一个新候选包即可比较，无须为A/B各重建一整包。两次均显式启用原native trial，并仅在新进程环境设置 `ETE_WINDOWS_PREVIEW_PROFILE=1`。A另设 `ETE_WINDOWS_PREVIEW_BASELINE=1` 恢复原重复捕获／重建／resize路径；B移除该baseline变量。普通入口依旧默认不启用native试验，环境变量不写入用户配置或系统设置。

由父协调Work时机后，使用全新隔离profile、相同内容和起始位置、相同窗口尺寸／DPI／HDR与播放状态。分别测移动画面、静止画面和暂停，先预热，再在30秒固定窗口取得起止快照，至少重复三次。先单独悬停thumbnail，再单独进入Peek，不混算两者。不得操作正在验收的旧包或传出账户／媒体数据。

显式trial的既有preload提供只读函数（本轮未在Work执行）：

```javascript
const before = await window.__etePreviewPerformance();
// 保持已约定的同一内容、窗口和预览状态，完成测量窗口后再读。
const after = await window.__etePreviewPerformance();
```

| 字段 | 实际测量边界 |
| --- | --- |
| native.stages.rpc | main服务请求至回复，含IPC／排队／helper，失败等待也计入 |
| native.stages.nativeWait | helper异步截图请求至开始复制，含分派／前置检查；不是纯GPU耗时 |
| native.stages.nativeCopy | 节点验证、内存分配及整帧复制 |
| native.stages.nativeResize / nativeEncode | 缩到160×90的采样／base64循环 |
| native.stages.decode | main base64校验／解码及BGR24→不透明BGRA |
| preview.capture.stages.nativeImage / frameCompare | NativeImage建立／已验证像素比较 |
| preview.dwm.resize.stages | resize、invalidate、完整DWM提交包装调用 |
| preview.dwm.native.stages | toBitmap、DIB建立／复制／API提交／释放 |
| preview.counters | 请求、有效帧、变化／重复、暂停／隐藏／无需求／并发／节流跳过 |
| preview.dwm.messages | thumbnail／Peek请求、成功提交、源图像变换次数，各自独立 |

统计只保留固定数量的count／total／max／p95桶上界，没有像素、媒体ID、路径或逐帧样本。无样本均值为null，不伪报零；旧helper或未启用profile时native细分阶段无样本。窗口平均阶段成本以 `(after.totalMs-before.totalMs)/(after.count-before.count)` 计算，不能将累计均值相减。请求／有效帧／提交率用相应计数差除以同一elapsedMs差；提交成功和源图像变化率仍不是屏幕实际呈现FPS。

CPU／GPU成本须另按所属main／helper进程和同一时间窗读取系统计量，不能从异步wall time或Linux解码时间推断。此轮真实Windows捕获／resize／invalidate耗时、实际FPS、CPU／GPU差值均为UNKNOWN；须由父安排采集，未抢Work前台。

## 可复现离线证据

`tools/benchmark-preview-work.cjs <source-root> <source-root>`使用同一维护源码，仅切换节省选项；不启动Electron、FFI、helper、桌面或网络。30秒模拟时间、同160×90合成画面和1200×800可见窗口，每次invalidate模拟相同十个WM请求：

| 合成场景 | 原路径 | 节省路径 |
| --- | --- | --- |
| 移动画面capture调用 | 31 | 31 |
| 移动画面resize调用 | 320 | 64 |
| 静止画面NativeImage建立 | 32 | 2 |
| 暂停capture调用 | 31 | 16 |

这些是代码工作次数，不是实机耗时、GPU收益或真实FPS；NativeImage数字包含初始中性图。工具另用真实JS解码器测本地主机160×90纯CPU解码，结果带平台／Node／源码SHA；不同机器不得据此比较Windows性能。定向覆盖重复帧后继续移动、暂停seek／需求／restore、输入Buffer别名、缓存预算／LRU／retire重入、baseline禁用与原owner／pending退出。
