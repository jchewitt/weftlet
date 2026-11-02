import { DataFactory, Store, type Quad } from 'n3';
import SHACLValidator from 'rdf-validate-shacl';
import { RDF, evidenceShapes } from './shacl-shapes.js';
import type { RdfPartitions } from './rdf-partitions.js';

const SH = 'http://www.w3.org/ns/shacl#', { namedNode: iri } = DataFactory;
const targets = new Set([SH + 'targetClass', SH + 'targetSubjectsOf']);
// All admitted constraints inspect the focus subject's outgoing triples. sh:class
// additionally reads rdf:type on referenced objects, supplied from the entire graph.
const allowed = new Set(['targetClass', 'targetSubjectsOf', 'property', 'path', 'minCount', 'maxCount',
  'datatype', 'minLength', 'minInclusive', 'maxInclusive', 'hasValue', 'in', 'or', 'nodeKind', 'class']);

export function assertPartitionLocalShapes(shapes: readonly Quad[]): void {
  for (const quad of shapes) {
    if (quad.predicate.value.startsWith(SH) && !allowed.has(quad.predicate.value.slice(SH.length))) {
      throw Error(`SHACL partition locality must be reviewed for ${quad.predicate.value}`);
    }
    if (quad.predicate.value === SH + 'path' && quad.object.termType !== 'NamedNode') {
      throw Error('SHACL partition locality requires direct predicate paths');
    }
    if (!quad.predicate.value.startsWith(SH) && ![RDF + 'type', RDF + 'first', RDF + 'rest'].includes(quad.predicate.value)) {
      throw Error(`Unsupported SHACL partition vocabulary: ${quad.predicate.value}`);
    }
  }
}

export interface ShaclIssue { category: 'extraction-gap'; focus?: string; path?: string; message: string }

/** Run the same strict validator/shapes on complete subjects with global class membership. */
export async function validatePartitions(partitions: RdfPartitions, types: ReadonlyMap<string, ReadonlySet<string>>,
  progress?: (completed: number) => void) {
  assertPartitionLocalShapes(evidenceShapes);
  const targetRules = evidenceShapes.filter(quad => targets.has(quad.predicate.value));
  const constraints = evidenceShapes.filter(quad => !targets.has(quad.predicate.value));
  const issues: ShaclIssue[] = [];
  let conforms = true, completed = 0;
  for (const batch of partitions.validation()) {
    // Select targets before adding support-only class triples; those objects are
    // validated with their complete outgoing records in their own partition.
    const shapes = new Store(constraints);
    for (const target of targetRules) {
      const selected = target.predicate.value === SH + 'targetClass'
        ? batch.getQuads(null, iri(RDF + 'type'), target.object, null)
        : batch.getQuads(null, target.object, null, null);
      for (const quad of selected) shapes.addQuad(target.subject, iri(SH + 'targetNode'), quad.subject);
    }
    const referenced = new Set<string>();
    for (const quad of batch) if (quad.object.termType === 'NamedNode') referenced.add(quad.object.value);
    for (const node of referenced) for (const type of types.get(node) ?? []) batch.addQuad(iri(node), iri(RDF + 'type'), iri(type));
    const report = await new SHACLValidator(shapes).validate(batch);
    conforms &&= report.conforms;
    for (const result of report.results) issues.push({ category: 'extraction-gap', focus: result.focusNode?.value,
      path: result.path?.value, message: result.message.map(message => message.value).join('; ') });
    progress?.(++completed);
    // Allow progress, cancellation observers and GC between bounded batches.
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  return { conforms, issues };
}
