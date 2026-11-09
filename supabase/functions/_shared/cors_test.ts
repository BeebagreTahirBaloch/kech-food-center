import { preflight } from './cors.ts';

Deno.test('CORS preflight accepts allowed origins with an empty 204 response', async () => {
  const previous = Deno.env.get('ALLOWED_ORIGIN');
  Deno.env.set('ALLOWED_ORIGIN', 'https://menu.example.com');
  try {
    const response = preflight(new Request('https://api.example.com', {
      method: 'OPTIONS', headers: { Origin: 'https://menu.example.com' },
    }));
    if (response.status !== 204 || await response.text() !== '') throw new Error('Invalid preflight response');
    if (response.headers.get('Access-Control-Allow-Origin') !== 'https://menu.example.com') throw new Error('Missing allowed origin');
    const denied = preflight(new Request('https://api.example.com', {
      method: 'OPTIONS', headers: { Origin: 'https://untrusted.example.com' },
    }));
    if (denied.status !== 403 || denied.headers.has('Access-Control-Allow-Origin')) throw new Error('Untrusted origin was allowed');
  } finally {
    if (previous === undefined) Deno.env.delete('ALLOWED_ORIGIN');
    else Deno.env.set('ALLOWED_ORIGIN', previous);
  }
});
