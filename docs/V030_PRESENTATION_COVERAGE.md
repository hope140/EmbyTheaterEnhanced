# v0.3.0 native presentation coverage

候选基线为 `c27755c`（`main@a8ba606`，集成 `31d1107→5288fb9`、`a31163b→c27755c`）。本轮只补测试缺口，不修改生产代码、vendor、协议或 Playback/Session contract。

| Contract branch | 实际 case（文件:行） | 结果 |
| --- | --- | --- |
| 普通本地 Next/Previous，same-player replacement | `tests/native-helper-lifecycle.test.cjs:321` `next and previous retire before prepare, then stop and begin with the same presentation token` | PASS |
| PlaybackManager NextTrack/PreviousTrack entry（remote/local 共用该入口） | `tests/playbackmanager-request-session.test.cjs:1964` `real Previous and Next pending across Stop ignore response order`（2 个 response order） | PASS（manager entry；未模拟真实远控传输） |
| remote PlayNow，先取得 presentation intent 再 physical Stop | `tests/playbackmanager-request-session.test.cjs:1080`（fullscreen=false/true） | PASS |
| A→B→C rapid replacement，旧 metadata success/failure 不得接管 | `tests/playbackmanager-request-session.test.cjs:1207`（success/failure）; `tests/native-helper-lifecycle.test.cjs:386` `a stale B preparation cannot replace newer C playback` | PASS |
| 新 Play 在旧 Stop/前置 user lookup 期间接管 existing intent | `tests/playbackmanager-request-session.test.cjs:1160` `P1 C admission pending user lookup retains B hold across late B metadata settlement`; `:1303` `new public Play after Stop owns B while old Next metadata returns` | PASS |
| replacement failure / timeout / cancel / user Stop | `tests/playbackmanager-request-session.test.cjs:1231`, `:1244`; `tests/nexttrack-native-transition.test.cjs:298`, `:319`, `:402` | PASS |
| success transfers reveal to native and releases manager hold | `tests/nexttrack-native-transition.test.cjs:363` `playbackReady clears the deadline and transfers the token without cancelling it`; `tests/playbackmanager-request-session.test.cjs:1080` | PASS |
| Native Helper exit during replacement首帧等待清理 token | `tests/native-helper-lifecycle.test.cjs:439` `native helper exit during replacement releases its presentation token` | PASS（本轮新增） |
| prepare rejection fail-open 到 ordinary stop | `tests/native-helper-lifecycle.test.cjs:419` | PASS |

本轮新增 1 个实际分支，测试总数由 83 增至 84。新增 case 使用 deferred/注入式 harness 行为抑制 `core-playing`，由 `bridge_error` 模拟 helper exit，验证 `NativeHelperError`、对应 `cancelPresentation` 和后续 destroy；未宣称真实 Emby、真实远控传输、真实窗口/全屏像素或 helper rebuild 的现场验收。

验证命令：

```text
node --test --test-concurrency=2 tests/nexttrack-native-transition.test.cjs tests/native-helper-lifecycle.test.cjs tests/playbackmanager-request-session.test.cjs
```

结果：`84/84 PASS`，`fail=0`，`cancelled=0`，`skipped=0`，`todo=0`。
