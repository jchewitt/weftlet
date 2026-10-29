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

cg:ColumnsShape a sh:NodeShape;
 sh:targetSubjectsOf cg:startColumn, cg:endColumn, cg:columnEncoding;
 sh:property [ sh:path cg:startColumn; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:integer; sh:minInclusive 1 ];
 sh:property [ sh:path cg:endColumn; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:integer; sh:minInclusive 1 ];
 sh:property [ sh:path cg:columnEncoding; sh:minCount 1; sh:maxCount 1; sh:in ("utf-16") ].
cg:CodeRangeShape a sh:NodeShape; sh:targetClass cg:CodeRange;
 sh:property [ sh:path cg:startLine; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:integer; sh:minInclusive 1 ];
 sh:property [ sh:path cg:endLine; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:integer; sh:minInclusive 1 ];
 sh:property [ sh:path cg:columnEncoding; sh:minCount 1; sh:hasValue "utf-16" ].
cg:CodeOccurrenceShape a sh:NodeShape; sh:targetClass cg:CodeOccurrence; sh:targetSubjectsOf cg:codeRole;
 sh:property [ sh:path cg:codeVersion; sh:minCount 1; sh:maxCount 1; sh:hasValue 1 ];
 sh:property [ sh:path cg:codeRole; sh:minCount 1; sh:maxCount 1; sh:in ("definition" "reference") ];
 sh:property [ sh:path cg:codeLocationKind; sh:minCount 1; sh:maxCount 1; sh:in ("name" "zero-width-anchor") ];
 sh:property [ sh:path cg:codeNativeRoles; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:integer; sh:minInclusive 0 ];
 sh:property [ sh:path cg:columnEncoding; sh:minCount 1; sh:hasValue "utf-16" ];
 sh:property [ sh:path cg:codeEnclosure; sh:minCount 1; sh:maxCount 1; sh:in ("native-range" "file" "ambiguous") ];
 sh:property [ sh:path cg:enclosingSymbol; sh:maxCount 1; sh:class cg:CodeSymbol ];
 sh:property [ sh:path cg:declarationRange; sh:maxCount 1; sh:class cg:CodeRange ];
 sh:or (
   [ sh:property [ sh:path cg:codeEnclosure; sh:hasValue "native-range" ]; sh:property [ sh:path cg:enclosingSymbol; sh:minCount 1 ] ]
   [ sh:property [ sh:path cg:codeEnclosure; sh:in ("file" "ambiguous") ]; sh:property [ sh:path cg:enclosingSymbol; sh:maxCount 0 ] ]
 );
 sh:or (
   [ sh:property [ sh:path cg:codeRole; sh:hasValue "definition" ]; sh:property [ sh:path rdf:subject; sh:class cg:CodeSymbol ]; sh:property [ sh:path rdf:predicate; sh:hasValue cg:definedBy ] ]
   [ sh:property [ sh:path cg:codeRole; sh:hasValue "reference" ]; sh:property [ sh:path rdf:object; sh:class cg:CodeSymbol ]; sh:property [ sh:path rdf:predicate; sh:hasValue cg:references ] ]
 ).
cg:CodeSymbolShape a sh:NodeShape; sh:targetClass cg:CodeSymbol;
 sh:property [ sh:path cg:kind; sh:hasValue "CodeSymbol" ];
 sh:property [ sh:path cg:codeVersion; sh:minCount 1; sh:maxCount 1; sh:hasValue 1 ];
 sh:property [ sh:path cg:codeProvider; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:codeRepository; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:nativeSymbol; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:codeResolution; sh:minCount 1; sh:maxCount 1; sh:in ("indexed-definition" "declaration-only" "no-indexed-definition") ];
 sh:property [ sh:path cg:codeIdentityScope; sh:minCount 1; sh:maxCount 1; sh:in ("repository" "index-document") ];
 sh:or (
   [ sh:property [ sh:path cg:codeIdentityScope; sh:hasValue "repository" ]; sh:property [ sh:path cg:codeDocument; sh:maxCount 0 ]; sh:property [ sh:path cg:codeIndex; sh:maxCount 0 ] ]
   [ sh:property [ sh:path cg:codeIdentityScope; sh:hasValue "index-document" ];
     sh:property [ sh:path cg:codeDocument; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
     sh:property [ sh:path cg:codeIndex; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ] ]
 ).

cg:DocumentCodeBindingShape a sh:NodeShape; sh:targetClass cg:DocumentCodeBinding;
 sh:property [ sh:path cg:bindingVersion; sh:minCount 1; sh:maxCount 1; sh:hasValue 1 ];
 sh:property [ sh:path cg:bindingMethod; sh:minCount 1; sh:maxCount 1; sh:hasValue "explicit-markdown" ];
 sh:property [ sh:path <${CG}bindingSelector/path>; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path <${CG}bindingSelector/symbol>; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:bindingDocument; sh:minCount 1; sh:class cg:BindingCitation ];
 sh:property [ sh:path cg:bindingSelection; sh:minCount 1; sh:class cg:BindingCitation ];
 sh:property [ sh:path cg:bindingDefinition; sh:minCount 1; sh:class cg:BindingCitation ];
 sh:property [ sh:path cg:bindingSubject; sh:class cg:BindingCitation ];
 sh:property [ sh:path rdf:object; sh:class cg:CodeSymbol ];
 sh:property [ sh:path rdf:predicate; sh:in (cg:references cg:implementedBy cg:verifiedBy) ];
 sh:property [ sh:path cg:authority; sh:in ("inferred" "draft") ];
 sh:property [ sh:path cg:extractionReview; sh:minCount 1; sh:in ("deterministic" "unreviewed") ].
cg:BindingCitationShape a sh:NodeShape; sh:targetClass cg:BindingCitation;
 sh:property [ sh:path cg:path; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:digest; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:commitSha; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:startLine; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:integer; sh:minInclusive 1 ];
 sh:property [ sh:path cg:endLine; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:integer; sh:minInclusive 1 ];
 sh:property [ sh:path cg:bindingFact; sh:maxCount 1; sh:class rdf:Statement ].
cg:BindingSelectorPositionShape a sh:NodeShape;
 sh:targetSubjectsOf <${CG}bindingSelector/line>, <${CG}bindingSelector/column>;
 sh:property [ sh:path <${CG}bindingSelector/line>; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:integer; sh:minInclusive 1 ];
 sh:property [ sh:path <${CG}bindingSelector/column>; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:integer; sh:minInclusive 1 ].

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
