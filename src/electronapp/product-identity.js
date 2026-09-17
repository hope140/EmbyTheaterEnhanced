'use strict';

function getProductIdentity(metadata) {
    var info = metadata || {};
    return info.productName || info.name;
}

function setAppName(app, metadata) {
    var identity = getProductIdentity(metadata);
    if (!app || typeof app.setName !== 'function') throw new Error('Electron app.setName is required.');
    if (!identity) throw new Error('Runtime package metadata requires productName or name.');
    app.setName(identity);
    return identity;
}

module.exports = {getProductIdentity, setAppName};
