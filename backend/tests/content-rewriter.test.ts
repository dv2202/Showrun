import { describe, expect, it } from 'vitest';
import { rewriteContent } from '../src/proxy/content-rewriter.js';

describe('target-origin response rewriting', () => {
  it('rewrites supported HTML and inline CSS URLs while preserving external URLs', () => {
    const html = `<!doctype html><html><head>
      <link rel="stylesheet" href="https://private.example/assets/app.css">
      <script src="https://cdn.example/app.js"></script>
      <style>.hero { background: url('/images/hero.png') }</style>
      </head><body style="background:url(./tile.png)">
      <a href="https://private.example/projects/42">Project</a>
      <a href="https://external.example/docs">Docs</a>
      <img src="/images/logo.png" srcset="/images/small.png 1x, https://external.example/large.png 2x">
      <form action="/search"></form>
      </body></html>`;
    const output = rewriteContent(
      Buffer.from(html), 'text/html; charset=utf-8',
      {
        documentUrl: new URL('https://private.example/dashboard'),
        originMap: new Map([
          ['https://private.example', 'http://demo.localhost:3000'],
          ['https://cdn.example', 'http://o-cdn--demo.localhost:3000'],
        ]),
      },
    ).toString();
    expect(output).toContain('http://demo.localhost:3000/projects/42');
    expect(output).toContain('http://demo.localhost:3000/assets/app.css');
    expect(output).toContain('http://o-cdn--demo.localhost:3000/app.js');
    expect(output).toContain('src="/images/logo.png"');
    expect(output).toContain('/images/small.png 1x');
    expect(output).toContain('action="/search"');
    expect(output).toContain("url('/images/hero.png')");
    expect(output).toContain('url(./tile.png)');
    expect(output).not.toContain('window.fetch =');
    expect(output).not.toContain('https://private.example/dashboard');
    expect(output).toContain('https://external.example/docs');
    expect(output).toContain('https://external.example/large.png 2x');
    expect(output).toContain('data-showrun-interaction-guard');
    expect(output).toContain('stopImmediatePropagation');
  });

  it('rewrites CSS url() values only for the configured target origin', () => {
    const css = `.a{background:url('/a.png')}.b{background:url(https://cdn.example/b.png)}`;
    const output = rewriteContent(
      Buffer.from(css), 'text/css',
      {
        documentUrl: new URL('https://private.example/assets/main.css'),
        originMap: new Map([['https://private.example', 'http://demo.localhost:3000']]),
      },
    ).toString();
    expect(output).toContain("url('/a.png')");
    expect(output).toContain('url(https://cdn.example/b.png)');
  });

  it('installs a non-secret localStorage bridge before target scripts', () => {
    const output = rewriteContent(
      Buffer.from('<html><head><script src="/app.js"></script></head><body></body></html>'),
      'text/html',
      {
        documentUrl: new URL('https://private.example/dashboard'),
        originMap: new Map([['https://private.example', 'http://demo.localhost:3000']]),
        sessionToken: { storage: 'localStorage', name: 'access_token' },
        bridgeToken: 'public-bridge-token',
      },
    ).toString();

    expect(output).toContain('const bridgeKey = "access_token"');
    expect(output).toContain("installVirtualStorage('localStorage')");
    expect(output).toContain('public-bridge-token');
    expect(output).not.toContain('real-access-token');
    expect(output.indexOf('data-showrun-interaction-guard')).toBeLessThan(output.indexOf('src="/app.js"'));
  });
});
