/** Shapes target only obligation records, keeping ordinary-fact validation cost unchanged. */
export const obligationShapes = `
cg:ContractObligationShape a sh:NodeShape; sh:targetClass cg:ContractObligation;
 sh:property [ sh:path cg:obligationVersion; sh:minCount 1; sh:maxCount 1; sh:hasValue 1 ];
 sh:property [ sh:path cg:obligationMethod; sh:minCount 1; sh:maxCount 1; sh:hasValue "explicit-markdown" ];
 sh:property [ sh:path cg:obligationRole; sh:minCount 1; sh:maxCount 1; sh:in ("guarantee" "requirement") ];
 sh:property [ sh:path cg:obligationId; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:obligationStatement; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:obligationRepository; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:obligationScope; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:obligationContract; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:obligationTransport; sh:minCount 1; sh:maxCount 1; sh:in ("queue" "stored-data") ];
 sh:property [ sh:path cg:obligationContractVersion; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:obligationDomain; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:obligationStage; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:obligationRevalidation; sh:maxCount 1; sh:in ("required" "not-required") ];
 sh:property [ sh:path cg:obligationEndpoint; sh:minCount 1; sh:maxCount 1; sh:class cg:ObligationEndpoint ];
 sh:property [ sh:path cg:authority; sh:in ("inferred" "draft") ];
 sh:property [ sh:path cg:extractionReview; sh:minCount 1; sh:hasValue "deterministic" ];
 sh:property [ sh:path rdf:predicate; sh:in (cg:emits cg:consumes) ].
cg:ObligationEndpointShape a sh:NodeShape; sh:targetClass cg:ObligationEndpoint;
 sh:property [ sh:path cg:path; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:digest; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:commitSha; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:startLine; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:integer; sh:minInclusive 1 ];
 sh:property [ sh:path cg:endLine; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:integer; sh:minInclusive 1 ].
cg:ObligationConstraintShape a sh:NodeShape; sh:targetSubjectsOf cg:obligationMetric, cg:obligationOperator, cg:obligationValue, cg:obligationUnit;
 sh:property [ sh:path cg:obligationMetric; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:obligationOperator; sh:minCount 1; sh:maxCount 1; sh:in ("at-most" "at-least" "equal") ];
 sh:property [ sh:path cg:obligationValue; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:double ];
 sh:property [ sh:path cg:obligationUnit; sh:maxCount 1; sh:datatype xsd:string; sh:minLength 1 ].
`;
