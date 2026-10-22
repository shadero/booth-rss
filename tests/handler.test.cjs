const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('cheerio');
const { handler: lambdaHandler } = require('../dist/index.js');
const handler = (request) => lambdaHandler(request, { getRemainingTimeInMillis: () => 35000 });
let calls = [];
global.fetch = async (url) => {
  calls.push(url.href);
  if (url.searchParams.get('q') === 'upstream-error') return { ok: false, status: 503, text: async () => '<html><title>BOOTH</title><body>Unavailable</body></html>' };
  if (decodeURIComponent(url.pathname).includes('timeout')) throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
  const tag = url.searchParams.getAll('tags[]').join(',') || '検索商品';
  return { ok: true, text: async () => `<div class="item-card"><a class="item-card__thumbnail-image" data-original="https://booth.pximg.net/test.jpg" href="/ja/items/123"></a><div class="item-card__title"><a href="/ja/items/123">${tag} &amp; 衣装</a></div><div class="item-card__shop-name">Shop &lt;A&gt;</div><span class="price">¥ 500</span></div>` };
};
const requestContext = { domainName: 'example.lambda-url.ap-northeast-1.on.aws', stage: '$default', http: { method: 'GET' } };
const event = (query, overrides = {}) => ({ version: '2.0', rawPath: '/', rawQueryString: new URLSearchParams(query).toString(), ...overrides, requestContext: { ...requestContext, ...overrides.requestContext } });

test('v2 Atom, all search filters, XML escaping and no caching', async () => {
  const q = { tag: 'しなの,Lapwing', keyword: 'VRChat', category: '3D衣装', exclude_keyword: '除外1、除外2', item_type: 'digital', min_price: '0', max_price: '5000', age: 'include' };
  const a = await handler(event(q));
  assert.equal(a.statusCode, 200);
  const xml = load(a.body, { xml: true });
  assert.equal(xml('entry').length, 1);
  assert.equal(xml('entry title').text(), 'しなの,Lapwing & 衣装');
  assert.match(xml('entry content').text(), /Shop &lt;A&gt;/);
  assert.match(xml('feed > link[rel=self]').attr('href'), /^https:\/\/example.lambda-url/);
  assert.equal(xml('entry id').text(), 'https://booth.pm/ja/items/123');
  const source = new URL(calls.at(-1));
  assert.equal(decodeURIComponent(source.pathname), '/ja/browse/3D衣装');
  assert.equal(source.searchParams.get('q'), 'VRChat');
  assert.deepEqual(source.searchParams.getAll('except_words[]'), ['除外1','除外2']);
  assert.equal(source.searchParams.get('min_price'), '0');
  const count = calls.length;
  assert.equal(a.headers['cache-control'], 'no-store');
  assert.equal(a.headers.etag, undefined);
  assert.equal((await handler(event(q))).statusCode, 200);
  assert.equal(calls.length, count + 1);
  const b = await handler(event({ tag:'髪型' }));
  assert.match(b.body, /髪型/);
  const beforeConditional = calls.length;
  assert.equal((await handler(event(q, { headers: { 'If-None-Match': '*' } }))).statusCode, 200);
  assert.equal(calls.length, beforeConditional + 1);
  const head = await handler(event(q, { requestContext: { http: { method: 'HEAD' } } }));
  assert.equal(head.statusCode, 200);
  assert.equal(head.body, '');
});

test('v1 query events, RSS and JSON output, keyword-only search', async () => {
  const a = await handler({ httpMethod:'GET', path:'/', requestContext, queryStringParameters:{ keyword:'検索用語', format:'rss' } });
  assert.equal(a.statusCode, 200);
  assert.equal(load(a.body,{xml:true})('rss channel item').length,1);
  assert.match(decodeURIComponent(new URL(calls.at(-1)).pathname), /\/ja\/search\/検索用語/);
  const b = await handler(event({tag:'JSON',format:'json'}));
  assert.equal(b.statusCode,200);
  const json = JSON.parse(b.body);
  assert.equal(json.items[0].authors[0].name, 'Shop <A>');
  assert.equal(json.items[0].id, 'https://booth.pm/ja/items/123');
});

test('feed URLs preserve API Gateway stages without duplicating existing prefixes', async () => {
  const domainName = 'example.execute-api.ap-southeast-2.amazonaws.com';
  const cases = [
    { path: '/booth-rss', stage: 'default', expected: '/default/booth-rss' },
    { path: '/default/booth-rss', stage: 'default', expected: '/default/booth-rss' },
    { path: '/default', stage: 'default', expected: '/default' },
    { path: '/default-other', stage: 'default', expected: '/default/default-other' },
    { path: '/booth-rss', stage: '$default', expected: '/booth-rss' },
    { path: '/', stage: 'prod', expected: '/prod/' },
    { path: '/booth-rss', stage: 'prod', domain: 'feeds.example.com', expected: '/booth-rss' },
    { path: '/', stage: '$default', domain: 'example.lambda-url.ap-northeast-1.on.aws', expected: '/' },
  ];
  for (const c of cases) {
    for (const version of ['1.0', '2.0']) {
      const domain = c.domain || domainName;
      const request = {
        version, queryStringParameters: { tag: 'Lapwing', age: 'include', format: 'json' },
        requestContext: { domainName: domain, stage: c.stage, http: { method: 'GET' } },
        ...(version === '2.0' ? { rawPath: c.path } : { path: c.path, httpMethod: 'GET' }),
      };
      const result = await handler(request);
      assert.equal(result.statusCode, 200);
      assert.equal(JSON.parse(result.body).feed_url, `https://${domain}${c.expected}?tag=Lapwing&age=include&format=json`);
    }
  }
});

test('FEED_URL overrides the inferred API Gateway endpoint', async () => {
  const previous = process.env.FEED_URL;
  process.env.FEED_URL = 'https://feeds.example.com/mapped/booth-rss';
  try {
    const result = await handler(event({ format: 'atom' }, {
      rawPath: '/booth-rss',
      requestContext: { domainName: 'example.execute-api.ap-southeast-2.amazonaws.com', stage: 'prod' },
    }));
    assert.equal(result.statusCode, 200);
    assert.equal(load(result.body, { xml: true })('feed > link[rel=self]').attr('href'), 'https://feeds.example.com/mapped/booth-rss?format=atom');
  } finally {
    if (previous === undefined) delete process.env.FEED_URL;
    else process.env.FEED_URL = previous;
  }
});

test('rejects unsupported formats and handles HTTP errors, timeouts and health checks', async () => {
  assert.equal((await handler(event({format:'html'}))).statusCode,400);
  assert.equal((await handler(event({}, {requestContext:{http:{method:'POST'}}}))).statusCode,405);
  assert.equal((await handler(event({keyword:'upstream-error',category:'x'}))).statusCode,502);
  assert.equal((await handler(event({keyword:'timeout'}))).statusCode,504);
  assert.equal((await handler(event({}, {rawPath:'/healthz'}))).body,'ok');
});
