import * as cheerio from 'cheerio';
import type { SessionTokenLocation } from '../domain/types.js';

function scriptValue(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export interface RewriteContentOptions {
  documentUrl: URL;
  originMap: ReadonlyMap<string, string>;
  sessionToken?: SessionTokenLocation;
  bridgeToken?: string;
}

function runtimeBootstrap(options: RewriteContentOptions): string {
  const storage = options.sessionToken?.storage;
  const storageKey = storage === 'localStorage' || storage === 'sessionStorage'
    ? options.sessionToken?.name
    : null;
  const bridgeValue = storageKey ? options.bridgeToken ?? null : null;
  return `(() => {
  const bridgeStorage = ${scriptValue(storage ?? null)};
  const bridgeKey = ${scriptValue(storageKey)};
  const bridgeValue = ${scriptValue(bridgeValue)};
  const installVirtualStorage = (property) => {
    if (!bridgeKey || !bridgeValue || property !== bridgeStorage) return;
    const values = new Map([[bridgeKey, bridgeValue]]);
    const storage = {
      getItem(key) { key = String(key); return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(String(key), String(value)); },
      removeItem(key) { values.delete(String(key)); },
      clear() { values.clear(); },
      key(index) { return Array.from(values.keys())[Number(index)] ?? null; },
    };
    Object.defineProperty(storage, 'length', { get: () => values.size });
    const virtualStorage = new Proxy(storage, {
      get(target, property, receiver) {
        if (typeof property === 'string' && !(property in target)) return target.getItem(property);
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set(target, property, value, receiver) {
        if (typeof property === 'string' && !(property in target)) {
          target.setItem(property, value);
          return true;
        }
        return Reflect.set(target, property, value, receiver);
      },
    });
    try { Object.defineProperty(window, property, { configurable: true, get: () => virtualStorage }); } catch {}
  };
  installVirtualStorage('localStorage');
  installVirtualStorage('sessionStorage');
  if ('serviceWorker' in navigator) {
    try { Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined }); } catch {}
  }
  try {
    Object.defineProperty(window, 'WebSocket', {
      configurable: true,
      value: class UnsupportedShowcaseWebSocket { constructor() { throw new Error('WebSockets are disabled in read-only showcases'); } },
    });
  } catch {}
  const block = (event) => { event.preventDefault(); event.stopImmediatePropagation(); };
  for (const type of ['click', 'auxclick', 'dblclick', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'submit', 'change', 'input', 'contextmenu', 'dragstart']) {
    window.addEventListener(type, block, { capture: true, passive: false });
  }
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') block(event);
  }, true);
})();`;
}

function rewrittenUrl(value: string, documentUrl: URL, originMap: ReadonlyMap<string, string>): string | null {
  const trimmed = value.trim();
  if (/^(data:|blob:|mailto:|tel:|javascript:|#)/i.test(trimmed)) return null;
  // Relative URLs already resolve against the isolated preview origin.
  if (!/^(?:https?:)?\/\//i.test(trimmed)) return null;
  try {
    const resolved = new URL(trimmed, documentUrl);
    const publicOrigin = originMap.get(resolved.origin);
    return publicOrigin ? `${publicOrigin}${resolved.pathname}${resolved.search}${resolved.hash}` : null;
  } catch {
    return null;
  }
}

function rewriteCssText(css: string, options: RewriteContentOptions): string {
  return css.replace(/url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi, (full, quote: string, raw: string) => {
    const rewritten = rewrittenUrl(raw, options.documentUrl, options.originMap);
    return rewritten ? `url(${quote}${rewritten}${quote})` : full;
  });
}

export function rewriteContent(body: Buffer, contentType: string, options: RewriteContentOptions): Buffer {
  if (contentType.includes('text/css')) return Buffer.from(rewriteCssText(body.toString('utf8'), options));
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) return body;

  const $ = cheerio.load(body.toString('utf8'));
  for (const attribute of ['href', 'src', 'action', 'poster']) {
    $(`[${attribute}]`).each((_index, element) => {
      const current = $(element).attr(attribute);
      if (!current) return;
      const rewritten = rewrittenUrl(current, options.documentUrl, options.originMap);
      if (rewritten) $(element).attr(attribute, rewritten);
    });
  }
  $('[srcset]').each((_index, element) => {
    const current = $(element).attr('srcset');
    if (!current) return;
    $(element).attr('srcset', current.split(',').map((candidate) => {
      const [url, descriptor] = candidate.trim().split(/\s+/, 2);
      if (!url) return candidate;
      const rewritten = rewrittenUrl(url, options.documentUrl, options.originMap) ?? url;
      return `${rewritten}${descriptor ? ` ${descriptor}` : ''}`;
    }).join(', '));
  });
  $('[style]').each((_index, element) => {
    const current = $(element).attr('style');
    if (current) $(element).attr('style', rewriteCssText(current, options));
  });
  $('style').each((_index, element) => {
    const current = $(element).html();
    if (current) $(element).html(rewriteCssText(current, options));
  });
  $('head').prepend(`<script data-showrun-interaction-guard>${runtimeBootstrap(options)}</script>`);
  return Buffer.from($.html());
}
