# v0.4.7 安装包通知实物核对

核对日期2026-11-01。已完成此前[补件清单P1](SIGNPATH_V047_GAPS.md)中的安装包只读提取和有限通知比对；原先“无法解包/未独立回读”是前轮事实，由本轮证据补充。完整URL、版本、哈希和逐项结果见[机器回执](evidence/signpath-v047-payload-notices.json)。没有运行安装器或产品，没有安装系统组件。

## 包与提取结果

重新下载公开 [v0.4.7安装器](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.7)，162030104 bytes，实算SHA256 `8157ed8b38d075bba080992933dce04d8c813729b11895745455be127b814d42`。使用 [crazy-max/innoextract v1.13.0](https://github.com/crazy-max/innoextract/releases/tag/v1.13.0) Linux工具只读列举并提取；工具SHA256 `c898db2ecc282ff8d943e9868d03dd6f1fc6069ddd40430341b211f93826b360`，匹配其GitHub发行API摘要。工具识别setup data 6.7.0，返回0；出现`Unexpected filetime: 0`警告，源码安装器使用`notimestamp`。本轮不依赖时间字段，独立核对文件内容。

提取到2226个文件：包内build-manifest列出的2225个文件全部存在、逐文件SHA256一致；另外一个文件就是build-manifest自身，没有其它多余文件。build-manifest SHA256为`ea000b7ef9fa474d80b2f97396ef7c1764a7695b624bba0885c4c669d4b9e187`，匹配发行外置provenance；内外sourceCommit均为`5190a7020d0d00ea06776676921469736859bfbd`。这证明本轮取得的包与该来源记录一致，不证明发布方所有第三方授权已成立。

## 实际携带的通知

| 范围 | 独立比对依据 | 本轮结果 |
|---|---|---|
| 16份项目通知/来源说明 | 包内build-input-provenance中的16路径；对照准确源码提交的Git blob，而非更新后的工作树。 | 16/16存在、哈希一致，原始字节均与源码blob相同，包括LICENSE、THIRD_PARTY_NOTICES、API MIT、Host GPL及两个MIT文件和所列来源文档。 |
| Electron/Chromium | 重新下载官方44.4.2 Windows x64 ZIP并核其固定SHA256，再从ZIP读取两份通知。 | 包内`x64/electron/LICENSE`（1096 bytes）及`LICENSES.chromium.html`（20472830 bytes）与官方归档逐字节相同。 |
| 33个生产npm包 | 按该提交package-lock选择`dev !== true`的33包，从各锁定官方registry URL下载tarball并验证SRI；比较其中license/notice/copying命名文件。 | 上游共36个许可命名文件全部存在于包内，逐字节一致。此计数包括`emoji-regex/LICENSE-MIT.txt`，不延用早期35文件的命名规则漏计。 |
| 7项继承npm包通知 | 固定Emby Electron `e897adda583b2339f077cb67113e71326a806de0`的对应Git文件，按已锁定换行转换比较。 | 7/7通知存在，哈希和转换后字节一致；范围按manifest的包记录，嵌套is-windows另计。 |
| Windows原生媒体依赖 | 对照固定Koffi3.3.3完整成员清单；前轮已独立验证两个原始tarball。 | 主包的`LICENSE.txt`、`vendor/node-api-headers/LICENSE`、`vendor/node-addon-api/LICENSE.md`三份通知均在最终包内，哈希一致。原生子包无独立LICENSE是上游原始包的事实，并非本次装配丢失。 |

因此，**在本轮明确比对的通知集合中，没有发现预期通知文件被漏装或修改。**这不是对整个发行许可条件、所有嵌入代码的通知覆盖或对应源码完整性的保证。33包的检查对象是上游许可命名文件，不包括对所有README、源码内声明及隐含依赖逐项法律审查；Koffi主包通知对原生成员的具体覆盖仍按真实项目/许可关系判断。

另核包内根路径：ServiceStack.Text.dll、SharpCompress.dll、私有System.Configuration.dll和五个CEC二进制均不在，符合当前投影；这些旧输入的通知研究不能直接变成当前包“缺文件”的结论。必要历史通知仍可能随总说明保留。

## 还缺什么、是否需要用户提供

- Web、preload、部分图像的来源/许可适用关系，以及Model/Common对应发布源码关系，仍是[具体清单U1—U5](SIGNPATH_V047_GAPS.md)所列问题。文件存在及总说明随包不能补出未知授权。
- libmpv实际依赖锁、补丁、配置、完整对应源码与必要通知范围仍未闭合；不能因为已交付mpv/FFmpeg已知全文就声称全部链接依赖已覆盖。GPL组合判断另列。
- 本轮未发现需要用户重新提供安装器、Electron/npm/Koffi公开包或现有通知。若用户保存Web/preload原始来源或授权记录，仍可能推进剩余来源链；无需提供账号、Token、媒体或私人服务器资料。

复核方法：对固定安装器先验整体SHA，用上述固定工具提取到全新审计目录；按build-manifest逐文件计算SHA，单列manifest自身；用准确源码commit的Git blob比项目通知，用lock的resolved/integrity验证npm tarball并比较许可命名成员，用固定Electron ZIP比较两份全文。不得将运行安装器、修改现用客户端或执行包内脚本混入这一核对。
