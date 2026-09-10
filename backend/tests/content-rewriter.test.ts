import { describe, expect, it } from 'vitest';
import { rewriteContent } from '../src/proxy/content-rewriter.js';

describe('target-origin response rewriting', () => {
  it('rewrites supported HTML and inline CSS URLs while preserving external URLs', () => {
    const html = `<!doctype html><html><head>
      <link rel="stylesheet" href="https://private.example/assets/app.css">
      <style>.hero { background: url('/images/hero.png') }</style>
      </head><body style="background:url(./tile.png)">
      <a href="https://private.example/projects/42">Project</a>
      <a href="https://external.example/docs">Docs</a>
      <img src="/images/logo.png" srcset="/images/small.png 1x, https://external.example/large.png 2x">
      <form action="/search"></form>
      </body></html>`;
    const output = rewriteContent(
      Buffer.from(html), 'text/html; charset=utf-8', new URL('https://private.example/dashboard'),
      'https://private.example', 'demo',
    ).toString();
    expect(output).toContain('/showcase/demo/projects/42');
    expect(output).toContain('/showcase/demo/assets/app.css');
    expect(output).toContain('/showcase/demo/images/logo.png');
    expect(output).toContain('/showcase/demo/images/small.png 1x');
    expect(output).toContain('/showcase/demo/search');
    expect(output).toContain('/showcase/demo/images/hero.png');
    expect(output).toContain('/showcase/demo/tile.png');
    expect(output).toContain('https://external.example/docs');
    expect(output).toContain('https://external.example/large.png 2x');
  });

  it('rewrites CSS url() values only for the configured target origin', () => {
    const css = `.a{background:url('/a.png')}.b{background:url(https://cdn.example/b.png)}`;
    const output = rewriteContent(
      Buffer.from(css), 'text/css', new URL('https://private.example/assets/main.css'),
      'https://private.example', 'demo',
    ).toString();
    expect(output).toContain('url(\'/showcase/demo/a.png\')');
    expect(output).toContain('url(https://cdn.example/b.png)');
  });
});
