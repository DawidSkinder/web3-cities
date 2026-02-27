import { handleTopCoinsApiRequest } from '../server/binanceProxy';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'method-not-allowed' }));
    return;
  }

  const host = String(req.headers?.host ?? 'localhost');
  const proto = String(req.headers?.['x-forwarded-proto'] ?? 'https');
  const rawUrl = `${proto}://${host}${req.url ?? '/api/top-coins'}`;
  const result = await handleTopCoinsApiRequest(rawUrl);

  res.statusCode = result.status;
  for (const [key, value] of Object.entries(result.headers)) {
    res.setHeader(key, value);
  }
  res.end(result.body);
}
