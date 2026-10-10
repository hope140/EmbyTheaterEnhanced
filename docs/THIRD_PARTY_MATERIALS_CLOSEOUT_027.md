# 第三方材料有界收尾核查 027

日期：2026-10-10（UTC+8）。状态：有界核查完成，剩余材料WAITING_EXTERNAL。

本轮只读核查材料来源与构建关系。材料核查worker只读维护工作树与源材料工作树，未修改产品源码、vendor、runtime、工具或原始材料。沿用原审计中的 160 项材料记录和 17 个 MSYS2 原包，不复制已有归档。三轮定向查询没有找到能以精确身份绑定到目标二进制的新材料，因此本轮未下载新源码或二进制。

主线程随后回读160项实体文件，160/160、missing/mismatch0；五份外部输入/工具链清单与本轮产品来源的Git blob相同，详见 [实体回读](evidence/third-party-readback-027.json)。这不是重验签名或源码重建。

## 核查结论

| 范围 | 状态 | 结论 |
|---|---|---|
| patched libmpv winbuild 与依赖 | `WAITING_EXTERNAL` | 目标 SourceForge dev archive 与 DLL 的既有 SHA256 关系保持成立。指定 GitHub release API 路径返回 404；上游 winbuild 仓库和其他日期发布仅是线索，不能证明生成了目标归档。仍缺准确 workflow、依赖修订、patch、构建配置和通知集合。 |
| Windows Host / DLL 构建关系 | `WAITING_EXTERNAL` | Host `3.0.20` tag 固定到 `708fadc068cbf66ced6aece4a32f3e12bb2c4e13`。既有三项 NuGet DLL EXACT 观察不变；Host EXE 和 Model、SharpCompress、SocketHttpListener 等文件仍未由准确构建输入绑定。公开源码可见不等于二进制重建或对应源码闭合。 |
| 离线 Web、字体与图像 | `WAITING_EXTERNAL` | 761 个 Web 路径、23 个字体和 19 个图像仍由冻结 manifest 固定。查到的公开 Web components/default skin 仓库是部分组件参考，不能当成完整离线 Web 快照。没有精确源版本、依赖锁、Carnival overlay 映射及逐资产来源/通知。 |
| MSYS2 剩余 recipe | `WAITING_EXTERNAL` | `mingw-w64-crt`、`mingw-w64-headers`、`mingw-w64-winpthreads` 的包内 PKGBUILD SHA256 在既有候选范围均未匹配。当前 recipe 路径存在不证明其字节对应历史包；旧 `-git` 路径在 master 返回 404。原 12 项 EXACT recipe 和 54 个 recipe/patch 文件身份保持。 |

各项精确目标身份、查询 URL、已查结果、所需材料和可执行下一步见 [机器证据](evidence/third-party-closeout-027.json)。原始查询轮次见 [查询记录](evidence/third-party-queries-027.json)。原证据按源材料 commit `05a08e9113ae1485256a505c64d7aba7d9edd67b` 及文件 SHA256 引用，未改写或替代原始清单。

## 后续可执行步骤

1. 向原提供者索取能按目标 SHA256 对应的 libmpv / Host 构建包、日志和依赖锁，以及 Web 源快照、overlay 映射和资产通知。
2. 对三项 MSYS2 剩余 recipe，以包内 `pkgbuild_sha256sum` 为精确接受条件，从对应公开 CI/历史提交查找 recipe 目录迁移与完整配方；任何 hash 不匹配的版本继续记 `WAITING_EXTERNAL`。
3. 收到材料后先校验文件身份、版本、来源和边界，再判断是否需要源码构建实验。此记录本身不作产品修改或法律结论。

本轮没有形成许可意见、完整对应源码闭合结论或源码到二进制可复现结论。没有运行脚本、下载程序、安装器、服务或客户端。
