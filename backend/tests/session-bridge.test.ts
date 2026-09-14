import { describe, expect, it } from 'vitest';
import type { SessionMaterial } from '../src/domain/types.js';
import { observedSessionHeaders } from '../src/proxy/session-bridge.js';

describe('session bridge header discovery', () => {
  it('returns only header names that carried captured browser-storage values', () => {
    const material: SessionMaterial = {
      origins: [{
        origin: 'https://app.example',
        localStorage: [{ name: 'access_token', value: 'local-storage-secret' }],
      }],
      sessionOrigins: [{
        origin: 'https://app.example',
        sessionStorage: [{ name: 'session_token', value: 'session-storage-secret' }],
      }],
    };

    expect(observedSessionHeaders(material, {
      Authorization: 'Bearer local-storage-secret',
      'X-Session': 'session-storage-secret:v1',
      'X-Unrelated': 'public-value',
    })).toEqual(['authorization', 'x-session']);
  });

  it('never approves Cookie and ignores short values that create unsafe matches', () => {
    const material: SessionMaterial = {
      origins: [{
        origin: 'https://app.example',
        localStorage: [{ name: 'short', value: '1234' }],
      }],
    };

    expect(observedSessionHeaders(material, {
      Cookie: 'short=1234',
      'X-Value': '1234',
    })).toEqual([]);
  });
});
