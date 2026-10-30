/** Included in the shared named-dataset/union shape set. */
export const callShapes = `
cg:CodeCallShape a sh:NodeShape; sh:targetClass cg:CodeCall;
 sh:property [ sh:path rdf:predicate; sh:hasValue cg:calls ];
 sh:property [ sh:path rdf:object; sh:class cg:CodeSymbol ];
 sh:property [ sh:path cg:callVersion; sh:minCount 1; sh:maxCount 1; sh:hasValue 1 ];
 sh:property [ sh:path cg:callMethod; sh:minCount 1; sh:maxCount 1; sh:hasValue "typescript-ast+scip" ];
 sh:property [ sh:path cg:callSyntax; sh:minCount 1; sh:maxCount 1; sh:in ("call" "construct") ];
 sh:property [ sh:path cg:callDispatch; sh:minCount 1; sh:maxCount 1; sh:in ("lexical" "member" "construct") ];
 sh:property [ sh:path cg:callOptional; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:boolean ];
 sh:property [ sh:path cg:callCaller; sh:minCount 1; sh:maxCount 1; sh:in ("indexed-callable" "file-scope") ];
 sh:property [ sh:path cg:callTarget; sh:minCount 1; sh:maxCount 1; sh:in ("indexed-body" "indexed-class" "declaration-only" "external") ];
 sh:property [ sh:path cg:callRuntime; sh:minCount 1; sh:maxCount 1; sh:hasValue "not-observed" ];
 sh:property [ sh:path cg:columnEncoding; sh:minCount 1; sh:hasValue "utf-16" ];
 sh:property [ sh:path cg:authority; sh:in ("implemented" "draft") ];
 sh:property [ sh:path cg:extractionReview; sh:minCount 1; sh:hasValue "deterministic" ];
 sh:property [ sh:path cg:callOccurrence; sh:minCount 1; sh:class cg:CallProof ];
 sh:property [ sh:path cg:callCallerDefinition; sh:class cg:CallProof ];
 sh:property [ sh:path cg:callTargetDefinition; sh:class cg:CallProof ].
cg:CallProofShape a sh:NodeShape; sh:targetClass cg:CallProof;
 sh:property [ sh:path cg:callFact; sh:minCount 1; sh:maxCount 1; sh:class rdf:Statement ];
 sh:property [ sh:path cg:path; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:digest; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:commitSha; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:startLine; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:integer; sh:minInclusive 1 ];
 sh:property [ sh:path cg:endLine; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:integer; sh:minInclusive 1 ];
 sh:property [ sh:path cg:columnEncoding; sh:minCount 1; sh:hasValue "utf-16" ].
`;
