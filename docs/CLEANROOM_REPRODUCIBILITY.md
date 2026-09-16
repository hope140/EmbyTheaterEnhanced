# Clean-room reproducibility

## 2026-09-16 — Phase 1 reproducible build contract

基线为 `origin/main@2c668eed87379eafec2e1a25f6b46f6b1dbf5ec6`，分支为 `chore/reproducible-build-phase1`。已验证实现 revision 为 `5019a754ecd75d2a64767e19996d6ded7ad6c3fd`。

根因不是 vendor archive hash 缺失，而是 `build.ps1` 在复制 Carnival 后递归复制整个物理 `src/electronapp`。开发机 ignored Web snapshot 有 792 个文件，其中 `app.js`、`apiclient.js`、`toast.css` 三项相对 Carnival 有差异；fresh worktree 没有这些文件。`apiclient.js` 和 `toast.css` 的综合补丁 payload 虽已在 manifest 中，却没有被 build 显式使用；`app.js` 在 ignored overlay 存在时删除 registration，在 clean fallback 时由 generator 写成 `false`，形成两个字节输出。另有两个测试直接或优先读取 ignored Web snapshot。Windows Git checkout 的 LF/CRLF 过滤还会使 generator 的工作文件 hash 随 worktree 状态变化。

新 contract：

1. `build.ps1` 只复制 `git ls-files src/electronapp` 返回的产品源码；ignored `src/electronapp/www`、package metadata、language fallback 和其他本机残留不进入 overlay。
2. `src/electronapp/preload.js` 继续由 tracked `prepare-preload.cjs` 从固定 Carnival base 生成并显式复制。
3. `prepare-web-overlays.cjs` 在写入前一次性预检三项 Web contract，任一输入不匹配即停止且不留下部分输出。
4. tracked generator SHA256 来自当前 commit 的 canonical Git blob；工作文件除 CRLF/LF 外与 HEAD 不同会失败。
5. `prepare.ps1 -ArchiveRoot <dir>` 允许 fresh worktree 直接使用已声明且 hash 固定的两个外部 archive，不需要从开发工作区手工复制 overlay 或 vendor 解包目录。

| Runtime path | Source → transform → output | Base SHA256 | Output SHA256 |
|---|---|---|---|
| `electronapp/www/modules/emby-apiclient/apiclient.js` | Carnival base → manifest-locked patch payload replacement | `f3516c72784e5bc8782abbce021f22a7f939034e5b8b70639672ae682e18acc0` | `a4a901640abe6bc25188c1cf27fb53125b4f65ef2a797def033dc55165b080ae` |
| `electronapp/www/modules/toast/toast.css` | Carnival base → manifest-locked patch payload replacement | `e4e8efcdfbe4841fd05b6cfe6b2a94393474899f3977416077d99b4f8cad0e39` | `654aeb05c1b89ca625cc6bd9145f1966a780c0e80fe1197f619800c5f1894743` |
| `electronapp/www/app.js` | Carnival base → tracked canonical registration removal | `3ef3102567458359a02e2fe8f79a8700cfe9c223347abe5ab6ecb8bd93be89d2` | `a5a3cddcf279496ee3792ee0e29f7cd347f969c5eb3876c284cc990df9755f08` |

provenance 分三层：

- `source-provenance.json` 解释 source/input/transform/output，记录 archive/manifest、Web base/final tree、Electron 18.3.15、Pepper bridge、libmpv 与 33-package production dependency closure。
- `runtime-provenance.json` 解释 Git tracked source、prepared preload、PlaybackManager/package overlay 到 runtime 的关系，并绑定 source provenance。
- `build-manifest.json` schema 2 枚举最终 payload，绑定 source commit、vendor manifest、package-lock、两份 provenance 和 canonical payload-set digest。

验证在正常开发 worktree 与第二个 fresh detached worktree 上分别执行 `npm ci --ignore-scripts`、prepare、`npm test`、build、source/runtime provenance 与 package verify。两边均为 `npm test 150/150`、build manifest 2,130 files、package verify PASS。加上 `build-manifest.json` 后，实际 runtime 各 2,131 files；逐路径 SHA256 为：

```text
missing = 0
extra = 0
mismatch = 0
payloadSetSha256 = b5578003078484399930d0b1d613680d0c91178395406307b6028bb79eba4c96
```

本阶段没有改变 Toast 视觉、Toast 触发、PlaybackManager、Resolver、CD2/Mount、Session/PlaySessionId、WebSocket、DeviceId、WatchTogether、mpv、libmpv、Pepper bridge、Electron、preload security architecture、installer 产品行为或自动更新。没有编译 installer，也不宣称 installer container byte-for-byte deterministic。Electron、Pepper bridge、libmpv 和完整 Web snapshot 仍是 manifest 锁定但外部提供的二进制/third-party 输入；公开再分发仍受既有来源与许可核验边界约束。

