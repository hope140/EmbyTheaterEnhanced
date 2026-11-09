define(['dialogHelper', 'globalize', 'layoutManager', 'focusManager', 'inputManager',
    'text!modules/dialog/dialog.template.html', 'emby-button', 'formDialogStyle', 'flexStyles', 'emby-scroller'],
function (dialogHelper, globalize, layoutManager, focusManager, inputManager, template) {
    'use strict';

    // This terminal notice owns a local surface, never a router history entry.
    // Do not use dialogHelper.open/close: its URL-based history owner and delayed
    // backdrop setup are intended for ordinary navigation dialogs.
    return function (options, owner) {
        if (!owner.current()) return Promise.resolve();
        return new Promise(function (resolve, reject) {
            var dlg = dialogHelper.createDialog({enableHistory: false, transparentBackground: true,
                size: layoutManager.tv ? 'fullscreen' : undefined});
            var container = document.createElement('div'), activeElement = document.activeElement;
            var scrollingElement = document.scrollingElement || document.documentElement;
            var ownsScrollLock = !scrollingElement.classList.contains('withDialogOpen');
            var closed = false;
            container.className = 'dialogContainer';
            dlg.classList.remove('dialog-animated', 'hide');
            dlg.classList.add('dialog-noanimation', 'opened', 'formDialog', 'align-items-center', 'justify-content-center', 'etePlaybackErrorDialog');
            dlg.setAttribute('role', 'alertdialog');
            dlg.setAttribute('aria-modal', 'true');
            dlg.setAttribute('aria-label', options.title);
            dlg.innerHTML = template;
            dlg.querySelector('.formDialogHeaderTitle').textContent = options.title;
            dlg.querySelector('.dialogContentInner').textContent = options.text;
            dlg.querySelector('.dialogContentInner').style.textAlign = 'center';
            var content = dlg.querySelector('.formDialogContent');
            content.classList.add('no-grow');
            if (layoutManager.tv) {
                content.style.maxWidth = '50%'; content.style.maxHeight = '60%';
            } else dlg.classList.add('dialog-fullscreen-lowres');
            var button = document.createElement('button', {is: 'emby-button'});
            button.type = 'button';
            button.classList.add('btnOption', 'raised', 'formDialogFooterItem', 'formDialogFooterItem-autosize', 'button-submit');
            button.textContent = globalize.translate('ButtonGotIt');
            dlg.querySelector('.formDialogFooter').appendChild(button);

            function close(confirmed) {
                if (closed) return;
                closed = true;
                if (owner.close === retire) owner.close = null;
                inputManager.off(dlg, onCommand);
                dlg.removeEventListener('keydown', onKeyDown);
                container.removeEventListener('click', onBackdrop);
                button.removeEventListener('click', confirm);
                dlg.dispatchEvent(new CustomEvent('closing'));
                focusManager.popScope(dlg);
                dlg.classList.add('hide');
                dlg.classList.remove('opened');
                if (ownsScrollLock) scrollingElement.classList.remove('withDialogOpen');
                container.remove();
                dlg.dispatchEvent(new CustomEvent('close'));
                if (owner.current() && activeElement && activeElement.isConnected) focusManager.focus(activeElement);
                confirmed && owner.current() ? resolve() : reject();
            }
            function retire() { close(false); }
            function confirm() { close(true); }
            function onCommand(event) {
                var command = event.detail.command;
                if (command === 'back') {event.preventDefault(); event.stopImmediatePropagation(); close(false);}
                else if (['home', 'end', 'settings', 'guide', 'recordedtv', 'favorites', 'channelup', 'channeldown'].indexOf(command) >= 0) event.preventDefault();
                else event.stopPropagation();
            }
            function onKeyDown(event) {
                if (event.key === 'Escape') {event.preventDefault(); event.stopImmediatePropagation(); close(false);}
            }
            function onBackdrop(event) { if (event.target === container) close(false); }
            owner.close = retire;
            button.addEventListener('click', confirm);
            inputManager.on(dlg, onCommand);
            dlg.addEventListener('keydown', onKeyDown);
            container.addEventListener('click', onBackdrop);
            container.appendChild(dlg);
            document.body.appendChild(container);
            if (ownsScrollLock) scrollingElement.classList.add('withDialogOpen');
            focusManager.pushScope(dlg);
            dlg.dispatchEvent(new CustomEvent('open'));
            focusManager.autoFocus(dlg);
        });
    };
});
