# Vendor 输入

当前准备和构建按独立组件 manifest 恢复并核验材料，不读取 `vendor/carnival/` 或 `vendor/patch/`，也不靠旧安装包补文件。`runtime-manifest.json` 的1009个 Carnival／51个补丁记录保留为历史来源和校验依据，不表示当前必须恢复这些正文。

活动快照为兼容资源39项、小组件2项、Web713项，版本由各 manifest 明示。冻结输入与原始归档只读；需要变更活动集合时遵循既有快照迁移流程。完整 npm 来源保持33包／1142文件，发布投影仅精确排除20项，保留必要 LICENSE／NOTICE。

官方 Windows3.0.20 完整来源仍为19项；runtime 精确排除9项，余下10项中的 Host EXE/PDB替换为已验证的 ETE 源码构建产物，另加入固定 Newtonsoft DLL。官方 Model 独立校验，Electron 使用固定44.4.2 Windows x64完整树，libmpv使用仓库记录的固定归档恢复。源码派生 Host、第三方原件和生成器分别记录身份，不能互相冒充。

维护源码位于 `src/`、`native/`；Web只复制合同明确选择的 overlay。默认配置和中文维护源按各自合同生成，构建不覆盖用户已有配置，不安装字体或预设，不运行旧 BAT／驱动安装器。

入口见[构建与打包](../docs/PACKAGING.md)、[Host输入](../docs/WINDOWS_HOST_INPUT.md)及[来源材料](../docs/SOURCE_MATERIALS.md)。历史分类A至E及其证据见[基线审计](../docs/CARNIVAL_BASELINE.md)。已固定来源或源码可用不等于所有第三方许可、完整对应源码及二进制重建义务已经核验完成；必要声明保持。
