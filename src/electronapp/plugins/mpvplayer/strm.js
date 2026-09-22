define(['loading', 'baseView', 'emby-select', 'emby-checkbox', 'emby-input', 'emby-button', 'emby-scroller', '../../resolvers/strm-mapping-assistant.js', 'css!./strm'], function (loading, BaseView, _select, _checkbox, _input, _button, _scroller, mappingAssistant) {
    'use strict';

    var CHANNELS = {
        get: 'enhanced-strm-config-get',
        save: 'enhanced-strm-config-save',
        setToken: 'enhanced-strm-token-set',
        clearToken: 'enhanced-strm-token-clear',
        testConnection: 'enhanced-strm-cd2-test-connection',
        testRule: 'enhanced-strm-rule-test',
        previewMapping: 'enhanced-strm-smart-mapping-preview',
        diagnostics: 'enhanced-diagnostics-log',
        restoreAuto: 'enhanced-strm-rule-restore-auto',
        disableRule: 'enhanced-strm-rule-disable'
    };
    var STAGES = ['direct-url', 'cd2-http', 'mount', 'native'];
    var STAGE_LABELS = {
        'direct-url': 'DirectUrl',
        'cd2-http': 'CD2 HTTP',
        mount: 'Mount',
        native: 'Native'
    };
    var STRATEGY_ORDERS = {
        'cloud-first': ['direct-url', 'cd2-http', 'mount', 'native'],
        'mount-first': ['mount', 'direct-url', 'cd2-http', 'native']
    };

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function element(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function option(value, label) {
        var node = element('option', null, label);
        node.value = value;
        return node;
    }

    function request(channel, payload) {
        if (!window.ipc || typeof window.ipc.invoke !== 'function') {
            return Promise.reject(new Error('config_api_unavailable'));
        }
        return window.ipc.invoke(channel, payload);
    }

    function sendDiagnostic(record) {
        try {
            if (!window.ipc || typeof window.ipc.send !== 'function') return;
            var pending = window.ipc.send(CHANNELS.diagnostics, record);
            if (pending && typeof pending.catch === 'function') pending.catch(function () {});
        } catch (_) { /* Settings diagnostics are fail-open. */ }
    }

    function statusText(response) {
        if (!response) return '配置服务不可用，请重启应用后重试。';
        if (response.reason === 'untrusted_sender') return '配置服务拒绝了当前页面。';
        if (response.reason === 'invalid_config') return '保存失败：请检查路径和地址格式。';
        if (response.reason === 'invalid_token') return 'Token 无效，请输入不含控制字符的值。';
        return '操作未完成，请检查配置后重试。';
    }

    function strategyOrder(strategy, customOrder) {
        if (STRATEGY_ORDERS[strategy]) return STRATEGY_ORDERS[strategy].slice();
        if (strategy === 'custom' && Array.isArray(customOrder) && customOrder.length === 4) return customOrder.slice();
        return STAGES.slice();
    }

    function setStatus(node, text, isError) {
        node.textContent = text || '';
        node.setAttribute('role', isError ? 'alert' : 'status');
    }

    function confidenceText(value) {
        if (value === 'HIGH') return '高';
        if (value === 'MEDIUM') return '中';
        return '低';
    }

    function reasonText(value) {
        return {
            unique_long_suffix: '连续目录结构唯一匹配',
            unique_supported_suffix: '目录结构匹配，但证据未达到高置信度',
            multiple_equal_candidates: '存在多个同等匹配候选',
            filename_only: '仅文件名相同',
            suffix_too_short: '连续目录层级不足',
            no_common_suffix: '未找到可用的共同目录结构',
            no_candidates: '未提供云端路径',
            identical_mapping: '两侧前缀相同，无需新增映射',
            invalid_cloud_candidate: '云端路径不是安全的绝对 POSIX 文件路径',
            path_semantics_mismatch: '路径类型与声明不一致',
            relative_path: '路径必须是绝对路径',
            path_traversal: '路径包含不安全的目录跳转',
            empty_segment: '路径包含空目录段',
            empty_path: '路径不能为空',
            surrounding_whitespace: '路径首尾包含空白字符',
            control_character: '路径包含控制字符',
            mixed_separator: 'POSIX 路径包含反斜杠',
            invalid_unc_root: 'UNC 路径缺少有效的服务器或共享边界',
            root_only: '路径不能只有根目录',
            incomplete_path: '路径不完整',
            root_boundary_ambiguous: '无法安全区分路径根边界',
            invalid_request: '请输入有效的本地路径和云端路径'
        }[value] || '路径证据不足，无法生成安全建议';
    }

    function assistantStatus(preview, evaluation) {
        if (evaluation.collision === mappingAssistant.COLLISION.DUPLICATE) return '该规则已存在。';
        if (evaluation.collision === mappingAssistant.COLLISION.CONFLICT) return '现有规则与建议冲突，请先检查当前路径规则。';
        if (preview.status === 'MATCHED' && preview.confidence === 'HIGH') return '已生成高置信度建议。确认后只会加入当前草稿。';
        if (preview.status === 'MATCHED' && preview.confidence === 'MEDIUM') return '匹配证据不足，建议提供目录层级更多的样本。';
        if (preview.status === 'AMBIGUOUS') return '存在歧义，无法确定唯一映射。';
        if (preview.status === 'UNSAFE') return '路径未通过安全检查：' + reasonText(preview.reason) + '。';
        return reasonText(preview.reason) + '。';
    }

    function resetAssistantPreview(view) {
        var preview = view.querySelector('.ete-strm-assistant-preview');
        var suggestion = view.querySelector('.ete-strm-assistant-suggestion');
        var addButton = view.querySelector('.btnAddSuggestedRule');
        preview.hidden = true;
        suggestion.hidden = true;
        addButton.disabled = true;
        setStatus(view.querySelector('.smartMappingState'), '', false);
    }

    function renderAssistantPreview(view, preview, rules) {
        var container = view.querySelector('.ete-strm-assistant-preview');
        var suggestion = view.querySelector('.ete-strm-assistant-suggestion');
        var addButton = view.querySelector('.btnAddSuggestedRule');
        var evaluation = mappingAssistant.evaluatePreview(preview, rules);
        var hasSuggestion = preview && typeof preview.localPrefix === 'string' && typeof preview.cloudPrefix === 'string';

        container.hidden = false;
        suggestion.hidden = !hasSuggestion;
        addButton.disabled = !evaluation.canAdd;
        if (hasSuggestion) {
            view.querySelector('.smartLocalPrefix').textContent = preview.localPrefix;
            view.querySelector('.smartCloudPrefix').textContent = preview.cloudPrefix;
            view.querySelector('.smartMatchedBasis').textContent = preview.matchedParentSegments + ' 个连续父目录 + 文件名';
            view.querySelector('.smartConfidence').textContent = confidenceText(preview.confidence);
            view.querySelector('.smartReason').textContent = reasonText(preview.reason);
        }
        setStatus(view.querySelector('.smartMappingState'), assistantStatus(preview, evaluation),
            preview.status === 'UNSAFE' || preview.status === 'AMBIGUOUS' || evaluation.collision === mappingAssistant.COLLISION.CONFLICT);
        return evaluation;
    }

    function ruleStateLabel(state) {
        if (state === 'USER') return '用户配置';
        if (state === 'DISABLED') return '已抑制';
        return '自动建议';
    }

    function storageLabel(value) {
        return value === 'local-nas' ? 'NAS / 本地存储' : '云盘挂载';
    }

    function createLabeledInput(ruleId, field, label, value) {
        var wrapper = element('div', 'inputContainer');
        var inputId = 'ete-rule-' + ruleId + '-' + field;
        var labelNode = element('label', 'ete-strm-field-label', label);
        var input = element('input');
        input.id = inputId;
        input.type = 'text';
        input.className = 'rule-' + field;
        input.value = value || '';
        input.setAttribute('is', 'emby-input');
        input.setAttribute('aria-label', label);
        labelNode.htmlFor = inputId;
        wrapper.appendChild(labelNode);
        wrapper.appendChild(input);
        return wrapper;
    }

    function createLabeledSelect(ruleId, field, label, values, selected, labels) {
        var wrapper = element('div', 'selectContainer');
        var selectId = 'ete-rule-' + ruleId + '-' + field;
        var labelNode = element('label', 'ete-strm-field-label', label);
        var select = element('select');
        select.id = selectId;
        select.className = 'rule-' + field;
        select.setAttribute('is', 'emby-select');
        select.setAttribute('aria-label', label);
        labelNode.htmlFor = selectId;
        values.forEach(function (value) {
            select.appendChild(option(value, labels[value] || value));
        });
        select.value = selected;
        wrapper.appendChild(labelNode);
        wrapper.appendChild(select);
        return wrapper;
    }

    function createOrderEditor(ruleId, order) {
        var wrapper = element('div', 'ete-strm-custom-order');
        order = strategyOrder('custom', order);
        for (var index = 0; index < STAGES.length; index++) {
            var label = element('label', null, '第 ' + (index + 1) + ' 顺位');
            var select = element('select', 'rule-order-stage');
            select.setAttribute('is', 'emby-select');
            select.setAttribute('aria-label', '自定义顺序第 ' + (index + 1) + ' 顺位');
            select.dataset.index = String(index);
            STAGES.forEach(function (stage) {
                select.appendChild(option(stage, STAGE_LABELS[stage]));
            });
            select.value = order[index];
            label.appendChild(select);
            wrapper.appendChild(label);
        }
        return wrapper;
    }

    function updateOrderPreview(card) {
        var strategy = card.querySelector('.rule-strategy').value;
        var order = strategyOrder(strategy, Array.prototype.map.call(card.querySelectorAll('.rule-order-stage'), function (select) {
            return select.value;
        }));
        var value = card.querySelector('.ete-strm-order-value');
        var editor = card.querySelector('.ete-strm-custom-order');
        value.textContent = order.map(function (stage) { return STAGE_LABELS[stage]; }).join(' → ');
        if (strategy === 'custom') {
            if (!editor) {
                editor = createOrderEditor(card.dataset.ruleId, order);
                card.querySelector('.ete-strm-order').appendChild(editor);
            }
            editor.classList.remove('hide');
        } else if (editor) {
            editor.classList.add('hide');
        }
    }

    function renderRule(rule) {
        var card = element('article', 'ete-strm-rule-card');
        var heading = element('div', 'ete-strm-rule-heading');
        var title = element('span', 'ete-strm-rule-title', rule.sourcePrefix || '新建路径规则');
        var state = element('span', 'ete-strm-rule-state', ruleStateLabel(rule.originState));
        var grid = element('div', 'ete-strm-rule-grid');
        var order = element('div', 'ete-strm-order');
        var orderLabel = element('span', 'ete-strm-order-label', '实际顺序');
        var orderValue = element('span', 'ete-strm-order-value');
        var actions = element('div', 'ete-strm-rule-actions');
        var testButton = element('button', null, '测试映射');
        var restoreButton = element('button', null, '恢复自动配置');
        var isDraftRule = /^new-rule-/.test(rule.id || '');
        var disableButton = element('button', null, isDraftRule ? '移除草稿' : (rule.originState === 'DISABLED' ? '保持抑制' : '禁用/删除'));
        var result = element('span', 'ete-strm-rule-test secondaryText');

        card.dataset.ruleId = rule.id;
        heading.appendChild(title);
        heading.appendChild(state);
        card.appendChild(heading);
        grid.appendChild(createLabeledInput(rule.id, 'sourcePrefix', '源路径', rule.sourcePrefix));
        grid.appendChild(createLabeledInput(rule.id, 'mountPrefix', '挂载路径', rule.mountPrefix));
        grid.appendChild(createLabeledInput(rule.id, 'cloudPrefix', 'CloudDrive2 路径', rule.cloudPrefix));
        grid.appendChild(createLabeledSelect(rule.id, 'storageType', '存储类型', ['cloud-mount', 'local-nas'], rule.storageType, {
            'cloud-mount': '云盘挂载',
            'local-nas': 'NAS / 本地存储'
        }));
        grid.appendChild(createLabeledSelect(rule.id, 'strategy', '解析策略', ['cloud-first', 'mount-first', 'custom'], rule.strategy, {
            'cloud-first': '云端直连优先',
            'mount-first': '本地 / NAS 优先',
            custom: '自定义顺序'
        }));
        card.appendChild(grid);
        order.appendChild(orderLabel);
        order.appendChild(orderValue);
        if (rule.strategy === 'custom') order.appendChild(createOrderEditor(rule.id, rule.order));
        card.appendChild(order);

        testButton.type = 'button';
        restoreButton.type = 'button';
        disableButton.type = 'button';
        testButton.className = 'btnTestRule';
        restoreButton.className = 'btnRestoreAuto';
        disableButton.className = 'btnDisableRule';
        actions.appendChild(testButton);
        if (rule.originState !== 'AUTO') actions.appendChild(restoreButton);
        actions.appendChild(disableButton);
        actions.appendChild(result);
        card.appendChild(actions);
        updateOrderPreview(card);

        if (rule.originState === 'DISABLED') {
            card.classList.add('is-disabled');
            Array.prototype.forEach.call(card.querySelectorAll('input, select'), function (input) { input.disabled = true; });
            restoreButton.disabled = false;
            disableButton.disabled = true;
        }
        return card;
    }

    function renderConfig(view, config) {
        var list = view.querySelector('.rulesList');
        view.querySelector('.chkEnabled').checked = config.enabled === true;
        view.querySelector('.chkCd2Enabled').checked = config.cd2.enabled === true;
        view.querySelector('.chkDirectUrlEnabled').checked = config.cd2.directUrlEnabled !== false;
        view.querySelector('.txtCd2Origin').value = config.cd2.origin || '';
        view.querySelector('.txtCd2Token').value = '';
        view.querySelector('.tokenState').textContent = config.cd2.tokenConfigured ? '已配置 ········' : '未配置';
        while (list.firstChild) list.removeChild(list.firstChild);
        if (!config.rules.length) {
            list.appendChild(element('div', 'ete-strm-empty secondaryText', '尚未配置路径规则。添加一条规则后，STRM 将按最长前缀匹配。'));
        } else {
            config.rules.forEach(function (rule) { list.appendChild(renderRule(rule)); });
        }
    }

    function collectConfig(view, config) {
        var next = clone(config);
        next.enabled = view.querySelector('.chkEnabled').checked;
        next.cd2.enabled = view.querySelector('.chkCd2Enabled').checked;
        next.cd2.directUrlEnabled = view.querySelector('.chkDirectUrlEnabled').checked;
        next.cd2.origin = view.querySelector('.txtCd2Origin').value.trim();
        next.rules = Array.prototype.map.call(view.querySelectorAll('.ete-strm-rule-card'), function (card) {
            var original = next.rules.filter(function (rule) { return rule.id === card.dataset.ruleId; })[0] || {
                id: card.dataset.ruleId,
                originState: 'USER',
                enabled: true
            };
            var strategy = card.querySelector('.rule-strategy').value;
            var order = strategy === 'custom'
                ? Array.prototype.map.call(card.querySelectorAll('.rule-order-stage'), function (select) { return select.value; })
                : strategyOrder(strategy);
            return {
                id: original.id,
                sourcePrefix: card.querySelector('.rule-sourcePrefix').value.trim(),
                mountPrefix: card.querySelector('.rule-mountPrefix').value.trim(),
                cloudPrefix: card.querySelector('.rule-cloudPrefix').value.trim(),
                storageType: card.querySelector('.rule-storageType').value,
                strategy: strategy,
                order: order,
                originState: original.originState,
                enabled: original.enabled !== false
            };
        });
        return next;
    }

    function uniqueRuleId(rules, prefix) {
        var base = (prefix || 'new-rule-') + Date.now().toString(36);
        var id = base;
        var suffix = 1;
        var used = Object.create(null);
        (Array.isArray(rules) ? rules : []).forEach(function (rule) {
            if (rule && rule.id) used[rule.id] = true;
        });
        while (used[id]) {
            id = base + '-' + suffix;
            suffix++;
        }
        return id;
    }

    function newRule(rules) {
        return {
            id: uniqueRuleId(rules, 'new-rule-'),
            sourcePrefix: '',
            mountPrefix: '',
            cloudPrefix: '',
            storageType: 'cloud-mount',
            strategy: 'cloud-first',
            order: STAGES.slice(),
            originState: 'USER',
            enabled: true
        };
    }

    function SettingsView(view) {
        BaseView.apply(this, arguments);
        this.view = view;
        this.config = null;
        this.loadingConfig = null;
        this.assistantPreview = null;
        view.querySelector('form').addEventListener('submit', function (event) {
            event.preventDefault();
            this.saveSettings();
        }.bind(this));
        view.querySelector('.btnAddRule').addEventListener('click', function () {
            if (!this.config) return;
            this.config = collectConfig(view, this.config);
            this.config.rules.push(newRule(this.config.rules));
            renderConfig(view, this.config);
            var inputs = view.querySelectorAll('.rule-sourcePrefix');
            if (inputs.length) inputs[inputs.length - 1].focus();
        }.bind(this));
        view.addEventListener('change', function (event) {
            if (event.target.classList.contains('rule-strategy') || event.target.classList.contains('rule-order-stage')) {
                updateOrderPreview(event.target.closest('.ete-strm-rule-card'));
            }
        });
        view.addEventListener('click', function (event) {
            var card = event.target.closest('.ete-strm-rule-card');
            var ruleId = card && card.dataset.ruleId;
            if (!card || !ruleId) return;
            if (event.target.classList.contains('btnTestRule')) this.testRule(ruleId, card);
            if (event.target.classList.contains('btnRestoreAuto')) this.restoreAuto(ruleId);
            if (event.target.classList.contains('btnDisableRule')) this.disableRule(ruleId);
        }.bind(this));
        view.querySelector('.btnSetToken').addEventListener('click', function () { this.setToken(); }.bind(this));
        view.querySelector('.btnClearToken').addEventListener('click', function () { this.clearToken(); }.bind(this));
        view.querySelector('.btnTestConnection').addEventListener('click', function () { this.testConnection(); }.bind(this));
        view.querySelector('.btnAnalyzeMapping').addEventListener('click', function () { this.analyzeMapping(); }.bind(this));
        view.querySelector('.btnAddSuggestedRule').addEventListener('click', function () { this.acceptSuggestedRule(); }.bind(this));
        Array.prototype.forEach.call(view.querySelectorAll('.txtSmartLocalPath, .txtSmartCloudPath'), function (input) {
            input.addEventListener('input', function () {
                this.assistantPreview = null;
                resetAssistantPreview(view);
            }.bind(this));
        }.bind(this));
    }

    Object.assign(SettingsView.prototype, BaseView.prototype);

    SettingsView.prototype.loadSettings = function () {
        var view = this.view;
        loading.show();
        this.loadingConfig = request(CHANNELS.get).then(function (config) {
            if (!config || Number(config.version) !== 1 || !config.cd2 || !Array.isArray(config.rules)) {
                throw new Error('invalid_config_response');
            }
            this.config = clone(config);
            renderConfig(view, this.config);
            this.assistantPreview = null;
            resetAssistantPreview(view);
            setStatus(view.querySelector('.saveState'), '', false);
            loading.hide();
            return config;
        }.bind(this)).catch(function () {
            loading.hide();
            setStatus(view.querySelector('.saveState'), '无法读取 STRM 设置，请重启应用后重试。', true);
        });
        return this.loadingConfig;
    };

    SettingsView.prototype.saveSettings = function () {
        if (!this.config) return Promise.resolve();
        var view = this.view;
        var next = collectConfig(view, this.config);
        var button = view.querySelector('.btnSave');
        button.disabled = true;
        setStatus(view.querySelector('.saveState'), '正在保存…', false);
        return request(CHANNELS.save, {config: next}).then(function (response) {
            if (!response || response.status !== 'saved') {
                setStatus(view.querySelector('.saveState'), statusText(response), true);
                return;
            }
            this.config = clone(response.config);
            renderConfig(view, this.config);
            setStatus(view.querySelector('.saveState'), response.requiresRestart ? '已保存，重启应用后播放链生效。' : '设置已保存。', false);
        }.bind(this)).catch(function () {
            setStatus(view.querySelector('.saveState'), '保存失败，请检查配置服务。', true);
        }).then(function () {
            button.disabled = false;
        });
    };

    SettingsView.prototype.setToken = function () {
        var view = this.view;
        var input = view.querySelector('.txtCd2Token');
        var value = input.value;
        if (!value) {
            setStatus(view.querySelector('.saveState'), '请输入新的 Token。', true);
            input.focus();
            return;
        }
        input.disabled = true;
        request(CHANNELS.setToken, {token: value}).then(function (response) {
            if (!response || response.status !== 'saved') {
                setStatus(view.querySelector('.saveState'), statusText(response), true);
                return;
            }
            this.config = clone(response.config);
            input.value = '';
            view.querySelector('.tokenState').textContent = '已配置 ········';
            setStatus(view.querySelector('.saveState'), 'Token 已保存，重启应用后播放链生效。', false);
        }.bind(this)).catch(function () {
            setStatus(view.querySelector('.saveState'), 'Token 保存失败。', true);
        }).then(function () {
            input.disabled = false;
        });
    };

    SettingsView.prototype.clearToken = function () {
        if (!window.confirm('清除 CloudDrive2 Token？')) return;
        request(CHANNELS.clearToken).then(function (response) {
            if (!response || response.status !== 'saved') {
                setStatus(this.view.querySelector('.saveState'), statusText(response), true);
                return;
            }
            this.config = clone(response.config);
            this.view.querySelector('.tokenState').textContent = '未配置';
            setStatus(this.view.querySelector('.saveState'), 'Token 已清除，重启应用后播放链生效。', false);
        }.bind(this)).catch(function () {
            setStatus(this.view.querySelector('.saveState'), 'Token 清除失败。', true);
        }.bind(this));
    };

    SettingsView.prototype.analyzeMapping = function () {
        var view = this.view;
        var button = view.querySelector('.btnAnalyzeMapping');
        var localPath = view.querySelector('.txtSmartLocalPath').value;
        var cloudPath = view.querySelector('.txtSmartCloudPath').value;
        button.disabled = true;
        resetAssistantPreview(view);
        setStatus(view.querySelector('.smartMappingState'), '正在分析…', false);
        return request(CHANNELS.previewMapping, {localPath: localPath, cloudPath: cloudPath}).then(function (response) {
            if (!response || ['MATCHED', 'AMBIGUOUS', 'NO_MATCH', 'UNSAFE'].indexOf(response.status) < 0) {
                this.assistantPreview = null;
                setStatus(view.querySelector('.smartMappingState'), statusText(response), true);
                return;
            }
            this.assistantPreview = response;
            renderAssistantPreview(view, response, this.config ? collectConfig(view, this.config).rules : []);
            sendDiagnostic(mappingAssistant.diagnosticRecord('smart-path-mapping-preview', response));
        }.bind(this)).catch(function () {
            this.assistantPreview = null;
            setStatus(view.querySelector('.smartMappingState'), '映射分析失败，请检查配置服务。', true);
        }.bind(this)).then(function () {
            button.disabled = false;
        });
    };

    SettingsView.prototype.acceptSuggestedRule = function () {
        if (!this.config || !this.assistantPreview) return;
        var view = this.view;
        var next = collectConfig(view, this.config);
        var id = uniqueRuleId(next.rules, 'new-rule-smart-');
        var result = mappingAssistant.addDraftRule(next.rules, this.assistantPreview, id);
        if (result.status !== 'added') {
            renderAssistantPreview(view, this.assistantPreview, next.rules);
            return;
        }
        next.rules = result.rules;
        this.config = next;
        renderConfig(view, this.config);
        renderAssistantPreview(view, this.assistantPreview, this.config.rules);
        setStatus(view.querySelector('.smartMappingState'), '建议已加入路径规则草稿，请检查后点击“保存设置”。', false);
        sendDiagnostic(mappingAssistant.diagnosticRecord('smart-path-mapping-accepted', this.assistantPreview));
    };

    SettingsView.prototype.testConnection = function () {
        var state = this.view.querySelector('.connectionState');
        state.textContent = '正在连接…';
        request(CHANNELS.testConnection).then(function (response) {
            var message = {
                ok: '连接正常',
                auth_failed: '认证失败',
                connection_failed: '连接失败',
                incomplete: '配置不完整'
            }[response && response.status] || '连接失败';
            state.textContent = message;
            state.setAttribute('role', response && response.status === 'ok' ? 'status' : 'alert');
        }).catch(function () {
            state.textContent = '连接失败';
            state.setAttribute('role', 'alert');
        });
    };

    SettingsView.prototype.testRule = function (ruleId, card) {
        var state = card.querySelector('.ete-strm-rule-test');
        state.textContent = '正在检查…';
        request(CHANNELS.testRule, {ruleId: ruleId}).then(function (response) {
            if (!response || response.status === 'error') {
                state.textContent = statusText(response);
                state.setAttribute('role', 'alert');
                return;
            }
            var mount = response.mount === 'not_configured' ? '挂载未配置' : '挂载 ' + response.mount;
            var cloud = response.cloud === 'not_configured' ? 'CD2 路径未配置' : 'CD2 映射 ' + response.cloud;
            state.textContent = mount + '；' + cloud;
            state.setAttribute('role', response.status === 'ok' ? 'status' : 'alert');
        }).catch(function () {
            state.textContent = '规则检查失败';
            state.setAttribute('role', 'alert');
        });
    };

    SettingsView.prototype.restoreAuto = function (ruleId) {
        request(CHANNELS.restoreAuto, {ruleId: ruleId}).then(function (response) {
            if (!response || response.status !== 'saved') {
                setStatus(this.view.querySelector('.saveState'), statusText(response), true);
                return;
            }
            this.config = clone(response.config);
            renderConfig(this.view, this.config);
            setStatus(this.view.querySelector('.saveState'), '已恢复自动配置。', false);
        }.bind(this)).catch(function () {
            setStatus(this.view.querySelector('.saveState'), '恢复自动配置失败。', true);
        }.bind(this));
    };

    SettingsView.prototype.disableRule = function (ruleId) {
        if (/^new-rule-/.test(ruleId || '')) {
            this.config = collectConfig(this.view, this.config);
            this.config.rules = mappingAssistant.removeDraftRule(this.config.rules, ruleId);
            renderConfig(this.view, this.config);
            setStatus(this.view.querySelector('.saveState'), '未保存的规则草稿已移除。', false);
            return;
        }
        if (!window.confirm('禁用这条路径规则？系统不会在自动发现时重新创建相同映射。')) return;
        request(CHANNELS.disableRule, {ruleId: ruleId}).then(function (response) {
            if (!response || response.status !== 'saved') {
                setStatus(this.view.querySelector('.saveState'), statusText(response), true);
                return;
            }
            this.config = clone(response.config);
            renderConfig(this.view, this.config);
            setStatus(this.view.querySelector('.saveState'), '规则已禁用并记住抑制状态。', false);
        }.bind(this)).catch(function () {
            setStatus(this.view.querySelector('.saveState'), '规则禁用失败。', true);
        }.bind(this));
    };

    SettingsView.prototype.onResume = function (options) {
        BaseView.prototype.onResume.apply(this, arguments);
        if (!this.config || (options && options.refresh)) this.loadSettings();
        else loading.hide();
    };

    SettingsView.prototype.onPause = function () {
        BaseView.prototype.onPause.apply(this, arguments);
    };

    return SettingsView;
});
