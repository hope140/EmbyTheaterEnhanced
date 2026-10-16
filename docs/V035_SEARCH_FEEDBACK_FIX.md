# v0.3.5 搜索反馈修正候选

当前产品sourceCommit为`cc7f542cf12a236bba22948030b5043a8a736e08`。修正用户报告的空结果提示重复，继续0.3.5；独立目录、ZIP及空profile入口与旧候选分开，未发布。

## 根因与最小修改

默认搜索的原ListController.getEmptyListMessage/setEmptyListState已有空结果提示，并按空输入、单字符及普通无匹配情况选择文案。维护helper又在成功空响应时显示eteSearchStatus，因而同一页面出现两条。旧2c9410c真实AMD完整应用、原getRouteUrl默认入口已复现可见2条；用户原截图不复制进公开仓库。

只删除helper成功空结果分支5行。成功响应照原样交给ItemsContainer，空态由原列表统一拥有；成功时隐藏维护status，维护status仅显示请求错误。默认currentApiClient选择/身份守卫、原查询/分类/分页/返回、防抖、原生菜单及播放owner均保持。修改前定向测试失败日志与完整应用双提示回执保留。

## 新来源验证

- 搜索/菜单相关单元与固定材料定向15/15；完整材料162/162，0失败/跳过。
- 完整隐藏应用的原默认搜索路由24项通过：包括空输入不显示无匹配、普通空结果只有一条原生提示、helper空态隐藏、单字符只显示原TwoSearchCharsRequired、错误只显示一条，以及错误/恢复、快速查询/清空、分类/分页、详情返回与再次输入。
- 空结果专项390/800/1280三视口均可见1条、helperVisible=false、无页面横向溢出，已核对代表截图；非空搜索三视口也通过。
- 真实main/AMD/router/controller/原组件，合成API/空profile；show、浏览器外网、Node网络、Native启动及非预期页面错误均0。原file Cache警告保持单列。
- JS297、PowerShell28语法、348文件有限敏感信息扫描和diff-check通过。
- 2157 payload / 2158完整runtime；VerifyOnly、完整集合/逐项SHA与交付副本核对通过。独立appData/userData/config启动探针通过，生成profile已移出交付。

本次仅删除成功反馈的重复owner，未重复执行不相关的全量公开套件；新来源执行相关15项、完整162项材料、来源构建及真实完整应用验证。旧来源全量公开结果不冒充本来源结果。真实服务器、前台、真实播放/远控与系统安装仍NOT_VERIFIED。

## 交付身份

- Runtime：`dist/EmbyTheaterEnhanced-v035-search-feedback-20261016`。
- 独立目录：`dist/ETE-v0.3.5-browse-cc7f542-20261016`，入口`Start-v0.3.5.cmd`；首次登录由用户完成。
- manifest SHA-256：`9d802f6842c2286866fad1705fadfa4f120a3e6a77f41b35c46be8f61a5af111`。
- payload-set SHA-256：`bafd1015a63beac98e4972b832d4d9f91d8f6bfd90e70363e44f888bbdad82e2`。
- Helper及libmpv固定字节保持，准确哈希见随包VALIDATION.json。
- ZIP：`dist/ETE-v0.3.5-browse-cc7f542-20261016.zip`，2162文件、234473048 bytes；全部条目流回读与SHA/集合核对通过。SHA-256：`266a2ad3c855f7c0afa533a8d547660309dd759e404ffae40c2941a68e191b0c`，附同名`.sha256`。旧2c9410c、441eafb、51ae2e4及v0.3.4目录、ZIP、profile均保留。

人工检查一个没有匹配结果的关键词，确认只有一条提示；再检查单个字符、清空、正常关键词和详情返回。沿用随包测试说明核对实际服务器行为，不把合成材料当作真实服务器验收。

私有证据：`.work/empty-status-before/RESULT.json`（原生完整应用可见2条）、`empty-status-before.log`（修前单测失败）、`empty-status-targeted.log`、`empty-status-materials.log`、`search-feedback-final/RESULT.json`、`empty-status-after/RESULT.json`、`empty-status-build.log`、`empty-status-verify.log`、`FEEDBACK_PAYLOAD_AUDIT.json`及`launcher-feedback/RESULT.json`。夹具/profile/截图不进入payload或ZIP。文档HEAD与产品来源分开记录。
