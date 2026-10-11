# 简体中文安装器语言资源来源

- 资源：`ChineseSimplified.isl`，直接读取固定上游 commit 的 Git blob 原始字节。
- 上游仓库：[`jrsoftware/issrc`](https://github.com/jrsoftware/issrc)。文件在 Inno Setup 6.7.3 tag 中位于 `Files/Languages/Unofficial/ChineseSimplified.isl`，标记为用户贡献翻译。
- 固定版本：tag `is-6_7_3`，commit `4adf37ed7f3fd2bd11c6836ba056e3de170fbabf`。
- 兼容声明：语言文件头标记 `Inno Setup version 6.5.0+`；本资源通过 Inno Setup 6.7.3 编译验证。
- 编码：UTF-8、无 BOM、LF 行尾；文件 20,905 字节，0 个 CR、418 个 LF。SHA-256 `7d544b9bb1d142cfa11f2e5d3cc8abe2e55f8e066c5124e3772675aa236e1278`。
- 原始字节获取：固定 commit 的 checkout 在此 Windows 环境受 `core.autocrlf=true` 影响，会将 `.isl` 的 LF 转为 CRLF。最终资源通过 `git cat-file blob` 读取 Git 对象中的原始字节，避免该转换。
- 许可：同一上游 revision 的 `license.txt`，随附为 `LICENSE.txt`。许可允许使用、修改和再分发，要求保留源码版权声明与许可条件，并标示修改版；本语言文件未修改。
- 官方语言资源目录：<https://jrsoftware.org/files/istrans/>。该页面将简体中文标为 6.5.0+，并链接到上游仓库的语言文件。

## 完整性检查

以本机固定 Inno Setup 6.7.3 runtime 的 `Default.isl` 为基准，按 section/key 比对：英文键 **296**，中文键 **296**，缺失 **0**，多余 **0**。占位符比对不匹配 **0**，没有因键缺失而需要 English fallback 的项目。系统原生 Windows MessageBox 按钮文字仍由 Windows UI 语言决定，Inno Setup FAQ 说明此类按钮不由 `.isl` 翻译。

使用本文件和固定 6.7.3 工具链进行双语言最小安装脚本编译，成功生成临时安装包。没有进行安装或客户端验收。

SHA-256 校验值见 `SHA256SUMS.txt`。