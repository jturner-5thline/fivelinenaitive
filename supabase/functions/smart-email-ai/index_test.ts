// Import the complete handler without starting a server or contacting external services.
const source = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
const isolatedSource = source
  .replace(/import \{ serve \} from [^;]+;/, 'const serve = (handler: unknown) => { (globalThis as any).__smartEmailHandler = handler; };')
  .replace(/import \{ createClient \} from [^;]+;/, 'const createClient = () => ({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } });')
  .replace(/Deno\.env\.get\("[A-Z_]+"\)/g, '"synthetic-test-value"');

Deno.test('smart email handler boots and responds to preflight and unauthenticated requests', async () => {
  try {
    await import(`data:application/typescript,${encodeURIComponent(isolatedSource)}`);
    const handler = (globalThis as unknown as {
      __smartEmailHandler: (request: Request) => Promise<Response>;
    }).__smartEmailHandler;
    const preflight = await handler(new Request('https://example.invalid', { method: 'OPTIONS' }));
    if (preflight.status !== 200) throw new Error(`Expected preflight 200, got ${preflight.status}`);
    if (preflight.headers.get('Access-Control-Allow-Origin') !== '*') throw new Error('Missing preflight CORS');
    const denied = await handler(new Request('https://example.invalid', { method: 'POST', body: '{}' }));
    if (denied.status !== 401) throw new Error(`Expected unauthorized 401, got ${denied.status}`);
    if ((await denied.json()).error !== 'Unauthorized') throw new Error('Expected authentication rejection');
  } finally {
    Reflect.deleteProperty(globalThis, '__smartEmailHandler');
  }
});