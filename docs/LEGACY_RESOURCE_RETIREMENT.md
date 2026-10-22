# 14 项旧资源用途与发布选择

本候选从 `main` 的 `6fee412ad68934d0194303916cfe346e6254a228` 独立开展，仅处理下表资源。10 项不再进入**新构建的 runtime/安装包**，4 项保留。没有修改产品版本、v0.3.16 发行源码、Tag、Release 或附件；没有合并 main。ApiClient/toast 自有补丁另行维护。

AGENTS.md 要求 vendor 和原始归档只读，因此本候选通过既有 `tools/runtime-exclusions.cjs` 与组件装配白名单剥离发布资源，**没有删除或改写 Git 中的原始快照文件**。源码归档仍含原材料，其来源与许可边界不会因成品瘦身而消失。没有以“用途退役”作为来源已解决、作者已确认或完整许可已核实的证据。

## 逐项决定

前九项路径相对 `vendor/compatibility-resources/snapshot-v1/`，第十至十三项相对 `vendor/small-runtime/snapshot-v1/`，最后一项相对 `vendor/web-snapshot/`。

| 项目 | 新发布包选择 | 已核对的用途与理由 |
| --- | --- | --- |
| `external/Anime4K/Anime4K-off.conf` | 删除 | 旧 Ctrl+0/反引号切换所用替换文件；现有 `onLoaded` 已退役这些快捷键与全局 mpv 文件重命名，回归仍验证不注册、不改配置。文件本身含启用的 shader 行，不能因文件名假定它会关闭滤镜。正常启动和 Native Helper 不读取此包内备用文件。保留另一个 Anime4K.conf、input.conf 与全部 shader；不扩展清理范围。 |
| `external/emby.disable/www/modules/layout.css` | 删除 | 仅供旧 BAT 的“禁用背景模糊”操作覆盖正式布局；不是浏览器加载的实际 layout.css。覆盖会抹去当前受哈希管理的布局修正。 |
| `external/emby.disable/www/modules/themes/darkgradient/theme.css` | 删除 | 同一手工主题覆盖组；实际 Web 主题仍由原模块加载，保持原字节。 |
| `external/emby.enable/www/modules/layout.css` | 删除 | 仅供旧 BAT 的“启用背景模糊”操作覆盖正式布局；不属于当前主题选择或 CSS 定制入口。 |
| `external/emby.enable/www/modules/themes/darkgradient/theme.css` | 删除 | 同一手工覆盖组；删除备用副本不删除实际主题。 |
| `external/Presets/fonts/Source Han Serif SC-Bold.ttf` | 删除 | Emby.Dialog.bat 会把字体复制到 `%APPDATA%/mpv/fonts`，配合旧预设中的 `sub-font` 使用。没有当前安装、菜单或启动接线指向包内字体。此次明确退役这套全局预设附送流程；不删除用户已安装的字体，不替换当前字幕设置。 |
| `Emby.ConfigureAndUninstall.bat` | 删除 | 有可手工双击的旧配置/卸载菜单，并非无用途文件。但它按旧 Emby Theater 目录、进程名及全局 mpv 路径工作；包括强制结束同名进程、整份 CSS 覆盖、SVP 环境变量/弹幕配置、账户及缓存删除、Everyone ACL 和旧卸载操作。当前 ETE 启动与 Inno 快捷方式不调用它，官方 Host 参考启动链也不调用它。退役不受当前安装/用户数据归属合同管理的旧手工入口。 |
| `Emby.Dialog.bat` | 删除 | 旧安装后修复/提示脚本，会提升权限、复制全局字体及预设、结束进程并改旧目录 ACL。当前 Inno 的 Files/Icons/Run/Code、启动器和 main 不调用它；不作为当前安装后入口保留。 |
| `external/Presets/mpv.conf` | 删除 | 由旧 Dialog BAT 手工覆盖全局 mpv 配置，指定字体、IPC pipe、hwdec 与 Anime4K include。不是 ETE 随包 system.xml，也不在 Native Helper 初始化选项中指定；移除其附送副本，不修改 libmpv 的配置发现行为或用户已有文件。 |
| `config/system.xml` | 保留 | `tools/Start-Enhanced.ps1` 与 `src/electronapp/enhanced/bootstrap.js` 在用户 profile 缺配置时复制的种子。保留全部字节和首次复制/已有值不覆盖合同。 |
| `electronapp/plugins/mpvplayer/strings/zh-CN.json` | 保留 | `src/electronapp/plugins/libmpv.js` 的 `getTranslations` 显式映射 zh-CN。删掉会损失播放器设置中文翻译。 |
| `cec-driver/cancel`（0 bytes） | 保留 | 按存在性生效的 CEC 安装抑制标记。Host 参考源码 Program.InstallCecDriver 先判断 cancel 是否存在并返回；当前固定 Host 二进制也含该目录和取消提示。ETE bootstrap/启动器会在独立 profile 新建同名标记。包内副本保守保留，不把“零字节”当作无意义。 |
| `注意事项.txt` | 删除 | UTF-16 旧用户说明指向已退役的外部播放器、旧配置/卸载菜单和权限修复，显卡建议也混用不适用于当前固定 Native 渲染路径的选项。没有当前运行读取者。原文包含旧使用限制，因此原始文件、其 manifest 记录与来源/许可文档均保留；仅退出当前运行包的用户操作说明。 |
| `www/modules/CustomCssJS.js` | 保留 | app.js 的插件清单仍加载它；server/local CSS 选择及加载有效。既有 hash-pinned overlay 已禁止动态 JS 执行，保留脚本配置并提示；本候选不改变该合同。 |

