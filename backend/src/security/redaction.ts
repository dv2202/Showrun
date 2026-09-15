const sensitiveKey = /^(authorization|proxy-authorization|cookie|set-cookie|username|password|passcode|secret|token|storageState|encryptedSecret|encryptedState)$/i;

export function redactSecrets(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, seen));
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = sensitiveKey.test(key) ? '[REDACTED]' : redactSecrets(item, seen);
  }
  return output;
}

export const pinoRedactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers.proxy-authorization',
  'req.headers.x-showrun-runtime-token',
  'req.body.username',
  'req.body.password',
  'req.body.text',
  'req.body.authentication.secret',
  'res.headers.set-cookie',
  '*.password',
  '*.username',
  '*.token',
  '*.secret',
  '*.storageState',
  '*.encryptedSecret',
  '*.encryptedState',
];
