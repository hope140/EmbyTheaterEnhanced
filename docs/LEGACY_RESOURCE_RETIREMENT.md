# 15 项旧资源用途与发布选择

Current v2 update: all fifteen reviewed old bodies are now removed from the current tree, not merely omitted from runtime. New active counts are39/2/718; original manifests/hashes and necessary declarations remain. The two maintained replacements retain the approved values/text scope. [Exact migration and evidence](SNAPSHOT_V2_MIGRATION.md). Statements below about bodies remaining or migration awaiting approval describe the earlier retirement-only stage.


本候选从 `main` 的 `6fee412ad68934d0194303916cfe346e6254a228` 独立开展，处理初始十四项及后来明确追加的一张旧启动 logo。13 项不再进入**新构建的 runtime/安装包**，2 项功能保留并由维护层生成；profile 中实际生效的 CEC 标记继续独立创建。没有修改产品版本、v0.3.16 发行源码、Tag、Release 或附件；没有合并 main。ApiClient/toast 自有补丁另行维护。

初期按只读快照规则仅做发布剥离；随后明确批准新快照迁移，现已将这十五个旧正文移出当前 tree。v1 的精确 manifest/hash 及旧 Git/tag 保留，活动 v2 严格校验其余资源与两个维护输出。用途退役和正文移除都不构成全部来源/许可已解决的证据。

## 逐项决定

前九项路径相对 `vendor/compatibility-resources/snapshot-v1/`，第十至十三项相对 `vendor/small-runtime/snapshot-v1/`，最后两项相对 `vendor/web-snapshot/`。

| 项目 | 新发布包选择 | 已核对的用途与理由 |
| --- | --- | --- |
| `external/Anime4K/Anime4K-off.conf` | 删除 | 旧 Ctrl+0/反引号切换所用替换文件；现有 `onLoaded` 已退役这些快捷键与全局 mpv 文件重命名，回归仍验证不注册、不改配置。文件本身含启用的 shader 行，不能因文件名假定它会关闭滤镜。正常启动和 Native Helper 不读取此包内备用文件。保留现有全部 39 份 shader；快照中没有另附 Anime4K.conf 或 input.conf，不扩展清理范围。 |
| `external/emby.disable/www/modules/layout.css` | 删除 | 仅供旧 BAT 的“禁用背景模糊”操作覆盖正式布局；不是浏览器加载的实际 layout.css。覆盖会抹去当前受哈希管理的布局修正。 |
| `external/emby.disable/www/modules/themes/darkgradient/theme.css` | 删除 | 同一手工主题覆盖组；实际 Web 主题仍由原模块加载，保持原字节。 |
| `external/emby.enable/www/modules/layout.css` | 删除 | 仅供旧 BAT 的“启用背景模糊”操作覆盖正式布局；不属于当前主题选择或 CSS 定制入口。 |
| `external/emby.enable/www/modules/themes/darkgradient/theme.css` | 删除 | 同一手工覆盖组；删除备用副本不删除实际主题。 |
| `external/Presets/fonts/Source Han Serif SC-Bold.ttf` | 删除 | Emby.Dialog.bat 会把字体复制到 `%APPDATA%/mpv/fonts`，配合旧预设中的 `sub-font` 使用。没有当前安装、菜单或启动接线指向包内字体。此次明确退役这套全局预设附送流程；不删除用户已安装的字体，不替换当前字幕设置。 |
| `Emby.ConfigureAndUninstall.bat` | 删除 | 有可手工双击的旧配置/卸载菜单，并非无用途文件。但它按旧 Emby Theater 目录、进程名及全局 mpv 路径工作；包括强制结束同名进程、整份 CSS 覆盖、SVP 环境变量/弹幕配置、账户及缓存删除、Everyone ACL 和旧卸载操作。当前 ETE 启动与 Inno 快捷方式不调用它，官方 Host 参考启动链也不调用它。退役不受当前安装/用户数据归属合同管理的旧手工入口。 |
| `Emby.Dialog.bat` | 删除 | 旧安装后修复/提示脚本，会提升权限、复制全局字体及预设、结束进程并改旧目录 ACL。当前 Inno 的 Files/Icons/Run/Code、启动器和 main 不调用它；不作为当前安装后入口保留。 |
| `external/Presets/mpv.conf` | 删除 | 由旧 Dialog BAT 手工覆盖全局 mpv 配置，指定字体、IPC pipe、hwdec 与 Anime4K include。不是 ETE 随包 system.xml，也不在 Native Helper 初始化选项中指定；移除其附送副本，不修改 libmpv 的配置发现行为或用户已有文件。 |
| `config/system.xml` | 保留 | `tools/Start-Enhanced.ps1` 与 `src/electronapp/enhanced/bootstrap.js` 在用户 profile 缺配置时复制的种子。维护的 JSON→XML 保留五个字段/默认值和首次复制/已有值不覆盖合同；格式/说明变化见[维护合同](MAINTAINED_SMALL_RUNTIME.md)。 |
| `electronapp/plugins/mpvplayer/strings/zh-CN.json` | 保留 | `src/electronapp/plugins/libmpv.js` 的 `getTranslations` 显式映射 zh-CN。保持加载路径与 37 keys，维护层仅覆盖十三项已选择文字，其余二十四项原文保留。 |
| `cec-driver/cancel`（0 bytes） | 删除包内副本 | 复核固定 Host IL 后区分路径：读取的是 ProgramDataPath/cec-driver/cancel；ETE 的 ProgramDataPath 指向用户 profile。bootstrap 在 profile 独立新建标记，从不复制包内副本。因此包内文件没有当前消费路径；profile 中真实有安装抑制语义的标记和创建/保留逻辑不改。详见下方时序与验收限制。 |
| `注意事项.txt` | 删除 | UTF-16 旧用户说明指向已退役的外部播放器、旧配置/卸载菜单和权限修复，显卡建议也混用不适用于当前固定 Native 渲染路径的选项。没有当前运行读取者。原文包含旧使用限制；其原文同时保留在随包 SMALL_RUNTIME_INPUT.md 的历史声明记录中，旧 Git 原文及历史 manifest 保留。仅剥离过时操作说明文件，不删除声明记录。 |
| `www/modules/CustomCssJS.js` | 删除可选集成 | 退役前可在 Electron 登录后消费服务端插件的 forced_on CSS，并非所有桌面场景都不可执行。本候选按明确退役范围删除本地注册、运行包模块及专属禁 JS 生成器；普通 CSS、主题和原生 Branding/Css 既有逻辑保持。旧 Git 中的脚本身份及已查明的上游/GPL 记录保留。 |

