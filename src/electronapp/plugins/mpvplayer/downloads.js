define(['baseView', '../../enhanced/advance-download/renderer.js', 'emby-button', 'emby-scroller', 'css!./enhanced-settings', 'css!./downloads'], function (BaseView, downloads) {
    'use strict';
    var states = {checking: '正在核对来源', queued: '等待下载', downloading: '正在下载', paused: '已暂停', failed: '下载失败', complete: '已完成'};
    var fileStates = {'file-missing': '未找到本地文件', 'directory-unavailable': '目录暂不可用', 'directory-changed': '目录已变化',
        'file-changed': '文件已变化', 'file-unavailable': '文件暂不可用', checking: '正在检查文件位置'};
    var fileNotes = {'file-missing': '未找到文件，可能已被移动或删除。记录保留，可删除记录或重新下载。',
        'directory-unavailable': '目录暂不可用，请检查磁盘连接。记录保留，磁盘恢复后会重新检查。',
        'directory-changed': '目录身份已变化，原文件索引保留，未接管其他文件。',
        'file-changed': '本地文件已变化，ETE 不会接管或自动删除它。',
        'file-unavailable': '暂时无法读取文件，请检查权限或稍后刷新。', checking: '正在检查本地文件位置，暂不改变任务记录。'};
    function button(label) {
        var result = document.createElement('button', {is: 'emby-button'});
        result.type = 'button'; result.classList.add('raised', 'emby-button'); result.textContent = label;
        return result;
    }
    function size(value) {return value >= 1073741824 ? (value / 1073741824).toFixed(2) + ' GiB' : (value / 1048576).toFixed(1) + ' MiB';}
    function DownloadView(view) {
        BaseView.apply(this, arguments);
        this.view = view; this.epoch = 0; this.refreshId = 0; this.timer = null; this.active = false;
        this.rows = new Map(); this.selected = new Set(); this.tasks = [];
        var self = this;
        view.querySelector('.btnDownloadDirectory').addEventListener('click', function () {return self.action(this, function () {return downloads.directory();});});
        view.querySelector('.btnOpenDownloadDirectory').addEventListener('click', function () {return self.action(this, function () {return downloads.openFolder();});});
        view.querySelector('.btnPauseAllDownloads').addEventListener('click', function () {return self.action(this, function () {return downloads.pauseAll();});});
        view.querySelector('.btnResumeAllDownloads').addEventListener('click', function () {return self.action(this, function () {return downloads.resumeAll();});});
        view.querySelector('.btnRemoveSelectedDownloads').addEventListener('click', function () {
            var ids = Array.from(self.selected);
            if (ids.length) return self.action(this, function () {return downloads.remove(ids);});
        });
        view.querySelector('.chkSelectAllDownloads').addEventListener('change', function () {
            self.selected.clear();
            if (this.checked) self.tasks.forEach(function (task) {self.selected.add(task.id);});
            self.rows.forEach(function (row, id) {row.select.checked = self.selected.has(id);}); self.toolbar();
        });
    }
    Object.assign(DownloadView.prototype, BaseView.prototype);
    DownloadView.prototype.action = async function (control, work) {
        var epoch = this.epoch;
        control.disabled = true;
        try {
            var result = await work();
            if (this.active && this.epoch === epoch) {
                if (result && result.status === 'error') this.view.querySelector('.downloadStatus').textContent = downloads.message(result.reason);
                else if (result && result.status !== 'cancelled') {
                    await this.refresh();
                    var failures = (result.results || []).filter(function (value) {return value.status === 'error';});
                    if (failures.length) this.view.querySelector('.downloadStatus').textContent = failures.length + ' 项操作未完成：' + downloads.message(failures[0].reason);
                }
            }
        } finally {control.disabled = false; if (this.active) this.toolbar();}
    };
    DownloadView.prototype.toolbar = function () {
        var busy = this.tasks.some(function (task) {return task.busy;});
        this.view.querySelector('.btnPauseAllDownloads').disabled = busy || !this.tasks.some(function (task) {return ['checking', 'queued', 'downloading'].indexOf(task.state) >= 0;});
        this.view.querySelector('.btnResumeAllDownloads').disabled = busy || !this.tasks.some(function (task) {return task.state === 'paused' || task.state === 'failed';});
        this.view.querySelector('.btnRemoveSelectedDownloads').disabled = busy || this.selected.size === 0;
        this.view.querySelector('.downloadSelectionCount').textContent = this.selected.size ? '已选 ' + this.selected.size + ' 项' : '';
        var all = this.view.querySelector('.chkSelectAllDownloads');
        all.disabled = !this.tasks.length || busy; all.checked = this.tasks.length > 0 && this.selected.size === this.tasks.length;
        all.indeterminate = this.selected.size > 0 && this.selected.size < this.tasks.length;
    };
    DownloadView.prototype.row = function (task) {
        var self = this, row = this.rows.get(task.id);
        if (!row) {
            row = {element: document.createElement('section'), header: document.createElement('div'), name: document.createElement('h3'),
                selection: document.createElement('label'), select: document.createElement('input'), selectionText: document.createElement('span'),
                detail: document.createElement('p'), progress: document.createElement('progress'), source: document.createElement('p'), location: document.createElement('p'),
                fileNote: document.createElement('p'), note: document.createElement('p'), actions: document.createElement('div'),
                control: button('继续'), open: button('打开文件夹'), remove: button('删除')};
            row.element.classList.add('downloadTask'); row.header.classList.add('downloadTaskHeader'); row.location.classList.add('downloadPath');
            row.note.classList.add('downloadTaskReason'); row.actions.classList.add('downloadActions'); row.selection.classList.add('downloadTaskSelection');
            row.select.type = 'checkbox'; row.selectionText.textContent = '选择'; row.selection.appendChild(row.select); row.selection.appendChild(row.selectionText);
            row.header.appendChild(row.name); row.header.appendChild(row.selection);
            [row.header, row.detail, row.progress, row.source, row.location, row.fileNote, row.note, row.actions].forEach(function (child) {row.element.appendChild(child);});
            [row.control, row.open, row.remove].forEach(function (control) {row.actions.appendChild(control);});
            row.select.addEventListener('change', function () {if (this.checked) self.selected.add(task.id); else self.selected.delete(task.id); self.toolbar();});
            row.control.addEventListener('click', function () {
                return self.action(this, function () {return ['checking', 'queued', 'downloading'].indexOf(row.task.state) >= 0 ? downloads.pause(task.id) : downloads.resume(task.id);});
            });
            row.open.addEventListener('click', function () {return self.action(this, function () {return downloads.openFolder(task.id);});});
            row.remove.addEventListener('click', function () {return self.action(this, function () {return downloads.remove([task.id]);});});
            this.rows.set(task.id, row); this.view.querySelector('.downloadTasks').appendChild(row.element);
        }
        row.task = task; row.name.textContent = task.title || '视频下载';
        row.select.setAttribute('aria-label', '选择 ' + (task.title || '视频下载')); row.select.checked = this.selected.has(task.id); row.select.disabled = !!task.busy;
        var invalidFile = task.state === 'complete' && task.fileState && task.fileState !== 'available';
        row.detail.textContent = (task.busy === 'remove' ? '正在处理删除请求' : invalidFile ? fileStates[task.fileState] || '文件暂不可用' : states[task.state] || '未知状态') +
            (task.total ? invalidFile ? ' · 原下载大小 ' + size(task.total) : ' · ' + size(task.bytes) + ' / ' + size(task.total) + ' · ' + Math.floor(100 * task.bytes / task.total) + '%' : ' · 尚未开始传输');
        row.progress.hidden = !task.total || invalidFile; row.progress.max = task.total || 1; row.progress.value = task.bytes || 0;
        row.source.textContent = task.total ? '下载来源：' + downloads.sourceKind(task.sourceKind) : ''; row.source.hidden = !task.total;
        row.location.textContent = task.targetPath || task.directory || '尚未选择目录';
        row.fileNote.textContent = invalidFile ? fileNotes[task.fileState] || '' : ''; row.fileNote.hidden = !invalidFile;
        row.note.textContent = task.reason ? (/-restarting$/.test(task.reason) ? '无法安全续传，正在从头下载。' :
            task.state === 'failed' ? downloads.detail(task) : downloads.message(task.reason)) : '';
        row.note.hidden = !task.reason;
        var canPause = ['checking', 'queued', 'downloading'].indexOf(task.state) >= 0;
        var canRedownload = task.state === 'complete' && ['file-missing', 'file-changed'].indexOf(task.fileState) >= 0;
        row.control.textContent = canPause ? '暂停' : canRedownload ? '重新下载' : task.state === 'failed' ? '重试' : '继续';
        row.control.hidden = !canPause && !canRedownload && task.state !== 'paused' && task.state !== 'failed';
        row.control.disabled = row.remove.disabled = !!task.busy;
        row.open.hidden = !task.directory;
        return row;
    };
    DownloadView.prototype.refresh = async function () {
        var epoch = this.epoch, refreshId = ++this.refreshId;
        var result = await downloads.status();
        if (!this.active || this.epoch !== epoch || this.refreshId !== refreshId) return;
        var view = this.view, status = view.querySelector('.downloadStatus'), self = this;
        if (result.status !== 'ok') {
            this.rows.forEach(function (row) {row.element.remove();}); this.rows.clear(); this.selected.clear(); this.tasks = []; this.toolbar();
            view.querySelector('.downloadDirectory').textContent = ''; view.querySelector('.downloadCount').textContent = '';
            view.querySelector('.btnOpenDownloadDirectory').disabled = true; status.textContent = downloads.message(result.reason); return;
        }
        view.querySelector('.downloadDirectory').textContent = result.directory || '尚未选择目录，首次下载时会提示选择。';
        view.querySelector('.btnOpenDownloadDirectory').disabled = !result.directory;
        var tasks = result.tasks || [], ids = new Set(tasks.map(function (task) {return task.id;}));
        this.tasks = tasks;
        this.selected.forEach(function (id) {if (!ids.has(id)) self.selected.delete(id);});
        this.rows.forEach(function (row, id) {if (!ids.has(id)) {row.element.remove(); self.rows.delete(id);}});
        tasks.forEach(function (task) {self.row(task);}); this.toolbar();
        view.querySelector('.downloadCount').textContent = tasks.length ? '（' + tasks.length + '）' : '';
        status.textContent = tasks.length ? '' : '暂无下载任务。在影片详情中点击“下载”即可添加。';
    };
    DownloadView.prototype.onResume = function () {
        BaseView.prototype.onResume.apply(this, arguments);
        this.active = true; this.epoch++;
        clearInterval(this.timer); this.timer = setInterval(this.refresh.bind(this), 3000); return this.refresh();
    };
    DownloadView.prototype.onPause = function () {
        this.active = false; this.epoch++; clearInterval(this.timer); this.timer = null; BaseView.prototype.onPause.apply(this, arguments);
    };
    DownloadView.prototype.destroy = function () {
        this.active = false; this.epoch++; clearInterval(this.timer);
        if (BaseView.prototype.destroy) return BaseView.prototype.destroy.apply(this, arguments);
    };
    return DownloadView;
});
