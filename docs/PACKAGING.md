# 构建与打包

## Phase 2B bridge payload boundary

`Pepper / PPAPI bridge` 已退休。`vendor/carnival/electronapp/libmpv/x64/mpv-win32-x64.node` 仍作为 immutable archive inventory input 供 provenance 对照，但 `tools/runtime-exclusions.cjs` 在 vendor copy 后立即将它从 Enhanced runtime 移除；`tools/package.ps1 -VerifyOnly` 和 runtime provenance 会再次 fail closed 检查该路径不存在。正式 runtime 只包含 `electronapp/native-helper/ete-mpv-helper.exe` 与受锁定 hash 的 `electronapp/libmpv/x64/mpv-1.dll`。

## Native helper payload

Production bridge 增加 `electronapp/native-helper/ete-mpv-helper.exe` 与根 `native-helper-provenance.json`。先运行 `tools/prepare-native-helper-inputs.ps1` 获取并核对固定 mpv `client.h`；`tools/build.ps1` 在替换锁定 libmpv 后调用 `tools/build-native-helper.ps1`。helper source 只能来自 `sourceCommit` 的 Git blob，compiler/header/libmpv/source/helper/contract hash 均写入 provenance；dirty checkout 与 research binary 不参与。

Inno `[Files]` 已递归复制整个 runtime，因此不增加独立 helper 安装/注册动作。helper 只由 Electron main 以固定相对路径启动，不作为服务、计划任务或公共 IPC endpoint。正式 package verify 仍必须在获授权 commit 上重新执行。

## 公开基线限制

`v0.1.1-baseline` 是用于源码治理和审计的公开基线，并非独立可构建的发行源码包。公开仓库刻意不包含完整离线 Web snapshot、冻结 Electron/runtime、native binary、Carnival 输入或综合补丁输入；本地构建仍需要这些已锁定但未公开的输入。缺少这些内容时，`prepare.ps1` 或 `build.ps1` 不能完成是预期行为，不应视为公开仓库缺陷。

在逐项确认来源、再分发许可和 GPL 对应源码义务前，不发布 setup.exe 或其他二进制产物。

## 已实际使用的工具

- Windows PowerShell 5.1 执行所有 ps1，脚本内容保持 ASCII；读取含中文的 JSON 显式 UTF8。
- 本地开发 Node + 固定 `node-unrar-js 2.0.2`，根 package-lock.json 锁定。
- CloudDrive2 runtime 固定 `@grpc/grpc-js` 1.14.4 与 `@grpc/proto-loader` 0.8.1；构建只复制 lockfile 的 production dependency closure，当前为 33 个纯 JavaScript package、0 个 `.node` addon。
- Inno Setup 6.7.3。官方安装 EXE Authenticode 验证有效，签名者 Pyrsys B.V.；只用项目内 innounp 解包，没有安装或修改系统 PATH。
- Python 仅用于可选 DLL 身份 probe，无 pip 新依赖。

工具来源及哈希见 `vendor/toolchain-manifest.json`。构建不自动下载工具；`package.ps1 -Compiler` 支持用户已安装或自行准备的 ISCC.exe。

## 两阶段

```powershell
npm ci --ignore-scripts
powershell -NoProfile -ExecutionPolicy Bypass -File tools/prepare.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools/package.ps1
```

clean worktree 可以用 `tools/prepare.ps1 -ArchiveRoot <包含两个原始归档的目录>`，由脚本直接核对并解包已声明的外部输入，不手工复制 archive 或 overlay。prepare 核对两个输入归档的 SHA256，解包到 vendor。build 核对 manifest 中每个 vendor 文件 → 复制 Carnival runtime → 从固定 `sourceCommit` 的 Git tree 枚举普通 `src/electronapp` blob 并按原始 bytes 写入 → 生成 prepared preload 与三份受控 Web overlay → 复制 production dependencies → 应用 PlaybackManager overlay → 替换指定 libmpv → 写 Enhanced package 元数据、独立 ProgramDataPath、provenance 与 final payload manifest。mpv.conf、shader、字体不写入个人目录。

普通产品源码由 `copy-tracked-product-sources.cjs` 执行 `git ls-tree -r -z --full-tree <sourceCommit>` 和 `git cat-file blob <objectId>`。只接受 regular `100644/100755 blob`，binary 与文本都直接写 Buffer，不做 decode、re-encode 或换行转换。dirty/staged index 和 checkout bytes 不进入 runtime；prepared preload、Web overlay、PlaybackManager 和 package metadata 继续走各自独立 contract。

Web overlay 的唯一来源如下：

- `apiclient.js`：固定 Carnival base + manifest 锁定的 `vendor/patch/payload/client/apiclient.js` replacement。
- `toast.css`：固定 Carnival base + manifest 锁定的 `vendor/patch/payload/client/toast.css` replacement。
- `app.js`：固定 Carnival base + tracked canonical External Player registration transform。

`prepare-web-overlays.cjs` 在写任何输出前先校验全部 base、payload 和 generator；任一 hash 不匹配则 fail-fast，不留下部分 Web overlay。tracked generator identity 使用当前 commit 的 canonical Git blob SHA256，并拒绝除 CRLF/LF checkout 差异之外的工作文件偏移。

CD2 阶段在源码覆盖后执行两项确定性步骤：`copy-runtime-dependencies.cjs` 从根 lockfile 复制 production closure 到输出 `electronapp/node_modules` 并拒绝 native addon；`patch-playbackmanager.cjs` 对未公开的 frozen Web snapshot 应用锚点唯一的 request-generation overlay，锚点数量不符即停止构建。runtime 不依赖开发机 `electronapp/node_modules` 的偶然内容，不执行 native rebuild 或 node-gyp。

