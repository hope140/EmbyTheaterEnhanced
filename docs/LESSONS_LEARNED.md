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
