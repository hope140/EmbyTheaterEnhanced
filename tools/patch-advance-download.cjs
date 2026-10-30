'use strict';

function patchCommandProcessor(source) {
    const before = 'var url=options.mediaSourceId;return downloadFiles([apiClient.getItemDownloadUrl(item.Id,url)])';
    if (typeof source !== 'string' || source.split(before).length !== 2) throw Error('Advance download command source contract mismatch.');
    return source.replace(before, 'var url=options.mediaSourceId;if(item.MediaType==="Video"||["Movie","Episode","Video"].indexOf(item.Type)!==-1)return require(["../enhanced/advance-download/renderer.js"]).then(function(modules){return modules[0].begin(apiClient,item,url)});return downloadFiles([apiClient.getItemDownloadUrl(item.Id,url)])');
}
module.exports = {patchCommandProcessor};
