import * as cheerio from 'cheerio';

function proxiedUrl(value: string, documentUrl: URL, targetOrigin: string, slug: string): string | null {
  if (/^(data:|blob:|mailto:|tel:|javascript:|#)/i.test(value.trim())) return null;
  try {
    const resolved = new URL(value, documentUrl);
    if (!['http:', 'https:'].includes(resolved.protocol) || resolved.origin !== targetOrigin) return null;
    return `/showcase/${encodeURIComponent(slug)}${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return null;
  }
}

function rewriteCssText(css: string, documentUrl: URL, targetOrigin: string, slug: string): string {
  return css.replace(/url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi, (full, quote: string, raw: string) => {
    const rewritten = proxiedUrl(raw, documentUrl, targetOrigin, slug);
    return rewritten ? `url(${quote}${rewritten}${quote})` : full;
  });
}

export function rewriteContent(
  body: Buffer,
  contentType: string,
  documentUrl: URL,
  targetOrigin: string,
  slug: string,
): Buffer {
  if (contentType.includes('text/css')) {
    return Buffer.from(rewriteCssText(body.toString('utf8'), documentUrl, targetOrigin, slug));
  }
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) return body;

  const $ = cheerio.load(body.toString('utf8'));
  const attributes = ['href', 'src', 'action', 'poster'];
  for (const attribute of attributes) {
    $(`[${attribute}]`).each((_index, element) => {
      const current = $(element).attr(attribute);
      if (!current) return;
      const rewritten = proxiedUrl(current, documentUrl, targetOrigin, slug);
      if (rewritten) $(element).attr(attribute, rewritten);
    });
  }
  $('[srcset]').each((_index, element) => {
    const current = $(element).attr('srcset');
    if (!current) return;
    const rewritten = current.split(',').map((candidate) => {
      const [url, descriptor] = candidate.trim().split(/\s+/, 2);
      if (!url) return candidate;
      return `${proxiedUrl(url, documentUrl, targetOrigin, slug) ?? url}${descriptor ? ` ${descriptor}` : ''}`;
    }).join(', ');
    $(element).attr('srcset', rewritten);
  });
  $('[style]').each((_index, element) => {
    const current = $(element).attr('style');
    if (current) $(element).attr('style', rewriteCssText(current, documentUrl, targetOrigin, slug));
  });
  $('style').each((_index, element) => {
    const current = $(element).html();
    if (current) $(element).html(rewriteCssText(current, documentUrl, targetOrigin, slug));
  });
  $('base').remove();
  return Buffer.from($.html());
}
