define(['baseView', '../../enhanced/advance-download/renderer.js', 'emby-button', 'emby-scroller', 'css!./enhanced-settings'], function (BaseView, downloads) {
    'use strict';
    var states = {queued: '等待下载', downloading: '正在下载', paused: '已暂停，登录后继续', failed: '未完成', complete: '已完成'};
    function DownloadView(view) {
        BaseView.apply(this, arguments);
        this.view = view; this.epoch = 0; this.refreshId = 0; this.timer = null; this.active = false;
        var self = this;
        view.querySelector('.btnRefreshDownloads').addEventListener('click', function () {self.refresh();});
        view.querySelector('.btnDownloadDirectory').addEventListener('click', async function () {
            var epoch = self.epoch;
            this.disabled = true;
            try {
                var result = await downloads.directory();
                if (self.active && self.epoch === epoch) {
                    if (result.status === 'error') self.view.querySelector('.downloadStatus').textContent = downloads.message(result.reason);
                    else self.refresh();
                }
            } finally {this.disabled = false;}
        });
    }
    Object.assign(DownloadView.prototype, BaseView.prototype);
    DownloadView.prototype.refresh = async function () {
        var epoch = this.epoch, refreshId = ++this.refreshId;
        var result = await downloads.status();
        if (!this.active || this.epoch !== epoch || this.refreshId !== refreshId) return;
        var view = this.view, status = view.querySelector('.downloadStatus');
        if (result.status !== 'ok') {
            view.querySelector('.downloadTasks').textContent = '';
            view.querySelector('.downloadDirectory').textContent = '';
            status.textContent = downloads.message(result.reason); return;
        }
        view.querySelector('.downloadDirectory').textContent = result.directory || '首次下载时选择';
        var container = view.querySelector('.downloadTasks');
        container.textContent = '';
        var self = this;
        (result.tasks || []).forEach(function (task) {
            var row = document.createElement('section'), name = document.createElement('h3'), detail = document.createElement('p'), location = document.createElement('p');
            name.textContent = task.title;
            detail.textContent = (states[task.state] || '未知') + ' · ' + (task.bytes / 1048576).toFixed(1) + ' / ' + (task.total / 1048576).toFixed(1) + ' MiB';
            location.textContent = task.directory + (task.fileName ? ' — ' + task.fileName : '');
            row.appendChild(name); row.appendChild(detail); row.appendChild(location);
            if (task.reason && /-restarting$/.test(task.reason)) {
                var note = document.createElement('p'); note.textContent = task.reason === 'source-changed-restarting' ? '来源版本变化，正在从头下载。' : '无法安全续传，正在从头下载。'; row.appendChild(note);
            } else if (task.state === 'failed') {
                var error = document.createElement('p'); error.textContent = downloads.message(task.reason); row.appendChild(error);
            }
            if (task.state === 'paused' || task.state === 'failed') {
                var retry = document.createElement('button'); retry.type = 'button'; retry.className = 'raised emby-button'; retry.textContent = '继续';
                retry.addEventListener('click', async function () {
                    var epoch = self.epoch;
                    this.disabled = true;
                    await downloads.retry(task.id);
                    if (self.active && self.epoch === epoch) self.refresh();
                });
                row.appendChild(retry);
            }
            container.appendChild(row);
        });
        status.textContent = result.tasks && result.tasks.length ? '' : '当前账户没有下载任务。';
    };
    DownloadView.prototype.onResume = function () {
        BaseView.prototype.onResume.apply(this, arguments);
        this.active = true; this.epoch++;
        clearInterval(this.timer); this.timer = setInterval(this.refresh.bind(this), 3000);
        return this.refresh();
    };
    DownloadView.prototype.onPause = function () {
        this.active = false; this.epoch++; clearInterval(this.timer); this.timer = null;
        BaseView.prototype.onPause.apply(this, arguments);
    };
    DownloadView.prototype.destroy = function () {
        this.active = false; this.epoch++; clearInterval(this.timer);
        if (BaseView.prototype.destroy) return BaseView.prototype.destroy.apply(this, arguments);
    };
    return DownloadView;
});
