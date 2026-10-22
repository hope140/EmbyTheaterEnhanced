# v0.3.16 测试版

Windows x64 **Pre-release 测试版**，请手动下载。当前正式版为 [v0.3.1](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.1)。内置更新检查读取 Stable 渠道，不会自动安装测试版。

## 本次更新

- 将已验证的独立固定组件与官方 Windows 3.0.20 Model 组合纳入本次测试发行，构建不再读取旧 Carnival 整包或综合补丁包。
- 保留 v0.3.15 的播放后退出修复。播放器功能代码沿用已验证组合，libmpv 版本和文件保持；本版不增加播放功能。

## 已知问题

此前组合测试包有有限安装、浏览、播放、退出及重开登录态保持的验收反馈；这不代表本次 0.3.16 安装包已做 GUI、实际播放或系统安装验收。云端验证范围及准确来源见[本版发行核验](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/V0316_RELEASE_VERIFICATION.md)。

音轨、字幕切换延迟按长期未再出现的使用反馈记为已解决。多显示器目标选择及显示恢复等既有限制保持。可选 Windows FFI 系统媒体试验仍未完成普通构建接线。更多内容见[已知问题](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/KNOWN_ISSUES.md)。

## 下载安装

- [Windows x64 安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.16/EmbyTheaterEnhanced-0.3.16-win-x64-setup.exe)
- [SHA-256 校验文件](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.16/EmbyTheaterEnhanced-0.3.16-win-x64-setup.exe.sha256)
- [安装包来源记录](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.16/EmbyTheaterEnhanced-0.3.16-win-x64-setup.exe.provenance.json) · [附件校验表](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.16/SHA256SUMS.txt)
- 安装程序未进行数字签名。关闭正在运行的客户端后再安装，步骤见[用户指南](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/USER_GUIDE.md)。SHA-256 用于核对下载字节，不等同于数字签名或许可认证。

## 项目说明

非官方社区维护项目，与 Emby 官方无隶属或认可关系。许可与第三方材料情况见[许可与来源说明](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/LICENSING.md)。既有未决来源、对应源码和许可事项保持未决。

[版本变更记录](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/CHANGELOG.md) · [与前一版本比较](https://github.com/hope140/EmbyTheaterEnhanced/compare/v0.3.15...v0.3.16)
