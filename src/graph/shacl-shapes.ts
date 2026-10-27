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

# Optional source metadata targets only assertions that carry those predicates.
# Legacy facts do not acquire additional property or ownership consistency checks.
cg:SourceRoleShape a sh:NodeShape; sh:targetSubjectsOf cg:sourceRole;
 sh:property [ sh:path cg:sourceRole; sh:maxCount 1; sh:datatype xsd:string;
   sh:in ("intent" "plan" "validation" "reference" "unclassified") ].
cg:SourcePolicyShape a sh:NodeShape; sh:targetSubjectsOf cg:sourcePolicyDigest;
 sh:property [ sh:path cg:sourcePolicyDigest; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ].
cg:SourceOwnershipShape a sh:NodeShape;
 sh:targetSubjectsOf cg:ownershipStatus, cg:ownerDocument, cg:ownershipMapping;
 sh:property [ sh:path cg:ownershipStatus; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string;
   sh:in ("resolved" "missing" "ambiguous" "unavailable" "unapproved" "ineligible" "not-required") ];
 sh:property [ sh:path cg:ownerDocument; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:ownershipMapping; sh:datatype xsd:string; sh:minLength 1 ];
 # Structural consistency does not prove approval, ownership correctness or source availability.
 sh:or (
   [ sh:property [ sh:path cg:ownershipStatus; sh:in ("resolved" "unavailable" "unapproved" "ineligible") ];
     sh:property [ sh:path cg:ownerDocument; sh:minCount 1; sh:maxCount 1 ];
     sh:property [ sh:path cg:ownershipMapping; sh:minCount 1 ] ]
   [ sh:property [ sh:path cg:ownershipStatus; sh:hasValue "ambiguous" ];
     sh:property [ sh:path cg:ownerDocument; sh:minCount 2 ];
     sh:property [ sh:path cg:ownershipMapping; sh:minCount 1 ] ]
   [ sh:property [ sh:path cg:ownershipStatus; sh:in ("missing" "not-required") ];
     sh:property [ sh:path cg:ownerDocument; sh:maxCount 0 ];
     sh:property [ sh:path cg:ownershipMapping; sh:maxCount 0 ] ]
 ).
`);
