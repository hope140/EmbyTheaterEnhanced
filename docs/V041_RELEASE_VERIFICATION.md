# v0.4.1 测试版：准备与验收边界

## 版本和发布计划

- 计划tag：`v0.4.1`；读取远端tags时未占用，发布前父仍须复核并发变化。
- 标题：**v0.4.1 测试版**；GitHub `prerelease=true`，`make_latest=false`。
- 当前仅准备代码、内部版本及说明，不创建tag/Release、不上传附件、不修改当前正式v0.4.0、main或其历史资产。
- 根package.json、package-lock.json.version及packages[""].version为0.4.1。tools/build.ps1沿原链把该版本写到运行时electronapp/package.json和build-manifest；tools/package.ps1通过现有一致性门禁后派生installer AppVersion。固定上游模板和独立组件版本不改。
- `release_package`构建输入只控制既有标准附件准备，不决定GitHub的测试/正式或Latest状态，也不自行发布；最终包及Release仍由父协调。

## 来源和范围

九项源码来源检查点415ddf88e0f1efb90d2256ed34225af3921675c7保留：四项审查源2570c326、EWT源cb0ebf78、缩略图源66c6a32d及必要Framework预检独立增量。对应Windows/云端证据只适用于各自准确提交；最终UI和版本收尾的新SHA仍须新包来源核验。

用户对415ddf88反馈除两处固定无效下拉外其余通过。保留这个有限验收事实；未明确执行的双端EWT、多版本服务器、显示设备或安装矩阵不自动变为通过。九项原合同和真实环境观察范围见[九项验收](NINE_FIX_ACCEPTANCE.md)。

本轮追加仅为固定Native Helper的控件显隐和版本/说明：复用`enhanced-native-helper-call`的status，确认mode=native-helper且fixedNativeRenderPath=vo=gpu-next; gpu-api=d3d11时隐藏两个选择的整行（含说明）并禁用焦点。status不创建helper，stopped/starting/ready均可判定。不在能力未知、固定或已离开页面时保存两个历史键；非固定模式恢复原选择及保存，其它有效渲染/硬解等设置保持。没有改libmpv adapter、service、Native C++或实际后端，不新增其它功能。

## 本轮验证及最短复验

修前修后同一DOM属性/真实HTML控制器测试覆盖固定三状态、其他模式、历史未知值、硬件解码/范围保存、不可用查询及迟到回复。参数/服务状态矩阵验证原gpu-next/D3D11固定行为和有效属性路径不变。独立headless Chromium核对实际HTML+AMD控制器的隐藏/说明/disabled/Tab焦点及存储行为；loader、BaseView、IPC和Emby自定义控件仍含替身，不能冒称Windows设置页已复验。

准确最终SHA的计数和原始日志独立交付。本轮仍需父在新Windows包中：

1. 检查版本、来源commit、Host/Helper与完整build/VerifyOnly/安装器解包门禁；五版本字段一致，附件及校验来自本次run。
2. 不播放时打开视频设置，视频渲染与图形接口两行及原冗余说明都不出现；键盘Tab首个可达设置应为硬件解码。
3. 硬件解码、输出范围等仍能修改并保存；正常播放/退出保持，实际渲染仍固定gpu-next/D3D11。两处历史键不被删除或改为空。

无需因此重判415ddf88已获反馈的所有九项为未通过，也不将该反馈扩为所有真实环境通过。未完成新包、Windows GUI和最终附件核对前，不写本版已发布；不创建PR、合main或使用当前Work前台。