| `www/modules/themes/logo.png` | 删除旧启动图 | 旧通用 index 的唯一字面引用已由固定 startup overlay 改为现有 ETE startup.svg；PR70 对 398 份 JS 的解码字符串、常量拼接和动态候选评估也未找到其他消费者。本候选仅剥离旧 PNG，不动标题/屏保图；原 index/PNG 仍作为冻结输入保存。尺寸、透明背景、动态主题及最终目标检查见下方。 |

这里区分了“还有历史手工用途”和“当前受支持功能”。两份 BAT 及其配套资源作为一组旧手工工具退役，不能把这一变化描述为原来完全没有功能。新包不再附送背景模糊覆盖工具、全局字体/播放器预设和旧清账户/权限修复工具；该可选插件的 CSS/JS 配置消费不再提供；普通 CSS、主题、播放器字幕选择与 Native 播放链保持，不读取或删除旧 localStorage。

## 入口与依赖核对

核对了基础组件装配、prepare/build/package/provenance、Inno 的安装/快捷方式/安装后启动/卸载 guard、Start-Enhanced、bootstrap、main、播放器翻译注册、Web app 插件注册、CustomCssJS overlay，以及两份 BAT 的完整手工菜单和复制目标。没有执行 BAT、安装字体/预设、应用 ACL、清用户数据或启动真实 Host。