这里区分了“还有历史手工用途”和“当前受支持功能”。两份 BAT 及其配套资源作为一组旧手工工具退役，不能把这一变化描述为原来完全没有功能。新包不再附送背景模糊覆盖工具、全局字体/播放器预设和旧清账户/权限修复工具；当前 CSS 定制、主题、播放器字幕选择与 Native 播放链保持。

## 入口与依赖核对

核对了基础组件装配、prepare/build/package/provenance、Inno 的安装/快捷方式/安装后启动/卸载 guard、Start-Enhanced、bootstrap、main、播放器翻译注册、Web app 插件注册、CustomCssJS overlay，以及两份 BAT 的完整手工菜单和复制目标。没有执行 BAT、安装字体/预设、应用 ACL、清用户数据或启动真实 Host。

Host 参考仅使用仓库既有固定引用 [708fadc](https://github.com/MediaBrowser/emby-theater-windows/tree/708fadc068cbf66ced6aece4a32f3e12bb2c4e13)：[ElectronApp.StartProcess](https://github.com/MediaBrowser/emby-theater-windows/blob/708fadc068cbf66ced6aece4a32f3e12bb2c4e13/Emby.Theater/App/ElectronApp.cs) 直接启动 electron 并传入 app/data/CEC/mpv 路径；[Program.InstallCecDriver](https://github.com/MediaBrowser/emby-theater-windows/blob/708fadc068cbf66ced6aece4a32f3e12bb2c4e13/Emby.Theater/Program.cs) 根据 cancel 的存在性返回。对当前固定 ZIP/Host 做已有 manifest 哈希检查及只读字符串核对。参考代码不等于已证明 Host 的完整源码重建关系；没有为这 14 项追加来源调查。

`index.html` 的隐藏 Carnival 标记和 CustomCssJS 的 MainActivity 分支本次不变。虽然 ETE 的生产运行在 Electron，仍不需要为包内资源剥离改动 reload 分支；保留候选记录，不扩大到其它 Android/远程播放模块。remoteaudio/remotevideo、Model、ApiClient/toast、src/、native/ 及用户数据路径均不改。

## 装配、哈希与通知

原兼容快照的 48 文件/29,353,185 bytes 和小组件的 4 文件/5,216 bytes、每项 SHA256、treeSha256 均继续校验，已退役输入也不能被篡改、缺失或夹入额外文件。输出只选 39 项兼容资源和 3 项小资源；组件运行时验证及最终 runtime 排除合同拒绝被重新放回的旧文件。plan、装配结果与 source-provenance 同时记录完整输入身份、实际 runtime 数量/字节/树哈希及排除项，避免用输入数量冒充实际分发数量。

| 组件 | 新 runtime 文件/字节 | 新 runtime tree SHA256 |
| --- | --- | --- |
| compatibility-resources | 39 / 2,391,214 | `ca74d8b1bddeacc8f8e5a271ac75ad43301328f0e81be8cb350ea84110ca9ea4` |
| small-runtime | 3 / 3,834 | `95ba0e8bc92bb3f2c18231d1e3b48476384a11794d51e99400cac2c52ce7869a` |

根 LICENSE、THIRD_PARTY_NOTICES、SOURCE_MATERIALS、LICENSING、Adobe/OFL 记录及剩余 shader 内嵌 MIT 头保持；原始 notice 文本仍存档。字体退出 runtime 不代表源码存档中的字体许可事实被消除。其它仍分发的 Web、翻译、配置、shader、libmpv、Host 等材料仍按各自现有合同和未闭合项记录，不宣布“所有遗留来源/许可已解决”。

包体减少正好 10 文件、26,963,353 未压缩 bytes（约 25.71 MiB）。这是实际文件集合差值；没有把它当作最终安装器压缩体积。源码快照和 Git 历史体积不减少。旧版本安装目录中已存在的 BAT 等文件没有新增迁移删除逻辑；本候选保证新装配/新安装包的内容，升级残留清理需单独核验。

## 复验方法与证据边界

```sh
node --test tests/legacy-resource-retirement.test.cjs tests/compatibility-resources-input.test.cjs tests/small-runtime-input.test.cjs tests/runtime-base-assembly.test.cjs tests/pepper-retirement.test.cjs
node --test tests/app-bootstrap.test.cjs tests/custom-css-js-amd-vm.test.cjs tests/custom-css-js-overlay.test.cjs tests/anime4k-shortcut-retirement.test.cjs
node --test tests/runtime-provenance.test.cjs tests/build-input-audit.test.cjs tests/build-input-contract.test.cjs
node --test tests/runtime-base-material-selftest.cjs tests/windows-host-material-selftest.cjs tests/custom-css-js-material-selftest.cjs
```

真实材料回归独立按未改写的组件 manifest 加上显式批准的十项差值构造参考侧；精确比较 812 个基础文件、927 个共同生产变换后的中间文件。不能额外忽略任何文件或改变预期 hash 来放过缺失。CustomCssJS 输入/输出 SHA 保持既有合同。测试不是 Windows GUI、安装升级、真实 Emby/CD2、音视频设备或最终安装器验收；后者须在审阅分支上另行取得，不能沿用 v0.3.16 已构建产物的结果。

本候选 Linux 实测：针对性装配/接线/安全门禁 105/105，来源与 runtime-provenance 4/4；公共 runner 1361 项中 1351 pass、0 fail、10 个明确 Windows 平台 skip。JS/PowerShell 语法、有限凭据模式及差异空白检查通过。来源夹具首轮有 4 个失败，因为整树复制仍放入已退役 notice；修正夹具使用生产排除阶段后单独复验 4/4，不将首轮记为绿。

提交后补充：原公共 runner 显式排除的六个材料依赖测试文件已独立运行，84/84 通过、0 skip；含 Host 的三项真实材料验证 3/3 通过、0 skip。基础输出的完整路径/大小/SHA256 与原始清单减十项后的集合相同。该结果仍不是完整 Windows 安装器或应用验收。
