# 固定Web基底输入

Web构建使用独立组件`vendor/web-snapshot/`及受版本控制的`vendor/web-snapshot-manifest.json`，不读取`vendor/carnival/electronapp/www`。这是历史页面的字节快照，不代表已恢复该版本的完整上游源码或实现了整个产品的源码重建。

## 身份与归属

- Web基底为720文件、22,009,668字节。原761文件中的41个已退役外置播放器文件不进入组件；保留空文件、二进制、BOM、换行及路径大小写。
- 清单按路径固定大小与SHA256，`treeSha256`覆盖排序后的路径、大小与SHA。每文件记录原材料路径、已知/待确定来源和通知保留说明；不重新编码、不添加虚假的统一授权。
- 原始Web精确版本/源码修订未知。一份equalizer GIF与官方defaultskin字节匹配，其余文件的准确上游版本或修改归属未建立，不能笼统算作社区原创。
- `user-patches/apiclient.js`和`toast.css`保留用户综合补丁的历史完整载体，作为来源及精确字节对照；组件完整性校验仍覆盖它们。生产 overlay 已改从固定 `www` 基底经 `tools/patch-user-web.cjs` 生成增量，再串联既有 ApiClient 生命周期变换，不再读取这两份完整替换文件。底稿及第三方内容仍保留其来源关系，不因用户做补丁成为用户原创。
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

`assemble-runtime-base.cjs`组装其余材料，再由Web组件复制720份基底；随后沿用25个overlay及PlaybackManager变换。`source-provenance.json`记录独立组件清单、基底树和最终Web树，PlaybackManager的runtime provenance也引用独立组件路径。新清单和验证器纳入HEAD构建输入合同。

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

## 用户增量的维护边界

`tools/patch-user-web.cjs` 直接提取当前固定基底与历史综合补丁载体的差异，不替换 Web 上游版本，也不把此基底称为已定位的原始官方源码：

- ApiClient 的 `openWebSocket`：连接成功后重置重试计数，非预期关闭后按 1/2/4 秒指数退避至 30 秒重新 ensure。后续已存在的 `patch-apiclient-lifecycle.cjs` 继续管理 socket、注销、计时器及回调归属；未重写该修复。
- `reportPlaybackProgress`：原节流判断通过后、原 HTTP POST 之前调用 `ensureWebSocket()`；其余上报协议及所属关系保持。
- toast：删除 `.noScrollY.transparentDocument` 的六行定位规则，并保留历史补丁整份 CSS 转为 LF 的字节结果；其余样式不变。

变换器固定输入及中间输出 SHA256、要求替换锚点唯一，复现 ApiClient 历史混合换行，随后使用既有最终输出校验。两条 overlay 都属于 `tracked-canonical-transform`，`inputPath/inputSha256` 为 null，来源关系是冻结基底与受 HEAD 校验的生成器。变换器进入既有 `generatorPaths`、`build-input-contract` 和 provenance，不新增第二套 patch 系统。最终 ApiClient 为 `6342a2c809b8cd4c0e1e3e35fc49f6af8a415e4f4f8f8f0363cb769e9a7ef95e`，toast 为 `654aeb05c1b89ca625cc6bd9145f1966a780c0e80fe1197f619800c5f1894743`，与拆分前相同。

针对性验证：

```powershell
node --test tests/playback-lifecycle-patchers.test.cjs tests/web-overlay-preparation.test.cjs tests/user-web-patches-material-selftest.cjs tests/apiclient-lifecycle-material-selftest.cjs
```

新材料自测逐字节比较生成结果与保留载体，限制 ApiClient 修改方法及 toast 删除范围；overlay 夹具没有 `user-patches` 目录，验证生产生成不依赖完整替换文件。完整组件门禁仍核对历史载体清单，未删除或重新归属 vendor 材料。来源记录中的生成器和输入关系会相应变化，因此 provenance/build-manifest 不应声称与旧构建逐字节相同；产品 Web payload 可以独立比较路径和文件 SHA256。此验证不等于 Windows 整包重建、GUI 或真实服务器/媒体验收。

本次以 main `6fee412` 为拆分前参考，同一组件基底经 25 条 overlay 及既有 PlaybackManager 变换，720 个 Web 路径及文件 SHA256 完全一致。对按路径排序的 `{path,sha256}` 数组执行 `JSON.stringify` 后的 SHA256 为 `1b29d84dbcd3f8fe0537a7a129da3eab39df14492a0dcc40615a6194772a82bf`；该值是本次对照的摘要，不替代组件 manifest 的树算法。完整 npm test 为 1429 pass / 0 fail / 10 Windows 专属 skip。完整材料门禁因本环境缺少固定 `vendor/windows-host` 停止，未重建 Windows 整包。
