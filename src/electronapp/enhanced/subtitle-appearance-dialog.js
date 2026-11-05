define(['dialogHelper', 'globalize', 'userSettings',
    'emby-select', 'paper-icon-button-light', 'emby-scroller'],
function (dialogHelper, globalize, userSettings) {
    'use strict';
    require(['formDialogStyle']);
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

    function label(name) { return globalize.translate(name); }
    function makeField(doc, field, value) {
        var container = doc.createElement('div');
        container.className = 'selectContainer';
        container.style.marginBottom = '1.2em';
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
        dlg.classList.add('formDialog', 'subtitleAppearanceDialog');
        var header = document.createElement('div');
        header.className = 'formDialogHeader';
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
        body.className = 'formDialogContent';
        var form = document.createElement('form');
        form.className = 'dialogContentInner dialog-content-centered padded-left padded-right padded-top padded-bottom';
        form.style.maxWidth = '34em';
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
