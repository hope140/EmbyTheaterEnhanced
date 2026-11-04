# v0.4.13 语言偏好测试版：发布核验与候选历史

## 发布后回读（2026-11-04）

用户确认普通测试包验收通过，其源码为 `c686e189ca2ce51359270624f45b6652e4618213`。[PR #91](https://github.com/hope140/EmbyTheaterEnhanced/pull/91) 以 `715bc5af6f9be8a87c6813a0cee10f4fb3196a10` 合入 main，两提交源码树相同；`v0.4.13` Tag 指向验收源码。[PR CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41823937341)、[main CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41844044695) 与[testing 发行运行](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41846593844)均成功。发行构建从准确源码重建，2499 项为 2497 pass／0 fail／2 skip，显式材料 135/135 通过；五附件独立下载后大小、SHA-256、来源证明、校验表和原始 notes 均一致，安装器 SHA-256 为 `797dfcc9048119e6917376815308c26d964121166bd76e0148cdd5470fc25794`。安装器及对应校验文件也经匿名公开链接下载核对。[Release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.13) 为非草稿 Pre-release，正式 Latest 保持 v0.4.0。

用户验收未提供旧服务器解释、遥控操作、实际选轨与安装组合的逐项结果，不能把自动测试扩成这些现场证据。此前窗口按钮偶发无法点击的根因尚未确定，本版不声称已修复。以下范围、方法和“待授权”语句是发布前候选记录，按当时阶段阅读。

## 范围与语义

- “播放”中的首选音轨语言支持多选；“字幕”中已有的多选也支持调整顺序。两处设置页仅显示已选语言，弹窗从选择框下方展开、已选项置顶；桌面上可拖动右侧手柄，键盘聚焦手柄后用上下方向键调整。非精细指针布局保留可聚焦的上／下按钮供遥控操作。仅这两个选择框启用弹窗排序。列表顺序写入服务端用户配置的逗号分隔字符串。
- 语言代码和显示名来自当前服务器 `getCultures()`。未知代码保持可见且可调整，未修改语言时不重写服务器上取回的原值；清空选择写入空字符串。
- “播放默认音轨”“记住音轨选择”“记住字幕选择”及清除已记轨道保持原接口。记住选轨仍由服务器按媒体记录处理；本版不增加客户端选轨规则，实际轨道以服务器播放信息为准。旧服务器可能仅把逗号值当成单一语言，实际解释需连接目标版本验证。
- 与其他 Emby 客户端共用同一用户配置字段。页面保存前重新读取用户配置，因此未调整的语言字段沿用服务器的新值；同时修改同一字段时，最后一次保存仍可能覆盖前一次。

官方网页参考：[播放模板](https://app.emby.media/settings/playback.html)、[播放脚本](https://app.emby.media/settings/playback.js)、[字幕模板](https://app.emby.media/settings/subtitles.html)、[字幕脚本](https://app.emby.media/settings/subtitles.js)。2026-11-04 读取；当前网页使用 `multiple`、`data-reordering`、`data-joindelimiter=","` 和上述两个用户配置字段。进一步核对当前网页的 [ActionSheet JS](https://app.emby.media/modules/actionsheet/actionsheet.js)、[ActionSheet CSS](https://app.emby.media/modules/actionsheet/actionsheet.css) 和 [EmbySelect JS](https://app.emby.media/modules/emby-elements/emby-select/emby-select.js)，其 2026-11-04 SHA-256 分别为 `0365ee49719a5372ec84bb2c203c1ff4c989cbdc0e9cce861a40276dc8b0e761`、`0bb94c6c59942e9b108aeb8ddd90f8dec3521d7deeccf3100263f1f3bdd486ec`、`e0c5ba8e8da9afd2af7cc529d274b04f596b4f559103437b166b60711d1b46f9`。当前网页的虚拟列表有 `min(30em,70vh)` 高度上限并将弹窗放在选择框下方；用户提供的实际网页截图中约十行可见，右侧只显示手柄并与滚动条留白。

[官方公开 emby-webcomponents 仓库](https://github.com/MediaBrowser/emby-webcomponents)于 2020 年停止代码更新，历史 [GPL-2.0 LICENSE](https://github.com/MediaBrowser/emby-webcomponents/blob/93d3f89bd7d151d7bde09af6dffc0c627901831b/LICENSE.md)不能据此认定覆盖 2026 年网页资产；当前网页资产没有随文件给出可分发许可，[Emby 网站条款](https://www.emby.tv/terms.html)另限制软件复制、修改与分发。因此本候选不复制当前网页源码，仍对 ETE 冻结版控件作独立局部适配。它保留 ETE 主题、旧列表拖放及键盘操作；未启用排序的公共弹窗沿用原行为。此判断仅界定本次新增资产的来源，不替代项目既有完整许可审计。

## 验收方法

1. 在 ETE “播放”页打开语言弹窗，确认选择框仍在上方、弹层约十行且手柄与滚动条有间距。选择两种音轨语言，用手柄拖动改变顺序；离开再进入，确认顺序保留。键盘 Tab 聚焦手柄后用上下方向键排序；遥控布局用可聚焦的上／下按钮。移动后焦点应仍在当前语言可用控件上。
2. 在“字幕”页对已有多选语言做相同操作；核对清空、未知代码和重进页面的显示。再到官方网页核对同一用户的顺序，反向修改后返回 ETE 核对读取。避免同时在两个客户端修改同一字段。
3. 切换“播放默认音轨”和“记住音轨选择”，复播同一媒体；检查实际轨道、服务器记录及本次语言设置是否互不误写。字幕模式和记住字幕选择也核对一次。不同媒体可用轨道需分别记录，不能只凭设置页保存判定选轨生效。
4. 若需兼容旧服务器，用其测试账户执行相同读写和播放检查，记录服务器版本及其是否理解逗号优先序。不要在现用账户上做破坏性试验。

## 证据边界

本分支运行 Node VM 设置页回归、Web overlay 来源校验和公开源码检查。隔离 Chromium 页面加载冻结版的 ActionSheet、EmbySelect、ItemsContainer、VirtualScroller、DialogHelper、Material Icons 字体及本版补丁；在 2048×1206 视口中，语言弹窗宽度沿用 958px 选择框，显示在选择框下方，高约 437px，已选／普通行同为约 33.5px，手柄右侧至弹窗边缘约 36px。真实组件页面已操作鼠标拖放（拖至第二行下半部触发 `itemdrop`）、键盘手柄上下方向键重复排序及焦点恢复、取消选择、滚动行复用、普通多选和队列式单选弹窗。音轨与字幕共用同一弹窗扩展，页面保存分别由 VM 回归覆盖。该页面使用模拟语言数据和服务，不等于 Windows 原生窗口或真实遥控／服务端；真实页面行高随 ETE 字体比例变化，具体视觉仍待用户测试包确认。弹窗打开时原 DialogHelper 的全屏容器会接收首次外部点击并关闭弹窗，首次点击不传给背后的设置或窗口按钮；隔离复现中再次点击可触发按钮。若弹窗关闭后按钮仍失效，需要现场录屏或日志继续定位。Windows 测试包、安装包解包回比、真实服务器读回与播放按准确提交另行记录；构建通过不替代现场验收。合并 main、建 Tag、发布 testing 均待单独授权，不发布正式版。
