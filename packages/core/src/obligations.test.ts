import { describe, expect, it } from 'vitest';
import { obligationContractNode, parseObligationDeclaration } from './obligations.js';

const declaration = { schemaVersion: 1, id: 'age', role: 'requirement', endpoint: 'src/consume.ts',
  contract: { scope: 'public', id: 'readings', kind: 'queue' }, statement: 'Check freshness at execution.' };
describe('public obligation declaration contract', () => {
  it('keeps missing fields absent and uses exact repository/scope/transport/version identities', () => {
    expect(parseObligationDeclaration(declaration)).toEqual(declaration);
    const contract = parseObligationDeclaration(declaration).contract;
    const identities = [obligationContractNode('repo', contract), obligationContractNode('other', contract),
      obligationContractNode('repo', { ...contract, scope: 'billing' }),
      obligationContractNode('repo', { ...contract, kind: 'stored-data' }),
      obligationContractNode('repo', { ...contract, version: '1' })];
    expect(new Set(identities.map(node => node.id)).size).toBe(5);
    expect(parseObligationDeclaration({ ...declaration, constraint: { metric: 'age', operator: 'at-most', value: 60 } }).constraint).toEqual({ metric: 'age', operator: 'at-most', value: 60 });
  });
  it.each([
    { endpoint: '../outside.ts' }, { endpoint: '/root.ts' }, { endpoint: 'C:\\source.ts' }, { endpoint: 'src//a.ts' },
    { schemaVersion: 2 }, { domain: null }, { role: 'guarantee', revalidation: 'required' }, { approved: true },
    { contract: { ...declaration.contract, version: '' } }, { statement: 'text\nmore' },
    { constraint: { metric: 'age', operator: 'at-most', value: Infinity } },
    { constraint: { metric: 'age', operator: 'at-most', value: '60' } },
    { constraint: { metric: 'age', operator: 'approximately', value: 60 } },
  ])('rejects ambiguous or unsupported data: %j', change => {
    expect(() => parseObligationDeclaration({ ...declaration, ...change })).toThrow();
  });
});
