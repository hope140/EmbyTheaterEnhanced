# STRM Smart Path Mapping

本阶段只提供确定性的路径推导与只读 preview。它不写入 schema version 1 配置，不调用 `applyDiscovery()`，不改变 `selectRule()`、`resolve()`、`resolveAsync()` 或最终 `loadfile` source。生产播放顺序继续由已有规则决定：

```text
DirectUrl → CD2 HTTP → Mount → Native
```

## Current path contract

当前生产配置没有 `pathMappings` 字段。authoritative schema 是 `rules[]`，每条规则包含 `sourcePrefix`、`mountPrefix`、`cloudPrefix`、`strategy`、`order`、`originState` 和 `enabled`。未知字段不会被 version 1 store 持久化。

播放上下文保持三种不同 identity：

| identity | source | authority |
| --- | --- | --- |
| `sidecarPath` | `Item.Path`，或一次有界 metadata recovery 得到的 `.strm` Path | STRM sidecar identity |
| `sourcePath` | `MediaSource.Path` | absolute path rule matching 的唯一首选 identity |
| `nativeSource` | `options.url` | Resolver 失败时必须保留的 Emby source |

`sourcePath` 是可识别的绝对 Windows drive、UNC 或 POSIX 路径时，只使用它做最长前缀匹配；只有 source 不是绝对路径或是 HTTP(S) 时才允许 sidecar fallback。`MediaSource.Path` 与 `Item.Path` 不参加同一个 longest-prefix competition。

正式规则中的三个 prefix 含义固定如下：

| field | UI name | definition | consumer |
| --- | --- | --- | --- |
| `sourcePrefix` | STRM 源路径 | STRM / Emby `MediaSource.Path` 中记录的原始媒体路径前缀；不保证当前电脑可访问 | rule selection |
| `cloudPrefix` | CloudDrive2 路径 | 同一媒体在 CloudDrive2 中的绝对 POSIX 逻辑路径前缀 | DirectUrl / CD2 HTTP |
| `mountPrefix` | 本地挂载路径 | 当前客户端可通过 filesystem 访问的可选挂载前缀 | Mount fallback |

例如 `X:\115` 可以只是 STRM 中保留的历史 drive identity；只有 `mountPrefix=Z:\115` 才声明当前客户端实际挂载位置。三者不可互换。

## CD2 capability audit

当前 ETE 固定、校验 hash 的最小 CloudDrive2 proto 只声明：

```text
FindFileByPath(parentPath, path) → CloudDriveFile
GetDownloadUrlPath(path, preview, lazy_read, get_direct_url) → DownloadUrlPathInfo
```

能力状态如下：

| capability | status | current use |
| --- | --- | --- |
| exact path lookup | AVAILABLE | 对已由 authoritative rule 映射出的一个 `cloudPath` 调用 `FindFileByPath` |
| file path/type/size metadata | AVAILABLE, main-process only | 只验证 regular file；不会返回 renderer 作为 discovery source |
| same-origin download URL | AVAILABLE | `GetDownloadUrlPath` 后执行 origin/path 校验 |
| DirectUrl/expiry/User-Agent | AVAILABLE | 严格安全校验后只透传 file-local User-Agent |
| mount points | NOT AVAILABLE | 当前 proto/client 没有对应 RPC 或 message |
| root directory listing | NOT AVAILABLE | `/` 的 connection probe 不是 root discovery |
| directory enumeration/tree traversal | NOT AVAILABLE | 当前 proto/client 没有 list/stream RPC |
| stable file/mount/provider IDs | NOT AVAILABLE | `CloudDriveFile` 没有 ID 字段 |
| name/suffix/fuzzy search | NOT AVAILABLE | 只有 exact path lookup |
| caller-provided `candidateCloudPaths` IPC | NOT AVAILABLE | 当前 renderer IPC 发送的是 source/local `candidates`，main 再按 rule 映射 |

因此当前 API 可以验证调用方已经知道的精确 cloud path，但不能从 CD2 自身发现 mount、root、目录树或 cloud candidates。历史研究中出现过其他 proto 的 MountPoint/目录方法，不属于当前 ETE client capability，不能作为本阶段实现依据。

## Pure inference contract

入口为：

```javascript
inferSmartPathMapping({
    localPath,
    candidateCloudPaths,
    manualMappings,
    pathSemantics
})
```

输出固定包含：

