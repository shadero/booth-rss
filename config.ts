import { HTTPError } from './models';
import type { Config, RequestInput, SearchQuery } from './models';

const contentTypes = { atom: 'application/atom+xml', rss: 'application/rss+xml', json: 'application/feed+json' };
const splitWords = (value: string) => value.split(/[\s,、]+/u).filter(Boolean);

function buildSearchURL(query: SearchQuery): URL {
    const { keyword, category } = query;
    const age = query.age || 'all-ages';
    const type = query.item_type || 'all';
    // 検索条件の妥当性はBOOTH側に任せ、ここでは検索URLへの変換だけを行う。
    const path = category ? `/ja/browse/${encodeURIComponent(category)}` : keyword ? `/ja/search/${encodeURIComponent(keyword)}` : '/ja/items';
    const url = new URL(path, 'https://booth.pm');
    url.searchParams.set('sort', 'new');
    if (category && keyword) url.searchParams.set('q', keyword);
    for (const word of splitWords(query.exclude_keyword)) url.searchParams.append('except_words[]', word);
    for (const tag of splitWords(query.tag)) url.searchParams.append('tags[]', tag);
    if (age !== 'all-ages') url.searchParams.set('adult', age);
    if (type !== 'all') url.searchParams.set('type', type);
    for (const field of ['min_price', 'max_price'] as const) {
        if (query[field]) url.searchParams.set(field, query[field]);
    }
    return url;
}

export function buildConfig(input: RequestInput): Config {
    const { query, format, domain, stage, remainingTime } = input;
    if (format !== 'atom' && format !== 'rss' && format !== 'json') throw new HTTPError(400, 'format must be atom, rss, or json');
    const url = buildSearchURL(query);
    if (remainingTime < 1500) throw new HTTPError(504, 'Insufficient time to fetch BOOTH');
    let publicPath = input.path;
    // execute-apiの名前付きステージは公開URLに必要だが、イベントのパスでは省略される場合がある。
    // カスタムドメインのパスはマッピング設定に依存するため補完しない（必要ならFEED_URLを指定）。
    if (/\.execute-api\.[a-z0-9-]+\.amazonaws\.com(?:\.cn)?$/.test(domain) && stage !== '$default' && publicPath.split('/')[1] !== stage) {
        publicPath = `/${stage}${publicPath}`;
    }
    const publicURL = new URL(input.feedURL || `https://${domain}${publicPath}`);
    publicURL.search = new URLSearchParams({ ...Object.fromEntries(Object.entries(query).filter(([, value]) => value !== '')), format }).toString();
    const label = [query.keyword, query.tag, query.category].filter(Boolean).join(' / ');
    return {
        request: {
            url,
            headers: { Cookie: 'adult=t', 'User-Agent': 'Mozilla/5.0 (compatible; BOOTHFeed)', 'Accept-Language': 'ja,en;q=0.8' },
            timeout: Math.min(25000, remainingTime - 1000),
        },
        feed: { title: `BOOTH 新着アイテム${label ? ` - ${label}` : ''}`, link: url.href, self: publicURL.href },
        format,
        contentType: contentTypes[format] + '; charset=utf-8',
    };
}
