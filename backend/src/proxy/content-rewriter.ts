import * as cheerio from 'cheerio';
import type { StorageAuthBridge } from '../domain/types.js';

const PUBLIC_AUTH_PLACEHOLDER =
  'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJzaG93cnVuLXB1YmxpYyIsImV4cCI6NDEwMjQ0NDgwMH0.';

function scriptValue(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function runtimeBootstrap(
  documentUrl: URL,
  targetOrigin: string,
  slug: string,
  publicProxyPrefix: string,
  storageBridge?: StorageAuthBridge,
): string {
  const proxyBase = `${publicProxyPrefix.replace(/\/$/, '')}/${encodeURIComponent(slug)}`;
  return `(() => {
  const proxyBase = ${scriptValue(proxyBase)};
  const targetDocument = ${scriptValue(documentUrl.href)};
  const targetOrigin = ${scriptValue(targetOrigin)};
  const bridgeKey = ${storageBridge ? scriptValue(storageBridge.key) : 'null'};
  const bridgeValue = ${storageBridge ? scriptValue(PUBLIC_AUTH_PLACEHOLDER) : 'null'};
  if (bridgeKey) {
    const values = new Map([[bridgeKey, bridgeValue]]);
    const storage = {
      getItem(key) {
        key = String(key);
        return values.has(key) ? values.get(key) : null;
      },
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
    try {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get: () => virtualStorage,
      });
    } catch {}
  }
  const rewriteRequestUrl = (value) => {
    const raw = value instanceof URL ? value.href : String(value);
    if (raw.startsWith(proxyBase)) return raw;
    try {
      const resolved = new URL(raw, targetDocument);
      if (resolved.origin !== targetOrigin) return raw;
      return proxyBase + resolved.pathname + resolved.search + resolved.hash;
    } catch {
      return raw;
    }
  };
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (input instanceof Request) {
      const rewritten = new Request(rewriteRequestUrl(input.url), input);
      return nativeFetch(new Request(rewritten, { ...(init || {}), credentials: 'omit' }));
    }
    return nativeFetch(rewriteRequestUrl(input), { ...(init || {}), credentials: 'omit' });
  };
  const nativeXhrOpen = XMLHttpRequest.prototype.open;
  const nativeXhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    return nativeXhrOpen.call(this, method, rewriteRequestUrl(url), ...rest);
  };
  XMLHttpRequest.prototype.send = function(...args) {
    try { this.withCredentials = false; } catch {}
    return nativeXhrSend.apply(this, args);
  };
  const block = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  for (const type of ['click', 'auxclick', 'dblclick', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'submit', 'change', 'input', 'contextmenu', 'dragstart']) {
    window.addEventListener(type, block, { capture: true, passive: false });
  }
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') block(event);
  }, true);
})();`;
}

function proxiedUrl(
  value: string,
  documentUrl: URL,
  targetOrigin: string,
  slug: string,
  publicProxyPrefix: string,
): string | null {
  if (/^(data:|blob:|mailto:|tel:|javascript:|#)/i.test(value.trim())) return null;
  try {
    const resolved = new URL(value, documentUrl);
    if (!['http:', 'https:'].includes(resolved.protocol) || resolved.origin !== targetOrigin) return null;
    const prefix = publicProxyPrefix.replace(/\/$/, '');
    return `${prefix}/${encodeURIComponent(slug)}${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    console.warn(`Failed to resolve URL ${value} relative to ${documentUrl.href}`);
    return null;
  }
}

function rewriteCssText(
  css: string,
  documentUrl: URL,
  targetOrigin: string,
  slug: string,
  publicProxyPrefix: string,
): string {
  return css.replace(/url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi, (full, quote: string, raw: string) => {
    const rewritten = proxiedUrl(raw, documentUrl, targetOrigin, slug, publicProxyPrefix);
    return rewritten ? `url(${quote}${rewritten}${quote})` : full;
  });
}

export function rewriteContent(
  body: Buffer,
  contentType: string,
  documentUrl: URL,
  targetOrigin: string,
  slug: string,
  publicProxyPrefix = '/showcase',
  storageBridge?: StorageAuthBridge,
): Buffer {
  if (contentType.includes('text/css')) {
    return Buffer.from(
      rewriteCssText(body.toString('utf8'), documentUrl, targetOrigin, slug, publicProxyPrefix),
    );
  }
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) return body;

  const $ = cheerio.load(body.toString('utf8'));
  const attributes = ['href', 'src', 'action', 'poster'];
  for (const attribute of attributes) {
    $(`[${attribute}]`).each((_index, element) => {
      const current = $(element).attr(attribute);
      if (!current) return;
      const rewritten = proxiedUrl(current, documentUrl, targetOrigin, slug, publicProxyPrefix);
      if (rewritten) $(element).attr(attribute, rewritten);
    });
  }
  $('[srcset]').each((_index, element) => {
    const current = $(element).attr('srcset');
    if (!current) return;
    const rewritten = current.split(',').map((candidate) => {
      const [url, descriptor] = candidate.trim().split(/\s+/, 2);
      if (!url) return candidate;
      return `${proxiedUrl(url, documentUrl, targetOrigin, slug, publicProxyPrefix) ?? url}${descriptor ? ` ${descriptor}` : ''}`;
    }).join(', ');
    $(element).attr('srcset', rewritten);
  });
  $('[style]').each((_index, element) => {
    const current = $(element).attr('style');
    if (current) {
      $(element).attr(
        'style',
        rewriteCssText(current, documentUrl, targetOrigin, slug, publicProxyPrefix),
      );
    }
  });
  $('style').each((_index, element) => {
    const current = $(element).html();
    if (current) {
      $(element).html(rewriteCssText(current, documentUrl, targetOrigin, slug, publicProxyPrefix));
    }
  });
  $('base').remove();
  $('head').prepend(
    `<script data-showrun-interaction-guard>${runtimeBootstrap(
      documentUrl,
      targetOrigin,
      slug,
      publicProxyPrefix,
      storageBridge,
    )}</script>`,
  );
  return Buffer.from($.html());
}
