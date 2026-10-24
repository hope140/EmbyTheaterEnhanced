define(['loading', 'baseView', '../../enhanced/release-note-links.js', 'emby-button', 'emby-select', 'emby-scroller', 'css!modules/listview/listview', 'css!./enhanced-settings', 'css!./about'], function (loading, BaseView, noteLinks) {
    'use strict';

    var CHANNELS = {
        info: 'enhanced-maintenance-info',
        copy: 'enhanced-maintenance-copy-environment',
        checkUpdate: 'enhanced-maintenance-check-update',
        releases: 'enhanced-maintenance-open-releases',
        noteLink: 'enhanced-maintenance-open-note-link',
        getChannel: 'enhanced-maintenance-get-channel',
        setChannel: 'enhanced-maintenance-set-channel',
        download: 'enhanced-maintenance-download-update',
        cancel: 'enhanced-maintenance-cancel-update',
        progress: 'enhanced-maintenance-update-progress',
        kernelStatus: 'enhanced-mpv-kernel-status',
        kernelImport: 'enhanced-mpv-kernel-import',
        kernelSelect: 'enhanced-mpv-kernel-select'
    };

    function request(channel, payload) {
        if (!window.ipc || typeof window.ipc.invoke !== 'function') return Promise.reject(new Error('maintenance_api_unavailable'));
        return window.ipc.invoke(channel, payload);
    }

    function setStatus(node, text, isError) {
        node.textContent = text || '';
        node.setAttribute('role', isError ? 'alert' : 'status');
    }

    function setValue(view, selector, value, fallback) {
        view.querySelector(selector).textContent = value || fallback || 'UNKNOWN';
    }

    function setUpdateCancel(view, action) {
        var button = view.querySelector('.btnCancelUpdate');
        button.hidden = !action;
        button.disabled = !action;
        if (action) button.textContent = action === 'check' ? '取消检查' : '取消下载';
    }

    function AboutView(view) {
        BaseView.apply(this, arguments);
        this.view = view;
        this.info = null;
        this.infoRequestId = 0;
        this.kernelRequestId = 0;
        this.updateRequestId = 0;
        this.updating = false;
        this.downloading = false;
        this.changingChannel = false;
        this.updateChannel = 'stable';
        this.channelRequestId = 0;
        this.progressListener = null;
        setUpdateCancel(view, null);
        view.querySelector('.btnCheckUpdates').addEventListener('click', this.checkUpdates.bind(this));
        view.querySelector('.selectUpdateChannel').addEventListener('change', this.changeChannel.bind(this));
        view.querySelector('.btnDownloadUpdate').addEventListener('click', this.downloadUpdate.bind(this));
        view.querySelector('.btnCancelUpdate').addEventListener('click', this.cancelUpdate.bind(this));
        view.querySelector('.btnCopyEnvironment').addEventListener('click', this.copyEnvironment.bind(this));
        view.querySelector('.btnOpenReleases').addEventListener('click', this.openReleases.bind(this));
        view.querySelector('.btnImportKernel').addEventListener('click', this.importKernel.bind(this));
        view.querySelector('.btnSelectBaseline').addEventListener('click', this.selectBaseline.bind(this));
        var notes = view.querySelector('.aboutReleaseNotes');
        var openNote = function (event) {
            var link = event.target && typeof event.target.closest === 'function' ? event.target.closest('a.aboutNoteLink') : null;
            if (!link || !notes.contains(link)) return;
            event.preventDefault();
            event.stopPropagation();
            if (event.type === 'auxclick' && event.button !== 1) return;
            this.openNoteLink(link.getAttribute('href'));
        }.bind(this);
        notes.addEventListener('click', openNote);
        notes.addEventListener('auxclick', openNote);
        view.querySelector('.aboutReleaseLink').addEventListener('click', function (event) {
            event.preventDefault();
            this.openReleases();
        }.bind(this));
    }

    Object.assign(AboutView.prototype, BaseView.prototype);

    AboutView.prototype.renderInfo = function (info) {
        this.info = info;
        var view = this.view;
        var fields = {
            aboutHeaderVersion: 'appVersion', aboutAppVersion: 'appVersion',
            aboutElectron: 'electron', aboutChromium: 'chromium', aboutNativeHelper: 'nativeHelper',
            aboutLibmpv: 'libmpv', aboutSourceCommit: 'sourceCommit', aboutNode: 'node',
            aboutWindows: 'windows', aboutDisplayDpi: 'displayDpi', aboutNativeHelperState: 'nativeHelperState',
            aboutPackageLibmpvSha256: 'packageLibmpvSha256',
            aboutExpectedLibmpvVersion: 'expectedLibmpvVersion', aboutExpectedMpvClientApiVersion: 'expectedMpvClientApiVersion',
            aboutExpectedLibmpvSha256: 'expectedLibmpvSha256', aboutRunningNativeHelper: 'runningNativeHelper',
            aboutRunningLibmpv: 'runningLibmpv', aboutRunningLibmpvClientApiVersion: 'runningLibmpvClientApiVersion',
            aboutValidatedNativeHelperCapabilities: 'validatedNativeHelperCapabilities',
            aboutRunningLibmpvImageSha256: 'runningLibmpvImageSha256',
            aboutFixedNativeRenderPath: 'fixedNativeRenderPath', aboutRenderSettingUiValues: 'renderSettingUiValues',
            aboutObservedNativeRenderPath: 'observedNativeRenderPath'
        };
        Object.keys(fields).forEach(function (name) { setValue(view, '.' + name, info[fields[name]]); });
    };

    AboutView.prototype.loadInfo = function () {
        var view = this.view;
        var requestId = ++this.infoRequestId;
        loading.show();
        return request(CHANNELS.info).then(function (response) {
            if (!response || response.status !== 'ok' || !response.info) throw new Error('maintenance_info_failed');
            if (requestId !== this.infoRequestId) return;
            this.renderInfo(response.info);
            setStatus(view.querySelector('.aboutCopyState'), '', false);
        }.bind(this)).catch(function () {
            if (requestId !== this.infoRequestId) return;
            setStatus(view.querySelector('.aboutCopyState'), '无法读取版本信息，请重启应用后重试。', true);
        }.bind(this)).then(function () {
            if (requestId === this.infoRequestId) loading.hide();
        }.bind(this));
    };

    AboutView.prototype.checkUpdates = function () {
        if (this.updating || this.changingChannel) return Promise.resolve();
        var view = this.view;
        var button = view.querySelector('.btnCheckUpdates');
        var state = view.querySelector('.aboutUpdateState');
        var update = view.querySelector('.about-update');
        button.disabled = true;
        this.updating = true;
        var requestId = ++this.updateRequestId;
        setUpdateCancel(view, 'check');
        view.querySelector('.btnDownloadUpdate').disabled = true;
        view.querySelector('.aboutDownloadProgress').hidden = true;
        view.querySelector('.aboutDownloadDetails').textContent = '尚未开始下载。';
        update.hidden = true;
        setStatus(state, '正在检查…', false);
        setStatus(view.querySelector('.aboutNoteLinkState'), '', false);
        return request(CHANNELS.checkUpdate).then(function (response) {
            if (requestId !== this.updateRequestId) return;
            if (response && ['latest', 'ahead', 'update-available'].indexOf(response.status) !== -1) {
                if (response.channel === 'stable' || response.channel === 'testing') this.updateChannel = response.channel;
                view.querySelector('.selectUpdateChannel').value = this.updateChannel;
                var channelName = this.updateChannel === 'testing' ? '测试通道' : '正式通道';
                view.querySelector('.about-update-channel').textContent = channelName + ' · Windows x64';
                setValue(view, '.aboutCurrentVersion', response.currentVersion);
                setValue(view, '.aboutLatestVersion', response.latestVersion);
                view.querySelector('.aboutReleaseLink').setAttribute('data-release-url', response.releaseUrl || '');
                noteLinks.render(view.querySelector('.aboutReleaseNotes'), response.notes || '此版本没有更新说明。');
                view.querySelector('.btnDownloadUpdate').disabled = response.status !== 'update-available' || !response.installer;
                update.hidden = false;
                var message = response.status === 'latest' ? '已是当前' + channelName + '版本（' + response.currentVersion + '）。' :
                    response.status === 'ahead' ? '当前版本高于' + channelName + '版本（' + response.latestVersion + '），不提供降级下载。' :
                    '发现新版本：' + response.latestVersion + (response.prerelease || String(response.latestVersion).indexOf('-') !== -1 ? '（测试版）' : '') + '。';
                if (response.status === 'update-available' && !response.installer) message += ' 官方安装附件或独立校验信息不可用，请查看发布页。';
                setStatus(state, message, false);
                return;
            }
            if (response && response.status === 'cancelled') { setStatus(state, '已取消检查。', false); return; }
            setStatus(state, '检查失败：无法从 GitHub 官方源确认所选通道版本，请稍后重试。', true);
        }.bind(this)).catch(function () {
            if (requestId !== this.updateRequestId) return;
            setStatus(state, '检查失败，请稍后重试。', true);
        }.bind(this)).then(function () {
            if (requestId !== this.updateRequestId) return;
            this.updating = false;
            button.disabled = false;
            setUpdateCancel(view, null);
        }.bind(this));
    };

    AboutView.prototype.loadChannel = function () {
        var view = this.view, requestId = ++this.channelRequestId;
        view.querySelector('.selectUpdateChannel').disabled = true;
        view.querySelector('.btnCheckUpdates').disabled = true;
        return request(CHANNELS.getChannel).then(function (result) {
            if (!this.view || requestId !== this.channelRequestId) return;
            if (!result || result.status !== 'ok' || ['stable', 'testing'].indexOf(result.channel) === -1) throw new Error('channel-unavailable');
            this.updateChannel = result.channel;
            view.querySelector('.selectUpdateChannel').value = result.channel;
            view.querySelector('.selectUpdateChannel').disabled = this.downloading || this.changingChannel;
            view.querySelector('.btnCheckUpdates').disabled = this.updating || this.changingChannel;
            view.querySelector('.about-update-channel').textContent = (result.channel === 'testing' ? '测试通道' : '正式通道') + ' · Windows x64';
        }.bind(this)).catch(function () {
            if (this.view && requestId === this.channelRequestId) setStatus(view.querySelector('.aboutUpdateState'), '无法读取更新通道，请重新进入本页重试。', true);
        }.bind(this));
    };

    AboutView.prototype.changeChannel = function () {
        var view = this.view, selector = view.querySelector('.selectUpdateChannel'), selected = selector.value;
        if (this.downloading || this.changingChannel || ['stable', 'testing'].indexOf(selected) === -1) {
            selector.value = this.updateChannel; return Promise.resolve();
        }
        this.retireUpdate();
        this.changingChannel = true;
        var requestId = ++this.channelRequestId;
        view.querySelector('.about-update').hidden = true;
        view.querySelector('.aboutDownloadProgress').hidden = true;
        view.querySelector('.btnCheckUpdates').disabled = true;
        setStatus(view.querySelector('.aboutUpdateState'), '正在保存更新通道…', false);
        return request(CHANNELS.setChannel, {channel: selected}).then(function (result) {
            if (!this.view || requestId !== this.channelRequestId) return;
            if (!result || result.status !== 'saved' || result.channel !== selected) throw new Error(result && result.reason === 'busy' ? 'channel-busy' : 'channel-not-saved');
            this.updateChannel = selected;
            setStatus(view.querySelector('.aboutUpdateState'), '更新通道已保存，请点击“检查更新”。', false);
        }.bind(this)).catch(function (error) {
            if (this.view && requestId === this.channelRequestId) setStatus(view.querySelector('.aboutUpdateState'),
                error.message === 'channel-busy' ? '下载尚未结束，请先取消或等待完成后再切换通道。' : '无法保存更新通道，仍使用原通道，请重试。', true);
        }.bind(this)).then(function () {
            if (!this.view || requestId !== this.channelRequestId) return;
            this.changingChannel = false;
            selector.value = this.updateChannel; selector.disabled = false;
            view.querySelector('.btnCheckUpdates').disabled = false;
            view.querySelector('.about-update-channel').textContent = (this.updateChannel === 'testing' ? '测试通道' : '正式通道') + ' · Windows x64';
        }.bind(this));
    };

    AboutView.prototype.removeUpdateProgress = function () {
        if (this.progressListener && window.ipc && typeof window.ipc.removeListener === 'function') {
            window.ipc.removeListener(CHANNELS.progress, this.progressListener);
        }
        this.progressListener = null;
    };

    AboutView.prototype.cancelUpdate = function (retiring) {
        var button = this.view && this.view.querySelector('.btnCancelUpdate');
        // Deduplicate button clicks; page retirement still sends its cleanup.
        if (!this.updating || !button || (button.disabled && retiring !== true)) return;
        button.disabled = true;
        return request(CHANNELS.cancel).catch(function () {});
    };

    AboutView.prototype.downloadUpdate = function () {
        if (this.updating || this.changingChannel) return Promise.resolve();
        var view = this.view;
        var state = view.querySelector('.aboutUpdateState');
        var requestId = ++this.updateRequestId;
        this.updating = true;
        this.downloading = true;
        view.querySelector('.selectUpdateChannel').disabled = true;
        view.querySelector('.btnCheckUpdates').disabled = true;
        view.querySelector('.btnDownloadUpdate').disabled = true;
        setUpdateCancel(view, 'download');
        view.querySelector('.aboutDownloadProgress').hidden = false;
        view.querySelector('.aboutDownloadProgress').value = 0;
        view.querySelector('.aboutDownloadDetails').textContent = '';
        setStatus(state, '正在向 GitHub 官方源重新确认附件和校验值…', false);
        this.progressListener = function (_event, progress) {
            if (requestId !== this.updateRequestId || !progress || !progress.total) return;
            view.querySelector('.aboutDownloadProgress').value = Math.min(1, progress.bytes / progress.total);
            view.querySelector('.aboutDownloadDetails').textContent = '来源：' + progress.source + '；' + progress.bytes + ' / ' + progress.total + ' bytes';
            setStatus(state, '正在下载… ' + Math.floor(100 * progress.bytes / progress.total) + '%', false);
        }.bind(this);
        if (window.ipc && typeof window.ipc.on === 'function') window.ipc.on(CHANNELS.progress, this.progressListener);
        return request(CHANNELS.download).then(function (result) {
            if (requestId !== this.updateRequestId) return;
            if (result && result.status === 'downloaded') {
                view.querySelector('.aboutDownloadProgress').value = 1;
                view.querySelector('.aboutDownloadDetails').textContent = '来源：' + result.source + '\n目录：' + result.directory + '\n文件：' + result.fileName + '\nSHA-256：' + result.sha256;
                setStatus(state, '下载完成，SHA-256 与 GitHub 官方发布值一致。请正常退出客户端，再自行打开下载目录中的安装程序。此校验不代表数字签名；请保留系统与浏览器安全检查。', false);
            } else if (result && result.status === 'cancelled') {
                setStatus(state, '已取消下载。', false);
            } else {
                var reasons = {
                    'verification-unavailable': '官方源不可达或缺少校验值，无法独立验证。',
                    'release-changed': '官方发布身份已改变，请重新检查更新。',
                    'file-exists': '目标目录已有同名文件，请选择其他目录；已有文件未覆盖。',
                    'hash-mismatch': 'SHA-256 不匹配，下载已拒绝。',
                    'http-rejected': '服务器拒绝请求，已停止下载。',
                    'unsafe-redirect': '下载跳转不符合安全规则，已停止。',
                    'size-mismatch': '下载大小不符合官方发布信息。'
                };
                setStatus(state, '下载失败：' + (reasons[result && result.reason] || '请稍后重试或查看发布页。'), true);
            }
        }.bind(this)).catch(function () {
            if (requestId === this.updateRequestId) setStatus(state, '下载失败，请稍后重试。', true);
        }.bind(this)).then(function () {
            if (requestId !== this.updateRequestId) return;
            this.removeUpdateProgress();
            this.updating = false;
            this.downloading = false;
            view.querySelector('.selectUpdateChannel').disabled = false;
            view.querySelector('.btnCheckUpdates').disabled = false;
            view.querySelector('.btnDownloadUpdate').disabled = false;
            setUpdateCancel(view, null);
        }.bind(this));
    };

    AboutView.prototype.copyEnvironment = function () {
        var state = this.view.querySelector('.aboutCopyState');
        var requestId = ++this.infoRequestId;
        loading.hide();
        request(CHANNELS.copy).then(function (response) {
            if (requestId !== this.infoRequestId) return;
            if (response && response.status === 'copied' && response.info) this.renderInfo(response.info);
            setStatus(state, response && response.status === 'copied' ? '已复制版本/环境信息。' : '复制失败，请稍后重试。', !(response && response.status === 'copied'));
        }.bind(this)).catch(function () {
            if (requestId !== this.infoRequestId) return;
            setStatus(state, '复制失败，请稍后重试。', true);
        }.bind(this));
    };

    AboutView.prototype.openReleases = function () {
        var link = this.view.querySelector('.aboutReleaseLink');
        request(CHANNELS.releases, {url: link.getAttribute('data-release-url') || ''}).catch(function () {});
    };

    AboutView.prototype.openNoteLink = function (url) {
        if (!this.view || !noteLinks.safeUrl(url)) return Promise.resolve();
        var requestId = this.updateRequestId;
        return request(CHANNELS.noteLink, {url: url}).catch(function () {
            return {status: 'error'};
        }).then(function (result) {
            if (!this.view || requestId !== this.updateRequestId) return;
            setStatus(this.view.querySelector('.aboutNoteLinkState'),
                result && result.status === 'opened' ? '' : '无法打开此链接，请在官方发布页查看。', !(result && result.status === 'opened'));
        }.bind(this));
    };

    AboutView.prototype.renderKernelStatus = function (result) {
        var view = this.view;
        var state = view.querySelector('.aboutKernelState');
        var list = view.querySelector('.aboutKernelCandidates');
        var importButton = view.querySelector('.btnImportKernel');
        var baselineButton = view.querySelector('.btnSelectBaseline');
        while (list.firstChild) list.removeChild(list.firstChild);
        setValue(view, '.aboutKernelCurrent', '无法读取');
        setValue(view, '.aboutKernelNext', '无法读取');
        if (!result || result.status === 'unavailable') {
            var unavailableText = result && result.reason === 'store-unavailable'
                ? '候选存储不可用；现有播放链保持不变。'
                : '候选导入不可用：当前包内 Helper 身份未能通过 provenance/hash 校验；候选功能已停用。';
            setStatus(state, unavailableText, true);
            importButton.disabled = true;
            baselineButton.disabled = true;
            return;
        }
        if (result.status !== 'ok' || !Array.isArray(result.candidates)) {
            var runtime = result && result.runtime || {};
            var currentRuntimeText = runtime.activeCandidateId
                ? '当前进程仍使用候选 ' + runtime.activeCandidateId + '。'
                : runtime.effectiveCandidateId ? '当前启动选择候选 ' + runtime.effectiveCandidateId + '。' : '当前启动选择固定基线。';
            setStatus(state, '无法读取内核候选状态；' + currentRuntimeText, true);
            importButton.disabled = false;
            baselineButton.disabled = false;
            return;
        }
        importButton.disabled = false;
        baselineButton.disabled = false;
        var runtime = result.runtime || {};
        var currentId = runtime.activeCandidateId || null;
        var selectedId = result.selectedCandidateId || null;
        function kernelName(id) {
            if (!id) return '内置内核';
            var candidate = result.candidates.find(function (item) { return item.candidateId === id; });
            return candidate && candidate.version || '候选内核';
        }
        var currentKnown = !!currentId || Object.prototype.hasOwnProperty.call(runtime, 'effectiveCandidateId');
        var nextKnown = Object.prototype.hasOwnProperty.call(result, 'selectedCandidateId');
        setValue(view, '.aboutKernelCurrent', currentKnown ? kernelName(currentId || runtime.effectiveCandidateId) : 'UNKNOWN');
        setValue(view, '.aboutKernelNext', result.selectionState === 'invalid' ? '选择无效，请重新选择' : nextKnown ? kernelName(selectedId) : 'UNKNOWN');
        var pendingRestart = selectedId !== currentId;
        var invalidSelectionText = runtime.activeCandidateId
            ? '下次启动选择状态无效；当前进程仍使用已启动候选 ' + runtime.activeCandidateId + '。本进程内核不变。'
            : runtime.effectiveCandidateId
                ? '下次启动选择状态无效；本次启动使用候选 ' + runtime.effectiveCandidateId + '。新的选择只在下次启动生效。'
                : '下次启动选择状态无效；本次启动选择固定基线。显式选择固定基线可修复状态。';
        var text = result.selectionState === 'invalid' ? invalidSelectionText :
            pendingRestart ? '已保存下次启动选择；当前运行内核保持不变。' :
            runtime.activationState === 'candidate-active' ? '当前内核已通过启动校验。' :
            runtime.activationState === 'candidate-fallback-baseline-active' ? '候选启动失败，已在页面/播放启动前回到固定基线。' :
            runtime.activationState === 'baseline-start-failed' ? '候选与固定基线启动均失败；Native Helper 保持停止。' :
            runtime.activationState === 'candidate-runtime-failed' ? '候选运行期间 Helper 失败；本进程未切换内核。' :
            '当前启动选择：固定基线。';
        setStatus(state, text, result.selectionState === 'invalid' || runtime.activationState === 'baseline-start-failed' || runtime.activationState === 'candidate-runtime-failed');
        result.candidates.forEach(function (candidate) {
            var card = document.createElement('div');
            card.className = 'listItem listItem-border about-kernel-candidate';
            var content = document.createElement('div');
            content.className = 'listItem-content';
            var body = document.createElement('div');
            body.className = 'listItemBody';
            var heading = document.createElement('h3');
            heading.className = 'listItemBodyText';
            heading.textContent = candidate.version || 'UNKNOWN';
            var use = document.createElement('div');
            use.className = 'secondaryText about-kernel-state';
            use.textContent = candidate.candidateId === currentId
                ? candidate.candidateId === selectedId ? '当前使用 · 下次启动继续使用' : '当前使用 · 已安排切换'
                : candidate.candidateId === selectedId ? '下次启动使用' : '已导入';
            var technical = document.createElement('details');
            technical.className = 'ete-about-advanced about-kernel-details';
            var summary = document.createElement('summary');
            summary.textContent = '技术详情';
            var identity = document.createElement('code');
            identity.textContent = candidate.candidateId || 'UNKNOWN';
            var details = document.createElement('p');
            details.textContent = '包 SHA 与 PE 静态合同已验证；来源声明未独立核验；notice 已随包提供；可发行状态：NOT_ASSESSED。DLL 大小：' + String(candidate.sizeBytes || 'UNKNOWN') + ' bytes。';
            var evidence = document.createElement('p');
            evidence.textContent = '文件 SHA256';
            evidence.appendChild(document.createElement('br'));
            evidence.appendChild(identity);
            var runtimeEvidence = document.createElement('p');
            runtimeEvidence.textContent = '已加载 DLL 映像 SHA256：UNKNOWN。包文件校验与启动握手不代表映像哈希、来源许可或可发行性结论。';
            var select = document.createElement('button', {is: 'emby-button'});
            select.type = 'button';
            // Preserve theme/focus classes installed by the native button constructor.
            ['raised', 'ete-settings-button'].forEach(function (name) { select.classList.add(name); });
            select.setAttribute('is', 'emby-button');
            select.textContent = candidate.candidateId === selectedId ? '已选择' : '下次启动使用';
            select.setAttribute('aria-label', select.textContent + ' ' + (candidate.version || '候选内核'));
            select.disabled = candidate.candidateId === selectedId || result.selectionState === 'invalid';
            select.addEventListener('click', function () { this.selectKernel(candidate.candidateId); }.bind(this));
            body.appendChild(heading);
            body.appendChild(use);
            technical.appendChild(summary);
            technical.appendChild(evidence);
            technical.appendChild(details);
            technical.appendChild(runtimeEvidence);
            body.appendChild(technical);
            content.appendChild(body);
            content.appendChild(select);
            card.appendChild(content);
            list.appendChild(card);
        }, this);
        baselineButton.disabled = selectedId === null && result.selectionState !== 'invalid';
    };

    AboutView.prototype.loadKernelStatus = function () {
        var requestId = ++this.kernelRequestId;
        return request(CHANNELS.kernelStatus).then(function (result) {
            if (requestId !== this.kernelRequestId) return;
            this.renderKernelStatus(result);
        }.bind(this)).catch(function () {
            if (requestId === this.kernelRequestId) this.renderKernelStatus(null);
        }.bind(this));
    };

    AboutView.prototype.importKernel = function () {
        var button = this.view.querySelector('.btnImportKernel');
        var state = this.view.querySelector('.aboutKernelOperationState');
        button.disabled = true;
        if (state.getAttribute('role') !== 'alert') setStatus(state, '等待选择本地 ZIP 候选包…', false);
        request(CHANNELS.kernelImport).then(function (result) {
            if (result && result.status === 'cancelled') {
                if (state.getAttribute('role') !== 'alert') setStatus(state, '已取消导入。', false);
                return this.loadKernelStatus();
            }
            if (result && result.status === 'imported') {
                setStatus(state, '已导入并完成静态检查。选择候选后需重启应用生效。', false);
                return this.loadKernelStatus();
            }
            setStatus(state, '候选导入失败：' + String(result && result.reason || 'kernel-operation-failed'), true);
            return this.loadKernelStatus();
        }.bind(this)).catch(function () {
            setStatus(state, '候选导入失败。', true);
            return this.loadKernelStatus();
        }.bind(this)).then(function () { button.disabled = false; });
    };

    AboutView.prototype.selectKernel = function (candidateId) {
        return this.changeKernelSelection(candidateId);
    };

    AboutView.prototype.selectBaseline = function () {
        return this.changeKernelSelection(null);
    };

    AboutView.prototype.changeKernelSelection = function (candidateId) {
        var state = this.view.querySelector('.aboutKernelOperationState');
        if (state.getAttribute('role') !== 'alert') setStatus(state, '正在保存下次启动选择…', false);
        return request(CHANNELS.kernelSelect, {candidateId: candidateId}).then(function (result) {
            if (!result || result.status !== 'selected') {
                setStatus(state, '选择失败：' + String(result && result.reason || 'kernel-operation-failed'), true);
                return this.loadKernelStatus();
            }
            setStatus(state, '下次启动选择已保存。当前内核不变。', false);
            return this.loadKernelStatus();
        }.bind(this)).catch(function () {
            setStatus(state, '选择失败。', true);
            return this.loadKernelStatus();
        }.bind(this));
    };

    AboutView.prototype.onResume = function (options) {
        BaseView.prototype.onResume.apply(this, arguments);
        this.loadInfo();
        this.loadKernelStatus();
        this.loadChannel();
    };

    AboutView.prototype.retireUpdate = function () {
        if (!this.view) return;
        this.cancelUpdate(true);
        ++this.updateRequestId;
        ++this.channelRequestId;
        this.updating = false;
        this.downloading = false;
        this.changingChannel = false;
        this.removeUpdateProgress();
        this.view.querySelector('.btnCheckUpdates').disabled = false;
        this.view.querySelector('.selectUpdateChannel').disabled = true;
        this.view.querySelector('.btnDownloadUpdate').disabled = true;
        setUpdateCancel(this.view, null);
    };



    AboutView.prototype.onPause = function () {
        this.retireUpdate();
        BaseView.prototype.onPause.apply(this, arguments);
    };

    AboutView.prototype.destroy = function () {
        this.infoRequestId++; this.kernelRequestId++;
        this.retireUpdate();
        if (typeof BaseView.prototype.destroy === 'function') return BaseView.prototype.destroy.apply(this, arguments);
    };

    return AboutView;
});
