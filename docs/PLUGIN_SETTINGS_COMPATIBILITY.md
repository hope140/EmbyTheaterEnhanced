# 插件设置兼容合同

本候选从 v0.3.1 的 `080d352f3ea5d00aa6e5a5233e14808b9278fc02` 开始。服务器资源只用于只读协议对照，没有复制服务器 Web/GenericUI 实现或执行插件 DLL。候选没有更改 PlaybackManager、Session、Resolver、Native Helper、Electron、认证或 IPC。

## 来源与组装

维护源码位于 `src/electronapp/enhanced/plugin-ui/`，由现有 Git blob materialization 进入 `electronapp/enhanced/plugin-ui/`。`tools/patch-plugin-settings.cjs` 对冻结 `app.js` 添加本地 GenericUI admin 路由和两个传统依赖别名，对冻结 viewmanager 添加插件导航事务，对 approuter 添加异步路由归属检查。所有锚点必须唯一；`prepare-web-overlays.cjs` 分别绑定原字节、生成器及输出 SHA-256。`build-input-contract.cjs` 继续要求生成器与 HEAD 一致。

不读取 ignored `src/electronapp/www` 来组装。vendor 原件保持只读。app 的 External Player 清理仍先执行；插件变换串联在同一受控 app overlay 内。新增 viewmanager overlay 单独记录来源；正常页面的加载逻辑保留。

## 页面与生命周期

- `/configurationpage` 保留原 controller 资源解析和 admin 权限。补齐 `responseHelper`、`emby-premierecontainer` AMD 别名。Premiere 显示复用原 registrationservices/iapManager 条件，不授予功能权限。
- `/genericui?PageId=…` 使用本地 controller/template、同一 admin 路由检查及 `currentApiClient`。没有新增远程脚本加载、Token 获取或跨来源 API。
- 插件依赖及 controller 加载阶段使用隐藏暂存节点；构造成功后才提交页面与缓存。失败只销毁所属暂存页，当前成功页保持。传统 jQuery/inline-script 插入路径保留。
- load/restore 入口先拒绝已取消信号，再为有效请求编号；已取消的旧 text 内容晚到不能反向取消新请求。AbortSignal 与 epoch 在加载、构造和提交前检查；恢复失败保持缓存可重试。已提交页面的延迟 transition 仅在它仍是 currentViewInfo 的 owner 时完成 resume，避免较新请求失败后当前页一直暂停。构造/事件重入取消时只恢复仍属当前 owner 的旧成功页。
- 路由意图在 handleRoute 开始时编号；permission 查询和 controller import 晚到不能倒序创建请求或反向取消新页。原角色判断、登录处理与 API client 保持；当前权限失败仍走原登录流程，过期回调不触发该流程。
- GenericUI 状态、命令、dialog 和通知监听器属于 controller 实例。暂停/销毁撤销监听器并使旧请求失效。渲染先在新节点完成，再在代际仍有效时替换页面；每次渲染保留一套字段监听器。
- 维护 AMD 模块使用原应用的 `modules/...` 标识引用共享模块，不能用 `../../www/modules/...` 产生同文件的第二个 AMD 身份。service locator、appsettings、connection manager 等必须复用已经初始化的原实例。
- 同一页面的 `UIPageInfoChanged` 只接受当前 API client、PageId，以及相同 ViewId 或明确的 IsPageChangeInfo。复用旧 `common/input/api` 的通知出口，该共享模块保持原字节。
- Page、Dialog、Wizard 使用现有字段编辑器和 dialog helper。窄适配补齐字段编辑器实际引用但冻结 Babel bundle 缺失的 toConsumableArray，以及静态多选控件的本地选项 provider；不替换已有 helper，也不增加网络 provider。schema 不支持的编辑器明确失败；不加载外部 DataGrid/PivotGrid 代码。

## API 与外部输入

`UI/View` 为现有 API client 的 GET，query 为 PageId、ClientLocale。`UI/Command` 为 JSON POST，字段为 PageId、CommandId、Data、ItemId、ClientLocale；Data 通常是 Object 的 JSON 字符串。PageBack 按服务器观察到的协议发送 Data=null、ItemId=null；页面按钮与键盘保存携带 PluginId。所有命令验证在合成服务中执行，真实 NAS 未调用写接口。

schema 限制深度、节点数、属性路径及数字约束，拒绝原型属性。Emby 4.10 的普通页面类型为 `RegularPage`，保留该协议值并走普通页面渲染；现有 `Page`、`Dialog`、`Wizard` 合同及未知类型拒绝保持。继承编辑器拼接的 schema 文本先转义；ItemList/RadioGroup/子菜单显示值使用独立副本，命令 Data 保留原值。按钮补齐真正 disabled 属性与确认提示，拒绝关闭的命令；子菜单及 ItemList 动作从 canonical descriptor 恢复命令字段和各自确认提示，取消确认静默结束。标题、页签和错误通过安全文本输出。页签与重定向限定为本地 GenericUI 路由。错误传播仅含静态分类/阶段，不含服务器错误正文、配置、URL 或认证字段。

responseHelper 的失败拒绝值为新建 PluginRequestError / AbortError，仅保留静态 message/code 与校验后的 HTTP status；不附带原 response、cause、headers、URL 或正文，alert/module 自身拒绝也清理为同一错误。取消不弹框。导航/router 的错误 toast 在 AMD 模块实际解析回调执行时再次核对 epoch，导航还核对 signal；过期请求不显示提示，当前有效失败仍显示静态提示。

## 验证与停点

RED/GREEN 导航材料测试执行真正 frozen viewmanager 和候选变换；公开单元测试覆盖适配协议、代际、通知、表单、Dialog/Wizard 和错误安全。隐藏 Electron fixture 只使用 loopback、独立临时 profile 与 `show:false`；真实字段编辑器/控件与必要 stub 的范围由该报告列出。以上不等同于真实三个插件的前台验收。

source-bound runtime/package 必须来自包含本候选的已提交 sourceCommit，本地提交按当前用户授权执行。工作树脏输入应被门禁拒绝；可审 patch、逐文件 hash 与实验结果不替代正式 provenance。268598b 的真实三插件前台结果为 USER_REPORTED_FAIL；实际管理员响应与完整产品 AMD/DOM 的只读 RED/GREEN 证据必须单独记录，合成 schema 不足以声明兼容。

正式产物就绪后，最少前台验收为：进入神医助手和 Madby 并切换各自页签；依次进入 Chapter API → Backup & Restore → 普通设置，再返回；确认只有当前页可见且字段/状态正常。保存、备份、恢复及其他插件业务命令需要另行明确授权。出现错误时只记录插件名称、步骤与脱敏分类，不导出 profile 或认证信息。

回滚时撤回本候选维护源码与构建变换，再从原固定 sourceCommit 重建。不要修改 vendor 或复用标识错误的实验目录；原已安装 v0.3.1 及用户 profile 均未更改。
