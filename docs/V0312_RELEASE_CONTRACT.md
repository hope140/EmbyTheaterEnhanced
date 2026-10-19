# v0.3.12 下拉框对齐修正测试版

## 范围与来源

用户已认可本地验收包并授权发布 Pre-release。基线为 main `4dd912a51ded4def7bc6c1208414748f9a5d17bb`；产品差异只涉及 STRM 两份布局/标签文件及 0.3.12 版本元数据。自定义顺序编辑器为既有功能，选项、顺序、保存及事件链保持。

通过正常 PR、审查与公开 CI 合并后固定最终 main 产品提交，从该 source 重新构建安装器，不把本地验收包 `282d39e` 标作合并后来源。完整 Electron、Native、依赖与外部工具链保持锁定。

## 门禁与发布

按既有 build/package provenance 合同构建，VerifyOnly 后由固定 Inno 编译；使用 InnoUnp 检查和解包，对完整 runtime 与 `{app}` 的路径、大小及 SHA-256 逐项核对。区分公开离线 CI、完整材料环境测试、材料自检、隔离控件和用户确认。

五附件为标准安装器、安装器 provenance、单文件 sha256、产品 source 的 RELEASE_NOTES.md、SHA256SUMS.txt。新 annotated Tag 绑定最终产品 source；检查 Tag CI 和 draft 附件身份后公开为 Pre-release。匿名完整下载回读并核对字节/长度；不替换旧 Tag 或资产，Stable/Latest 保持 v0.3.1。

更新当前下载入口、指南、文档索引、发行核验与状态，后续文档 HEAD 与产品 source 分开。未执行系统安装、真实服务器或播放/远控等场景不得补记为通过，许可未决事项保持。
