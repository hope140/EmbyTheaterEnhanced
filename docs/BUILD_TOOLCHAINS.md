# 固定的本地构建工具材料

2026-10-09独立材料分支补充了17个MSYS2原包及签名，包内6,990文件与下方
固定前缀全部相同；本地发行keyring下17份签名均验证通过。12个PKGBUILD
与包内build metadata hash相同，保存了相应目录54个配方/patch文件。
Inno6.7.3源码和固定发布digest、InnoUnp固定commit的原ZIP/源码/分组件
通知也已收集。详细身份、验证与未收齐的source tarballs/构建关系见
[材料审计](THIRD_PARTY_MATERIALS_AUDIT.md)。下文“原包/签名尚未收齐”
保留为前一轮的历史材料状态；本轮没有改变工具锁或构建gate。

`tools/build-toolchains.lock.json` 补充展开目录身份。它引用既有
`vendor/toolchain-manifest.json` 和 `vendor/native-helper-manifest.json`
的 Git blob/canonical hash，保持这些原清单中的归档、编译器版本、
header、libmpv 和 flags 定义。锁文件自己必须已提交，dirty 输入拒绝。

| 范围 | 固定文件数 / 总字节 | 身份 |
|---|---|---|
| UCRT64 完整前缀 | 6,990 / 553,090,415 | GCC 16.1.0 Rev5，树 SHA256 `5215ec9725ad0ef660064944eef6aba5106bd09044a0f70a6e37c4252815fab3` |
| Inno `{app}` 完整目录 | 118 / 28,932,279 | 6.7.3，树 SHA256 `b463554775c237560cb13ca5759098b963764256744f638ad2706ab0b8cba0dd` |
| InnoUnp 工具目录 | 5 / 1,782,207 | 树 SHA256 `f179e8ef4189195758b0620e7a3bfa6f5305f96f7cb5a79b587e5aa582ca6081` |

树算法按相对路径排序，串联 path、NUL、大写文件 SHA256、LF，再求
SHA256；文件总数、总字节和树 digest 同时检查。当前 Node locale 排序
与既有 Electron tree 算法一致；换宿主实现需重新验证。

UCRT64 保留整个前缀，包含 gcc driver、cc1plus、collect2、as、ld、
C++/GCC/MinGW/UCRT headers、CRT objects、静态/import 库和运行 DLL。
复制到项目 `.work/toolchain/msys2/ucrt64` 后，实际程序、include 和
主要库搜索位置均随前缀重定位；观察到的 compile-time fallback 目录
不存在。构建拒绝影响搜索的显式环境覆盖，具体变量在 lock 中列出。
不修改原系统工具目录，不安装或升级编译器，不修改原 flags。

Inno 原归档 SHA 与既有清单一致，现场 Authenticode 为 Valid / Pyrsys
B.V.。使用同样固定的 InnoUnp，在新目录独立解包该归档，118 文件
`{app}` 与原工具目录逐项相同。gate 检查归档、解包器和实际 ISCC 的
完整目录及准确 hash；只指定同版本但不同字节的 compiler 不能通过。
不执行 Inno 安装程序。

准备目录均位于项目 `.work/toolchain`：GCC 按上述完整前缀复制；Inno
需要清单对应的 `innosetup-6.7.3.exe`、`innounp.zip`、解包的 `innounp`
和 `inno/{app}`。这批材料已经在当前候选工作树固定。原始 MSYS2 包
归档、包签名和构建这些工具本身的完整源码尚未收齐；本地树固定不
等于工具链可从公开源码重建。Windows 系统 DLL、宿主 OS、Node/npm、
Git 和 PowerShell 的实现也不是这个完整前缀锁的组成部分，实测宿主
版本在本轮重复构建证据中单列。

Native provenance 记录固定完整树身份；校验已有 runtime 时只需要
提交中的 lock 和记录，不要求重新安装工具。实际编译前必须检查真实
工具目录，不能用 provenance 的历史 PASS 替代。Inno 容器输出重复性
另行比较，不由相同编译器或解包 payload 推断。