保留实际布局 `Emby.Theater.exe`、`electronapp/libmpv/x64`、`electronapp/native-helper`、`x64/electron`。任务书中的 runtime/libmpv/plugins 分拆仅是示意；Native Helper 通过固定相对路径启动，旧 Pepper plugin registration 已不存在。

`source-provenance.json` 记录 base/runtime version、archive/manifest、Web base 与 final tree、每个 Web overlay 的 base/input/generator/output SHA256、Electron、Native Helper、retired bridge input exclusion、libmpv 以及 package-lock 驱动的 production dependency closure。`runtime-provenance.json` 绑定 source provenance，并覆盖 Git tracked 产品源码、prepared preload、PlaybackManager、package metadata overlay 与 runtime exclusion contract。`build-manifest.json` schema 2 绑定 source commit、两份 provenance、vendor manifest、package-lock 和 canonical payload-set digest；它不把自己列入 payload，避免递归 hash。

package verify 先验证两层 provenance，再对 build manifest 做路径规范、重复路径、双向 file-set、逐文件 SHA256、provenance binding 和 payload-set digest 检查，然后才允许 Inno 编译到 `dist/EmbyTheaterEnhanced-0.1.1-win-x64-setup.exe`。传 `-RuntimeName` 选择 runtime。安装目标独立于 Carnival，安装器保留稳定 AppId；桌面、开始菜单和安装完成入口直接启动 `{app}\Emby.Theater.exe`。卸载不删除个人 mpv 配置和 Enhanced 用户数据。

## 可重复性

Phase 1 在 `5019a754ecd75d2a64767e19996d6ded7ad6c3fd` 上使用正常开发 worktree 与第二个 fresh detached worktree，分别从同一组 manifest 锁定 archive 执行 prepare/test/build/provenance/package verify。两边 `npm test` 均为 150/150，build manifest 各列 2,130 个文件；加上 manifest 自身，实际 runtime 各 2,131 个文件。逐路径 SHA256 比较为 `missing=0`、`extra=0`、`mismatch=0`，canonical payload-set SHA256 均为 `b5578003078484399930d0b1d613680d0c91178395406307b6028bb79eba4c96`。

tracked-source follow-up `5a2bafc1dfa5d65f8821a3ef47371c08fe162cad` 将上述普通 source acquisition 从工作树 physical bytes 收紧为 commit blob bytes。实际 dirty-worktree build 中，`splash.html` 工作树 hash 与 HEAD blob 不同，但 runtime/provenance 仍等于 HEAD blob；normal 与新 fresh worktree 再次得到 2,131 files、`missing=0`、`extra=0`、`mismatch=0`，测试增至 152/152。

该结论只覆盖 runtime payload。Inno installer container 可能包含时间戳等非确定字段，本阶段没有要求或宣称 setup.exe byte-for-byte 相同，也没有从源码重建 Electron、Pepper bridge 或 libmpv。

第一轮两次分别构建到不同输出目录，1013 个文件（含 build-manifest）SHA256 全部相同。CD2 merge review 的 final/repeat runtime 各有 2156 个 manifest 载荷，逐文件 SHA256 0 差异；连同 `build-manifest.json` 实际为 2157 文件。这里的可重复是 runtime 载荷一致，未声称 setup.exe 位级确定性或 native binary 源码重建。

PR #2 merge review 的隔离 installer 候选已编译并用 innounp 解包，2157 个 `{app}` 文件与 final runtime 逐文件哈希一致，grpc-js、proto 存在且 production dependency closure 中没有 native addon。本轮没有运行安装器或执行系统安装。

build 拒绝覆盖已有目录；重复构建使用 `-OutputName`。package 同样拒绝覆盖已有 setup。旧产物应由用户保留或在明确范围内处理，脚本不执行递归删除。

0.1.1 安装包已用 innounp 解包，build-manifest 中 1012 个载荷文件哈希全部一致。随后在用户授权独立目录实际安装 0.1.0、覆盖升级 0.1.1，每次均验证全部载荷与安装记录；快捷方式实际启动成功，卸载后目录、安装记录、桌面/开始菜单快捷方式均移除。保留 Enhanced profile 与个人 mpv 配置。当前提权环境未覆盖 UAC 提示交互或 Program Files ACL。

## 启动与配置

Portable 与安装后的快捷方式都直接启动 `Emby.Theater.exe`。Electron main process bootstrap 只在 `%APPDATA%\EmbyTheaterEnhanced` 下创建缺失的 system.xml、CEC cancel 标记和必要目录，保留基线的自动更新关闭设置，不覆盖用户文件，也不启动外部 wrapper 或驱动安装流程。

第一轮已运行 frozen Electron 加载输出目录 main.js；另用 `tools/test-host.ps1` 在唯一测试副本中将 ProgramDataPath 指向测试目录，实际启动 Emby.Theater.exe，10 秒后原 host 存活、4 个 Electron 子进程存在、诊断日志已生成。测试只停止该副本内的进程。此测试证明原 Windows host 可启动输出应用，不能替代完整 installer/升级验收。

Electron profile 已隔离；0.1.1 的媒体测试显式设置子进程 MPV_HOME，并已验证 native 读取独立配置。正式用户启动不设置 MPV_HOME、不修改个人配置。详见 LIBMPV_RUNTIME。
