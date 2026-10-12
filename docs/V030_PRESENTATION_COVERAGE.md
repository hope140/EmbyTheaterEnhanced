# v0.3.0 native presentation coverage

整合基线为 `c27755c`（`main@a8ba606`，集成 `31d1107→5288fb9`、`a31163b→c27755c`）。后续新增 Helper exit/rebuild 测试，并在 `68a0026` 修正非 Video 请求继承持帧的排除边界；vendor、协议与 Playback/Session 身份合同保持不变。

| Contract branch | 实际 case（文件:行） | 结果 |
| --- | --- | --- |
| 普通本地 Next/Previous，same-player replacement | `tests/native-helper-lifecycle.test.cjs:321` `next and previous retire before prepare, then stop and begin with the same presentation token` | PASS |
| PlaybackManager NextTrack/PreviousTrack entry（remote/local 共用该入口） | `tests/playbackmanager-request-session.test.cjs:1993` `real Previous and Next pending across Stop ignore response order`（2 个 response order） | PASS（manager entry；未模拟真实远控传输） |
| remote PlayNow，先取得 presentation intent 再 physical Stop | `tests/playbackmanager-request-session.test.cjs:1080`（fullscreen=false/true） | PASS |
| A→B→C rapid replacement，旧 metadata success/failure 不得接管 | `tests/playbackmanager-request-session.test.cjs:1207`（success/failure）; `tests/native-helper-lifecycle.test.cjs:386` `a stale B preparation cannot replace newer C playback` | PASS |
| 新 Play 在旧 Stop/前置 user lookup 期间接管 existing intent | `tests/playbackmanager-request-session.test.cjs:1160` `P1 C admission pending user lookup retains B hold across late B metadata settlement`; `:1332` `new public Play after Stop owns B while old Next metadata returns` | PASS |
| replacement failure / timeout / cancel / user Stop | `tests/playbackmanager-request-session.test.cjs:1260`, `:1273`; `tests/nexttrack-native-transition.test.cjs:298`, `:319`, `:402` | PASS |
| success transfers reveal to native and releases manager hold | `tests/nexttrack-native-transition.test.cjs:363` `playbackReady clears the deadline and transfers the token without cancelling it`; `tests/playbackmanager-request-session.test.cjs:1080` | PASS |
| Native Helper exit/rebuild 清理 replacement presentation state | `tests/native-helper-lifecycle.test.cjs:439` `native helper exit during replacement releases its presentation token`; `tests/native-helper-service.test.cjs:1012` `helper crash clears a pending presentation before the replacement helper prepares` | PASS（本轮新增） |
| prepare rejection fail-open 到 ordinary stop | `tests/native-helper-lifecycle.test.cjs:419` | PASS |
| B Video pending → C Audio 释放继承意图并完成 Audio 播放 | `tests/playbackmanager-request-session.test.cjs` `P1 Audio replacement clears an inherited Video intent before physical Stop` | RED→GREEN；只抓取 B 帧，C 普通 Stop，B stale 不播放 |

本轮新增 3 个实际分支，覆盖 renderer replacement 的 `bridge_error` 释放、service helper crash/rebuild 的迟到 prepare 隔离，以及 Video→Audio 重叠请求清理。四文件定向回归为 126/126；新增 case 使用 deferred/注入式 harness。真实 Together、窗口/全屏像素和真实 Helper 重建现场验收各自保留独立证据层。

验证命令：

```text
node --test --test-concurrency=2 tests/nexttrack-native-transition.test.cjs tests/native-helper-lifecycle.test.cjs tests/native-helper-service.test.cjs tests/playbackmanager-request-session.test.cjs
```

结果：`126/126 PASS`，`fail=0`，`cancelled=0`，`skipped=0`，`todo=0`。
