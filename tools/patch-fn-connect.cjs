'use strict';
const {createHash} = require('node:crypto');
const BASE_SHA256 = '08f70e05191c68940a769c3c61ae779cc4c6ad9970d87971198e520c0a67e871';
function patchManualServer(source) {
    if (createHash('sha256').update(source).digest('hex') !== BASE_SHA256) throw new Error('FN manual server fixed input mismatch');
    const replacements = [
        ['"./../modules/common/appsettings.js"],function(', '"./../modules/common/appsettings.js","../../enhanced/fn-connect/manual-server.js"],function('],
        ['_approuter,_appsettings){function View', '_approuter,_appsettings,_fnManual){function View'],
        ['_baseview.default.apply(this,arguments),view.querySelector("form")', '_baseview.default.apply(this,arguments),this._eteFnDispose=_fnManual.install(view,{connection:_connectionmanager.default,router:_approuter.default,loading:_loading.default}),view.querySelector("form")'],
        [',_exports.default=View});', ',View.prototype.destroy=function(){if(this._eteFnDispose)this._eteFnDispose();return _baseview.default.prototype.destroy.apply(this,arguments)},_exports.default=View});']
    ];
    for (const [from, to] of replacements) {
        if (source.split(from).length !== 2) throw new Error('FN manual server transform boundary mismatch');
        source = source.replace(from, to);
    }
    return source;
}
module.exports = {BASE_SHA256, patchManualServer};
