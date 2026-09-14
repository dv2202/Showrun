import type { ShowcaseDependency } from '../domain/types.js';

function jsonType(value: unknown): 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array' {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'object';
}

function escapedPointerSegment(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

export function inspectJsonResponseFields(
  body: Buffer,
  contentType: string,
): ShowcaseDependency['responseFields'] | undefined {
  if (!/json/i.test(contentType) || body.length > 524_288) return undefined;
  try {
    const parsed: unknown = JSON.parse(body.toString('utf8'));
    const fields: NonNullable<ShowcaseDependency['responseFields']> = [];
    const visit = (value: unknown, path: string, depth: number) => {
      if (fields.length >= 100 || depth > 6) return;
      if (path) {
        const key = path.split('/').at(-1)?.toLowerCase() ?? '';
        const sensitivity = /password|passcode|secret|token|authorization|cookie|private.?key|credential/.test(key)
          ? 'sensitive'
          : /email|phone|address|name|account|billing|dob|birth|ssn|pan|aadhaar/.test(key)
            ? 'possible'
            : 'none';
        fields.push({ path, type: jsonType(value), sensitivity });
      }
      if (Array.isArray(value)) {
        value.slice(0, 3).forEach((item, index) => visit(item, `${path}/${index}`, depth + 1));
      } else if (value && typeof value === 'object') {
        Object.entries(value).slice(0, 50).forEach(([key, item]) =>
          visit(item, `${path}/${escapedPointerSegment(key)}`, depth + 1));
      }
    };
    visit(parsed, '', 0);
    return fields;
  } catch {
    return undefined;
  }
}