```javascript
{
    status: 'MATCHED' | 'AMBIGUOUS' | 'NO_MATCH' | 'UNSAFE',
    suggestion: null | {localPrefix, cloudPrefix},
    confidence: 'HIGH' | 'MEDIUM' | 'LOW',
    evidence: {
        matchedSuffixSegments,
        matchedParentSegments,
        filenameMatched,
        caseRules,
        candidateCount,
        validCandidateCount,
        manualMappingMatched,
        manualConflict,
        reason
    }
}
```

函数没有文件系统、网络、时间、随机数、配置写入或播放器依赖。相同输入产生相同输出。

### Path parsing

- Windows drive path 必须是 `X:\...` 绝对路径。drive 与 segment 比较大小写不敏感，separator 统一为 `\`。
- UNC 必须保留 `\\server\share` boundary；server/share 与 segment 比较大小写不敏感。device namespace、relative UNC、跨 share prefix 和空 segment 被拒绝。
- POSIX 必须以单个 `/` 开始，segment 比较大小写敏感。反斜杠、重复 `/`、trailing `/` 和相对路径被拒绝。
- 三种路径都拒绝控制字符、`.`、`..`、root-only full path、incomplete path 和 empty-segment ambiguity。
- CD2 cloud candidate 固定要求为绝对 POSIX full path。Phase 1 不接受 Windows/UNC cloud candidate，也不把 URL 当 path。

### Longest suffix and prefix boundary

推导按 segment 从文件名向父目录逐段比较，不使用 substring、contains、全路径 `toLowerCase()` 或字符串 replace。Windows/UNC 的 segment comparison 大小写不敏感；POSIX local path 大小写敏感。

最长连续 suffix 中最靠近 root 的那个 matched directory 被保留为 mapping anchor。例如：

```text
local  D:\Media\Movies\A\B\movie.mkv
cloud  /115/Movies/A/B/movie.mkv

