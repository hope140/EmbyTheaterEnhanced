# 隐藏 runner 确定性记录

## 范围与身份

本轮完成测试工具修正，最终隐藏矩阵 **4 PASS / 1 FAIL，整体仍为 FAIL**。失败项暴露了固定产品的旧 PlaybackInfo 响应再次调用播放器的问题；另确认 pending Stop 缺少会话身份。两项产品问题尚未修复，不以工具或单元测试通过替代产品验收。

产品基线固定为 `v0.2.5`、sourceCommit `3ab10c94d75659c0a421b729aac3147afa680751`；harness 分支为 `codex/runner-determinism-20261009`，运行代码为 `d4a54ca`，随后 `9a71732` 仅补 Stop 专项测试。矩阵各轮13份实际执行文件的 SHA 全部相同，并与交付树读回一致；每轮分别记录 harness HEAD 和 ProductRoot sourceCommit。renderer IPC只接受精确应用窗口的 sender；产品源码、构建覆盖器、Native Helper 和 runtime 未修改。运行后核对 runtime 的 2,135 个清单条目及清单自身，共 2,136 文件，缺失、额外、哈希不符均为0。

本轮新增确定性 fixture 只为替换测试等待，不改变产品播放语义。它通过 main-owned fake CD2 request gate 让某条 resolve 保持 active，runner 以安全 arm label 等待真实进入和实际 service cancel；取消结果带回精确、经过校验的 requestId。`rapid-next` 与 `stop-before-load` 分别归属自己的 arm。等待超时或出现错误终态均返回失败；日志标记为 `UNAVAILABLE` 时也失败关闭。

首轮 `npm test` 为 561/568，7项失败来自该工作树缺少 vendor 输入；补齐后相关15项通过。随后全量 **580/580** 通过，另新增 Stop cooldown 专项 **3/3** 通过，均0失败/跳过。所有首次失败日志保留，没有修改或跳过旧测试。新测试还覆盖：缺失取消、错误请求/条目、旧 source、缺失事件、阶段卡住、总期限不能延长、超时后迟到成功、renderer 取证异常/不响应、输出管道不结束等负例。

## 两次 v0.2.5 隔离运行

| 运行 | 证据 | 观察结果 |
|---|---|---|
| 首轮 | `.work/p1-runtime-435a248dcaa940f784429fee51fa282c/electron-smoke.json`、同目录 `runner-result.json` | smoke 返回 `UI smoke timeout`；阶段顺序完成 modules、ordinary、STRM 后进入 `queue-play`，此后没有 pipeline 终态。到达 queue-play 约在整轮 25 秒 deadline 的 24,486ms。fake CD2 汇总为 resolve 2、completed 1、cancel 0、active 1。 |
| 新 profile 复验 | `.work/p1-runtime-65351075c54c40fd9375991247ef471c/electron-smoke.json`、同目录 `runner-result.json` | stages 到达 `pipeline-complete`，但 smoke 与 runner 均 `NOT_PASS`：`next.selected=false`、fake CD2 `cancelCount=1`（门槛为 2）。其余 Next 向量、generation checks、普通/STRM 控制与报告断言通过。 |

两次 runner 的 `timedOut=false` 是外层 runner 自己的期限状态；首轮的25秒是 Electron smoke 内部期限。历史外层等待为45秒，本轮才改为下文的新预算。两次 `candidateResidual=0`，没有真实服务访问；历史原始文件保留在发布工作树，上表路径相对该树。日志结构与脱敏的局部通过不改变 runner 失败状态。屏幕首帧在隐藏运行中始终 `NOT_VERIFIED`。

## 复验中的快速切集

队列标签顺序是 A、B、C。runner 发出 `nexttrack-1`，等待约 150ms，再发 `nexttrack-2`。复验记录的播放报告顺序为 A Playing / Stopped，B Playing / Stopped，C Playing / Stopped。四个相邻条件 `priorStopped`、`nextStarted`、`rapidNextSettled`、`rapidNewestLoaded` 均为 true；`selected` 检查的是最终 `manager.currentItem()` 是否仍是 B，因此值为 false。按这组记录推断，第二次 Next 已使 C 成为最后活动项；当前证据说明断言要求的 B 与快速双 Next 的最终队列位置不一致，没有显示队列动作未执行。

