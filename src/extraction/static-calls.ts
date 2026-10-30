import ts from 'typescript';
import { repositoryFileNode, type BindingEvidence, type CodeCall, type ExtractionContext,
  type GraphDiagnostic, type GraphFact, type GraphNode } from '@weftlet/core';
import { sha256, stableJson } from '../infrastructure/util.js';
import { calleeToken, callableName, factsAt, isAmbient, isCallable, parseCallSource, syntaxSpan, type ParsedCallSource } from './call-syntax.js';

export const staticCallIdentity = { id: 'typescript-call-extractor', version: '1.0.0' } as const;
type TargetKind = 'body' | 'declaration' | 'class';
type Caller = { node: GraphNode; definitions: readonly GraphFact[]; unresolved?: boolean };
const proof = (fact: GraphFact): BindingEvidence => ({ factId: fact.id, provenance: fact.provenance });
function targetResolution(syntax: CodeCall['syntax'], defs: readonly GraphFact[], kinds: ReadonlySet<TargetKind> | undefined): CodeCall['target'] | undefined {
  if (!defs.length) return 'external';
  if (syntax === 'construct' && kinds?.has('class')) return 'indexed-class';
  if (kinds?.has('body')) return 'indexed-body';
  if (kinds?.has('declaration')) return 'declaration-only';
  return undefined;
}

