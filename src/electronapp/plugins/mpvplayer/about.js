define(['loading', 'baseView', './cache-settings', 'emby-button', 'emby-scroller', 'css!modules/listview/listview', 'css!./enhanced-settings', 'css!./about'], function (loading, BaseView, cacheSettings) {
    'use strict';

    var CHANNELS = {
        info: 'enhanced-maintenance-info',
        copy: 'enhanced-maintenance-copy-environment',
        checkUpdate: 'enhanced-maintenance-check-update',
        releases: 'enhanced-maintenance-open-releases',
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

    function AboutView(view) {
        BaseView.apply(this, arguments);
        this.view = view;
        this.info = null;
        this.infoRequestId = 0;
        this.kernelRequestId = 0;
        this.cacheManagement = cacheSettings.create(view, request);
        view.querySelector('.btnCheckUpdates').addEventListener('click', this.checkUpdates.bind(this));
        view.querySelector('.btnCopyEnvironment').addEventListener('click', this.copyEnvironment.bind(this));
        view.querySelector('.btnOpenReleases').addEventListener('click', this.openReleases.bind(this));
        view.querySelector('.btnImportKernel').addEventListener('click', this.importKernel.bind(this));
        view.querySelector('.btnSelectBaseline').addEventListener('click', this.selectBaseline.bind(this));
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
        var view = this.view;
        var button = view.querySelector('.btnCheckUpdates');
        var state = view.querySelector('.aboutUpdateState');
        var update = view.querySelector('.about-update');
        button.disabled = true;
        update.hidden = true;
        setStatus(state, '正在检查…', false);
        request(CHANNELS.checkUpdate).then(function (response) {
            if (response && response.status === 'latest') {
                setStatus(state, '已是最新版本（' + response.currentVersion + '）。', false);
                return;
            }
            if (response && response.status === 'update-available') {
                setValue(view, '.aboutCurrentVersion', response.currentVersion);
                setValue(view, '.aboutLatestVersion', response.latestVersion);
                view.querySelector('.aboutReleaseLink').setAttribute('data-release-url', response.releaseUrl || '');
                update.hidden = false;
                setStatus(state, '发现新版本：' + response.latestVersion + '。', false);
                return;
            }
            setStatus(state, '检查失败，请稍后重试。', true);
        }).catch(function () {
            setStatus(state, '检查失败，请稍后重试。', true);
        }).then(function () {
            button.disabled = false;
        });
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
        this.cacheManagement.resume();
    };

    AboutView.prototype.onPause = function () {
        this.cacheManagement.pause();
        BaseView.prototype.onPause.apply(this, arguments);
    };

    AboutView.prototype.destroy = function () {
        this.cacheManagement.dispose();
        this.infoRequestId++; this.kernelRequestId++;
        if (BaseView.prototype.destroy) return BaseView.prototype.destroy.apply(this, arguments);
    };

    return AboutView;
});
