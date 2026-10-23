'use strict';
// Main-only decoder. Pixels never traverse renderer IPC or filesystem paths.
function validOwner(owner) {
    return !!owner && Object.keys(owner).length === 2 &&
        typeof owner.endpointId === 'string' && /^[a-f0-9-]{36}$/.test(owner.endpointId) &&
        Number.isSafeInteger(owner.generationId) && owner.generationId > 0;
}
function sameOwner(left, right) {
    return validOwner(left) && validOwner(right) && left.endpointId === right.endpointId && left.generationId === right.generationId;
}
function decode(value, generationId) {
    if (!value || value.ready !== true) return null;
    const keys = ['ready','generationId','format','width','height','pixels'];
    if (Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value,key)) || value.generationId !== generationId ||
        value.format !== 'bgr24' || !Number.isInteger(value.width) || !Number.isInteger(value.height) ||
        value.width < 1 || value.width > 160 || value.height < 1 || value.height > 90 ||
        typeof value.pixels !== 'string' || value.pixels.length > 57600) return null;
    const bytes = Buffer.from(value.pixels, 'base64');
    if (bytes.length !== value.width * value.height * 3 || bytes.toString('base64') !== value.pixels) return null;
    const pixels = Buffer.alloc(value.width * value.height * 4);
    for (let source = 0, target = 0; source < bytes.length; source += 3, target += 4) {
        pixels[target]=bytes[source]; pixels[target+1]=bytes[source+1]; pixels[target+2]=bytes[source+2]; pixels[target+3]=255;
    }
    return {width:value.width, height:value.height, pixels};
}
module.exports = {validOwner, sameOwner, decode};
