define(['exports', 'modules/registrationservices/registrationservices.js', 'modules/common/servicelocator.js'], function(exports, registration, services) {
    'use strict';
    // Compatibility display element only. Reuse existing entitlement checks;
    // this does not unlock features or introduce an authentication route.
    class PremiereContainer extends HTMLDivElement {
        connectedCallback() {
            var self = this, generation = this.generation = (this.generation || 0) + 1;
            this.style.display = 'none';
            registration.default.validateFeature('dvr', {showDialog: false, viewOnly: true}).then(function() {}, function() {
                var unlocks = (self.getAttribute('data-showifunlocked') || '').split(',').filter(Boolean);
                return unlocks.reduce(function(promise, feature) {
                    return promise.then(function() {
                        var inverse = feature.charAt(0) === '!';
                        return services.iapManager.isUnlockedByDefault(inverse ? feature.slice(1) : feature).then(function() {
                            if (inverse) throw new Error('Display condition not met');
                        }, function() { if (!inverse) throw new Error('Display condition not met'); });
                    });
                }, Promise.resolve()).then(function() {
                    if (self.isConnected && self.generation === generation) self.style.display = '';
                });
            }).catch(function() {});
        }
        disconnectedCallback() { this.generation = (this.generation || 0) + 1; }
    }
    if (!customElements.get('emby-premierecontainer')) customElements.define('emby-premierecontainer', PremiereContainer, {extends: 'div'});
    exports.default = PremiereContainer;
});
