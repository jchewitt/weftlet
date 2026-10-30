import ts from 'typescript';
import type { GraphFact, SourceSpan } from '@weftlet/core';

export type Callable = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration |
  ts.GetAccessorDeclaration | ts.SetAccessorDeclaration | ts.ConstructorDeclaration;
export const isCallable = (node: ts.Node): node is Callable => ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) ||
  ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node) || ts.isConstructorDeclaration(node);

export function callableName(node: Callable): ts.Node | undefined {
  if ('name' in node && node.name) return node.name;
  if (ts.isConstructorDeclaration(node)) return node.getFirstToken();
  const parent = node.parent;
  if ((ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertyAssignment(parent)) &&
      parent.initializer === node && (ts.isIdentifier(parent.name) || ts.isPrivateIdentifier(parent.name))) return parent.name;
  return undefined;
}

/** Ambient declarations may occur in .ts namespaces too; they supply no runtime body. */
export function isAmbient(node: ts.Node): boolean {
  if (node.getSourceFile().isDeclarationFile) return true;
  for (let current: ts.Node | undefined = node; current; current = current.parent) {
    if (ts.canHaveModifiers(current) && ts.getModifiers(current)?.some(modifier => modifier.kind === ts.SyntaxKind.DeclareKeyword)) return true;
  }
  return false;
}

export function syntaxSpan(node: ts.Node, source: ts.SourceFile, digest: string, commitSha: string): SourceSpan {
  const start = source.getLineAndCharacterOfPosition(node.getStart(source));
  const end = source.getLineAndCharacterOfPosition(node.getEnd());
  return { path: source.fileName, startLine: start.line + 1, startColumn: start.character + 1,
    endLine: end.line + 1, endColumn: end.character + 1, columnEncoding: 'utf-16', digest, commitSha };
}
export const positionKey = (span: SourceSpan) =>
  `${span.path}:${span.startLine}:${span.startColumn}:${span.endLine}:${span.endColumn}`;

export function calleeToken(expression: ts.Expression): ts.Node | undefined {
  while (ts.isParenthesizedExpression(expression) || ts.isNonNullExpression(expression) ||
    ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression) || ts.isSatisfiesExpression(expression)) expression = expression.expression;
  if (ts.isIdentifier(expression) || expression.kind === ts.SyntaxKind.SuperKeyword) return expression;
  if (ts.isPropertyAccessExpression(expression)) return expression.name;
  if (ts.isElementAccessExpression(expression) && ts.isStringLiteral(expression.argumentExpression)) return expression.argumentExpression;
  return undefined;
}

export interface ParsedCallSource {
  readonly source: ts.SourceFile;
  readonly digest: string;
  readonly byPosition: ReadonlyMap<string, readonly GraphFact[]>;
  readonly parseErrors: readonly ts.Diagnostic[];
}

export function parseCallSource(path: string, text: string, digest: string, facts: readonly GraphFact[]): ParsedCallSource {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const byPosition = new Map<string, GraphFact[]>();
  for (const fact of facts) {
    const key = positionKey(fact.provenance), group = byPosition.get(key) ?? [];
    group.push(fact); byPosition.set(key, group);
  }
  return { source, digest, byPosition,
    parseErrors: (source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics };
}

export function factsAt(node: ts.Node | undefined, parsed: ParsedCallSource, commitSha: string, role: 'definition' | 'reference') {
  if (!node) return [];
  return (parsed.byPosition.get(positionKey(syntaxSpan(node, parsed.source, parsed.digest, commitSha))) ?? [])
    .filter(fact => fact.codeOccurrence?.role === role);
}
