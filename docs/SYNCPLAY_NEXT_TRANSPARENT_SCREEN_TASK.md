# SyncPlay 下一集透明屏幕独立专项

2026-10-12当前状态 `ROOT_CAUSE_CONFIRMED / FIX_MERGED_MAIN / WINDOWED_SYNTHETIC_VISUAL_PASS / FULLSCREEN_INCONCLUSIVE / PENDING_USER_ACCEPTANCE`。原31d1107经[PR29](https://github.com/hope140/EmbyTheaterEnhanced/pull/29)的Merge Commit98b0651进入main；原PlayNow根因及RED→GREEN/窗口ROI证据保留，本轮没有新增实验。[P1报告](P1_REMOTE_PRESENTATION.md)和[readiness](V030_STABLE_READINESS.md)保留来源，真实双端与全屏待验收状态不变。

## 独立专项范围

先绑定两端实际版本/sourceCommit/runtime身份、主控/被控角色和触发顺序，再在独立工作区收集有界证据。不得猜测本次媒体、账号、服务器、CD2路线或发生版本，也不得把用户报告当作机器日志证据。

后续复现需区分正常自动下一集、主控手动下一集与被控本地操作。核对Item/MediaSource/PlaySession身份、控制送达和NextTrack时序、Native generation/surface归属及退出/残留；画面透明要保留用户可见证据和有限视频区域样本，不能仅以time-pos或PositionTicks前进判定呈现正常。日志和样本脱敏，不记录凭据、原始URL或私人媒体名称。

先完成定位和最小方案评审；需要播放核心、Session、Native/窗口生命周期实现时，按独立授权与项目冻结边界推进。不得借安装器整合引入焦点循环、强杀其它Electron或稳定链重写。

## 正式版前关闭标准

取得可复核复现/原因或明确的证据边界，形成独立处置结论；若实施修复，须有定向测试、独立复核和实际双端SyncPlay下一集及相邻正常场景验收。若证据不足则继续待核查，只有用户明确接受相应正式版风险才能改变处置状态。安装器用户UI验收、单端播放通过或模拟测试不能关闭该问题。

Tier2整合和独立审查已完成；真实Together主控/被控仍PENDING_USER_ACCEPTANCE，安装器UI、合成消息/像素和单端runtime不关闭此项。原2026-10-11 UNKNOWN/未实现登记已被上述带来源事实更新，PR28保留安装器范围。
