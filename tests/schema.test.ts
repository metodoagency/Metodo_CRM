import { it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { readFileSync } from 'node:fs';
it('keeps audit/version columns and provenance on all business models', () => {
  for (const model of Prisma.dmmf.datamodel.models.filter(m => !['Owner', 'Session', 'OAuthAttempt'].includes(m.name))) {
    const fields = new Map(model.fields.map(f => [f.name, f]));
    for (const name of ['ownerId', 'createdAt', 'updatedAt', 'deletedAt', 'createdBy', 'updatedBy', 'version', 'isExample', 'fieldProvenance', 'sourceUrl', 'sourceType', 'retrievedAt', 'verificationStatus']) expect(fields.has(name), `${model.name}.${name}`).toBe(true);
  }
});
it('has no identity/banking identifiers and stores sensitive values as ciphertext-capable text', () => {
  const names = Prisma.dmmf.datamodel.models.flatMap(m => m.fields.map(f => f.name));
  expect(names.some(name => /nationalId|passportNumber|bankAccount|creditCard|tcKimlik/i.test(name))).toBe(false);
  for (const model of Prisma.dmmf.datamodel.models) for (const field of model.fields) {
    if (['birthDate', 'phone', 'email', 'healthNotes', 'injuryNotes', 'salaryAmount', 'bonuses', 'commissionTerms'].includes(field.name)) expect(field.type, `${model.name}.${field.name}`).toBe('String');
  }
});
it('commits complete, valid country boundaries', () => {
  const boundaries = JSON.parse(readFileSync('public/geo/ne_110m_admin_0_countries.geojson', 'utf8'));
  expect(boundaries.type).toBe('FeatureCollection'); expect(boundaries.features.length).toBeGreaterThan(170);
  expect(boundaries.features.every((f: { geometry: { type: string; coordinates: unknown[] } }) => ['Polygon', 'MultiPolygon'].includes(f.geometry.type) && f.geometry.coordinates.length > 0)).toBe(true);
});
