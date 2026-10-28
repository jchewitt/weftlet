// Public, deterministic test grammar. This is not a model or a business-rule checker.
export function createSemanticExtractor() {
  return {
    identity: 'public-business-context-parser:1',
    async extract(source) {
      const assertions = [];
      for (const [index, line] of source.content.split('\n').entries()) {
        const implementation = /^The (\w+) workflow is implemented by (\S+)\.$/.exec(line);
        const handoff = /^The (\w+) workflow routes through the (\w+) workflow using stored readings\.$/.exec(line);
        const rule = /^The (\w+) workflow is governed by (.+)\.$/.exec(line);
        const workflow = implementation?.[1] ?? handoff?.[1] ?? rule?.[1];
        if (!workflow) continue;
        assertions.push({
          subject: { id: `workflow:${workflow}`, kind: 'Workflow', label: workflow },
          predicate: implementation ? 'implementedBy' : handoff ? 'routesThrough' : 'governedBy',
          object: implementation
            ? { id: `component:file:${implementation[2]}`, kind: 'Component', label: implementation[2] }
            : handoff ? { id: `workflow:${handoff[2]}`, kind: 'Workflow', label: handoff[2] }
              : { id: `invariant:${workflow}:freshness`, kind: 'Invariant', label: rule[2] },
          citation: { startLine: index + 1, endLine: index + 1 }, confidence: 1,
        });
      }
      return { parsed: { assertions, diagnostics: [], oml: '' }, rawModelOutput: JSON.stringify({ assertions }) };
    },
  };
}
