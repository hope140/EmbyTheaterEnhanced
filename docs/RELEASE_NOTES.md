# v0.4.4 测试版

Windows x64 **Pre-release 测试版**。可手动下载，或在“关于 Enhanced”选择测试通道后主动检查更新；下载后仍需自行退出并安装。当前正式版仍为 [v0.4.0](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.0)。

## 本次更新

- 改善再次进入详情时的布局与海报交接，减少简版内容跳变及图片短暂空白，不增加播放前等待。
- 返回首页时保留同账号、服务器与查询下可复用的驻留卡片，同时读取最新内容；页面淘汰或数据失效后正常加载。
- 补充脱敏播放诊断关联和 mpv 数字错误码，便于定位播放失败；不调整播放重试、回退或超时策略。
- 移除不再使用的包内 Anime4K shader。个人配置如引用旧包内路径需自行调整，个人 shader 与配置不会被清理。

## 已知问题

缓存不替代服务器授权、最新播放进度或真实播放数据。图片过慢或失败时仍可能显示占位；本版不承诺所有服务器与硬件组合通过。任务栏预览沿用一秒采样，不是连续视频，也不合成字幕。安装、真实播放及硬件证据边界见[本版核验](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/V044_RELEASE_VERIFICATION.md)。

## 下载安装

- [Windows x64 安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.4/EmbyTheaterEnhanced-0.4.4-win-x64-setup.exe)
- [SHA-256 校验文件](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.4/EmbyTheaterEnhanced-0.4.4-win-x64-setup.exe.sha256)
- [来源记录](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.4/EmbyTheaterEnhanced-0.4.4-win-x64-setup.exe.provenance.json)

安装器未签名。请核对同版本 SHA-256，正常退出客户端后再安装；具体步骤见[用户指南](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/USER_GUIDE.md)。应用不会自动检查或安装更新。

## 项目说明

非官方社区维护项目，与 Emby 官方无隶属或认可关系。许可与第三方材料情况见[许可与来源说明](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/LICENSING.md)。

[版本变更记录](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/CHANGELOG.md)
