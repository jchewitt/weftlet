/** JSON.parse silently accepts duplicate keys, including differently escaped spellings. */
export function parseUniqueJson(content: string): unknown {
  const parsed: unknown = JSON.parse(content);
  const objects: (Set<string> | undefined)[] = [];
  for (const token of content.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]]/g)) {
    const value = token[0];
    if (value === '{' || value === '[') objects.push(value === '{' ? new Set() : undefined);
    else if (value === '}' || value === ']') objects.pop();
    else if (/^\s*:/.test(content.slice(token.index! + value.length))) {
      const keys = objects.at(-1)!;
      const key = JSON.parse(value) as string;
      if (keys.has(key)) throw new Error('Duplicate JSON key');
      keys.add(key);
    }
  }
  return parsed;
}
