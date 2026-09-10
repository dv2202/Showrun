import { describe, expect, it } from 'vitest';
import { EncryptionService } from '../src/security/encryption.js';
import { redactSecrets } from '../src/security/redaction.js';
import { TEST_KEY } from './helpers.js';

describe('secret handling', () => {
  it('encrypts authenticated state with integrity protection', () => {
    const encryption = new EncryptionService(TEST_KEY);
    const encrypted = encryption.encrypt({ token: 'top-secret' });
    expect(encrypted).not.toContain('top-secret');
    expect(encryption.decrypt(encrypted)).toEqual({ token: 'top-secret' });
    const parts = encrypted.split('.');
    parts[3] = `${parts[3]![0] === 'A' ? 'B' : 'A'}${parts[3]!.slice(1)}`;
    expect(() => encryption.decrypt(parts.join('.'))).toThrow();
  });

  it('redacts secrets recursively', () => {
    expect(redactSecrets({
      username: 'login-name',
      password: 'secret',
      headers: { authorization: 'Bearer secret', cookie: 'sid=secret' },
      nested: { storageState: { cookies: ['secret'] } },
    })).toEqual({
      username: '[REDACTED]',
      password: '[REDACTED]',
      headers: { authorization: '[REDACTED]', cookie: '[REDACTED]' },
      nested: { storageState: '[REDACTED]' },
    });
  });
});
