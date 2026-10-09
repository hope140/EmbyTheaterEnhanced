# 0.2.6 测试版发布记录

日期：2026-10-09（UTC+8）。用户明确授权将已完成的本地安装包发布到 GitHub。本次沿用准确产物，版本仍为0.2.6，不重新构建产品。

## 产物身份

- 产品sourceCommit / tag目标：`355f4e6ba434074d1cd5c17e24cd79bad0f5eb1f`。
- 本地交付文档基线：`53b488fa0a67c4508bbc770e92c6eb5efdf1a0b3`；发布文档提交与产品身份分开。
- 安装包：`EmbyTheaterEnhanced-0.2.6-test-355f4e6-win-x64-setup.exe`，175,621,807 bytes。
- SHA256：`bc878b4e929016071b8d7a41f9b281ad3118e62e8a1e469b0a5c9858718b1532`。
- 发布附件限定为该EXE及同名`.sha256`、`.provenance.json`，不上传profile、原始日志或测试媒体。

## 发布前检查

准确工作树干净，v0.2.6本地/远端tag及Release均不存在。GitHub共有7个既有Release、12个既有附件；main为`46e995ef83fca7f7a882e3dc633bdcc2d2d521c7`，Latest为v0.2.2。目标发布渠道为Pre-release，latest=false。

三份资产重新读回hash、大小、版本、sourceCommit和runtime manifest绑定均匹配。相对v0.2.5的新增tracked文本经独立隐私扫描，未发现个人绝对路径或真实凭据；测试占位、公开hash与来源URL分开识别。产品及交付提交的Git作者/提交者身份与已公开v0.2.5相同，没有改写既有提交。

此前本地验收为631/631全量、三种正常关闭和五组完整播放矩阵通过，八轮均自然exit0、无强清理、残留0；安装器完整性和2,136文件解包一致。准确原始记录见 [本地交付](LOCAL_PACKAGE_026.md) 和 [结构化证据](evidence/local-package-026-20261009.json)。本次发布不重复运行客户端或扩大验收结论。

## 发布结果

状态：准备完成，远端发布与回读结果将在完成后补记。计划先推送发布分支和精确annotated tag，建立draft并上传三个资产，核对服务端大小/digest后发布为Pre-release。

## 保留边界

原本地打包报告中的“未发布”是当时阶段的历史记录；本页单独记录后续授权发布。正常产品窗口关闭与测试内部直接app.exit分别判断，后者在早期0.2.6候选及d480eb8出现过退出停滞，根因仍UNKNOWN。

系统安装/升级/卸载、真实Emby/CD2、远控、可见首帧/连续性、HDR/多屏没有新增验收。第三方完整源码/构建材料缺口继续保留。本轮不合并main、不修改旧Release/附件，不执行系统安装。
