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
