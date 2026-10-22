import { buildConfig } from './config';
import { requestPage, parseItems } from './booth';
import { renderFeed } from './feed';
import { HTTPError, searchFields } from './models';
import type { LambdaContext, LambdaEvent, RequestInput, SearchQuery } from './models';

// AWSの必須情報は欠損時にエラーとし、省略可能な検索条件だけを補完する。
function readRequest(event: LambdaEvent, context: LambdaContext): RequestInput {
    if (!event || !context) throw new Error('event and context are required');
    const method = 'rawPath' in event ? event.requestContext.http.method : event.httpMethod;
    const path = 'rawPath' in event ? event.rawPath : event.path;
    const { domainName: domain, stage } = event.requestContext;
    if (!method || !path || !domain || !stage) throw new Error('HTTP method, path, domain and stage are required');
    const params = 'rawQueryString' in event && event.rawQueryString ? Object.fromEntries(new URLSearchParams(event.rawQueryString)) : (event.queryStringParameters ?? {});
    // 全検索項目を列挙して構築しているため、必須キーが揃った型として扱う。
    const query = Object.fromEntries(searchFields.map((field) => [field, (params[field] ?? '').trim()])) as SearchQuery;
    return {
        query,
        format: (params.format || 'atom').toLowerCase(),
        method,
        path,
        domain,
        stage,
        feedURL: process.env.FEED_URL ?? '',
        remainingTime: context.getRemainingTimeInMillis?.() ?? 35000,
    };
}

function response(statusCode: number, body: string, headers: Record<string, string> = {}) {
    return { statusCode, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...headers }, body, isBase64Encoded: false };
}

export async function handler(event: LambdaEvent, context: LambdaContext) {
    const input = readRequest(event, context);
    const { method } = input;
    if (!['GET', 'HEAD'].includes(method)) return response(405, 'Method not allowed', { allow: 'GET, HEAD' });
    if (input.path === '/healthz') return response(200, method === 'HEAD' ? '' : 'ok');
    try {
        const config = buildConfig(input);
        const html = await requestPage(config.request);
        const items = parseItems(html, config.request.url);
        const body = renderFeed({ ...config.feed, items, updated: new Date().toISOString() }, config.format);
        return response(200, method === 'HEAD' ? '' : body, { 'content-type': config.contentType });
    } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error));
        const status = failure instanceof HTTPError ? failure.statusCode : ['TimeoutError', 'AbortError'].includes(failure.name) ? 504 : 502;
        console.error('BOOTH feed failed', { status, message: failure.message });
        return response(status, method === 'HEAD' ? '' : status === 400 ? failure.message : 'Unable to fetch BOOTH feed. Please retry later.');
    }
}
