import type { GraphFact, SourceSpan } from '@weftlet/core';

/** Navigation uses the exact proof citations in the graph assertion. */
export function evidenceSources(fact: GraphFact): readonly { role: string; provenance: SourceSpan }[] {
  if (fact.codeBinding) return [
    ...fact.codeBinding.documentCitations.map(provenance => ({ role: 'document', provenance })),
    ...fact.codeBinding.selectedOccurrences.map(proof => ({ role: 'selected occurrence', provenance: proof.provenance })),
    ...fact.codeBinding.definitions.map(proof => ({ role: 'definition', provenance: proof.provenance })),
    ...fact.codeBinding.subjectEvidence.map(proof => ({ role: 'subject evidence', provenance: proof.provenance })),
  ];
  if (fact.codeCall) return [
    ...fact.codeCall.callerDefinitions.map(proof => ({ role: 'caller definition', provenance: proof.provenance })),
    ...fact.codeCall.targetOccurrences.map(proof => ({ role: 'callee reference', provenance: proof.provenance })),
    ...fact.codeCall.targetDefinitions.map(proof => ({ role: 'target definition', provenance: proof.provenance })),
  ];
  return [];
}