## 2026-09-15 — Historical clean-room snapshot

以下内容记录旧 revision 的 preload/readiness clean-room 工作。其 `src/electronapp/www/** = SAFE` 判断和 77/77、2,116 files 数字已被上面的 Phase 1 审计与当前验证取代，不应作为当前 build contract。

日期：2026-09-15（UTC+8）

基线：`origin/main` / `main@56b2227324811b525cd73caed61e3399cd2875e5`

本轮分支：`audit/cleanroom-readiness-hardening`

代码提交：`6c5cc9e05b7dbec6a01a2cf81cd19209deb0b319`

## 结论

两个独立 clean worktree 都从上述提交开始，只加入 manifest 指定的两个原始 vendor archive。两边分别执行 `npm ci`、`prepare`、`npm test`、`build`、runtime provenance 和 package verify，结果全部通过。两个 runtime 的 2116 个载荷文件逐路径 SHA256 完全一致。

本轮没有复制开发工作区的 `src/electronapp/www/`、`src/electronapp/preload.js`、`dist/` 或 `node_modules/`。两个 archive 属于任务允许的 vendor inputs，哈希分别为：

| 输入 | SHA256 |
|---|---|
| Carnival 3.0 Windows archive | `9d53fe71b42a530e9941f97ad712bd6724dbb0e7aa0e7de73a4bf9614b28b001` |
| 综合补丁 archive | `2316cd37733b4abf5475dcb9f36d050e2e83c52807ea3b40b9b97d8a80263b43` |

## 环境记录

| 项目 | 实际值 |
|---|---|
| Host Node | `v24.18.1` |
| 执行 ps1 的 Windows PowerShell | `5.1.26100.9444` |
| 调用 shell | PowerShell `7.6.5` |
| Bundled Electron 文件版本 | `18.3.15` |
| Electron 内嵌 Node | `16.13.2`（runtime diagnostics） |

两个验证 worktree 以 `cleanroom-1`、`cleanroom-2` 标识，均为 detached worktree；当前开发分支 worktree 与用户的 `main` worktree 分离。

## 原始 fresh-worktree 失败

在修复前的 `origin/main@56b2227` fresh worktree 中，先按标准顺序执行 `npm ci --ignore-scripts`，再执行 `npm test`，结果为 62 PASS / 1 FAIL（63 tests）。失败测试为：

`tests/external-player-process-chain.test.cjs`

该测试在模块加载时执行：

```js
fs.readFileSync(path.join(__dirname, '../src/electronapp/preload.js'), 'utf8')
```

fresh worktree 没有该文件，因此在测试体开始前以 `ENOENT` 失败。首次完全没有 `node_modules` 时还会多出一个 `cd2-service` 依赖缺失差异；完成锁文件驱动的 `npm ci` 后只剩这个 preload failure。

根因链如下：

1. 当前开发机有一个 620-byte 的 `src/electronapp/preload.js`，但它被 `.gitignore` 忽略，Git 中没有 tracked copy。
2. vendor Carnival 中只有 214-byte 的 `vendor/carnival/electronapp/preload.js`，其中没有 Enhanced diagnostics bridge。
3. 原 `tools/prepare.ps1` 只解包 vendor，没有生成 `src/electronapp/preload.js`。
4. 原 `tools/build.ps1` 会先复制 vendor preload；如果 ignored source 存在，再由 `src/electronapp` overlay 覆盖它。fresh checkout 没有 overlay 时，runtime 仍能得到 vendor preload，但测试读取的 source path 不存在，且 runtime 不具备 diagnostics bridge。
5. `.gitignore` 的该规则原本属于未公开的本地 Electron/Web snapshot 边界，但没有声明这个 required prepared artifact 的生成来源。

## source-of-truth 分类

