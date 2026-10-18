# 贡献指南

欢迎提交可复现问题、文档修正和范围明确的 Pull Request。问题请说明版本、系统、复现步骤、预期与实际行为；播放问题补充普通媒体或 STRM、使用的路由、Stop/Next 时序。诊断中不要包含 Token、Cookie、完整地址、私人路径或媒体库标识。

修改前阅读 [架构](ARCHITECTURE.md) 和最近代码，遵循现有风格。产品改动与文档整理分开。保持播放会话身份、取消、Native fallback 和 DirectUrl header 边界，增加对应关键边界测试，不扩大到无关播放链重构。

公开离线验证使用固定依赖，无需真实服务器：

```powershell
npm ci --ignore-scripts
node tools/ci-public-tests.cjs
node tools/ci-syntax.cjs
pwsh -NoProfile -File tools/ci-powershell-syntax.ps1
node tools/ci-secret-scan.cjs
git diff --check
```

[测试说明](TESTING.md) 区分公开集合与材料依赖测试；[构建说明](PACKAGING.md) 列出外部输入。不要用测试退出成功代替真实安装、播放或可见呈现验收。版权和来源问题请准确注明组件及依据，保留上游通知。

整理用户文档时从[文档索引](README.md)确认受众和入口；发行说明遵循[Release 规范](RELEASE_CONVENTIONS.md)及其模板，保留历史版本、原始附件和来源关系。
