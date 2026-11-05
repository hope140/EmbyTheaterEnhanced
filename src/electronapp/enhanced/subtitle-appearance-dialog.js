define(['dialogHelper', 'globalize', 'userSettings',
    'emby-select', 'paper-icon-button-light', 'emby-scroller',
    'css!../enhanced/subtitle-appearance-dialog'],
function (dialogHelper, globalize, userSettings) {
    'use strict';
    require(['formDialogStyle']);
    var chineseNames = {
        LabelDropShadow: '描边与阴影：',
        None: '关闭', Raised: '偏移阴影（原右下）', Depressed: '偏移阴影（原左上）',
        Uniform: '加粗描边', DropShadow: '标准描边',
        Transparent: '透明', Black: '黑色', Blue: '蓝色', Cyan: '青色',
        DarkGray: '深灰色', DimGray: '暗灰色', Gray: '灰色', Green: '绿色',
        LightGray: '浅灰色', Lime: '亮绿色', Magenta: '品红色',
        Orange: '橙色', Pink: '粉色', Red: '红色', Silver: '银色',
        Yellow: '黄色', White: '白色'
    };
    var traditionalNames = {
        LabelDropShadow: '描邊與陰影：',
        None: '關閉', Raised: '偏移陰影（原右下）', Depressed: '偏移陰影（原左上）',
        Uniform: '加粗描邊', DropShadow: '標準描邊',
        Transparent: '透明', Black: '黑色', Blue: '藍色', Cyan: '青色',
        DarkGray: '深灰色', DimGray: '暗灰色', Gray: '灰色', Green: '綠色',
        LightGray: '淺灰色', Lime: '亮綠色', Magenta: '洋紅色',
        Orange: '橙色', Pink: '粉紅色', Red: '紅色', Silver: '銀色',
        Yellow: '黃色', White: '白色'
    };
    var locales = typeof globalize.getCurrentLocales === 'function' ? globalize.getCurrentLocales() : [];
    var language = (locales && locales[0]) || (typeof navigator !== 'undefined' && navigator.language) || '';
    var useChineseNames = /^zh(?:-|$)/i.test(language);
    var localNames = /^zh-(?:TW|HK|MO)(?:-|$)/i.test(language) ? traditionalNames : chineseNames;
    var fields = [
        {key: 'textSize', label: 'LabelTextSize', values: [
            ['smaller', 'Smaller'], ['small', 'Small'], ['', 'Normal'],
            ['large', 'Large'], ['larger', 'Larger'], ['extralarge', 'ExtraLarge']]},
        {key: 'textColor', label: 'LabelTextColor', values: [
            ['#000000', 'Black'], ['#0000FF', 'Blue'], ['#00FFFF', 'Cyan'],
            ['#808080', 'DarkGray'], ['#696969', 'DimGray'], ['#A9A9A9', 'Gray'],
            ['#008000', 'Green'], ['#D3D3D3', 'LightGray'],
            ['#00FF00', 'Lime'], ['#FF00FF', 'Magenta'], ['#FFA500', 'Orange'],
            ['#FFC0CB', 'Pink'], ['#FF0000', 'Red'], ['#C0C0C0', 'Silver'],
            ['#FFFF00', 'Yellow'], ['#ffffff', 'White']]},
        {key: 'dropShadow', label: 'LabelDropShadow', values: [
            ['none', 'None'], ['raised', 'Raised'], ['depressed', 'Depressed'],
            ['uniform', 'Uniform'], ['dropshadow', 'DropShadow']]},
        {key: 'textBackground', label: 'LabelBackgroundColor', values: [
            ['transparent', 'Transparent'], ['#000000', 'Black'], ['#0000FF', 'Blue'],
            ['#00FFFF', 'Cyan'], ['#808080', 'DarkGray'], ['#696969', 'DimGray'],
            ['#A9A9A9', 'Gray'], ['#008000', 'Green'], ['#D3D3D3', 'LightGray'],
            ['#00FF00', 'Lime'], ['#FF00FF', 'Magenta'],
            ['#FFA500', 'Orange'], ['#FFC0CB', 'Pink'], ['#FF0000', 'Red'],
            ['#C0C0C0', 'Silver'], ['#FFFF00', 'Yellow'], ['#ffffff', 'White']]},
        {key: 'textBackgroundOpacity', label: 'LabelBackgroundOpacity', values: [
            ['.1', '10%'], ['.2', '20%'], ['.25', '25%'], ['.3', '30%'],
            ['.4', '40%'], ['.50', '50%'], ['.6', '60%'], ['.7', '70%'],
            ['.75', '75%'], ['.8', '80%'], ['.9', '90%'], ['1', '100%']]}
    ];

    function label(name) {
        return useChineseNames && Object.prototype.hasOwnProperty.call(localNames, name) ?
            localNames[name] : globalize.translate(name);
    }
    function makeField(doc, field, value) {
        var container = doc.createElement('div');
        container.className = 'selectContainer';
        var select = doc.createElement('select', {is: 'emby-select'});
        select.setAttribute('is', 'emby-select');
        select.setAttribute('label', label(field.label));
        select.setAttribute('data-setting', field.key);
        var known = false;
        var selectedValue = value;
        field.values.forEach(function (entry) {
            var option = doc.createElement('option');
            option.value = entry[0];
            option.textContent = entry[1].endsWith('%') ? entry[1] : label(entry[1]);
            select.appendChild(option);
            if (entry[0].toLowerCase() === String(value).toLowerCase()) {
                known = true;
                selectedValue = entry[0];
            }
        });
        if (!known && typeof value === 'string' && value) {
            var saved = doc.createElement('option');
            saved.value = value;
            saved.textContent = value;
            select.appendChild(saved);
        }
        select.value = selectedValue;
        container.appendChild(select);
        if (field.key === 'dropShadow') {
            var note = doc.createElement('div');
            note.className = 'fieldDescription subtitleAppearanceHint';
            note.textContent = useChineseNames ?
                (localNames === traditionalNames ? '本地播放器對兩種偏移陰影使用相同的近似效果。' :
                    '本地播放器对两种偏移阴影使用相同的近似效果。') :
                'The two offset shadows use the same approximation in the local player.';
            container.appendChild(note);
        }
        return container;
    }

    function SubtitleAppearanceDialog(options) {
        this.options = options;
        this.dlg = null;
    }
    SubtitleAppearanceDialog.prototype.show = function () {
        if (this.dlg) return Promise.resolve();
        var self = this;
        var dlg = dialogHelper.createDialog({removeOnClose: true, scrollY: true, transparentBackground: true});
        dlg.classList.add('formDialog', 'subtitleAppearanceDialog', 'dialog-blur');
        var header = document.createElement('div');
        header.className = 'formDialogHeader formDialogHeader-clear';
        var back = document.createElement('button', {is: 'paper-icon-button-light'});
        back.setAttribute('is', 'paper-icon-button-light');
        back.className = 'btnCancel autoSize';
        back.setAttribute('aria-label', label('Back'));
        back.innerHTML = '<i class="md-icon autortl">&#xE5C4;</i>';
        back.addEventListener('click', function () { self.close(); });
        var title = document.createElement('h3');
        title.className = 'formDialogHeaderTitle';
        title.textContent = label('HeaderSubtitleAppearance');
        header.appendChild(back);
        header.appendChild(title);
        dlg.appendChild(header);
        var body = document.createElement('div', {is: 'emby-scroller'});
        body.setAttribute('is', 'emby-scroller');
        body.className = 'formDialogContent no-grow';
        var form = document.createElement('form');
        form.className = 'dialogContentInner dialog-content-centered padded-left padded-right padded-top padded-bottom';
        form.addEventListener('submit', function (event) { event.preventDefault(); });
        var settings = userSettings.getSubtitleAppearanceSettings();
        fields.forEach(function (field) {
            var fallback = field.key === 'textBackground' ? 'transparent' :
                field.key === 'textBackgroundOpacity' ? '1' :
                field.key === 'textColor' ? '#ffffff' :
                field.key === 'dropShadow' ? 'dropshadow' : '';
            form.appendChild(makeField(document, field, settings[field.key] == null ? fallback : settings[field.key]));
        });
        var opacity = form.querySelector('[data-setting="textBackgroundOpacity"]').parentNode;
        function updateOpacity() {
            opacity.classList.toggle('hide', form.querySelector('[data-setting="textBackground"]').value === 'transparent');
        }
        updateOpacity();
        form.addEventListener('change', function (event) {
            var select = event.target.closest('[data-setting]');
            if (!select || !form.contains(select) || !self.options) return;
            var current = Object.assign({}, userSettings.getSubtitleAppearanceSettings());
            current[select.getAttribute('data-setting')] = select.value;
            userSettings.setSubtitleAppearanceSettings(current);
            updateOpacity();
            if (self.options.player && typeof self.options.player.applySubtitleAppearance === 'function') {
                Promise.resolve(self.options.player.applySubtitleAppearance(current)).catch(function () {});
            }
        });
        body.appendChild(form);
        dlg.appendChild(body);
        this.dlg = dlg;
        return dialogHelper.open(dlg).then(function () { self.dlg = null; }, function () { self.dlg = null; });
    };
    SubtitleAppearanceDialog.prototype.close = function () {
        if (this.dlg) dialogHelper.close(this.dlg);
    };
    SubtitleAppearanceDialog.prototype.destroy = function () {
        this.close();
        this.dlg = null;
        this.options = null;
    };
    return SubtitleAppearanceDialog;
});
