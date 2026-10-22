# 固定Web基底输入

Latest v2 addition removes only directorybrowser.css, appstorage-cache.js and serviceworker-app.js. The active picker, localStorage/memory adapters, registered empty worker, playqueueconfirmation.js and all unapproved resources remain; see [projection contract](SCOPED_RUNTIME_PROJECTION.md).

Latest scoped addition: only the native settings/cameraupload.js/.html pair leaves source/runtime; the devices administrator page and shared/touch code remain. Current Web selection is716; prior051f990 and its718-file selection remain historical. See [evidence and regression boundary](MOBILE_CAMERA_SETTINGS_RETIREMENT.md).

Current v2 selection: the active manifest explicitly versions the existing vendor/web-snapshot root as snapshot-v2 with 713 resources and unchanged historical patch carriers. CustomCssJS.js and themes/logo.png leave the current tree, and the active app/index inputs already remove their obsolete references. The exact 720-entry v1 manifest/hash is preserved separately; index retains its approved identity; app additionally drops only the previously commented camera settings route. See [v2 migration](SNAPSHOT_V2_MIGRATION.md). Earlier 720-input/body-preservation statements below are historical.


Historical release-selection stage: [the scoped resource retirement](LEGACY_RESOURCE_RETIREMENT.md) preserves all 720 immutable Web inputs while copying only 718 to the runtime. The obsolete themes/logo.png is excluded after its startup reference was already replaced by the existing ETE SVG; title/screensaver images remain. CustomCssJS is an explicitly retired optional third-party integration: its local app registration, runtime module and dedicated overlay generator are removed. Normal CSS/Branding paths stay unchanged. Input validation still requires every original byte; this is not deletion from the current source snapshot. The newly confirmed upstream text/GPL record is documented separately in that audit.

Web构建使用独立组件`vendor/web-snapshot/`及受版本控制的`vendor/web-snapshot-manifest.json`，不读取`vendor/carnival/electronapp/www`。这是历史页面的字节快照，不代表已恢复该版本的完整上游源码或实现了整个产品的源码重建。

## 身份与归属

- Web基底为720文件、22,009,668字节。原761文件中的41个已退役外置播放器文件不进入组件；保留空文件、二进制、BOM、换行及路径大小写。
- 清单按路径固定大小与SHA256，`treeSha256`覆盖排序后的路径、大小与SHA。每文件记录原材料路径、已知/待确定来源和通知保留说明；不重新编码、不添加虚假的统一授权。
- 原始Web精确版本/源码修订未知。一份equalizer GIF与官方defaultskin字节匹配，其余文件的准确上游版本或修改归属未建立，不能笼统算作社区原创。
- `user-patches/apiclient.js`和`toast.css`保留用户综合补丁的历史完整载体，作为来源及精确字节对照；组件完整性校验仍覆盖它们。ApiClient 和 toast 的最终行为已直接纳入 `src/electronapp/www/modules/emby-apiclient/apiclient.js`、`src/electronapp/www/modules/toast/toast.css` 两份维护源码，构建不再应用这两份用户补丁或 ApiClient 生命周期补丁。继承正文及第三方内容保留原来源关系，不因维护或用户修改成为 ETE/用户原创。
- 版权/许可头保持原文件字节，产品既有LICENSE及第三方说明仍保留。未知来源、字体/图片/WASM/库及材料公开再分发尚需分别核对；本阶段不将原文材料提交或上传公开仓库。

## 准备及使用

材料正文默认被Git忽略，清单和工具受版本控制。拥有经允许取得的独立组件副本时，将整棵组件放到`vendor/web-snapshot`，执行：

```powershell
node tools/web-snapshot-input.cjs validate .
```

已有旧材料的用户只需做一次显式导入，工具先校验所有源文件再创建新组件；不覆盖已有组件、不删除或修改源材料：

```powershell
node tools/web-snapshot-input.cjs import . <prepared-carnival-root> <prepared-patch-root>
```

`tools/prepare.ps1`在组件缺失时调用此一次性导入入口。该准备流程目前仍服务整包其余材料；独立组件准备完成后，生产构建、Web overlay和来源记录都不再读取旧www或旧补丁中的两份Web文件。原始归档可保留作溯源档案，不作为该Web组件每次生成的输入。

`tools/build.ps1`先通过`validate-build-materials.cjs`分别检查独立Web组件及剩余非Web材料。旧www整棵目录、旧补丁apiclient/toast不再列为该门禁的必需物理文件；出现于旧目录时也不会遍历它们。旧manifest保留历史信息，不再作为Web物理输入集合。

`assemble-runtime-base.cjs`组装其余材料，再由Web组件复制720份基底；随后由 Git blob 复制两份维护的 Web 源码，并应用其余23个overlay及PlaybackManager变换。`source-provenance.json`记录独立组件清单、基底树和最终Web树，PlaybackManager的runtime provenance也引用独立组件路径。新清单和验证器纳入HEAD构建输入合同。

## 验证及范围

```powershell
node --test tests/web-snapshot-input.test.cjs tests/runtime-base-assembly.test.cjs
npm test
```

回归覆盖无旧www的生产材料门禁/组装、空文件/BOM/二进制字节保持、缺失/篡改/额外输入、危险路径/重定向、导入不覆盖及新旧组装等价。真实材料验证应在没有旧www的隔离目录生成Web，对比同一产品基线的完整路径集合和SHA256；不通过改输出hash掩盖差异。

整体产品仍依赖preload和package小模板、保留npm包、附带资源及其它历史校验材料；libmpv、Electron和工具链也仍是固定外部输入。14份原样Windows Host/辅助二进制已转为[官方固定组件](WINDOWS_HOST_INPUT.md)，Model保持当前字节和原来源。后续应逐组件替换或独立保存，不能将此阶段宣称为完全移除旧整包或全部从源码构建。

