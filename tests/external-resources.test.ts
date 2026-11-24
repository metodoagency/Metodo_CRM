import { describe, expect, it } from 'vitest';
import { resourceLinkParent } from '../shared/external-resources.js';

describe('external resource link recovery', () => {
  it('requires exactly one supported parent with a valid UUID', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(resourceLinkParent({ clubId: id, playerId: null })).toEqual({ type: 'Club', id });
    expect(resourceLinkParent({ contractId: id })).toEqual({ type: 'Contract', id });
    for (const row of [{}, { clubId: null }, { clubId: '' }, { clubId: 'invalid' }, { clubId: 12 }, { clubId: id, personId: id }, { clubId: id, personId: 'invalid' }, { unknownId: id }]) expect(resourceLinkParent(row)).toBeNull();
  });
});
