# Windows Host：完整来源与源码派生产物

当前完整官方组件保持19文件／3,967,899 bytes，来源manifest、归档身份与必要声明不变。运行投影精确排除9项，保留10项；其中原版EXE/PDB只作为新建基础装配的替换目标，随后由已核验的ETE源码构建产物替代。最终为8项未改官方成员、2项派生产物及另行固定的Newtonsoft DLL。Model是单独来源组件，不混入这19项白名单。

## 固定来源

- 官方归档：Windows3.0.20 `emby-theater-x64.zip`，111,318,728 bytes，SHA256 `3bc01d288d64046483ef12a8e5a70cc31b6d8b65ed9ee1837554ab7eba797c4c`。
- 完整清单：`vendor/windows-host-manifest.json`；准备正文：忽略的 `vendor/windows-host/3.0.20/`。
- 官方源码：`MediaBrowser/emby-theater-windows` 固定 `708fadc068cbf66ced6aece4a32f3e12bb2c4e13`，55份源码／资源／声明输入。ETE的6替换＋2新增产生57份选择和46编译项。[维护源码合同](../native/windows-host/README.md)记录GPL派生修改及独立MIT材料。
- 当前统一来源指纹：`81b18ab1264941b7121967770d9b791af7fd4436b6cf910da443c92f967eea45`。官方Model另以 `db22f8ea6cb6afdfab184f80d8b85a10d8a9f148ff4cae167db87ce9cd245153` 校验。

## 精确运行投影

| 排除组 | 完整来源中仍保留的路径 | 新runtime行为 |
| --- | --- | --- |
| 私有框架DLL | `System.Configuration.dll` | 不随应用分发；不改系统／GAC |
| CEC | `cec/cec-client.exe`、`cec/cec-client.x64.exe`、`cec/cec.dll`、`cec/cec.x64.dll`、`cec/p8-usbcec-driver-installer.exe` | CEC插件、spawn、Host安装提示及入口一起退役；不卸系统驱动 |
| 旧JSON／ZIP依赖 | `ServiceStack.Text.dll`、`ServiceStack.Text.xml`、`SharpCompress.dll` | 当前Host无这些编译引用；使用固定JSON依赖及框架ZIP实现 |

完整19项在准备和来源校验中继续全部检查，不能因不分发而省略或篡改来源输入。投影核对精确路径／大小／hash，拒绝大小写别名、额外输出、目录和链接；不采用目录通配删除。`RefreshRate.exe`、相关协议、普通HDMI音视频及其余有效成员保留。来源记录明确区分完整集合、排除差集与最终派生输出。

## 准备与构建

```powershell
./tools/prepare-windows-host.ps1 -ArchivePath '<fixed official ZIP>'
node tools/windows-host-input.cjs validate .
```

归档先整包校验，再验证唯一白名单成员；输出必须新建，不执行归档程序。完整来源恢复成功仍不等于派生Host输入齐备。构建另要求已审核的HEAD锁和匹配EXE/PDB，或当前runner编译／验证后生成的锁和完整回执；两套同时存在则失败。准备目录分别为 `vendor/source-built-host/snapshot-v1/` 和 `vendor/host-json/snapshot-v1/`。

`tools/build.ps1` 在创建dist前调用 `tools/source-built-host-input.cjs preflight`。基础组装之后只替换原版两叶文件，再记录生成器、源码、Model、工具链、回执和输出身份；不存在旧Host回退。普通锁须进入HEAD，不能只复制或暂存；runner锁绑定当前HEAD／运行和本次实际验证，不能沿用外部回执。具体流程见[构建与打包](PACKAGING.md)。

## 验证、升级与限制

runner 的 Framework 字节受独立[实现来源合同](FRAMEWORK_SERVICING_PROFILES.md)约束：原固定实现保持，已观察到的旧镜像候选另须匹配精确镜像/OS、规范系统路径、实际微软有效签名及重新计算的文件哈希。入口在下载依赖前只读预检，最终仍以实际 Host 观察和完整行为验收生成本次锁；未知实现失败，不安装更新或跳过验证。artifact 中的 runner-framework-profile.json 只是预检回执。

回归覆盖完整来源身份、精确投影、缺失／篡改／额外项、重定向、未提交锁、Model及派生EXE/PDB不符、装配归属和最终provenance篡改。入口为 `tests/windows-host-input.test.cjs`、`tests/source-built-host-input.test.cjs`、`tests/ci-source-built-host.test.cjs`、`tests/runtime-base-assembly.test.cjs`、`tests/runtime-provenance.test.cjs` 及 `tests/windows-host-material-selftest.cjs`。

本轮隔离候选的构建、安装器、升级、测试副本STRM播放及正常Host入口已获通过回报，用户确认验收；准确来源提交和后续待办见[收尾清单](SOURCE_CLEANUP_CLOSEOUT.md)。新runner未跑通、纯net462环境兼容及MSB3277仍分别记录，不把一次候选验收扩展为所有环境结论。

升级只处理注册应用目录[14项精确身份](../installer/retired-runtime.json)，不递归删目录，不执行旧助手／驱动安装器，不删除profile、登录态、配置或pending归档。回滚从可信旧来源重新构建或使用原可信安装包，不手工夹回文件后沿用新包manifest。

必要许可、历史manifest/hash及Git历史保留。官方分发身份或本轮源码构建成功不证明所有第三方完整源码／通知义务已闭合；声明边界仍见 `SOURCE_MATERIALS.md`、`LICENSING.md` 和 `THIRD_PARTY_NOTICES.md`。
