import * as cheerio from 'cheerio';

const interactionGuard = `(() => {
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
  $('head').prepend(`<script data-showrun-interaction-guard>${interactionGuard}</script>`);
  return Buffer.from($.html());
}
