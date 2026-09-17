# Known Issues

## 当前有效（2026-09-17）

- `CONCURRENT REMOTE NEXTTRACK = NON-BLOCKING / OUTSIDE ESTABLISHED CLIENT CONTRACT`：两个立即并发的远程 NextTrack 在 focused real run 中没有进入客户端 WebSocket dispatch，归类为 server remote-command semantics；普通单次 Remote NextTrack 已通过。本轮不改变 PlaybackManager 或服务器语义。
- `REFERENCEERROR = NON-BLOCKING FOLLOW-UP`：focused real run 每次记录 2 个 renderer `ReferenceError` event，但没有伴随 unhandled rejection、bridge error、helper crash、Electron crash 或播放副作用；保留后续补充 message/stack evidence。
- ordinary real media 当前为 `N/A — ENVIRONMENTALLY UNAVAILABLE`；Formal ordinary pipeline 和 STRM real lifecycle evidence 分开记录，不把合成媒体当作真实 ordinary library evidence。
- installer install/run、HDR、真实 mixed-DPI 仍是独立 deferred coverage，不属于 Pepper retirement blocker。

## Retirement boundary

- `Pepper / PPAPI bridge = RETIRED`。
- `Native Helper = ONLY production bridge`。
- `ETE_MPV_BRIDGE_MODE=pepper` 只得到 deterministic `legacy-mode-removed`，不会重新启用旧 bridge。
- `.work/stop-barrier-candidate.patch` 保持未应用、未删除。SHA256：`7BF1F8E53D8BA63717A9CFB44F0D53E46EAE1600E34C4D8F100D3B0153333931`。

历史 Pepper readiness diagnosis、listener race 与旧 direct probe 仍可在历史日志或 git history 中检索，但不代表当前产品入口、runtime payload 或 acceptance gate。
