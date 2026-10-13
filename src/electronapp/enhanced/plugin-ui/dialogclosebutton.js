define(['exports', 'modules/dialoghelper/dialoghelper.js', 'modules/common/globalize.js'], function(exports, dialogHelper, globalize) {
    'use strict';
    var name = 'emby-dialogclosebutton';
    var closingDialogs = new WeakSet();
    var handlers = new WeakMap();
    var attached = new WeakSet();
    var existing = customElements.get(name);

    function closeOwner(button, event) {
        var dialog = button.closest('.dialog');
        if (!dialog || !dialog.isConnected || !dialog.classList || !dialog.classList.contains('dialog') ||
            dialog.classList.contains('hide') || button.ownerDocument && dialog.ownerDocument !== button.ownerDocument) return;
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (closingDialogs.has(dialog)) return;
        closingDialogs.add(dialog);
        var onClose = function() { closingDialogs.delete(dialog); };
        dialog.addEventListener('close', onClose, {once: true});
        try {
            dialogHelper.default.close(dialog);
        } catch (error) {
            dialog.removeEventListener('close', onClose);
            closingDialogs.delete(dialog);
            throw error;
        }
    }

    function register() {
        if (existing) return existing;
        class EmbyDialogCloseButton extends HTMLButtonElement {
            connectedCallback() {
                this.type = 'button';
                this.setAttribute('type', 'button');
                this.classList.add('paper-icon-button-light', 'md-icon');
                if (!this.textContent.trim()) this.textContent = 'close';
                if (!this.hasAttribute('aria-label')) {
                    var label = '';
                    try {
                        var translate = globalize && globalize.default && globalize.default.translate;
                        if (typeof translate === 'function') label = translate('ButtonClose');
                    } catch (_) {}
                    this.setAttribute('aria-label', typeof label === 'string' && label ? label : 'Close dialog');
                }
                var handler = handlers.get(this);
                if (!handler) { handler = closeOwner.bind(null, this); handlers.set(this, handler); }
                if (!attached.has(this)) {
                    this.addEventListener('click', handler);
                    attached.add(this);
                }
            }
            disconnectedCallback() {
                if (attached.has(this)) {
                    this.removeEventListener('click', handlers.get(this));
                    attached.delete(this);
                }
            }
        }
        customElements.define(name, EmbyDialogCloseButton, {extends: 'button'});
        return EmbyDialogCloseButton;
    }

    exports.default = register();
});
