# STRM Smart Path Mapping Phase 1

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

## Confidence and safety model

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

`HIGH` 只说明输入 pair 对 prefix relation 提供了强 segment evidence，不说明 cloud candidate 的来源可信、CD2 当前可见、目录已 hydration、provider identity 相同或生产 route 可以自动启用。

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

## Phase 2 boundary

### A. Is the current CD2 API sufficient?

它足以验证一个调用方已经知道的精确 cloud path，不足以自动发现 candidate cloud paths。因此 pure evaluator 可用，CD2-aware automatic mapping discovery 仍缺数据来源。

### B. Most reliable inference source

最可靠的 source 是一个经过 main-process 信任边界确认的 pair：authoritative `MediaSource.Path` 与精确、完整、绝对 POSIX cloud file path。当前 `FindFileByPath.fullPathName` 只能在调用方已经知道 exact cloud path 后取得，不能解决 discovery 的 chicken-and-egg。现阶段只有用户明确提供或未来受信任的 main-process enumeration/selection 能形成该 pair。

### C. When can confidence be HIGH?

输入必须全部通过严格 path parsing；没有 matching manual mapping；只有一个 longest candidate；filename 与至少三个连续父目录 segment 匹配；prefix 可区分；没有 traversal、relative、empty segment、incomplete candidate 或 root/share ambiguity。

### D. When is user confirmation required?

所有 suggestion 在正式写入前都应由用户确认。`MEDIUM`、任何多候选、不同 root kind、来源无法证明、manual conflict 或候选不完整尤其不能自动启用。`AMBIGUOUS`、`NO_MATCH` 和 `UNSAFE` 不应提供可应用 mapping。

### E. Safest Phase 2 integration point

最安全的 activation point 是 main-process `strmConfigStore.applyDiscovery()` 之前的显式确认/校验 adapter。确认后的 suggestion 转换为现有 version 1 `rules[]`，再次经过 `normalizeRule()`，只允许更新 AUTO、尊重 USER 与 DISABLED tombstone，并要求重启后由现有 service snapshot 生效。不要在 `libmpv.playInternal()`、`selectRule()` 或 `resolveAsync()` 内即时应用推导结果。

### F. Recommendation

对已经有可信 candidate pair 的 suggestion，策略是 **USER CONFIRM FIRST**。对“由当前 CD2 API 自主发现并进入生产 route”的 Phase 2，当前结论是 **INSUFFICIENT DATA**。不得将 `HIGH` 直接解释为 AUTO APPLY 授权。

## Explicit non-goals

本阶段不实现 ancestor enumeration、cold-directory materialization、FindFile retry、hydration、cache warming、provider-specific search、settings UI、config migration、hot reload 或任何 route outcome change。
