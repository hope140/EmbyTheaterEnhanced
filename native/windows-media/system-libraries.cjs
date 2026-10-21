'use strict';
const path = require('node:path');

function systemLibraries(koffi) {
    // kernel32 is a Windows KnownDLL. Resolve other DLLs from the OS directory,
    // never from the application or current working directory.
    const kernel = koffi.load('kernel32.dll');
    const getDirectory = kernel.func('uint32_t GetSystemDirectoryW(void *buffer, uint32_t size)');
    const buffer = Buffer.alloc(65536), length = getDirectory(buffer, 32768);
    if (!length || length >= 32768) throw new Error('Windows system directory unavailable');
    const directory = buffer.subarray(0, length * 2).toString('utf16le');
    const allowed = new Set(['combase.dll', 'dwmapi.dll', 'gdi32.dll', 'user32.dll', 'ntdll.dll']);
    return function load(name) {
        if (!allowed.has(name)) throw new Error('Unexpected native library');
        return koffi.load(path.join(directory, name));
    };
}

module.exports = {systemLibraries};
