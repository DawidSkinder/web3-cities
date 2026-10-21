import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

export function loadTypescript(filename, globals = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const source = fs.readFileSync(file, 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    });
    const module = { exports: {} };
    cache.set(file, module);
    const context = vm.createContext({ console, Date, DOMException, ...globals });
    const wrapper = vm.runInContext(`(function(exports, require, module) { ${outputText}\n})`, context, { filename: file });
    wrapper(module.exports, (specifier) => load(path.resolve(path.dirname(file), `${specifier}.ts`)), module);
    return module.exports;
  }
  return load(filename);
}