/** Parse only the exact committed documents already indexed by SCIP. No second resolver or name guessing. */
export function extractStaticCalls(sources: ReadonlyMap<string, string>, codeFacts: readonly GraphFact[], context: ExtractionContext) {
  const parsed: ParsedCallSource[] = [], kinds = new Map<string, Set<TargetKind>>();
  const definitions = new Map<string, GraphFact[]>(), local = new Map<string, GraphFact[]>();
  for (const fact of codeFacts.filter(f => f.codeOccurrence)) {
    const group = local.get(fact.provenance.path) ?? []; group.push(fact); local.set(fact.provenance.path, group);
    if (fact.codeOccurrence!.role === 'definition') {
      const defs = definitions.get(fact.subject.id) ?? []; defs.push(fact); definitions.set(fact.subject.id, defs);
    }
  }
  for (const [path, text] of sources) {
    const digest = sha256(text), facts = local.get(path) ?? [];
    if (facts.some(f => f.provenance.commitSha !== context.commitSha || f.provenance.digest !== digest)) {
      throw new Error('Call analysis requires matching committed SCIP source bytes');
    }
    const file = parseCallSource(path, text, digest, facts); parsed.push(file);
    if (file.parseErrors.length) continue;
    const classify = (node: ts.Node) => {
      const name = isCallable(node) ? callableName(node) : ts.isClassDeclaration(node) || ts.isClassExpression(node) ? node.name :
        ts.isMethodSignature(node) ? node.name : undefined;
      const kind: TargetKind | undefined = isCallable(node) ? node.body && !isAmbient(node) ? 'body' : 'declaration' :
        ts.isClassDeclaration(node) || ts.isClassExpression(node) ? isAmbient(node) ? 'declaration' : 'class' : ts.isMethodSignature(node) ? 'declaration' : undefined;
      if (kind) for (const fact of factsAt(name, file, context.commitSha, 'definition')) {
        const values = kinds.get(fact.subject.id) ?? new Set(); values.add(kind); kinds.set(fact.subject.id, values);
      }
      ts.forEachChild(node, classify);
    };
    classify(file.source);
  }
  const facts: GraphFact[] = [], diagnostics: GraphDiagnostic[] = [];
  for (const file of parsed) {
    const physical = repositoryFileNode(file.source.fileName);
    const gap = (node: ts.Node, caller: Caller, reason: string, targets: readonly GraphNode[] = []) => {
      const record = { kind: 'implementationGaps' as const, reason: `Static call: ${reason}`,
        provenance: [syntaxSpan(node, file.source, file.digest, context.commitSha)],
        relatedNodeIds: [...new Set([physical.id, caller.node.id, ...targets.map(n => n.id)])].sort(), evidenceScope: 'source' as const };
      diagnostics.push({ ...record, id: sha256(stableJson({ ...record, extractor: staticCallIdentity })) });
    };
    if (file.parseErrors.length) {
      gap(file.source, { node: physical, definitions: [] }, 'TypeScript syntax errors prevent call analysis in this indexed document.'); continue;
    }
    const emit = (node: ts.CallExpression | ts.NewExpression, caller: Caller) => {
      const token = calleeToken(node.expression), selected = factsAt(token, file, context.commitSha, 'reference');
      const targets = [...new Map(selected.map(f => [f.object.id, f.object])).values()];
      if (caller.unresolved) { gap(node, caller, 'Enclosing anonymous callable or initializer has no exact indexed callable identity.', targets); return; }
      if (targets.length !== 1) { gap(node, caller, 'Callee expression has no single exact indexed target; dynamic dispatch is unresolved.', targets); return; }
      const target = targets[0]!, defs = definitions.get(target.id) ?? [], targetKinds = kinds.get(target.id);
      const syntax = ts.isNewExpression(node) ? 'construct' : 'call';
      const resolution = targetResolution(syntax, defs, targetKinds);
      if (!resolution) { gap(node, caller, 'Indexed value is not a known callable body or declaration; value flow, callbacks and dispatch are unresolved.', [target]); return; }
      const call: CodeCall = { schemaVersion: 1, method: 'typescript-ast+scip', syntax,
        dispatch: syntax === 'construct' ? 'construct' : token && (ts.isPropertyAccessExpression(token.parent) || ts.isElementAccessExpression(token.parent)) ? 'member' : 'lexical',
        optional: Boolean(node.flags & ts.NodeFlags.OptionalChain), caller: caller.definitions.length ? 'indexed-callable' : 'file-scope',
        target: resolution, runtime: 'not-observed', callerDefinitions: caller.definitions.map(proof),
        targetOccurrences: selected.map(proof), targetDefinitions: defs.map(proof) };
      const fact = { subject: caller.node, predicate: 'calls' as const, object: target,
        provenance: syntaxSpan(node, file.source, file.digest, context.commitSha), codeCall: call,
        extractor: staticCallIdentity, authority: 'implemented' as const, extractionReview: 'deterministic' as const, confidence: 1 };
      facts.push({ ...fact, id: sha256(stableJson(fact)), snapshotId: context.snapshotId });
      if (resolution === 'external' || resolution === 'declaration-only') gap(node, caller,
        'The selected declaration has no indexed callable body; runtime implementation remains unknown.', [target]);
    };
    const walk = (node: ts.Node, caller: Caller) => {
      // Ambient declarations describe types; decorators/default syntax there is not executed.
      if (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.DeclareKeyword)) return;
      if (isCallable(node)) {
        const defs = factsAt(callableName(node), file, context.commitSha, 'definition');
        const ids = new Set(defs.map(f => f.subject.id));
        const inner: Caller = ids.size === 1 ? { node: defs[0]!.subject, definitions: defs }
          : { node: caller.node, definitions: [], unresolved: true };
        // Decorators/computed names execute in the outer context, not in the function body.
        ts.forEachChild(node, child => {
          if (ts.isParameter(child)) ts.forEachChild(child, part => walk(part, part === child.initializer ? inner : caller));
          else walk(child, child === node.body ? inner : caller);
        });
        return;
      }
      if (ts.isPropertyDeclaration(node) && node.initializer) {
        ts.forEachChild(node, child => walk(child, child === node.initializer ? { node: caller.node, definitions: [], unresolved: true } : caller)); return;
      }
      if (ts.isClassStaticBlockDeclaration(node)) {
        ts.forEachChild(node, child => walk(child, { node: caller.node, definitions: [], unresolved: true })); return;
      }
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) emit(node, caller);
      ts.forEachChild(node, child => walk(child, caller));
    };
    if (!file.source.isDeclarationFile) walk(file.source, { node: physical, definitions: [] });
  }
  return { facts: facts.sort((a, b) => a.id.localeCompare(b.id)), diagnostics: diagnostics.sort((a, b) => a.id.localeCompare(b.id)) };
}
