(function (factory) {
    if (typeof define === 'function' && define.amd) define([], factory);
    else if (typeof module === 'object' && module.exports) module.exports = factory();
}(function () {
    'use strict';

    function safeUrl(value) {
        if (typeof value !== 'string' || value.length > 2048 || !/^https?:\/\//i.test(value) ||
            /[\s\u0000-\u001f\u007f-\u009f\\]/.test(value) || /%(?![0-9a-f]{2})/i.test(value)) return null;
        try {
            var url = new URL(value);
            return ['http:', 'https:'].indexOf(url.protocol) !== -1 && url.hostname && !url.username && !url.password ? url.href : null;
        } catch (_) { return null; }
    }

    function bareEnd(text, start) {
        var end = start;
        var counts = {'(': 0, ')': 0, '[': 0, ']': 0, '{': 0, '}': 0};
        while (end < text.length && !/[\s<>"']/.test(text[end])) {
            if (Object.prototype.hasOwnProperty.call(counts, text[end])) counts[text[end]]++;
            end++;
        }
        while (end > start) {
            var last = text[end - 1];
            if (/[.,;!?。，；！？]/.test(last)) { end--; continue; }
            var open = {')': '(', ']': '[', '}': '{'}[last];
            if (open && counts[last] > counts[open]) { counts[last]--; end--; continue; }
            break;
        }
        return end;
    }

    // Deliberately only inline [label](URL) and bare HTTP(S) URLs. Every other
    // Markdown/HTML construct remains text, including image syntax. No fetching.
    function parse(value) {
        var text = typeof value === 'string' ? value.slice(0, 65536) : '';
        var parts = [], start = 0, index = 0, nextClose = text.indexOf(']');
        function link(end, label, url) {
            if (index > start) parts.push({text: text.slice(start, index)});
            parts.push({text: label, url: url});
            start = end;
        }
        while (index < text.length) {
            // Keep URLs inside literal HTML tags as text too. This never parses
            // or inserts HTML; it only excludes those spans from link matching.
            if (text[index] === '<' && /^<(?:\/?[a-z][a-z0-9-]*(?=[\s/>])|!)/i.test(text.slice(index))) {
                var tagEnd = text.indexOf('>', index + 1);
                if (tagEnd !== -1) { index = tagEnd + 1; continue; }
            }
            var image = text.slice(index, index + 2) === '![';
            if (image || text[index] === '[') {
                var labelStart = index + (image ? 2 : 1);
                if (nextClose !== -1 && nextClose < labelStart) nextClose = text.indexOf(']', labelStart);
                var close = nextClose;
                if (close !== -1 && close - labelStart <= 2048 && text[close + 1] === '(' && !/[\r\n]/.test(text.slice(labelStart, close))) {
                    var depth = 1, end = close + 2;
                    while (end < text.length && end <= close + 2050 && depth && !/[\r\n]/.test(text[end])) {
                        if (text[end] === '(') depth++;
                        if (text[end] === ')') depth--;
                        end++;
                    }
                    if (!depth) {
                        var destination = safeUrl(text.slice(close + 2, end - 1));
                        if (!image && close > labelStart && destination) link(end, text.slice(labelStart, close), destination);
                        index = end;
                        continue;
                    }
                }
            }
            if ((index === 0 || /[\s(<（【“"']/.test(text[index - 1])) && /^https?:\/\//i.test(text.slice(index, index + 8))) {
                var urlEnd = bareEnd(text, index), raw = text.slice(index, urlEnd), target = safeUrl(raw);
                if (target) link(urlEnd, raw.length <= 72 ? raw : new URL(target).host + '/…', target);
                index = Math.max(index + 1, urlEnd);
                continue;
            }
            index++;
        }
        if (start < text.length) parts.push({text: text.slice(start)});
        return parts;
    }

    function render(container, value) {
        var parts = parse(value);
        container.textContent = '';
        if (!parts.some(function (part) { return !!part.url; })) {
            container.textContent = parts.map(function (part) { return part.text; }).join('');
            return;
        }
        var document = container.ownerDocument;
        parts.forEach(function (part) {
            if (!part.url) { container.appendChild(document.createTextNode(part.text)); return; }
            var anchor = document.createElement('a');
            anchor.className = 'aboutNoteLink button-link';
            anchor.textContent = part.text;
            anchor.href = part.url;
            anchor.rel = 'noopener noreferrer';
            anchor.title = '用系统浏览器打开：' + part.url;
            anchor.setAttribute('aria-label', part.text + '，用系统浏览器打开 ' + part.url);
            container.appendChild(anchor);
        });
    }

    return {safeUrl: safeUrl, parse: parse, render: render};
}));
