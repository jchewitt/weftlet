// Public grammar control: never reads code, calls a model or proposes a symbol mapping.
export function createSemanticExtractor() {
  return { identity: 'public-mapping-grammar:1', async extract(source) {
    const assertions = [];
    for (const [index, line] of source.content.split('\n').entries()) {
      const rule = /^Rule ([\w-]+) belongs to workflow ([\w-]+)\.$/.exec(line);
      const file = /^Rule ([\w-]+) is implemented by ([^ ]+)\.$/.exec(line);
      if (!rule && !file) continue;
      assertions.push({ subject: { id: 'invariant:' + (rule ?? file)[1], kind: 'Invariant', label: (rule ?? file)[1] },
        predicate: rule ? 'references' : 'implementedBy',
        object: rule ? { id: 'workflow:' + rule[2], kind: 'Workflow', label: rule[2] }
          : { id: 'component:file:' + file[2], kind: 'Component', label: file[2] },
        citation: { startLine: index + 1, endLine: index + 1 }, confidence: 1 });
    }
    const parsed = { assertions, diagnostics: [], oml: '' };
    return { parsed, rawModelOutput: JSON.stringify(parsed) };
  } };
}
