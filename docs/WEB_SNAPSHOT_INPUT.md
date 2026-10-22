# 固定Web基底输入

Current release selection: [the scoped resource retirement](LEGACY_RESOURCE_RETIREMENT.md) preserves all 720 immutable Web inputs while copying only 718 to the runtime. The obsolete themes/logo.png is excluded after its startup reference was already replaced by the existing ETE SVG; title/screensaver images remain. CustomCssJS is an explicitly retired optional third-party integration: its local app registration, runtime module and dedicated overlay generator are removed. Normal CSS/Branding paths stay unchanged. Input validation still requires every original byte; this is not deletion from the current source snapshot. The newly confirmed upstream text/GPL record is documented separately in that audit.

Web构建使用独立组件`vendor/web-snapshot/`及受版本控制的`vendor/web-snapshot-manifest.json`，不读取`vendor/carnival/electronapp/www`。这是历史页面的字节快照，不代表已恢复该版本的完整上游源码或实现了整个产品的源码重建。

## 身份与归属

- Web基底为720文件、22,009,668字节。原761文件中的41个已退役外置播放器文件不进入组件；保留空文件、二进制、BOM、换行及路径大小写。
- 清单按路径固定大小与SHA256，`treeSha256`覆盖排序后的路径、大小与SHA。每文件记录原材料路径、已知/待确定来源和通知保留说明；不重新编码、不添加虚假的统一授权。
- 原始Web精确版本/源码修订未知。一份equalizer GIF与官方defaultskin字节匹配，其余文件的准确上游版本或修改归属未建立，不能笼统算作社区原创。
- `user-patches/apiclient.js`和`toast.css`保留用户综合补丁的既有完整输入。用户增量分别为WebSocket生命周期调整及移除toast CSS块；底稿及第三方内容仍保留其来源关系，不因用户做补丁成为用户原创。现有ETE overlay继续作用于这些输入，输出hash不变。
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
