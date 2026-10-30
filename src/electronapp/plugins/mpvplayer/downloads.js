define(['baseView', '../../enhanced/advance-download/renderer.js', 'emby-button', 'emby-scroller', 'css!./enhanced-settings', 'css!./downloads'], function (BaseView, downloads) {
    'use strict';
    var states = {checking: '正在核对来源', queued: '等待下载', downloading: '正在下载', paused: '已暂停', failed: '未完成', complete: '已完成'};
    function button(label) {
        var result = document.createElement('button', {is: 'emby-button'});
        result.type = 'button'; result.classList.add('raised', 'emby-button'); result.textContent = label;
        return result;
    }
    function size(value) {return value >= 1073741824 ? (value / 1073741824).toFixed(2) + ' GiB' : (value / 1048576).toFixed(1) + ' MiB';}
    function DownloadView(view) {
        BaseView.apply(this, arguments);
        this.view = view; this.epoch = 0; this.refreshId = 0; this.timer = null; this.active = false; this.rows = new Map();
        var self = this;
        view.querySelector('.btnRefreshDownloads').addEventListener('click', function () {self.refresh();});
        view.querySelector('.btnDownloadDirectory').addEventListener('click', function () {return self.action(this, function () {return downloads.directory();});});
        view.querySelector('.btnOpenDownloadDirectory').addEventListener('click', function () {return self.action(this, function () {return downloads.openFolder();});});
    }
    Object.assign(DownloadView.prototype, BaseView.prototype);
    DownloadView.prototype.action = async function (control, work) {
        var epoch = this.epoch;
        control.disabled = true;
        try {
            var result = await work();
            if (this.active && this.epoch === epoch) {
                if (result && result.status === 'error') this.view.querySelector('.downloadStatus').textContent = downloads.message(result.reason);
                else await this.refresh();
            }
        } finally {control.disabled = false;}
    };
    DownloadView.prototype.row = function (task) {
        var self = this, row = this.rows.get(task.id);
        if (!row) {
            row = {element: document.createElement('section'), name: document.createElement('h3'), detail: document.createElement('p'),
                progress: document.createElement('progress'), location: document.createElement('p'), note: document.createElement('p'), actions: document.createElement('div'),
                retry: button('重试 / 继续'), open: button('打开文件夹')};
            row.element.classList.add('downloadTask'); row.location.classList.add('downloadPath'); row.note.classList.add('downloadTaskReason'); row.actions.classList.add('downloadActions');
            [row.name, row.detail, row.progress, row.location, row.note, row.actions].forEach(function (child) {row.element.appendChild(child);});
            row.actions.appendChild(row.retry); row.actions.appendChild(row.open);
            row.retry.addEventListener('click', function () {return self.action(this, function () {return downloads.retry(task.id);});});
            row.open.addEventListener('click', function () {return self.action(this, function () {return downloads.openFolder(task.id);});});
            this.rows.set(task.id, row); this.view.querySelector('.downloadTasks').appendChild(row.element);
        }
        row.name.textContent = task.title || '视频下载';
        row.detail.textContent = (states[task.state] || '未知状态') + (task.total ? ' · ' + size(task.bytes) + ' / ' + size(task.total) + ' · ' + Math.floor(100 * task.bytes / task.total) + '%' : ' · 尚未开始传输');
        row.progress.hidden = !task.total; row.progress.max = task.total || 1; row.progress.value = task.bytes || 0;
        row.location.textContent = task.targetPath || task.directory || '尚未选择目录';
        row.note.textContent = task.reason ? (task.stage ? downloads.stage(task.stage) + '：' : '') +
            (/-restarting$/.test(task.reason) ? '无法安全续传，正在从头下载。' : downloads.message(task.reason)) : '';
        row.note.hidden = !task.reason;
        row.retry.hidden = task.state !== 'paused' && task.state !== 'failed'; row.open.hidden = !task.directory;
        return row;
    };
    DownloadView.prototype.refresh = async function () {
        var epoch = this.epoch, refreshId = ++this.refreshId;
        var result = await downloads.status();
        if (!this.active || this.epoch !== epoch || this.refreshId !== refreshId) return;
        var view = this.view, status = view.querySelector('.downloadStatus'), self = this;
        if (result.status !== 'ok') {
            this.rows.forEach(function (row) {row.element.remove();}); this.rows.clear();
            view.querySelector('.downloadDirectory').textContent = '';
            view.querySelector('.downloadCount').textContent = '';
            view.querySelector('.btnOpenDownloadDirectory').disabled = true;
            status.textContent = downloads.message(result.reason); return;
        }
        view.querySelector('.downloadDirectory').textContent = result.directory || '尚未选择目录，首次下载时会提示选择。';
        view.querySelector('.btnOpenDownloadDirectory').disabled = !result.directory;
        var tasks = result.tasks || [], ids = new Set(tasks.map(function (task) {return task.id;}));
        this.rows.forEach(function (row, id) {if (!ids.has(id)) {row.element.remove(); self.rows.delete(id);}});
        tasks.forEach(function (task) {self.row(task);});
        view.querySelector('.downloadCount').textContent = tasks.length ? '（' + tasks.length + '）' : '';
        status.textContent = tasks.length ? '' : '暂无下载任务。在影片详情中点击“下载”即可添加。';
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
