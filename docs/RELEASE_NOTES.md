# Emby Theater Enhanced v0.3.0

Windows x64 正式版。请在下方附件下载安装包，并核对随附 SHA-256；安装包未进行数字签名。

## 更新内容

- 安装器支持简体中文和英文，参考 Windows 显示语言选择默认值；升级时显示目录页并预填原位置。
- 修复 Together PlayNow 同步切集时可能出现的透明屏。
- 改善连续媒体替换、取消、失败、视频转音频及 Helper 重建时的画面保持与状态清理。

## 使用与已知限制

用户已反馈 Together 使用、覆盖升级及升级后启动正常，安装器语言和目录页已有反馈。这些反馈未绑定这份安装器的 SHA-256，不能推定全部硬件、媒体或系统安装组合均经过验证。全屏短闪仍缺确定结论；卸载/重装、配置与 DeviceId 逐项比对、静默退出码、普通用户/UAC 和登记权限仍缺完整实测。STRM/115 内嵌字幕和音轨切换延迟尚未修复，CD2 新资源目录自动刷新尚未交付。

项目是非官方社区维护版本，与 Emby 无隶属或认可关系。维护层保持 GPL-2.0-only，项目及第三方许可证、版权和通知保留。已知 libmpv/FFmpeg 与 Helper 的 GPL 组合、对应源码/通知材料缺口、部分独立组件和资产来源/条款仍未解决。维护者接受风险不代表合规验证通过或第三方授权；GitHub Source code 归档不是全部第三方二进制的完整对应源码。详情见 [许可与来源说明](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/LICENSING.md)。

## 安装包身份

文件：`EmbyTheaterEnhanced-0.3.0-release-prepared-20e4251-win-x64-setup.exe`

源码：[`20e42511b54989550165511a7604aa1b73519ff2`](https://github.com/hope140/EmbyTheaterEnhanced/commit/20e42511b54989550165511a7604aa1b73519ff2)

SHA-256：

```text
a7eed18d97295d0fcda635ad90df1609f394553b5afc60c821877609842277f7
```

本次整理只改善公开说明正文。已有 Release 附件名称、字节、校验和与 Tag 保持；随附旧 `RELEASE_NOTES.md` 仍保留发布时的原始说明。
