'use strict';

function patchCommandProcessor(source) {
    const before = 'var url=options.mediaSourceId;return downloadFiles([apiClient.getItemDownloadUrl(item.Id,url)])';
    if (typeof source !== 'string' || source.split(before).length !== 2) throw Error('Advance download command source contract mismatch.');
    return source.replace(before, 'var url=options.mediaSourceId;if(["Season","Series"].indexOf(item.Type)!==-1)return require(["../enhanced/advance-download/renderer.js"]).then(function(modules){return modules[0].beginCollection(apiClient,item)});if(item.MediaType==="Video"||["Movie","Episode","Video"].indexOf(item.Type)!==-1)return require(["../enhanced/advance-download/renderer.js"]).then(function(modules){return modules[0].begin(apiClient,item,url)});return downloadFiles([apiClient.getItemDownloadUrl(item.Id,url)])');
}
function patchItemContextMenu(source) {
    const before = '      commands\n    );\n  }\n  function getResolveFn';
    if (typeof source !== 'string' || source.split(before).length !== 2) throw Error('Advance download menu source contract mismatch.');
    const download = 'item.CanDownload &&\n        _servicelocator.appHost.supports("filedownload") &&\n        commands.push({name: _globalize.default.translate("Download"), id: "download", icon: "download"})';
    if (source.split(download).length !== 2) throw Error('Advance download parent menu source contract mismatch.');
    source = source.replace(download, '(item.CanDownload || (["Season", "Series"].indexOf(item.Type) !== -1 && user && user.Policy && user.Policy.EnableContentDownloading === true)) &&\n        _servicelocator.appHost.supports("filedownload") &&\n        commands.push({name: item.Type === "Season" ? "下载整季" : item.Type === "Series" ? "下载整部剧" : _globalize.default.translate("Download"), id: "download", icon: "download"})');
    return source.replace(before, '      commands.filter(function (command) {return command.id !== "sync" && command.id !== "synclocal";})\n    );\n  }\n  function getResolveFn');
}
function patchMultiSelect(source) {
    const before = '!menuItems.length)';
    if (typeof source !== 'string' || source.split(before).length !== 2) throw Error('Advance download multi-select source contract mismatch.');
    return source.replace(before, '!(menuItems = menuItems.filter(function (command) {return command.id !== "sync" && command.id !== "synclocal";})).length)');
}
module.exports = {patchCommandProcessor, patchItemContextMenu, patchMultiSelect};
