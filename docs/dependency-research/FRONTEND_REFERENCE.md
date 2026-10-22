# 前端历史参考

[返回统一索引](../DEPENDENCY_RESEARCH.md) · [来源与许可问题](ISSUES.md)。这份参考服务于以后理解页面与交互沿革；当前优先处理遗留来源与许可，不由此启动移植或新功能。

对象是官方历史Server Web和固定720份底稿，不等同于经过用户补丁及ETE overlay后的最终界面。未执行浏览器、播放器或真实服务验收；以下仅为官方说明与静态控件/事件证据。

| 所取样本窗口 | 可观察的变化 | 代码定位 | 边界 |
|---|---|---|---|
| 4.6.7→4.7.0.60 | OSD出现Info、Chapters、Cast、On Now、Guide分区；字幕设置增加背景颜色/不透明度 | videoosd/videoosd.html的videoOsdBottom-tabs；settings/subtitles.html的LabelBackgroundOpacity | 显示仍受媒体与客户端条件影响 |
| 4.7.0.60→4.7.2 | 播放设置出现关闭/显示按钮/自动跳片头选项 | settings/playback.html的selectIntroSkip与None/ShowButton/AutoSkip | 4.7.0已含部分底层接口/按钮，不能把接口存在等同于设置页已存在 |
| 4.7.2→4.7.4 | 视图设置出现Table/datagrid | modules/viewsettings/viewsettings.template.html中的value=datagrid | 未穷举中间发行，不声称4.7.4是首次版本 |
| 4.7.4→4.7.5 | 官方说明修复Web字幕过小；固定视图设置条增加safe-area偏移 | modules/htmlvideoplayer/style.css、modules/layout.css | 静态看到旧videoSubtitles规则移除，未证明全部修复因果或实际字号 |
| 4.7.5→4.7.6 | ar/he/fa可切RTL，图标/按钮使用自动镜像类 | common/globalize.js的rtlLocales/document.dir；cardbuilder/listview/viewsettings的autortl | 检查CSS.supports后启用，不保证所有环境相同 |
| 4.7.5→4.7.6 | Shift范围多选与全不选动作 | multiselect的e.shiftKey/rangeSelectionInfo；actionsheet的btnActionSheetSelectNone | 未验收鼠标、触摸和遥控的完整交互 |

官方说明：[4.7.0.60](https://github.com/MediaBrowser/Emby.Releases/releases/tag/4.7.0.60)、[4.7.2](https://github.com/MediaBrowser/Emby.Releases/releases/tag/4.7.2.0)、[4.7.5](https://github.com/MediaBrowser/Emby.Releases/releases/tag/4.7.5.0)、[4.7.6](https://github.com/MediaBrowser/Emby.Releases/releases/tag/4.7.6.0)。各标记的有无、文件大小/SHA256及样本日期均在[证据JSON](evidence/web-history-20261022.json)中。

## 不把实现差异当功能数量

- BOM、CRLF/LF仅是序列化差异，不算UI修改。byte/格式对应在索引中分列。
- ApiClient从bower_components迁至modules，以及AMD/Babel、HTTP包装和兼容判断变化，没有页面证据时不称为可见UI功能。
- AppSettings 4.7.5→4.7.6的maxStreamingBitrate短路写法变化保持设置条件与默认值，不是新设置选项。
- 发布说明称照片加载性能改善，静态文件差异不能换算为实测耗时、流畅度或硬件结论。

## 当前差异的归属层次

| 层次 | 例子 | 处理方式 |
|---|---|---|
| 官方历史网页 | 上表控件与事件；许多当前模块与4.7.6对应 | 按文件引用出处，不给整树赋同一版本/许可 |
| 明确用户增量 | ApiClient WebSocket相关变动、toast既有块删除 | 与第三方底稿分开；见[PR #67](https://github.com/hope140/EmbyTheaterEnhanced/pull/67) |
| 作者未明旧改动 | videoosd亮度/触控/倍速代码、cardbuilder隐藏文字/中文提示、AppSettings码率默认值 | 记录具体差异，不把剩余数量推成社区修改量，也不自动移植 |
| ETE维护层 | src和构建overlay | 依现有技术合同核对生成关系；本报告不替代运行界面验收 |

今后按具体模块和目标取参考：OSD/字幕设置、intro设置、表格视图、RTL与多选各有不同边界。网页主体接近4.7.6，而ApiClient更接近较晚4.7.14；不要用整包桌面版本号代替文件证据。
