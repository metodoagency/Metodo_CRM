import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { run } from './process.js';
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : /\.(ts|tsx|json|ya?ml)$/.test(e.name) ? [join(dir, e.name)] : []);
const errors: string[] = [];
for (const file of ['server', 'src', 'shared', 'scripts', 'prisma', 'config'].flatMap(files)) {
  const source = readFileSync(file, 'utf8');
  const normalizedPath = file.replaceAll('\\', '/');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36}/.test(source)) errors.push(`${file}: credential pattern`);
  if (normalizedPath.startsWith('server/') && normalizedPath !== 'server/owner-digest.ts' && /\.sendMail\s*\(|\.sendSms\s*\(|api\.whatsapp\.com/.test(source)) errors.push(`${file}: outbound communication outside owner digest`);
}
if (errors.length) throw new Error(errors.join('\n'));
console.log('Source secrets/outbound scan passed');
run('npm', ['audit', '--omit=dev', '--audit-level=high']);
run('npm', ['test', '--', '-t', 'security baseline|sensitive paths|rate-limit boundaries']);
console.log('Security gate passed (blocks high/critical dependency advisories; see audit output for lower severities)');
