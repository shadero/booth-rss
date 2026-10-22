export const searchFields = ['keyword', 'exclude_keyword', 'tag', 'category', 'item_type', 'min_price', 'max_price', 'age'] as const;
export type SearchQuery = Record<typeof searchFields[number], string>;

export interface Item {
    title: string;
    link: string;
    author: string;
    price: string;
    image: string;
}

export interface Feed {
    title: string;
    link: string;
    self: string;
    updated: string;
    items: Item[];
}

export type FeedFormat = 'atom' | 'rss' | 'json';

export interface RequestConfig {
    url: URL;
    headers: Record<string, string>;
    timeout: number;
}

export interface Config {
    request: RequestConfig;
    feed: Pick<Feed, 'title' | 'link' | 'self'>;
    format: FeedFormat;
    contentType: string;
}

export interface RequestInput {
    query: SearchQuery;
    format: string;
    method: string;
    path: string;
    domain: string;
    stage: string;
    feedURL: string;
    remainingTime: number;
}

// Function URLとAPI Gatewayのイベントから、この処理で使う項目だけを定義する。
interface LambdaRequest {
    queryStringParameters?: Record<string, string> | null;
    requestContext: {
        domainName: string;
        stage: string;
    };
}

export type LambdaEvent = LambdaRequest & (
    { rawPath: string; rawQueryString?: string; requestContext: { http: { method: string } } }
    | { path: string; httpMethod: string }
);

export interface LambdaContext {
    getRemainingTimeInMillis?(): number;
}

export class HTTPError extends Error {
    constructor(public readonly statusCode: number, message: string) {
        super(message);
    }
}
