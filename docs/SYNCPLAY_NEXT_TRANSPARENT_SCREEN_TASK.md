# SyncPlay 下一集透明屏幕独立专项

2026-10-12当前状态 `CLOSED_USER_REPORTED_PASS / FIX_MERGED_MAIN`，`REAL_TOGETHER_USER_ACCEPTANCE=PASS`。用户反馈“实测了一下没问题了。”，允许将用户实际体验的Together场景从PENDING_USER_ACCEPTANCE关闭为USER_REPORTED_PASS。未报告的运行次数、媒体、硬件、全屏条件及实际客户端sourceCommit保持NOT_REPORTED；不扩大为所有组合通过。[匿名回执](evidence/v030-together-user-acceptance.json)记录用户反馈来源。

main89a0501包含PR29的Merge Commit98b0651和原31d1107修复。根因为Together1.6.0.5的PlayNow绕过本地NextTrack持帧入口；统一same-player Video替换Stop边界复用Native presentation hold。原完整783/783、独立138/138及窗口合成视觉PASS保留原来源，历史全屏合成采样仍INCONCLUSIVE。用户反馈没有改写任何机器/像素证据。本轮不改播放源码或重复实验；正式版冻结与门禁见[V030_FINAL_RELEASE_GATE](V030_FINAL_RELEASE_GATE.md)。

## 独立专项范围

先绑定两端实际版本/sourceCommit/runtime身份、主控/被控角色和触发顺序，再在独立工作区收集有界证据。不得猜测本次媒体、账号、服务器、CD2路线或发生版本，也不得把用户报告当作机器日志证据。

后续复现需区分正常自动下一集、主控手动下一集与被控本地操作。核对Item/MediaSource/PlaySession身份、控制送达和NextTrack时序、Native generation/surface归属及退出/残留；画面透明要保留用户可见证据和有限视频区域样本，不能仅以time-pos或PositionTicks前进判定呈现正常。日志和样本脱敏，不记录凭据、原始URL或私人媒体名称。

先完成定位和最小方案评审；需要播放核心、Session、Native/窗口生命周期实现时，按独立授权与项目冻结边界推进。不得借安装器整合引入焦点循环、强杀其它Electron或稳定链重写。

## 正式版前关闭标准

取得可复核复现/原因或明确的证据边界，形成独立处置结论；若实施修复，须有定向测试、独立复核和实际双端SyncPlay下一集及相邻正常场景验收。若证据不足则继续待核查，只有用户明确接受相应正式版风险才能改变处置状态。安装器用户UI验收、单端播放通过或模拟测试不能关闭该问题。

本专项工程整合、独立审查和已报告真实使用验收均已关闭。历史INCONCLUSIVE及未明确覆盖的组合继续保留各自证据边界；不再要求用户重复已经报告正常的Together场景，不另开播放研发专项。
