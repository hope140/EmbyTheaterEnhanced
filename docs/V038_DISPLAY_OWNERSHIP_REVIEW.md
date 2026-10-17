# v0.3.8 显示操作归属设计审查

## 审查状态与事实

本文件是 B 的精确候选合同，`B_DESIGN_REVIEW_REQUIRED`，尚未实施队列或 lease。A 的有界请求实现与本候选分开，来源见[范围合同](V038_SCOPE_AND_CONTRACT.md)。本候选不增加协议动作、配置、Native/IPC 或二进制。

实际固定 Web 注册链为 main `loadStartInfo` 枚举插件 → `Emby.App.start` → app.js `loadPlugin` → PluginManager 构造/按 id 注册 → PlaybackManager 的 registered/initMediaPlayer。PluginManager 仅在单个 renderer AMD 实例内去重，而且在检查 id 前已经调用构造器。main 的 dom-ready 会重新发送 StartInfo；新的 renderer 文档能构造新 adapter。Web beforeunload 只调用条件性的 onAppClose，不证明所有状态下都完成 destroy。main Native endpoint 也可能复用。因此不能把完整 AMD 夹具只 new 一次当作生产全局单实例证明。

刷新率协议安装在 main，跨 renderer 重载存活；A 中 renderer abort 只结束本地 XHR，不能取消 main 已收到的工具操作。[固定 Electron 44.4.2 ProtocolRequest 文档](https://github.com/electron/electron/blob/v44.4.2/docs/api/structures/protocol-request.md)列出 URL、referrer、initiatorOrigin、method、uploadData 和 headers，没有承诺 frame、webContentsId、AbortSignal 或取消通知；不能把 webRequest 的字段当作现有 protocol handler 字段。没有据此更换协议 API。

## B1：进程范围的物理串行候选

最小产品差异限 `main.js/registerFreshRate` 的现有闭包，不动 renderer 身份协议。所有现有 action 共用 FIFO，而非只给 change 排队；目标仍为现有固定 DISPLAY1，不声称窗口映射完成。

| 字段 | 所属与意义 |
| --- | --- |
| `pendingOwners` | main 闭包中的 FIFO，存尚未启动的原请求，不跨进程持久化 |
| `runningOwner` | 正在持有工具执行槽的记录，最多一个 |
| A 的 `owners` | 保留尚有 callback 或未确认进程退出的记录，包含 quarantine |
| 每请求 `deadline` | 接收时间加5000ms；排队、参数装配与执行全部扣减，不在获得槽时重置 |
| 每请求 `completed/exited/terminating` | 沿 A 的一次完成、进程证据和终止标志；不能合成一个 success 标志 |
| 每请求 `child` | 排队期为空；过期请求从不创建 child |

| 事件 | 动作与完成条件 | 错误 / 不能承诺的事 |
| --- | --- | --- |
| 接收合法请求 | 建立绝对 deadline，进入 FIFO，空槽且无 quarantine 才 pump | 已关闭或 quarantine 按 A 立即空结果，不无限排队 |
| 排队 deadline 到期 | 移出队列、一次空回调、清 timer，无 spawn | renderer 可降级，但没有任何显示变更成功证据 |
| 获得槽 | 再检查 deadline，剩余不足则不 spawn；否则走原固定工具 | spawn 同步异常按 A 空结果释放槽 |
| 正常 close | 先确认退出、封口与清 timer，再在 finally 中释放槽/pump，保留正常 stdout | callback 抛出可观察，但不能阻断后续已授权请求资源清理 |
| exit 先于 close | 记录进程结束；正常结果仍等 close 或原 deadline | 槽在结果封口及退出证据两者齐备后释放，避免旧 stdout 回包跨越后续工具结果 |
| 运行 deadline / 有 pid 的 error | 按 A 封口、kill、1000ms确认窗口 | 未确认退出仍占槽及 quarantine，所有新工具启动受阻 |
| 确认窗口结束仍无 exit/close | 所属等待有界结束，保留 owner/listeners；排队请求依自身 deadline完成 | 不能说物理副作用结束，不能保证迟到旧写不跨 Stop 返回 |
| 后续真实 exit/close | 清 quarantine，并释放已封口槽；只处理仍有效的队列项 | 不重放过期请求，不再次 callback |
| shutdown | 先关入口，封口/移除全部排队项，回收运行项，等待 A 有界清理 | 不把工具关闭当作显示恢复；原 Native/kernel/startup drain 保持 |

此设计在所有调用者经过原 main handler 的前提下，保证同一 main 进程不会并行执行多个刷新率工具；覆盖不同 adapter/renderer 的物理串行。它不提供跨 adapter 的逻辑 lease 或旧恢复优先级。

## B2：adapter 局部 lease 候选

以下字段只属于一次 adapter 构造，不能冒称 main 全局归属。没有跨 renderer singleton 的证明前，B2 不具备完整生产归属合同；不能只凭本地队列通过测试就整体实施或记完成。

| 字段 | 准确含义 |
| --- | --- |
| `refreshEpoch` | adapter 显示代次，begin/invalidate/terminal retirement 时单调增加 |
| `refreshTail` | 本实例显示操作完成链；每任务在入队时记录绝对总 deadline，排队也计时 |
| `pendingFps` / `fpsRun` | 一个最新待处理 FPS 与单个运行任务；相同目标合并，旧待处理目标可被较新目标覆盖 |
| `lease` | 非持久 `{originalRate,lastAppliedRate,ownerEpoch,proof}`；仅确认实际改变后才有效 |
| `proof` | `confirmed`、`unknown`、`released`；XHR 返回不是进程退出，undefined/timeout 不构造 confirmed lease |
| `displayStopPromise` | 本实例 terminal 显示清理共享 Promise，结束只表示已确认恢复、主动放弃或有界不确定 |

### 函数挂接与完成表

| 入口 | 候选最小挂接 | 完成、错误与保护 |
| --- | --- | --- |
| `invalidatePlayRequest` | 退休所属 pendingFps 与稳定等待，递增显示代次；不把已发 write 当作取消成功 | 保持原 AbortController/Native generation/Session 逻辑；已发操作仍可能存在于 main |
| `beginPlayRequest` | 沿原顺序安装新请求，标记局部显示接管意图 | 不凭新 Play 直接恢复或修改显示；与旧请求相关的后续 cur/unpause 提交失效 |
| `displaySync(request)` | 入 refreshTail；沿 A 8000ms总预算读取 list/current，执行前与 await后核对原 request/显示代次 | 新请求同实例可接管 confirmed lease；观察 current 与 lastApplied 不同则释放旧 lease；空值/异常禁本请求切率 |
| FPS | 合并到最新 pendingFps，队列执行前再选目标；第一次真实变更前读 current，记录 provisional original | lease 已存在时保留第一次 original；确认实际值确实改变才持有。旧 owner 完成仅更新物理账本，不提交新 cur/unpause |
| change 后确认 | 在同任务及总预算内读 current，确认 requested rate 与回读 | timeout/empty/quarantine记unknown且禁进一步自动切率；不重试。reference工具返回旧值不等于成功改变 |
| 成功稳定等待 | 原3000ms保持，等待绑定原请求与显示代次，退休可结束本地等待 | 只有仍为原 owner 才能按原暂停链解暂停；不新建播放生命周期 |
| `stop(false)` | 退休局部 FPS/pause工作，保留已确认 lease供原替换链的新请求接管 | 原 Native presentation/stop、实例和 Session 报告保持，不在替换之间盲恢复 |
| `stop(true)` / `destroyInternal` | 共享 displayStopPromise；旧已发操作有界结束后排恢复，恢复前重新检查代次/current | 新 owner 已出现则跳过尚未发出的旧恢复；已发恢复不能假取消，新本实例探测排其后 |
| 恢复 | 仅confirmed lease且current==lastApplied且仍持有时，沿原change恢复original，再回读确认 | 第三值释放lease保留外部设置；unknown不发补偿写。无原子CAS，查询到change间仍有TOCTOU |

每显示任务总预算候选沿 A 的8000ms，包含本地等待及其全部请求，不给每一步各重置；main各请求另有收到起5000ms及1000ms确认。当前预算不能给任意多个串行查询提供成功保证；剩余不足时必须放弃，不能靠延时/重试补齐。具体任务是否需更短子预算仍待父审。播放/Stop有界结束不等于工具一定已退出，quarantine期间只能报告不确定并阻止新工具。

## 跨实例缺口与审定选择

B1可独立闭合 main 的物理串行。B2的局部 token 无法告诉 main“该change是旧adapter恢复、较新adapter已接管”；不同实例可能对同一整数值形成不可区分的观察。现有协议没有可信实例归属或原子 compare-and-set。即使每实例恢复前都读 current，也无法证明另一个较新实例没有取得相同状态的使用权。

因此本轮推荐先审核 B1，B2继续保持设计状态；不能把 adapter 队列宣称为全局 lease。若要完整实施 B2，需要父审明确接受的跨实例归属来源，或另行确认可扩的内部合同；本执行不新增 URL owner 参数、Native命令、IPC通道、WebRequest全局拦截或新的工具。若该条件不能在冻结边界内满足，交付如实保留恢复归属缺口，不擅自删除用户已有显示同步功能。

同值外部设置、读到写之间的外部竞争、真实目标显示器、进程未确认退出后的物理副作用与 renderer 销毁后的完整 app-exit 恢复均未闭合。单元/AMD结果不替代这些证据。

## 待审核的有效用例

- B1 main FIFO：两种 action及跨调用者不重叠；首项工具结束才启动次项；队列项5000ms到期不spawn；退出前迟到stdout；callback throw后继续pump；quarantine、late exit释放、shutdown取消排队项。
- B2完整AMD：同owner同/不同FPS合并；两种回包次序；change→Stop/Next；original首次实际change前捕获；未改变不持有；第三值放弃；设置关闭但仍持有lease；同实例新owner跳过未开始恢复；unknown有界结束且不补偿写。
- 跨实例负控：在同一个 main handler 下构造两个真实AMD adapter，分别保留其独立局部字段，证明 B1 串行而局部lease无法证明全局接管；不得把这个限制用假全局token掩盖。

本文件仅具体化设计与验收。A的实际局部修正、已有测试与固定输入保持，B产品差异须下一次父审后再实施。
