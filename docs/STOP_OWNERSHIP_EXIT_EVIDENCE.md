# Stop 收尾归属与退出取证

日期：2026-10-09（UTC+8）。本轮从 `60acba55f6058789004748bde3df3a10a2348d04` 建立独立 `codex/stop-ownership-20261009`，版本保持 0.2.5。原工作树与 d480eb8 / 3ab10c9 产物保持。

## 已固定的局部 contract

PlaybackManager 的 request identity 继续决定哪个播放可以进入 metadata / player.play；被停止的 stream 对象决定旧会话的清理与 Stopped 归属，两者不能互相替代。replacement Stop 以 player 与捕获的 streamInfo 建立局部收尾记录，同一记录的物理 Stop 顺序执行，尚未开始且已过期的请求跳过。当前执行与最新请求仍分别走真实 Stop，以保留 Native presentation preparation。record 排空后领取一次清理、事件与报告；清空当前状态须满足对象身份相同，pending 状态保留清理事件但没有 Stopped 报告。

terminal Stop 仍同步失效请求，存在 replacement record 时纳入其收尾。物理 stopped 事件在 record 排空之前保持解绑，排空后使用既有 terminal handler 完成 queue、报告与 player removal。没有全局串行播放，没有更改 Item / MediaSource / PlaySession / source 替换规则。

原审核复算脚本及结果已逐字节复制到 `.work/stop-ownership/original-review/`，原件保留。它们是受控 fake Stop 的可复算证据，不证明真实客户端乱序必现。回归还要模拟真实 libmpv 的 stopped-before-Promise-resolution 顺序。

## 预定退出观测计划

本节在 runtime 观测前固定。保留原 stage/startup/total 与 outer 120 秒边界，所有运行串行、每次使用新的 appData/userData/MPV_HOME，不与构建或全量测试同时执行。

1. 原 d480eb8 runtime 使用新观测 harness，执行一次 hit 0ms 对照。
2. 新来源绑定候选执行一次五组矩阵，顺序为 miss400、hit0、hit400、hit800、direct400。
3. 共六次预定启动；没有退出复现时结束观测，历史超时原因保持 UNKNOWN。若失败，保留原目录与输入哈希，不为取得 PASS 重复同组；根据具体阶段证据决定是否需要最小修正及独立后续计划。

main 旁路仅写最多 32 条白名单阶段：结果写入前/写入返回、harness cleanup 完成、app.exit 请求/实际返回、before-quit/will-quit/quit/process-exit 观察。writer 失败不影响原退出调用，不记录 raw path/URL/stack。outer 记录精确 root PID/StartTime、固定 2 秒子进程快照、自然退出或强制清理、输出收集及最终残留。CIM CreationDate 的微秒精度只用于子进程观察匹配，root 强制清理仍要求精确 StartTime。

child 证据是固定时点的已观察进程，覆盖标为 `FIXED_2S_SNAPSHOT_NOT_EXHAUSTIVE`；缺失不能解释为该角色从未启动。零残留与自然退出分列，强制清理不改写为 PASS。正常产品关闭使用 main.js 的 before-quit/unregister/native-shutdown/app.quit 链；本轮 P1 终态继续使用原 harness app.exit，不能把它冒充正常产品关闭验收。

## 验收状态

进行中。正式测试、构建、来源绑定、六次观测及独立核心复核完成后补记实际结果。真实 Emby/CD2、真实远控、可见首帧、安装与正常产品窗口关闭另列，不由隐藏假服务结果替代。