固定快照的传递/存储目标与公开再分发是后续独立决定；仅有清单的Git克隆尚不包含该材料正文。


Normal first restoration can now use `node tools/web-snapshot-input.cjs restore . <independent-snapshot-root>` or `prepare.ps1 -WebSnapshotRoot`. This validates the exact fixed Web and user-patch tree without historical installer/extracted layouts. The older `import` command is a separate explicit historical acquisition tool.

## Current repository restoration update (2026-10-21)

The user authorized tracking the exact required Web, compatibility-resource, small-runtime and original Model snapshots in this same repository. The 775 manifest-listed files (51,953,202 bytes) use ordinary Git with `-text` attributes to preserve bytes. Historical local-only/ignored-storage statements below describe earlier stages and are superseded for these four roots. Source attribution and unresolved exact revisions remain unchanged; storage permission is not a claim of new third-party authorship or complete corresponding source. libmpv stays ignored and is restored from the pinned archive via `node tools/prepare-libmpv.cjs .`; see [repository inputs](REPOSITORY_INPUTS.md). No old full installer/patch or real user profile is included.

## 两份直接维护的上游派生源码

生产构建沿用 `copy-tracked-product-sources.cjs` 的已有 Git blob 装配，将下面两份文件直接覆盖到固定 Web 基底的同名路径；不再对它们运行生成器或补丁。`.gitignore` 仅开放这两个 `www` 文件，其他 Web 页面仍保持固定快照/既有 overlay 边界；`.gitattributes` 保留其准确运行字节。未新增通用 vendor 移植框架或第二套源码优先级。

| 维护源码 | 继承来源及变更边界 | 固定输出 SHA256 |
|---|---|---|
| `src/electronapp/www/modules/emby-apiclient/apiclient.js` | 派生自 `vendor/web-snapshot/www/modules/emby-apiclient/apiclient.js`（`f3516c72…e18acc0`），保留用户历史载体 `a4a90164…5b080ae` 的重连/进度修复及此前 `5a6e886` 引入的生命周期修复 | `6342a2c809b8cd4c0e1e3e35fc49f6af8a415e4f4f8f8f0363cb769e9a7ef95e` |
| `src/electronapp/www/modules/toast/toast.css` | 派生自 `vendor/web-snapshot/www/modules/toast/toast.css`（`e4e8efcd…cad0e39`），保留历史用户载体的六行定位规则删除及 LF 转换 | `654aeb05c1b89ca625cc6bd9145f1966a780c0e80fe1197f619800c5f1894743` |

维护源码包含继承的完整正文，不整体声明为用户原创或 ETE 原创，也不据此重新许可。原始 Web 精确官方版本/源码修订仍未确认；来源、已有声明及尚未确定的归属继续沿用本组件、[第三方说明](../THIRD_PARTY_NOTICES.md)和[来源材料](SOURCE_MATERIALS.md)记录。文件既有内容/头部字节保持，归属在此逐路径记录，未为添加新文件头而改变运行产物。

ApiClient 的实际用户增量不限于回忆中的一个 bug：`openWebSocket` 成功时重置重试次数、异常关闭时按 1/2/4 秒退避至 30 秒重连；`reportPlaybackProgress` 在原节流判断后、原 HTTP POST 前 ensure WebSocket。维护版本同时保留后续 socket identity/epoch、注销、所属计时器、CONNECTING/OPEN 关闭和旧回调抑制修复。其余认证、HTTP、消息、Session/播放归属保持；toast 仅去除 `.noScrollY.transparentDocument` 的定位块并保留历史 LF 字节。对应两个 overlay 入口及 ApiClient 生命周期生成器已移除，避免源和补丁双维护；其他23个 overlay 不改。

验证：

```powershell
node --test tests/tracked-product-sources.test.cjs tests/maintained-web-source-material-selftest.cjs tests/apiclient-lifecycle-material-selftest.cjs tests/device-identity.test.cjs tests/web-overlay-preparation.test.cjs
node tools/validate-build-materials.cjs .
node --test --test-concurrency=1 tests/*-material-selftest.cjs
```

回归直接执行维护的 AMD 源码，覆盖重连、注销、计时器/消息归属及进度 POST/节流；测试固定最终 SHA256、继承正文不变范围和 toast 完整字节。装配夹具不提供任何 vendor/patch 生成器，且故意篡改工作树文件，确认最终字节只取指定提交的 Git blobs，未跟踪 Web 文件不会进入产物。

完整组件门禁仍核对历史载体清单，未删除或重新归属 vendor 材料。来源关系由旧生成器改为普通受版本控制的派生源码，provenance/build-manifest 必然变化；产品 Web payload 则按完整720路径和文件SHA比较。Windows整包、GUI和真实服务/媒体须独立验收，不由静态材料对照代替。

本次直接源码装配相对 main `6fee412` 的720个 Web 文件逐路径/SHA256完全一致。对按路径排序的 `{path,sha256}` 数组执行 `JSON.stringify` 后的摘要保持 `1b29d84dbcd3f8fe0537a7a129da3eab39df14492a0dcc40615a6194772a82bf`。完整 npm test 为1429 pass / 0 fail / 10 Windows专属skip；全部显式材料集合136 pass / 0 fail / 0 skip；原完整材料门禁通过，基底822文件/共同变换后937文件对照通过。来源记录中的两份文件转为指定提交的 `git-blob-copy` 关系，未声称整份provenance与旧构建字节相同。
