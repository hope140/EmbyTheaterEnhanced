# Emby Theater Enhanced v0.3.1

Windows x64 正式版。请在下方附件下载安装包，并核对随附 SHA-256；安装包未进行数字签名。

## 更新内容

- 新资源在 CD2 中首次查询确认 NOT_FOUND 时，自动有限刷新父目录并重新查询一次。
- 正常命中保持原有 1200ms 查询预算；新资源恢复总上限为 3000ms。
- 增加刷新并发保护、30 秒冷却、停止/换集取消和迟到响应保护。
- 修复反向 custom 解析顺序下可能重复查询的问题，保持现有 STRM、Mount/Native 回退、Emby Session 和远控行为。

## 使用与已知限制

六项真实 CD2 验收为 USER_REPORTED_PASS，属于用户反馈，不等同于独立机器实测。刷新失败、冷却、超时或映射不匹配仍可能无法发现资源。STRM/115 内嵌字幕和音轨切换延迟尚未修复；全屏短闪、多显示器/HDR 和完整安装生命周期仍有未覆盖范围，详见 [已知问题](https://github.com/hope140/EmbyTheaterEnhanced/blob/v0.3.1/docs/KNOWN_ISSUES.md)。

项目是非官方社区维护版本，与 Emby 无隶属或认可关系。维护层保持 GPL-2.0-only，项目及第三方许可证、版权和通知保留。已知 libmpv/FFmpeg 与 Helper 的 GPL 组合、对应源码/通知材料缺口、部分独立组件和资产来源/条款仍未解决。维护者接受风险不代表合规验证通过或第三方授权；GitHub Source code 归档不是全部第三方二进制的完整对应源码。详情见 [许可与来源说明](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/LICENSING.md)。

## 安装包身份

文件：`EmbyTheaterEnhanced-0.3.1-win-x64-setup.exe`

源码由 `v0.3.1` Tag 固定；最终 main 提交、安装包大小和 SHA-256 由实际构建产物生成，列于 Release 正文及随附 provenance、`.sha256` 和 `SHA256SUMS.txt`。
