// Small deterministic transformer for this package's default-import/default-export modules.
// It does not transform or read any ETE product source.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
fs.mkdirSync(path.join(root, 'amd'), { recursive: true });
for (const file of fs.readdirSync(path.join(root, 'src')).filter(file => file.endsWith('.js'))) {
    let source = fs.readFileSync(path.join(root, 'src', file), 'utf8').replaceAll('../LICENSE.md', './LICENSE.md');
    const deps = [], bindings = [];
    source = source.replace(/^import (\w+) from '([^']+)';$/gm, (_, binding, dep) => {
        deps.push(dep); bindings.push(binding); return '';
    });
    let expression;
    source = source.replace(/export default class (\w+)/, (_, name) => { expression = name; return `class ${name}`; });
    source = source.replace(/export default ([\s\S]*?);\s*$/, (_, value) => { expression = value; return ''; });
    if (!expression) throw new Error(`No default export in ${file}`);
    const args = bindings.map((_, index) => `dep${index}`);
    const declarations = bindings.map((binding, index) => `const ${binding} = dep${index} && dep${index}.__esModule ? dep${index}.default : dep${index};`).join('\n');
    // The same value supports legacy AMD consumers and transpiled .default consumers.
    // Nonenumerable markers avoid adding artificial public method-table entries.
    const wrapped = `define(${JSON.stringify(deps)}, function(${args.join(',')}) {\n'use strict';\n${declarations}\n${source}\nconst result = ${expression};\nObject.defineProperty(result, '__esModule', { value: true });\nObject.defineProperty(result, 'default', { value: result });\nreturn result;\n});\n`;
    fs.writeFileSync(path.join(root, 'amd', file), wrapped);
}
console.log('Built 6 canonical .js AMD modules from isolated sources.');
