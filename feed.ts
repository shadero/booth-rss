import type { Feed, FeedFormat, Item } from './models';

const escapeXML = (value: string): string => value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

function renderDescription(item: Item): string {
    const image = item.image ? `<img src="${escapeXML(item.image)}" /><br>` : '';
    return `${image}<strong>ショップ:</strong> ${escapeXML(item.author)}<br><strong>価格:</strong> ${escapeXML(item.price)}`;
}

export function renderFeed(feed: Feed, format: FeedFormat): string {
    if (format === 'json') return JSON.stringify({
        version: 'https://jsonfeed.org/version/1.1', title: feed.title,
        home_page_url: feed.link, feed_url: feed.self, language: 'ja',
        items: feed.items.map((item) => ({ id: item.link, url: item.link, title: item.title, content_html: renderDescription(item), authors: [{ name: item.author }] })),
    });
    if (format === 'rss') return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>${escapeXML(feed.title)}</title><link>${escapeXML(feed.link)}</link><description>BOOTHの新着アイテム</description><language>ja</language>
<lastBuildDate>${new Date(feed.updated).toUTCString()}</lastBuildDate>
<atom:link href="${escapeXML(feed.self)}" rel="self" type="application/rss+xml"/>
${feed.items.map((item) => `<item><title>${escapeXML(item.title)}</title><link>${escapeXML(item.link)}</link><guid isPermaLink="true">${escapeXML(item.link)}</guid><description>${escapeXML(renderDescription(item))}</description></item>`).join('\n')}
</channel></rss>`;
    // BOOTHの検索結果には公開日時がないため、Atomで必須のupdatedには取得時刻を使う。
    return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ja">
<title>${escapeXML(feed.title)}</title><id>${escapeXML(feed.link)}</id><updated>${feed.updated}</updated><author><name>BOOTH</name></author>
<link rel="alternate" href="${escapeXML(feed.link)}"/>
<link rel="self" href="${escapeXML(feed.self)}" type="application/atom+xml"/>
${feed.items.map((item) => `<entry><title>${escapeXML(item.title)}</title><id>${escapeXML(item.link)}</id><link href="${escapeXML(item.link)}"/><updated>${feed.updated}</updated><author><name>${escapeXML(item.author)}</name></author><content type="html">${escapeXML(renderDescription(item))}</content></entry>`).join('\n')}
</feed>`;
}