不能单凭这组结果认定产品缺陷或 harness 缺陷。旧单轮通过记录 `a7db978f21eb4a5baf4edf7439278f40` 不能作为关闭依据；`34d9d88d21ca4efd9bcc19e20ac1ebb3` 的初次整合因 Stop observer 取错为 null 的 native requestId 失败，修正到 `cd2RequestId` 后保留了失败负例。零延迟实验 `050a82e486ab4aac8e1f390619b22719` 触发 inputmanager 已有的 Stop 全局 1000ms cooldown；后续夹具遵守该冷却时间，没有改产品值或输入逻辑。

## fake CD2 取消门槛

复验汇总为 resolve 7、completed 6、有效 service cancel 1、active 0。generation observer 的逐 fixture 记录显示：`fixturePlay#1` 与 `fixturePlay#2` 的 resolve 都实际进入过且在 gate 处 pending，observer 没有看到这两项的 cancel IPC，二者的CD2 resolve Promise最终 fulfilled；`fixtureStop#1-play` 进入 pending，并观察到 cancel IPC，CD2 invoke Promise以取消结果 fulfilled（对应播放器play Promise以PlaybackSuperseded拒绝）。fixture label 是安全测试标签，不含媒体或用户标识。

fake service 的 `cancelCount` 只在 requestId 仍在 active map 且 `service.cancel(requestId)` 成功时递增。observer 的 `cd2CancelSent` 表示 renderer 发出 IPC，不等同于 fake service 找到 active 请求并接受取消。现有汇总缺少按 requestId 输出的 fake service cancel result，故不能把唯一一次有效 cancel 确定归给某个未被 observer 关联的 queue 请求；也不能把 `cancelCount=1` 自动解释为漏了一个产品取消。旧 fake 全局 `cancelCount >= 2` 门槛依赖“会有两条仍 active 的 resolve 被取消”这一时序假设；native generation `9001/9002` 的 overlap 发生在相应 CD2 完成之后时，就不构成 pending-CD2 cancel。新的 arm fixture 把 pending 状态和精确取消请求分别记录，后续 runner 应按 case 读取，而非用全局计数猜测归属。

## 已确认的 pending Stop 身份观察

在旧成功样本 `a7db978f21eb4a5baf4edf7439278f40` 与新样本 `34d9d88d21ca4efd9bcc19e20ac1ebb3` 中，B 的 `/Stopped` 报告曾出现在 B `/Playing` 之前；该 Stop 携带 B 的 ItemId，但 `PlaySessionId=null` 且缺少 `MediaSourceId`。后续 B/C 的 Playing/Stopped 报告字段完整。本地播放管理器 `playbackmanager.js` 的 pending Stop 路径使用临时 `streamInfo(null, null)`（记录位置约 903），随后读取待停止状态；正常 Playing/Stopped 路径在 NowPlayingItem 和媒体信息可用后生成字段（约 908、927–928、1170、1408）。

这是 fake API 接受 POST 的本地观察。fake API 不代表 Emby 对 pending Stop 报告的实际处理结果，不能据此断言它无害，也不能声称所有队列报告身份完整。它需要单独决定 pending Stop 是否应上报及其归属规则，再开展受限产品修复；本轮不改播放核心。

## 已确认的旧 PlaybackInfo 再次播放

最终 `miss-400` 的 `staleMetadataIgnored=false`。夹具仅挂起第一条 B 的 PlaybackInfo，等第二条 Next 已完成后再释放它；实际 `embedded.play` 次数随后增加，B 出现两条完整 `/Playing`，中间没有 B `/Stopped`。串行切 C 在此断言之后才开始，未计入该窗口。

