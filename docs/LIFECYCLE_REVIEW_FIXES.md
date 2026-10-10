# Native Helper lifecycle review fixes

本轮以独立审核提交 `d875ba5b69ef75bcc6ba439182700f3fb865f70c` 为输入，按用户批准的局部 contract 实施。只修改 Native Helper service、相关离线测试/fixture 与本文档。当前已有的架构/经验文档中的“错误短路”描述属于本修正前行为；本次明确批准的 LIFE-01 contract 取代该行为。

Model Tier: Tier 1 implementation under a fixed parent-reviewed contract; Model: GPT-6; Reason: files, invariants and acceptance were fixed by the parent; Escalated: no. Native lifecycle design and final review remain with the parent.

## LIFE-01 — owned cleanup rejected 后仍释放本地资源

完整 destroy 仍同步封住 admission 并共享一个缓存 Promise。current owned cleanup 与捕获的 pending cleanup 全部 settled 后，逐项尝试移除 main listeners，再尝试销毁 surface，并清除 service 的 surface 引用。任一 listener 清理失败不会跳过剩余 listener 或 surface。

拒绝结果保持原始对象和原顺序：优先 current，再按 pending 快照顺序；本地 cleanup 的错误不覆盖 owned cleanup 原错。没有 owned cleanup 拒绝时，首个本地 cleanup 错误作为完整 destroy 的拒绝。重复调用仍取得同一 Promise，不重新 kill 或清理。

测试保留原错误对象、所有 owned exit 等待、renderer/full destroy/unregister join 和一次 kill 断言；原 `surfaceDestroyCalls=0` 按本次批准的新 contract 改为一次资源释放。补充 current 与 pending 同时拒绝、pending 反序结算、listener/surface 双失败、primary error 优先级及缓存本地失败。

实际验证（离线 Node，未运行 Electron/libmpv/runtime）：

- RED：`node --test --test-concurrency=1 tests/native-helper-service.test.cjs`，40 项，32 PASS / 8 FAIL，exit 1。失败对应尚未实现的本地资源收尾 contract。
- GREEN：`node --test --test-concurrency=1 tests/native-helper-service.test.cjs tests/native-helper-protocol.test.cjs tests/native-helper-client.test.cjs tests/native-helper-lifecycle.test.cjs tests/native-helper-diagnostics-playback.test.cjs`，66/66 PASS，exit 0，0 cancelled/skipped。
- `node --check` 两个修改 JS 文件及 `git diff --check` PASS。
- 原始日志和 exit receipt 保存在 `.work/lifecycle-fixes/life01-{red,green}.*`。

默认 production controller 的 `kill()` 拒绝可达性仍为 UNKNOWN；本次验证的是批准的拒绝边界与本地资源释放，不声明实际 libmpv 异常已实测。

## LIFE-02 — terminal helper 的 owned exit 进入完整 destroy join

本项从 LIFE-01 提交 `100e65828be23abb2cdca64f9447fc32843afabf` 建立独立分支。terminal callback 保持原通知、generation 失效、surface 隐藏和 `client=null` 顺序，再把原有 `owned.kill()` Promise 登记到同一 pending 集合；完成或拒绝后从集合移除。完整 destroy 的捕获与 allSettled join 因而覆盖尚未退出的旧 helper。没有修改 controller、renderer Endpoint、native C++、libmpv、PlaybackManager 或 identity 策略，没有新增产品 timer、retry 或强杀。

回归使用真实、未修改的 production `NativeHelperClient` 和 private inherited Node pipes；helper 是测试专用 Node 假进程，EOF 后的测试延迟模拟尚未完成的退出。关闭 parent read pipe 后先验证 transport terminal、pending request 的 exactly-once rejection 和旧 process 尚未 exited，再验证 full destroy 仍 pending；无 replacement 和已有 H2 两例分别覆盖。H2 保持 endpoint admission、获得独立 helper/generation identity，H1 旧回调不能通知或隐藏 H2。完整 join 后才移除 listeners、销毁 surface 一次。RED 失败时 finally 也等待实际假进程退出。

实际验证（离线 Node，未运行 Electron/libmpv/runtime）：

- RED：`node --test --test-concurrency=1 tests/native-helper-terminal-join.test.cjs`，0 PASS / 2 FAIL，exit 1；失败均为完整 destroy 在 H1 退出前已 settle。
- GREEN：上述两例与 LIFE-01 五份 Native suite 串行运行，68/68 PASS，exit 0，0 cancelled/skipped。
- 修改 JS/fixture 的 `node --check` 与 `git diff --check` PASS。
- 原始日志和 exit receipt 保存在 `.work/lifecycle-fixes/life02-{red,green}.*`；各例收尾验证全部 owned fake child exited，完成后进程清单未发现本夹具残留。

主线程按“违反完整退出等待 contract”将 LIFE-02 归为 P1。独立审核初始评级为 P2，理由是实际 runtime 的退出时长/最终残留影响未测得，默认 controller 已有后续退出策略；该评级差异不改变已确证的 join 缺口，也不将 Node 假进程证据提升为实际 libmpv 异常验收。

两个提交均可独立检查；LIFE-02 以 LIFE-01 为父提交。全量测试与真实 runtime/profile、真实 Emby/CD2/远控、可见画面、安装/发布验证不属于本 worker 的本轮完成声明。
