# 测试与验收

公开离线集合由 tools/ci-public-tests.cjs 实际发现 tests/*.test.cjs 并排除固定的材料依赖文件；不是完整产品验收。运行命令见 [贡献指南](CONTRIBUTING.md)，具体排除与流程见 [公开 CI](PUBLIC_CI.md)。

具有完整固定输入的环境可运行 npm test；部分用例需要 vendor、prepared preload 或 Windows native 工具链。缺少材料应报告未执行或失败，不能删断言或伪造 PASS。

插件材料合同还需显式运行 `node --test tests/plugin-*-material-selftest.cjs`，覆盖 Alameda 实例身份、真实冻结导航/路由、菜单和关闭别名顺序。它们不在 `npm test` 或公开离线自动发现集合中；具有固定材料的发行环境必须另行核对，原断言保持。

详情页菜单材料自测需显式运行 `node --test tests/item-select-menus-material-selftest.cjs`；它直接读取固定 vendor HTML、布局 CSS 与冻结 Emby select 模块，不属于公开离线自动发现集合。外置播放器详情页合同需运行 `node tests/external-player-item-material-selftest.cjs`，覆盖原控件退役和详情菜单 overlay 输出哈希。首页固定材料自测需运行 `node tests/home-server-rendering-material-selftest.cjs`，覆盖冻结 HomeTab 与首页 overlay 接线合同。

验收分层记录：单元/假服务验证逻辑；隔离 runtime 验证打包组件；真实 Emby/CD2 验证媒体、Session、远控；可见呈现验证视频区域；Windows 安装生命周期验证安装/升级/卸载/重装及权限。各层不能替代。

每次报告绑定源码与运行时身份、实际命令、结果和未覆盖项。原始日志与真实环境细节保存在仓库外，公开只提交可复现方法、合成 fixture 和必要脱敏结论。v0.3.0 的用户反馈和限制见 [项目状态](PROJECT_STATUS.md)。