固定 runtime 的 `playbackmanager.js:773–785` 把 playOptions 放到队列 item，`nextTrack:2321` 复用同一 B 的 options，`playInternal:824` 原地改写 `_etePlayRequestId`。因此第二条请求也改掉了第一请求闭包看到的 ID，旧回包在 `:1152` 通过 current-request 守卫，随后 `:1166` 再次调用 player.play。只读 VM 抽取真实函数、替换 I/O 后复现：同一 options 对象；旧 ID 从1变2；当前 sequence为2；旧请求守卫仍返回true。

这是共享 PlaybackInfo 阶段的问题，**不能限定为 CD2 miss 专属**。hit/direct 本轮门槛位于更靠后的 CD2 pending 阶段，四组通过不排除此窗口。已证明重复加载/Started；真实服务中 source、session 或播放位置是否回退仍未验证。

后续产品修复需先保证每条请求拥有独立且不可被新请求改写的身份，再定义 pending Stop 的上报及归属规则。维护入口是 `tools/patch-playbackmanager.cjs`，不是直接编辑 vendor 或当前已发布 runtime。修复后应在新来源绑定的本地候选上重新执行包含本失败项的矩阵；本轮没有执行该产品变更。

## Runner 限额与最终矩阵

新的 stage 预算为 15 秒，startup allowance 为 15 秒，总时间 90 秒，renderer 状态取证 allowance 为 750ms。runner 使用 PID-owned 120 秒硬上限、5 秒关闭收尾，以及两条输出 reader 共用的 5 秒收尾边界。所有超时/失败码固定枚举；缺失观测输出 `UNAVAILABLE` 且对应条件失败。hidden runner 不采屏，不把 `file-loaded` 或 `core-playing` 当作可见首帧。

| 场景 | 完整 runner | smoke 耗时 | 诊断校验 | 精确取消 | 进程残留 |
|---|---|---:|---|---|---:|
| CD2 hit，0ms | PASS | 11,443ms | 127条 PASS | rapid-next / stop-before-load 各1 | 0 |
| CD2 hit，400ms | PASS | 13,236ms | 128条 PASS | 两项各1 | 0 |
| CD2 hit，800ms | PASS | 15,893ms | 128条 PASS | 两项各1 | 0 |
| DirectUrl，400ms | PASS | 14,182ms | 128条 PASS | 两项各1 | 0 |
| CD2 miss，400ms | **FAIL：旧 metadata 再次调用播放器** | 9,943ms | 111条单独 PASS | 本例不使用 CD2 pending 取消门槛 | 0 |

五轮各自使用新 appData/userData，About版本与source读回、隔离标记、输出收集均通过；记录的各阶段 `document.hidden=true`。DirectUrl 请求头匹配及普通请求不泄漏专用 UA 通过。五轮均观察到前述 pending Stop 身份缺口，未隐藏该报告。诊断校验包括两类 Renderer 安全位置、native 生命周期、request关联和原始敏感标记排除，不等价于整包诊断 ZIP 验收。miss 的111条日志是在 runner FAIL 后单独校验，不改变其失败结论。

60秒合成媒体用于避免输入控制用例被自然 EOF 打断，元数据时长与文件匹配。执行示例（替换产品根目录，保持该目录 HEAD 与 runtime sourceCommit 相同）：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/test-p1-diagnostics.ps1 -RuntimeName ETE-0.2.5-3ab10c9-a-win-x64 -ProductRoot '<frozen-product-root>' -Cd2Mode hit -Cd2DelayMs 400
```

`Cd2Mode` 支持 hit/direct/miss，delay范围0–1000ms。新证据、文件哈希与各轮准确目录见 [结构化记录](evidence/runner-determinism-20261009.json)。发布时的原始 timeout/NOT_PASS 保留在 [RELEASE_025](RELEASE_025.md)。本轮没有真实 Emby/CD2、真实远控、可见首帧、HDR/多屏或系统安装验收，也没有推送、合并或重新发布。
