'use strict';

function patchCommandProcessor(source) {
    const before = 'var url=options.mediaSourceId;return downloadFiles([apiClient.getItemDownloadUrl(item.Id,url)])';
    if (typeof source !== 'string' || source.split(before).length !== 2) throw Error('Advance download command source contract mismatch.');
    return source.replace(before, 'var url=options.mediaSourceId;if(item.MediaType==="Video"||["Movie","Episode","Video"].indexOf(item.Type)!==-1)return require(["../enhanced/advance-download/renderer.js"]).then(function(modules){return modules[0].begin(apiClient,item,url)});return downloadFiles([apiClient.getItemDownloadUrl(item.Id,url)])');
}
function patchItemContextMenu(source) {
    const before = '      commands\n    );\n  }\n  function getResolveFn';
    if (typeof source !== 'string' || source.split(before).length !== 2) throw Error('Advance download menu source contract mismatch.');
    return source.replace(before, '      commands.filter(function (command) {return command.id !== "sync" && command.id !== "synclocal";})\n    );\n  }\n  function getResolveFn');
}
module.exports = {patchCommandProcessor, patchItemContextMenu};
