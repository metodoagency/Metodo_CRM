import { describe, it, expect } from 'vitest';
import { jsxStrings } from '../scripts/i18n-check.js';
import { checkRuleFile } from '../scripts/compliance-check.js';
describe('quality gate checkers', () => {
  it('fails on JSX text, visible attributes and conditional string literals', () => {
    expect(jsxStrings('<><p>hardcoded</p><input placeholder="literal" /><p>{ok ? "yes" : "no"}</p></>')).toHaveLength(4);
    expect(jsxStrings('<><p>{t("name")}</p><input placeholder={t("name")} /></>')).toEqual([]);
  });
  it('accepts unreviewed owner-authored prompts but rejects conclusions or missing metadata', () => {
    const value = { status: 'NOT REVIEWED', entries: [{ id: 'example', text: { tr: 'Kapsamı kontrol edin', en: 'Check the scope' }, appliesWhen: 'always', tag: 'owner-authored', version: '1', reviewedAt: 'NOT REVIEWED' }] };
    expect(checkRuleFile(value).status).toBe('NOT REVIEWED');
    expect(() => checkRuleFile({ ...value, entries: [{ ...value.entries[0], version: '' }] })).toThrow();
    expect(() => checkRuleFile({ ...value, entries: [{ ...value.entries[0], text: { tr: 'Bu hukuka uygundur', en: 'This is legal' } }] })).toThrow();
  });
});
