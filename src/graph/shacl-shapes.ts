import { Parser } from 'n3';

export const CG = 'https://context-graph.dev/record#';
export const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
export const XSD = 'http://www.w3.org/2001/XMLSchema#';

/** Graph-independent evidence constraints, evaluated over the union of all assertion graphs. */
export const evidenceShapes = new Parser().parse(`
@prefix cg: <${CG}>.
@prefix rdf: <${RDF}>.
@prefix sh: <http://www.w3.org/ns/shacl#>.
@prefix xsd: <${XSD}>.
cg:FactShape a sh:NodeShape; sh:targetClass rdf:Statement;
 sh:property [ sh:path cg:record; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string ];
 sh:property [ sh:path rdf:subject; sh:minCount 1; sh:maxCount 1; sh:nodeKind sh:IRI ];
 sh:property [ sh:path rdf:predicate; sh:minCount 1; sh:maxCount 1; sh:nodeKind sh:IRI ];
 sh:property [ sh:path rdf:object; sh:minCount 1; sh:maxCount 1; sh:nodeKind sh:IRI ];
 sh:property [ sh:path cg:authority; sh:minCount 1; sh:maxCount 1;
   sh:in ("declared" "implemented" "validated" "observed" "inferred" "draft") ];
 sh:property [ sh:path cg:path; sh:minCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:commit; sh:minCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:sourceDigest; sh:minCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:startLine; sh:minCount 1; sh:datatype xsd:integer; sh:minInclusive 1 ];
 sh:property [ sh:path cg:endLine; sh:minCount 1; sh:datatype xsd:integer; sh:minInclusive 1 ];
 sh:property [ sh:path cg:confidence; sh:minCount 1; sh:datatype xsd:decimal; sh:minInclusive 0; sh:maxInclusive 1 ];
 sh:property [ sh:path cg:extractor; sh:minCount 1; sh:datatype xsd:string; sh:minLength 1 ].
cg:NodeShape a sh:NodeShape; sh:targetClass cg:Node;
 sh:property [ sh:path cg:kind; sh:minCount 1; sh:maxCount 1 ].
`);
