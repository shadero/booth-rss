import { load } from 'cheerio';
import { HTTPError } from './models';
import type { Item, RequestConfig } from './models';

export async function requestPage({ url, headers, timeout }: RequestConfig): Promise<string> {
    const upstream = await fetch(url, { headers, signal: AbortSignal.timeout(timeout) });
    const html = await upstream.text();
    if (!upstream.ok) {
        const $ = load(html);
        $('script, style').remove();
        console.error('BOOTH upstream response', {
            status: upstream.status,
            title: $('title').text(),
            bodyText: $('body').text().replace(/\s+/g, ' ').trim().slice(0, 500),
        });
        throw new HTTPError(502, `BOOTH returned HTTP ${upstream.status}`);
    }
    return html;
}

function safeURL(value: string, base: URL): string {
    if (!value) return '';
    try {
        const url = new URL(value, base);
        return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch {
        return '';
    }
}

export function parseItems(html: string, url: URL): Item[] {
    const $ = load(html);
    const seen = new Set<string>();
    const items: Item[] = [];
    for (const element of $('.item-card').toArray()) {
        const card = $(element);
        const title = card.find('.item-card__title').first();
        const href = title.find('a').attr('href') || (title.is('a') ? title.attr('href') : '') || card.find('a[href*="/items/"]').first().attr('href') || '';
        const link = safeURL(href, url);
        if (!link || seen.has(link)) continue;
        seen.add(link);
        const author = card.find('.item-card__shop-name').first().text().trim() || '不明なショップ';
        const price = card.find('.price').first().text().trim() || '価格不明';
        const thumbnail = card.find('.item-card__thumbnail-image').first();
        const styleImage = /background-image:\s*url\(["']?([^"')]+)["']?\)/i.exec(thumbnail.attr('style') || '')?.[1] ?? '';
        const image = safeURL(thumbnail.attr('data-original') || thumbnail.attr('data-src') || thumbnail.attr('src') || styleImage, url);
        items.push({ title: title.text().trim() || 'タイトル不明', link, author, price, image });
    }
    if (!items.length && !$('.search-result, .search-result-items, [data-product-list]').length && !/検索結果[\s\S]{0,300}(見つかりません|ありません)|該当する商品がありません|0件/.test($.text())) {
        throw new HTTPError(502, 'BOOTH returned no recognizable results; its HTML may have changed or access may be blocked');
    }
    return items;
}