Host 参考仅使用仓库既有固定引用 [708fadc](https://github.com/MediaBrowser/emby-theater-windows/tree/708fadc068cbf66ced6aece4a32f3e12bb2c4e13)：[ElectronApp.StartProcess](https://github.com/MediaBrowser/emby-theater-windows/blob/708fadc068cbf66ced6aece4a32f3e12bb2c4e13/Emby.Theater/App/ElectronApp.cs) 直接启动 electron 并传入 app/data/CEC/mpv 路径；[Program.InstallCecDriver](https://github.com/MediaBrowser/emby-theater-windows/blob/708fadc068cbf66ced6aece4a32f3e12bb2c4e13/Emby.Theater/Program.cs) 根据 cancel 的存在性返回。对当前固定 ZIP/Host 做已有 manifest 哈希检查及只读字符串核对。参考代码不等于已证明 Host 的完整源码重建关系；没有为这 14 项追加来源调查。

`index.html` 的隐藏 Carnival 标记保持。CustomCssJS 的 MainActivity 分支只在旧 Git 原文中保留，随整个可选模块退出新 runtime；没有修改其它 Android/远程播放模块。remoteaudio/remotevideo、Model、ApiClient/toast、native/ 及用户数据路径均不改；src/ 仅新增已确认的配置和本地化维护数据。

## 装配、哈希与通知

原兼容48项与小组件4项的 manifest 原字节、每项记录及 treeSha256 保留并校验，不再要求旧正文存在。v2 按明确差值校验39项兼容资源和两个维护输出；活动输入不得缺失、篡改或夹入额外文件。输出只选 39 项兼容资源、2 项小资源和 718 项 Web 基底资源；组件运行时验证及最终 runtime 排除合同拒绝被重新放回的旧文件。plan、装配结果与 source-provenance 同时记录完整输入身份、实际 runtime 数量/字节/树哈希及排除项，避免用输入数量冒充实际分发数量。

| 组件 | 新 runtime 文件/字节 | 新 runtime tree SHA256 |
| --- | --- | --- |
| compatibility-resources | 39 / 2,391,214 | `ca74d8b1bddeacc8f8e5a271ac75ad43301328f0e81be8cb350ea84110ca9ea4` |
| small-runtime | 2 / 3,330 | `7d3ee238ca2be25533b2e28d31e64ba0c179c5a064ed7091b00c71557120ced2` |
| web-snapshot 基底 | 718 / 21,972,087 | `b26cd795b6542cae6a5dc73d85736877a0bd2b8d7ac4baa51413a85dbfcb2168` |

根 LICENSE、THIRD_PARTY_NOTICES、SOURCE_MATERIALS、LICENSING、Adobe/OFL 记录及剩余 shader 内嵌 MIT 头保持；原始 notice 文本仍存档。字体退出 runtime 不代表源码存档中的字体许可事实被消除。其它仍分发的 Web、翻译、配置、shader、libmpv、Host 等材料仍按各自现有合同和未闭合项记录，不宣布“所有遗留来源/许可已解决”。

发布资源集合少 13 个文件。同一生产变换下退役业务 payload 减少 26,968,863 bytes：此前十一项 26,963,353 bytes，加上原 CustomCssJS 生成模块 5,455 bytes 及 app.js 注册行 55 bytes；随后默认 XML 增加 102 bytes、选定译文减少 606 bytes，再剥离旧启动 PNG 的 32,892 bytes 后，合计业务 payload 净减少 27,002,259 bytes；来源/provenance/通知文件的变动另计。Web 基底少复制的是原始 4,548 bytes，不能将它当作旧生成模块大小。未声称最终安装器压缩体积，十五个旧正文现已退出当前 Git tree，仍使用的历史资源和必要声明保留，不能把有限范围移除称作源码全部清空。旧安装目录没有新增迁移删除逻辑；用户 storage 和 profile CEC 标记均保持。

## 复验方法与证据边界

```sh
node --test tests/legacy-resource-retirement.test.cjs tests/compatibility-resources-input.test.cjs tests/small-runtime-input.test.cjs tests/runtime-base-assembly.test.cjs tests/pepper-retirement.test.cjs
node --test tests/app-bootstrap.test.cjs tests/custom-css-js-retirement.test.cjs tests/anime4k-shortcut-retirement.test.cjs
node --test tests/runtime-provenance.test.cjs tests/build-input-audit.test.cjs tests/build-input-contract.test.cjs
node --test tests/runtime-base-material-selftest.cjs tests/windows-host-material-selftest.cjs tests/custom-css-js-material-selftest.cjs
```

真实材料回归独立按未改写的组件 manifest 加上显式批准的十三项差值构造参考侧；精确比较 809 个基础文件、924 个共同生产变换后的中间文件。不能额外忽略任何文件或改变预期 hash 来放过缺失。归档 CustomCssJS 输入 SHA 保持；旧运行输出退出合同，app.js 仅删除固定注册行。测试不是 Windows GUI、安装升级、真实 Emby/CD2、音视频设备或最终安装器验收；后者须在审阅分支上另行取得，不能沿用 v0.3.16 已构建产物的结果。

追加 logo 前十二项退役阶段的 Linux 公共集为 1351 项：1341 pass、0 fail、10 个 Windows 平台 skip；其排除的六个材料依赖文件另测 84/84、0 skip，三项真实材料回归 3/3。默认配置维护方案和十三项译文现已进入维护层，精确范围和回归见[维护合同](MAINTAINED_SMALL_RUNTIME.md)。完整安装包按后续整合节奏统一构建，本轮未触发。

初版十项剥离阶段的 Linux 实测：针对性装配/接线/安全门禁 105/105，来源与 runtime-provenance 4/4；公共 runner 1361 项中 1351 pass、0 fail、10 个明确 Windows 平台 skip。JS/PowerShell 语法、有限凭据模式及差异空白检查通过。来源夹具首轮有 4 个失败，因为整树复制仍放入已退役 notice；修正夹具使用生产排除阶段后单独复验 4/4，不将首轮记为绿。

初版提交后补充：原公共 runner 显式排除的六个材料依赖测试文件已独立运行，84/84 通过、0 skip；含 Host 的三项真实材料验证 3/3 通过、0 skip。基础输出的完整路径/大小/SHA256 与原始清单减十项后的集合相同。该历史结果仍不是完整 Windows 安装器或应用验收。CEC 复核后的十一项选择另以 19/19 聚焦回归及 28/28 材料/装配/provenance 回归验证，基础/中间集合为 811/926。


## CEC 与桌面 CustomCssJS 复核

包内标记与 profile 标记是不同文件。现用固定官方 Host 为 202,240 bytes，SHA256 `11abf75c8f77ddb0078e7dd62a2eaae60dba244c113bc7893a7e56bc6527163e`。本轮只读解析其 PE/CLI 元数据及 IL，没有加载或执行产品程序集：`Program.GetProgramDataPath` 读取 exe.config 的 ProgramDataPath 并展开 ApplicationData；`<InstallCecDriver>d__20.MoveNext` 在 IL `0x27` 调用 `IApplicationPaths.get_ProgramDataPath`，随后拼接 cec-driver、cancel，并在 `0x59` 调用 File.Exists。存在则直接退出检查；取消对话框分支的 File.Create 也写同一路径。没有发现读取或移除包内根目录标记的路径。生产 configOutput 固定该设置为 `%ApplicationData%\EmbyTheaterEnhanced`；bootstrap 使用 `app.getPath('appData')/EmbyTheaterEnhanced` 独立排他创建标记，并保留已有内容。

Host 的 RunApplication 在 `0x85` 构造 ElectronApp、等待 appHost.Init，然后在 `0xb6` 调用 InstallCecDriver；它没有显式等待 Electron main bootstrap 创建标记的握手。因此不能仅凭静态顺序宣称直接 Host 首启没有创建时序窗口。Start-Enhanced 会在启动 Host 前创建 profile 标记，但当前安装器快捷方式直接运行 exe，不使用该脚本。本候选不改变这套时序；包内副本原本也不参与该 profile 路径。没有运行 Host、CEC 工具或驱动，没有取得真实首启/设备验收。

不能把 CEC cancel 解释为功能开关：Host 安装检查仍会调用，没有“默认关闭 CEC 就不检查”的配置分支；当前 renderer 的 CEC 插件构造时请求 electroncec://start，HDMI port 设置只是端口选择，和驱动安装标记不同。profile 标记的安全语义保留，删除仅针对无消费者的包内副本。

CustomCssJS 的实际执行路径为 app.js 的 loadPlugin → 当前 pluginmanager.loadPlugin 的 new pluginFactory → events.on(connectionManager, localusersignedin) → 已设置的 ApiClient 请求 CustomCssJS/Scripts → 按 state/既存 localStorage 选择内容 → style.innerHTML/appendChild。MainActivity 仅位于 reload 分支，首次 CSS 加载不依赖它。事件由当前 connectionmanager 的登录完成路径触发，ApiClient 在 app.js 的 onLocalUserSignedIn 中设置。

当前 ETE 源码/快照里没有供用户编辑 customcssLocal、customcssLocalConfig 或 customcssServerConfig_* 的独立客户端设置页；模块只会初始化空值并读取既存值。服务端插件若返回 forced_on 项，不需要客户端选择即可注入；普通 on 项只有对应 serverId 的已有选择才能注入。本地预存 CSS 不会在接口 404/失败时单独离线加载。未读取用户 localStorage 或连接真实服务器，因此实际用户是否安装该服务端插件、是否保存选择均未知。

它也不能等同于内置 Branding/Css：app.js 在支持 multiserver 时跳过该通用 CSS 请求，而 ETE apphost 显式支持 multiserver。dashboard/settings 的 txtCustomCss 编辑的是服务端 branding 配置，和 CustomCssJS 的列表及选择键不同；ETE 固定布局 overlay 则不提供任意服务端/本地 CSS 选择的等效功能。

退役前的隔离回归证明这些分支在指定合成响应下可执行，不能据此声称界面/真实服务通过。当前改用最终 app.js 的真实主界面插件加载阶段做退役回归：接口可用/不可用时均不再请求 CustomCssJS、不加载其模块，其他播放/图片/确认播放插件、标题区和普通 CSS 依赖仍能继续。原仅针对专属禁 JS 生成器的测试随退役实现移除，新增严格缺失/重复/未知注册拒绝、模块缺席、输入仍必需和完整字节对照；没有以放宽缺失检查通过测试。


## 明确退役与上游来源证据

这次移除的是可选第三方集成，不是发现所有场景都没有执行路径。旧模块必须取得 CustomCssJS/Scripts 的有效配置后才调用 getCustom/loadCode；首次接口失败不会独立读取并应用 local CSS。主界面不应再为这个已退役功能发起请求。保留普通 CSS/主题与原生 Branding/Css 的原有代码，不新增或改变它们在 multiserver 模式下的条件，不删除保存的配置。Carnival 隐藏标记仍保持，未扩大到 Android 或其它模块。

上游为 [Shurelol/Emby.CustomCssJS](https://github.com/Shurelol/Emby.CustomCssJS/tree/6933b58c62f98b0919977e953f068b1a581a7a1c)，核对 commit `6933b58c62f98b0919977e953f068b1a581a7a1c`；工程声明 AssemblyVersion/FileVersion `1.0.0.2`。其 [CustomCssJS.js](https://github.com/Shurelol/Emby.CustomCssJS/blob/6933b58c62f98b0919977e953f068b1a581a7a1c/Emby.CustomCssJS/CustomCssJS.js) 为 4,416 bytes，SHA256 `3eaec19e8a27ef2894d262d2b8569bb6b1275baca249b1457f6679474c856009`。包内冻结原文为 4,548 bytes，SHA256 `2177de28dcc4e715f07c63329dc361c5b4ddd37eb7e59f273830b22acea37912`；仅 CRLF 转 LF 后与上游逐字节一致。相同文本亦见 [0fee38fa（2023-06-14）](https://github.com/Shurelol/Emby.CustomCssJS/blob/0fee38fae55a5458bfa1ae05b5af475277ae0915/src/CustomCssJS.js)。这证明对应文本，不声称核实了整个旧安装包的传递来源。

[安装说明](https://github.com/Shurelol/Emby.CustomCssJS/blob/6933b58c62f98b0919977e953f068b1a581a7a1c/src/README.md) 区分服务端网页与桌面客户端；[服务端入口](https://github.com/Shurelol/Emby.CustomCssJS/blob/6933b58c62f98b0919977e953f068b1a581a7a1c/Emby.CustomCssJS/CustomCssJSPluginEntryPoint.cs) 在服务器 ApplicationResourcesPath/dashboard-ui 创建模块，并在能找到锚点时注入 app.js。它不修改 ETE 固定本地网页；桌面需要自己的加载器。自动注入在 [5bc4d52f（2024-10-15）](https://github.com/Shurelol/Emby.CustomCssJS/commit/5bc4d52f52e57f6ce34e216b335b42d8a0e57b53) 引入。

[接口](https://github.com/Shurelol/Emby.CustomCssJS/blob/6933b58c62f98b0919977e953f068b1a581a7a1c/Emby.CustomCssJS/Api/CustomCssJSApi.cs) 是有认证/feature 条件的 GET CustomCssJS/Scripts；[前端](https://github.com/Shurelol/Emby.CustomCssJS/blob/6933b58c62f98b0919977e953f068b1a581a7a1c/Emby.CustomCssJS/CustomCssJS.js) 选择 forced_on 或已选 on 项，读取 customcssServerConfig_${serverId}、customcssLocalConfig、customcssLocal 等 localStorage 键。这与服务器原生 Branding/Css 不同，网页端 storage 也不会自动成为 ETE 本地网页的 storage。没有读取实际服务器或个人 storage。

上游 [LICENSE](https://github.com/Shurelol/Emby.CustomCssJS/blob/6933b58c62f98b0919977e953f068b1a581a7a1c/LICENSE) 为 GPLv3 文本；完整原文保存在 [来源记录](redistribution-notices/web/Emby-CustomCssJS-GPL-3.0.txt)，SHA256 `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`。原输入已移出当前 tree，仍保留其历史来源/许可材料与旧 Git 身份；不能将有限移除写成旧分发已解决或整个项目的许可结论。

当前已实施兼容39、小组件2、Web718的 v2 活动选择；旧 manifest/hash、必要声明和旧 Git/tag 保留。Web app/index 的两个必要引用已在活动输入中清理，最终生成身份保持；不重写历史或修改 v0.3.16。详见[完整迁移合同](SNAPSHOT_V2_MIGRATION.md)。


## 追加旧启动 PNG 的最小退役

旧图为 32,892 bytes、1238×377 RGBA PNG，SHA256 `624aa2425d6bee862fd5469e191a2dad928931425e45ee31d006d6e71906c064`，本地只读解码确认实际 alpha 范围 0–255。沿用 [PR70 的来源/引用评估](https://github.com/hope140/EmbyTheaterEnhanced/pull/70)，不重新追溯其它图片。固定输入的 JS/CSS/HTML/JSON 复核只在原 index 找到此文件名字面引用；skinmanager 的动态主题路径指向 theme.json/theme.css。

生产 main 的本地入口为 www/index.html；正常构建强制走固定 index overlay，并按既有合同替换到 ../enhanced/startup.svg。现有 SVG viewBox 同为 1238×377，其嵌入 PNG 保留透明度；原 contain、居中、80%/560px 上限与20%高度规则保持，没有新增图像或改样式。冷启动、同一入口的重载和登录/主题页面的静态引用检查未发现另一个消费者；这不是实际 GUI/登录/重载验收。

隔离真实 Web 装配/overlay 验证旧图缺席、生成 index 不再引用旧路径、自有 SVG 目标存在，逐项保留其余资源。明暗标题图、屏保自己的 logowhite.png（SHA256 `1bb70b932f1055b7f0fb5c7423539c4a7824126623ac725e1101c9691e6dc113`）、splash.html 和媒体 Logo API 不改。单独的预变换基底是中间材料，不是可启动产品；最终 overlay 失败会拒绝构建，不能拿未变换原 index 配上被删除的旧图发布。

原 PNG 已退出当前 tree，活动 index 已使用既有 ETE SVG；原有署名观察、来源边界、历史 manifest/hash/声明和旧 commit/tag 继续保留。Web v2 活动集合为718项，没有把旧 PNG 复制到另一活动目录。
