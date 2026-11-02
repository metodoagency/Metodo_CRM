import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tr, en } from '../shared/locales.js';
export function jsxStrings(source: string, filename = 'input.tsx'): string[] {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const errors: string[] = [];
  const visibleAttributes = new Set(['title', 'placeholder', 'aria-label', 'alt', 'label']);
  const hasWords = (text: string) => /\p{L}/u.test(text.trim());
  function visit(node: ts.Node) {
    if (ts.isJsxText(node) && hasWords(node.text)) errors.push(node.text.trim());
    if (ts.isJsxAttribute(node) && visibleAttributes.has(node.name.getText(file)) && node.initializer && ts.isStringLiteral(node.initializer) && hasWords(node.initializer.text)) errors.push(node.initializer.text);
    const visible = !node.parent || !ts.isJsxAttribute(node.parent) || visibleAttributes.has(node.parent.name.getText(file));
    if (visible && ts.isJsxExpression(node) && node.expression && ts.isStringLiteral(node.expression) && hasWords(node.expression.text)) errors.push(node.expression.text);
    if (visible && ts.isJsxExpression(node) && node.expression && ts.isConditionalExpression(node.expression)) {
      for (const branch of [node.expression.whenTrue, node.expression.whenFalse]) if (ts.isStringLiteral(branch) && hasWords(branch.text)) errors.push(branch.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(file); return errors;
}
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.tsx') ? [join(dir, e.name)] : []);
if (process.argv[1]?.endsWith('i18n-check.ts')) {
  const errors = files('src').flatMap(file => jsxStrings(readFileSync(file, 'utf8'), file).map(text => `${file}: ${text}`));
  if (JSON.stringify(Object.keys(tr).sort()) !== JSON.stringify(Object.keys(en).sort())) errors.push('Dictionary keys differ');
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log(`i18n: ${Object.keys(tr).length} keys in both languages; ${files('src').length} JSX files checked`);
}
