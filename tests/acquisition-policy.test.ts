import { it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(dir, entry.name)] : []);
const clients = /^(node:)?https?$|^(axios|undici|got|node-fetch|cross-fetch|superagent|request|playwright|puppeteer)(\/|$)/;
export function networkCode(source: string) {
  const tree = ts.createSourceFile('module.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && clients.test(node.moduleSpecifier.text)) found = true;
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && ['fetch', 'XMLHttpRequest', 'WebSocket'].includes(node.expression.text)) found = true;
      if (ts.isPropertyAccessExpression(node.expression) && ['fetch', 'XMLHttpRequest', 'WebSocket'].includes(node.expression.name.text)) found = true;
      if ((node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require') && node.arguments.some(arg => ts.isStringLiteral(arg) && clients.test(arg.text))) found = true;
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && ['XMLHttpRequest', 'WebSocket'].includes(node.expression.text)) found = true;
    ts.forEachChild(node, visit);
  };
  visit(tree); return found;
}
it('enforces the no-commercial-scraping policy with a network-code allowlist', () => {
  // No acquisition adapter exists yet. New networking modules require a policy
  // review and explicit tests; commercial-site acquisition is never exempted.
  const permitted = new Set(['server/auth.ts', 'src/api.ts']);
  for (const file of ['server', 'shared', 'src'].flatMap(walk)) {
    const path = file.replaceAll('\\', '/'); const source = readFileSync(file, 'utf8');
    if (!networkCode(source)) continue;
    expect(permitted.has(path), `Unreviewed network code: ${path}`).toBe(true);
    expect(source, `Commercial acquisition marker in network module: ${path}`).not.toMatch(/transfermarkt/i);
  }
});
it('detects HTTP imports, dynamic clients and global fetch while allowing manual links', () => {
  for (const source of ['import http from "node:https"', 'import axios from "axios"', 'const c = await import("undici")', 'const c = require("node-fetch")', 'fetch(url)', 'globalThis.fetch(url)', 'new XMLHttpRequest()']) expect(networkCode(source), source).toBe(true);
  expect(networkCode('const href = "https://www.transfermarkt.com";')).toBe(false);
});
