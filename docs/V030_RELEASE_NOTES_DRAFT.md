# Emby Theater Enhanced v0.3.0 Release Notes 草案

正式发行说明准备入口已更新为[V030_RELEASE_NOTES](V030_RELEASE_NOTES.md)，维护者风险接受决定见[V030_MAINTAINER_RELEASE_DECISION](V030_MAINTAINER_RELEASE_DECISION.md)。下方保留原草案；许可缺口不再作为内部自动阻止准备的门禁，原事实未改写，公开发布尚未授权。

本文件供最终发行审阅；v0.3.0 Stable尚未发布，当前V030_FEATURE_FREEZE。最终工程候选和剩余发行门禁见[V030_FINAL_RELEASE_GATE](V030_FINAL_RELEASE_GATE.md)。

- 安装器提供简体中文和英文，按Windows UI语言选择默认值，保留用户后续语言选择；升级安装显示目录页并预填原位置。
- 运行中安装/卸载保护提示正常关闭客户端，升级保留个人配置与DeviceId。
- Together1.6.0.5式PlayNow与同播放器视频替换接入原生持帧边界，覆盖原先绕过本地Next/Previous的路径；快速替换、取消、失败和超时按请求归属清理。
- 修正重叠视频请求被音频替换时的持帧排除边界；补充Helper退出及重建状态清理回归。

783/783完整本地回归、126/126核心定向、138/138独立扩展审查、内部候选构建和2139文件解包回读通过。窗口合成媒体的本地/远控Next/Previous与PlayNow呈现检查通过。

用户已实际体验Together并反馈“实测了一下没问题了。”，REAL_TOGETHER_USER_ACCEPTANCE=PASS，仅限已报告场景；另确认Windows覆盖升级成功、升级后启动使用正常，USER_INSTALL_ACCEPTANCE=PASS，两项USER_REPORTED_PASS。配置/DeviceId保留等没有单独确认，卸载/重装、静默/UAC等未覆盖场景披露为质量风险；上方描述的是安装器保护设计，不宣称用户已逐项验证。全屏合成采样仍INCONCLUSIVE；未报告条件不视为覆盖。实际分发权、完整对应源码、通知和组合许可仍需闭合，最新结果见[V030_RELEASE_UNBLOCK_PLAN](V030_RELEASE_UNBLOCK_PLAN.md)。不重复中文页面、覆盖升级或Together体验。v0.3.0-stable-rc是内部工程候选，旧包身份保持，未获得Stable发行批准。
