# 维护注意事项

- 以运行时和完整来源清单判断版本，不以开发依赖声明推断 Electron/libmpv 身份。
- source provenance、runtime relation 与 payload manifest 分别证明输入、生成关系和最终文件集合，不能互相替代。
- 新 Play、Stop 和 Next 必须使旧异步响应失效；超时只限制耗时，不能替代请求与 generation 归属检查。
- 普通 RPC 失败继续回退，Abort/superseded 终止旧请求。Mapping miss 与 CD2 not_found 分开判断。
- User-Agent 使用 file-local loadfile 选项；未知 headers 不进入播放器，不修改全局 header 设置。
- 单元测试、隔离 runtime、媒体推进、用户可见画面、Session/远控和真实安装是不同证据层；缺失值保持 UNKNOWN/不可用。
- 原始路径、URL、认证头和媒体标识不得进入公开诊断。有限脱敏规则仍需人工检查导出包。
- Windows 脚本保留编码和换行；固定 sourceCommit 的构建从 Git blob 获取字节，避免混入工作区残留。
- 传统插件的 data-require 失败发生在插入之前，controller 模块失败发生在插入之后；必须实际区分这两条失败路径。取消既要阻止旧状态提交，也要只销毁旧请求所属的暂存节点。
- GenericUI 可复用旧通知出口；新版同名模块依赖不同不能作为替换整个共享 input/API 或播放栈的理由。合成 schema 通过仍需真实插件前台验证。
- Alameda 按规范化的 AMD 标识缓存实例，不按最终文件路径去重。维护目录中的共享依赖应引用原 `modules/...` 标识；同文件的 `../www/modules/...` 会重复创建未初始化的 service locator/appsettings 等实例，必须用真实应用加载链验证。
- 真实插件协议枚举不能由合成 fixture 推断。Emby 4.10 的普通 GenericUI 响应使用 `RegularPage`；应先取得只读结构证据，再验证真实 controller 和 DOM，错误提示出现不能记为兼容通过。
- 页签direct route检查与真实按钮点击是不同证据。使用原生tab组件时，程序selectedTabIndex同样触发tabchange；恢复选中态必须抑制自己的处理器，mock也必须保留此行为。动态Caption只更新正文不能更新应用页头，标题更新还需转义及请求归属保护。
