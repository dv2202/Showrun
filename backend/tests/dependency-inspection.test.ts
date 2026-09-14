import { describe, expect, it } from 'vitest';
import { inspectJsonResponseFields } from '../src/proxy/dependency-inspection.js';

describe('dependency response inspection', () => {
  it('describes JSON fields without storing values and flags likely sensitive data', () => {
    const body = Buffer.from(JSON.stringify({
      user: { email: 'private@example.com', displayName: 'Demo', plan: 'pro' },
      accessToken: 'actual-secret-value',
      rows: [{ total: 42 }],
    }));
    const fields = inspectJsonResponseFields(body, 'application/json; charset=utf-8');
    expect(fields).toContainEqual({ path: '/user/email', type: 'string', sensitivity: 'possible' });
    expect(fields).toContainEqual({ path: '/accessToken', type: 'string', sensitivity: 'sensitive' });
    expect(fields).toContainEqual({ path: '/rows/0/total', type: 'number', sensitivity: 'none' });
    expect(JSON.stringify(fields)).not.toContain('private@example.com');
    expect(JSON.stringify(fields)).not.toContain('actual-secret-value');
  });

  it('ignores non-JSON, invalid JSON, and oversized bodies', () => {
    expect(inspectJsonResponseFields(Buffer.from('secret'), 'text/plain')).toBeUndefined();
    expect(inspectJsonResponseFields(Buffer.from('{invalid'), 'application/json')).toBeUndefined();
    expect(inspectJsonResponseFields(Buffer.alloc(524_289), 'application/json')).toBeUndefined();
  });
});