| 路径/对象 | 类别 | 事实与 contract |
|---|---|---|
| `vendor/carnival/electronapp/preload.js` | C — vendor-derived source | 只读 Carnival baseline，prepare 后由 archive hash 和 vendor manifest 校验 |
| `src/electronapp/preload.js` | D — prepared workspace artifact | 由 `tools/prepare-preload.cjs` 用 vendor preload 加 tracked diagnostics/sticky block 生成；继续 ignored，禁止手工复制 |
| runtime `electronapp/preload.js` | E — runtime-only assembled artifact | build 从 prepared artifact 复制，并由 provenance 校验 base/generator/prepared/runtime hash，且强制 runtime preload hash 等于 deterministic prepared preload hash |
| `src/electronapp/www/**` | C — vendor-derived source | fresh source 可缺失；build 从 vendor 得到，`app.js` 和 PlaybackManager 是显式 build overlay |
| `src/electronapp/package.json` | C — vendor-derived source | fresh source 可缺失；build 从 vendor 得到并写入受控 package metadata overlay |
| `src/electronapp/scripts/windowsync.js`、`mpvplayer/strings/en-US.json`、`zh-CN.json` | C — vendor-derived source | manifest 中有对应 vendor 文件，当前没有测试/构建依赖的无来源本地变体 |
| `vendor/carnival/`、`vendor/patch/` | C — prepared vendor inputs | 由两个已锁定 archive prepare 得到，目录只读 |
| `node_modules/`、`dist/`、`.work/`、`docs/evidence/live-acceptance.json` | E — runtime/test-only artifact | 由 npm、build 或 acceptance 生成，不作为 source 输入 |

`src/electronapp/preload.js` 是本轮唯一确认的 BLOCKING portability bug。它既不是可安全 skip 的测试 fixture，也不是应该从某台开发机拷贝的 source；修复为 tracked generator 加 prepare contract。没有把整个 ignored Web snapshot 纳入 Git。

## ignored dependency audit

| 分类 | 项目 | 判断 |
|---|---|---|
| BLOCKING（已修） | `src/electronapp/preload.js` | test 直接读取；runtime 需要 Enhanced diagnostics；此前没有生成来源 |
| SAFE | `src/electronapp/www/**`、`src/electronapp/package.json`、windowsync、两份语言 JSON | vendor fallback/build overlay 有明确来源；provenance 对 app/package overlay 有回归 |
| INTENTIONAL | vendor 解包目录、root archive、`node_modules/`、`dist/`、`.work/`、acceptance 输出 | 原始输入或生成产物，已在文档/脚本 contract 中隔离 |
| UNKNOWN | `vendor/official-reference/` 等历史参考目录 | 当前不被 standard prepare/build/test 路径引用，本轮不改变其归属 |

扫描 `tests/`、`src/electronapp/`、`tools/prepare.ps1`、`tools/build.ps1`、vendor manifest 和 runtime provenance 后，没有发现第二个“测试/构建依赖 ignored 本地文件但没有 tracked 来源”的 BLOCKING 案例。

## 标准 clean-room contract

在 worktree 根目录准备两个允许的 archive 后，命令顺序为：

```powershell
npm ci --ignore-scripts
powershell -NoProfile -ExecutionPolicy Bypass -File tools/prepare.ps1
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build.ps1 -OutputName EmbyTheaterEnhanced-cleanroom
node tools/runtime-provenance.cjs validate . dist/EmbyTheaterEnhanced-cleanroom <sourceCommit>
powershell -NoProfile -ExecutionPolicy Bypass -File tools/package.ps1 -RuntimeName EmbyTheaterEnhanced-cleanroom -VerifyOnly
```

`prepare.ps1` 和 `build.ps1` 都调用同一个 `prepare-preload.cjs`。生成器是幂等的；provenance 会分别计算 vendor base、generator、prepared、runtime 和 `expectedPreparedSha256`，并强制 `runtimeSha256 === preparedSha256 === expectedPreparedSha256`，不匹配时 fail closed 且只验证、不修改产物。测试仍然要求该 contract 已完成，不会在缺失 required preload 时 skip。

## 两次独立验证

| worktree | prepare | npm test | build | provenance | package verify |
|---|---|---|---|---|---|
| cleanroom-1 | PASS，1009 vendor files，prepared preload generated | PASS，77/77 | PASS，2116 files | PASS，scope 54，prepared artifact valid | PASS，2116 payload files |
| cleanroom-2 | PASS，1009 vendor files，prepared preload generated | PASS，77/77 | PASS，2116 files | PASS，scope 54，prepared artifact valid | PASS，2116 payload files |

两边的 build manifest 载荷逐路径 SHA256 比较为 identical。provenance 额外记录 `src/electronapp/preload.js` 的 vendor base hash、generator hash、prepared hash 和 runtime hash；其中 prepared/runtime hash 均为 `8e704d3459454084c898ba8dc3821e121a431b1e0e92ee2f06c20b260fa76530`。

## 验证边界

本轮验证的是 clean-room prepare/build/test/provenance/package payload contract，不声称全部 native binary 可以从公开源码位级重建，也没有编译或运行安装器。vendor archive、Electron runtime、native libmpv 和用户 acceptance profile 仍是允许但外部提供的输入。