matched suffix  Movies/A/B/movie.mkv
suggestion      D:\Media\Movies → /115/Movies
```

这避免把有业务意义的共同目录名从两侧 prefix 中同时剥掉。候选输入顺序不影响 unique-longest 结果；两个不同候选具有相同最长 suffix 时返回 `AMBIGUOUS`，不会按数组顺序选 winner。完全相同的候选只去重，不制造 ambiguity。

## Phase 1 file pair evidence

| evidence | result |
| --- | --- |
| filename + 至少 3 个连续父目录，唯一最长候选 | `MATCHED / HIGH` |
| filename + 2 个连续父目录，唯一最长候选 | `MATCHED / MEDIUM` |
| filename + 1 个父目录 | `NO_MATCH / LOW` |
| 只匹配 filename | `NO_MATCH / LOW` |
| filename 不匹配 | `NO_MATCH / LOW` |
| 多个候选同分 | `AMBIGUOUS / LOW` |
| relative、traversal、empty segment、incomplete/非 POSIX cloud candidate | `UNSAFE / LOW` |
| 推导后两侧 prefix 相同 | `NO_MATCH / LOW` |

这里的 `HIGH` 只说明两个完整路径的文件名和连续父目录高度吻合，是文件对应关系证据。一个样本可以对应多个同样有效的 prefix cut；它不能证明可复用映射边界。Phase 2.2 的用户助手另用多样本决定 `boundary.confidence`。

## Manual mapping authority

`manualMappings[]` 只考虑 enabled 且非 `DISABLED` 的 mapping，并按匹配 local path 的最长 `sourcePrefix` 判断：

- 匹配的 manual mapping 存在时返回 `NO_MATCH / manual_mapping_exists`，不输出 suggestion。
- 同等最长的 manual mappings 指向不同 cloud output、manual cloud target 无效，或已知 cloud candidates 与 authoritative manual result 冲突时，返回 `UNSAFE / manual_mapping_conflict`。
- 不同 drive 或不同 UNC share 的 manual mapping 不跨 root 生效。
- Phase 1 不修改 USER、AUTO 或 DISABLED rule，也不补写缺失的 `cloudPrefix`。

## Dry-run diagnostics

`strmResolver.previewSmartPathMapping()` 是显式调用的只读 hook。它返回完整 inference result，并可通过现有 fail-open `onDiagnostic` sink 发出：

```text
resolver / smart-path-mapping-candidate
```

diagnostic details 只包含：

```text
status
confidence
matchedSuffixSegments
candidateCount
reason
```

不包含 local path、cloud path、suggested prefixes、URL、token、headers 或媒体名。production `libmpv.playInternal()` 不调用该 preview，`resolveAsync()` 也不读取 inference result。

## Phase 2 and 2.1 historical assistant contract

以下记录最初单样本助手的实现经过；当前可加入规则的条件以 Phase 2.2 为准。

Phase 2.1 将助手输入明确为三个同一文件的完整路径：`STRM 源文件路径`、`CloudDrive2 文件路径` 与可选 `本地挂载文件路径`。source 是 STRM / Emby 中记录的路径，不是当前电脑挂载位置。页面不会扫描目录、调用 CD2、读取媒体库或自动发现候选。

renderer 通过 trusted settings IPC `enhanced-strm-smart-mapping-preview` 把三条原始输入交给 main process。handler 用 Phase 1 `inferSmartPathMapping()` 推导 source → CloudDrive2；提供 mount sample 时，再用同一 parser/suffix core 的 `inferSmartMountMapping()` 做独立安全判定。它不读写 config，不调用 Resolver/CD2/Mount/Native。assistant response 对外使用 canonical `sourcePrefix/cloudPrefix/mountPrefix` 名称；Phase 1 的 `localPath/localPrefix` alias 仅为既有 pure API 兼容保留。

Mount inference 支持 Windows drive → Windows drive/UNC、UNC → Windows drive/UNC、POSIX → POSIX。它先以 cloud HIGH suggestion 固定 `sourcePrefix` 与相对 suffix，再从 mount full path 的末尾严格逐 segment 验证并剥离该 suffix，避免两个独立 longest-suffix 选出不同 anchor。仍禁止 substring、contains 与无边界 replace。

Phase 2.1 曾仅凭单组 `MATCHED/HIGH` suffix 启用“加入路径规则”。真实样本证明该 HIGH 只适用于文件对应关系，因此 Phase 2.2 已撤销单样本新规则入口。Windows drive/UNC 比较大小写不敏感，POSIX 与 cloud prefix 大小写敏感。

确认只把 suggestion 转成一个普通 version 1 `USER` rule：

```text
localPrefix → sourcePrefix
cloudPrefix → cloudPrefix
mountPrefix → mount HIGH 时使用 canonical prefix，否则 empty
strategy → cloud-first
order → DirectUrl / CD2 HTTP / Mount / Native
```

确认后的 rule 只进入页面现有 `rules[]` draft/editor。用户可以继续编辑或移除，只有点击原有“保存设置”后才通过 `enhanced-strm-config-save → store.save() → normalizeRule()` 持久化并要求重启。页面离开时不隐式保存，普通规则的删除、AUTO disable/restore 也先进入 draft；assistant 不调用 `applyDiscovery()`，也没有第二套 schema。

Phase 2.1 不迁移、不猜测、也不自动修正既有 persisted rules。已有错误规则只能由用户在 editor 中删除或修改并显式保存。

duplicate 表示 equivalent `sourcePrefix` 与相同 `cloudPrefix` 已存在；conflict 表示 equivalent `sourcePrefix` 指向不同 cloud target。两者都不会加入第二条 draft，也不会覆盖或合并 manual rule。parent/child prefix 仍属于合法 longest-prefix 关系。

diagnostics 使用现有 trusted structured-log channel，只发送白名单 scalar：

```text
smart-path-mapping-preview: coverageStatus, fileMatchConfidence, boundaryStatus, boundaryConfidence, matchedSuffixSegments, reason
smart-path-mapping-accepted: boundaryConfidence, matchedSuffixSegments
```

事件不包含 raw input、canonical prefix、URL、Token、credential 或 rule body。`accepted` 只表示用户把 HIGH suggestion 加入本地 draft，不表示已保存、已重启或 production route 已启用。

## Phase 2.2 boundary model

当前助手最多接收 8 组用户手工提供的对应文件。每组包含 STRM source、CloudDrive2 absolute POSIX path 和可选 mount path。main-process trusted preview IPC 只调用 `smart-mapping-boundary.js` 纯函数；响应分为 `coverage`、`fileMatch`、`boundary`、`mount` 与可选 `suggestion`。诊断只记录固定枚举和计数，不含任何路径或规则正文。

判定顺序固定：

1. 对每组 source 按正式 sourcePrefix 的路径种类、目录边界、大小写和最长前缀规则选择当前页面的 eligible `rules[]`。用既有 `replacePrefix` 形成 cloud/mount 预期路径，再按目标路径语义做 canonical 精确比较。所有样本被已有规则解释时返回 `FULLY_COVERED` 或 `CLOUD_COVERED`，显示命中的规则，不生成新建议。已选规则与样本矛盾、部分样本落入不同覆盖状态，或 DISABLED tombstone 抑制同一边界时返回 `CONFLICT`。
2. `matchFilePair()` 只评估同一文件的 suffix evidence。文件名和至少三个连续父目录一致可得 `fileMatch=MATCHED/HIGH`，与新规则边界无关。
3. 一组样本即使 fileMatch HIGH，`boundary=INSUFFICIENT_EVIDENCE/LOW`。用户需补充另一组不同目录的同源文件。
4. `inferMappingBoundaryFromSamples()` 在至少两组独立目录样本上，分别求 source/cloud 的最深安全公共父目录。该最深公共父目录是唯一的最大特异候选；要求两侧在其下都有不同第一层目录分叉、不是 root-only，且每组完整相对 suffix 精确一致。CloudDrive2 始终按 POSIX 大小写验证。全部成立才返回 `boundary=MATCHED/HIGH`。
5. `inferMountBoundaryFromSamples()` 使用已确定的同一 sourcePrefix，从每组 source 得到 relative suffix，并逐段验证 mount 完整路径。所有 mount 样本支持同一非 root mountPrefix 时才给 `mount=MATCHED/HIGH`；缺失、不安全或不一致的 mount 样本只使建议的 `mountPrefix` 保持空，不提升也不降低 cloud boundary。当前 Windows 客户端允许 POSIX STRM source → Windows drive/UNC Mount target；正式 `replacePrefix()` 支持这种跨目标路径类型的映射。Windows drive/UNC source → POSIX Mount target 在当前客户端不生成 HIGH。

真实问题回归：既有 `sourcePrefix=/CloudNAS/CloudDrive/115open/115`、`cloudPrefix=/115open/115`、`mountPrefix=X:\115` 已精确解释 `/番剧/A/file.mkv` 样本。preview 为 `FULLY_COVERED`，不会再生成更宽的 `/CloudNAS/CloudDrive/115open → /115open` 规则。没有现有规则时，只有两组跨 `番剧/电影` 分叉的样本才能把 boundary 升为 HIGH。同目录仅换文件名不是独立目录证据。

## Production activation boundary

### A. Is the current CD2 API sufficient?

它足以验证一个调用方已经知道的精确 cloud path，不足以自动发现 candidate cloud paths。因此 pure evaluator 可用，CD2-aware automatic mapping discovery 仍缺数据来源。

### B. Most reliable inference source

最可靠的 source 是一个经过 main-process 信任边界确认的 pair：authoritative `MediaSource.Path` 与精确、完整、绝对 POSIX cloud file path。当前 `FindFileByPath.fullPathName` 只能在调用方已经知道 exact cloud path 后取得，不能解决 discovery 的 chicken-and-egg。现阶段只有用户明确提供或未来受信任的 main-process enumeration/selection 能形成该 pair。

### C. When can confidence be HIGH?

文件对应关系 HIGH：每组 filename 与至少三个连续父目录 segment 匹配。映射边界 HIGH：至少两组不同目录的样本、source/cloud 最深非 root 公共父目录各自唯一、两侧都有目录分叉、所有相对 suffix 精确一致、没有已覆盖或冲突的现有规则；单组样本不能达到边界 HIGH。

### D. When is user confirmation required?

只有 boundary HIGH 的 suggestion 才能由用户加入页面草稿；用户仍需显式点击 Save。文件匹配 HIGH 但 boundary 不足时只展示证据。`CONFLICT`、`UNRESOLVED`、`UNSAFE` 不产生可加入规则。

### E. Safest Phase 2 integration point

当前 user-confirmed assistant 的安全接入点是现有 Settings `rules[]` draft：确认后的 suggestion 先成为普通 `USER` rule，随后只由用户显式 Save 进入 `store.save()` / `normalizeRule()`，并要求重启后由现有 service snapshot 生效。`applyDiscovery()` 保留给未来有独立数据来源和 AUTO contract 的 discovery，不参与本助手。不要在 `libmpv.playInternal()`、`selectRule()` 或 `resolveAsync()` 内即时应用推导结果。

### F. Recommendation

对已经有可信 candidate pair 的 suggestion，策略是 **USER CONFIRM FIRST**。对“由当前 CD2 API 自主发现并进入生产 route”的 Phase 2，当前结论是 **INSUFFICIENT DATA**。不得将 `HIGH` 直接解释为 AUTO APPLY 授权。

## Explicit non-goals

本阶段不实现 ancestor enumeration、cold-directory materialization、FindFile retry、hydration、cache warming、provider-specific search、config migration、hot reload 或任何 route outcome change。
