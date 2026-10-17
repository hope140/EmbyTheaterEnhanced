# v0.3.8 显示窄子项审查

## 来源与状态

基于产品来源`311e36690c2eff5ea014d98878d4899b0d82f587`，当前`NARROW_DESIGN_REVIEW_REQUIRED`。A及B1的已准修正与本候选分开；本文件只提交两个独立小方案，没有实施完整B2 lease。准确的独立最小diff及完整候选源码保存在本任务私有narrow-drafts目录，只做语法检查，均为`DRAFTS_NOT_APPLIED / runtimeBehavior NOT_EXECUTED`。

完整AMD修前探针在此来源重新绑定renderer raw SHA `7e2d5ce3538de9f9839ebb86980f1d6cc159979482e40b8e470d74c0c7fc65a1`，8个场景、292条trace。探针执行成功表示准确复现现状，不是候选实现通过。N2的pre-destroy current观测为夹具控制的输入；原destroy尚未读取它，不能冒称产品守卫已运行。

## N1：同adapter FPS单飞与最新目标合并

Observed：同FPS在首回包前重复发两个120请求；不同FPS在首回包前发120及60两个XHR。B1已经串行工具执行，但renderer仍有并发任务、各自稳定等待及cur回复提交。正常current请求的3000ms后unpause、Stop/Next退休后不unpause新请求的正对照保持。

候选仅修改`libmpv.js`的FPS内部工作归属及原invalidate挂接，沿用原倍率/override/fullscreen条件、AbortSignal、错误收口和成功3000ms，不动destroy、orgRefreshRate或跨实例恢复。

| 字段 / helper | 精确归属 |
| --- | --- |
| `fpsDisplayWork` | 构造器内单个可空record，只属于这个adapter；不是main全局owner |
| `work.request` | 原activePlayRequest对象，复用原isCurrentPlayRequest |
| `work.pendingFps` | 最新一个待处理FPS；被更新覆盖，不保存无限队列 |
| `work.promise` | 单次drain共享Promise；同request重复回调返回它 |
| `work.waitTimer/releaseWait` | 唯一成功稳定等待；退休clear并resolve，旧Promise能结束 |
| `retireFpsDisplayWork()` | invalidate时先移走record、清pending和等待，再沿原链abort旧request |

| 入口 / 事件 | 候选精确动作 |
| --- | --- |
| FPS入口不合资格 | 沿原条件返回已完成Promise，不发请求 |
| 同request已有work | 仅更新pendingFps并返回共享Promise |
| 首个work | 安装record，微任务启动drain；启动前同批输入可合并为最新值 |
| drain每轮 | 取走最新pending；重新核原设置/全屏/请求，沿原calc/override选目标；等于cur则不再change |
| 一个change未完成 | 不发第二个本实例change，只记录最新pending；main仍沿B1全局FIFO |
| change有效回包 | 核record及原request仍current后才提交cur；成功稳定等待仍3000ms |
| 稳定等待结束 | 仍持有原record/current才unpause；再处理最新pending。不同新目标保留其自身一次3000ms稳定等待 |
| change失败/空值 | 复用A的清资格/cur及仅current自恢复；放弃pending，不自动重试 |
| Stop/Next/新Play | 原invalidate调用retire helper；不能把renderer取消说成main物理取消。旧finally只有record仍相同才清字段 |
| drain收口 | 在async drain内部finally同步释放仍相同record，再让Promise结算；不能仅放在外层Promise.finally，避免新FPS附着到已结束的drain |

候选承诺仅是本实例任务单飞和latest合并，不提供跨renderer lease。原Play/Stop/Native/Session和恢复语义保持；B1的5秒排队期限与不确定进程隔离仍有效。没有新timeout或缓存策略。

验收应把“已发送的首目标”与“work微任务启动前合并”分别覆盖：同/不同FPS突发、处理中多次更新只保留最后目标、相同目标不重复change、每个实际成功change后3000ms、等待中Stop/Next即清所属timer、旧回复不回写新cur/不unpause、收口微任务边界的新FPS不丢失、失败/空结果清资格，以及两个adapter仍共享B1物理槽。当前待审N1为v2草案，先前外层finally草案保留但已被本候选替代；这只是设计修订，未实施产品。

## N2：恢复前已观测第三值的守卫

Observed：本实例曾从60改120；夹具可读取当前144，但现destroy仍直接发缓存原值60。相同current120的正例仍有60恢复。错误、空及timeout只说明无法观测，修前证据不将其分类为第三值。

候选只把原fire-and-forget恢复换成同文件`restoreRefreshRateIfUnchanged(expected, original, generation)`。参数在destroy原invalidate后立即捕获，expected为当时cur、original为旧org、generation为现有playGeneration；没有新增lease、持久字段、协议或main owner token。

该helper仍为fire-and-forget，内部捕获全部显示探测/恢复拒绝，保持Native销毁和Stop返回不等待显示；不改原停止fence。读current和可能的change共用调用起8000ms绝对budget，使用A现有helper，不给每一步重置。没有额外retry或新稳定延时。

| 完成 / 错误 | 候选动作与结论 |
| --- | --- |
| 新的本实例playGeneration或activePlayRequest出现 | 跳过未发出的旧恢复；只保护本实例 |
| 成功读到第三值（current != expected） | 跳过恢复，固定diagnostic `display-restore-skipped / observed-change` |
| 成功读到expected | 沿原change恢复original，扣剩余budget；不据此宣称全局持有权或恢复已获硬件确认 |
| current失败、空、0或timeout | 候选采用不发补偿写，固定unavailable诊断；保持UNKNOWN，绝不记作“已观测第三值” |
| main quarantine / 排队到期空结果 | 按不可观测处理，不能绕开B1再开工具 |
| 已发送恢复后出现新owner | 没有物理取消承诺；同一main的后续工具仍受B1顺序限制 |

“未知current时不写”是本候选明确的安全失败选择，待父审，不是已实施行为。helper没有恢复后再读确认，沿原恢复语义仍不向调用者宣告恢复成功。org仍为旧初始快照；本子项没有解决首次实际change的lease捕获或跨adapter的同值接管。读到写的TOCTOU、用户同值外部写、另一个adapter同值接管及完整app-exit恢复仍为限制。

验收矩阵包括第三值跳过、同值保留、error/empty/0/timeout无写且分开诊断、新本实例Play退休旧未发恢复、query已耗尽预算不再发change、恢复拒绝已捕获、destroy/Native返回不受这次查询阻塞。两个adapter同值接管反例仍保留，不把第三值guard当作完整lease修复。

## 允许差异与审核停点

两份候选各自只涉及`src/electronapp/plugins/libmpv.js`和必要相邻AMD测试；N1与N2可独立接受或拒绝，不能借合批扩张成完整B2状态机。当前只保存独立未应用diff、语法检查与真实修前证据；没有候选修后或真实硬件PASS。必须父审具体diff、字段/挂接和失败选择后才能改产品。
