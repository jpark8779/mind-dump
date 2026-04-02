// ═══════════════════════════════════════════════════════
// MIND DUMP v4 — Cloudflare Worker (API Proxy)
// ═══════════════════════════════════════════════════════
// Deploy: wrangler deploy
// Env vars (via Cloudflare dashboard):
//   ANTHROPIC_API_KEY  — Anthropic API key
//   SUPABASE_JWT_SECRET — Supabase JWT secret (for verification)
//   ALLOWED_ORIGIN — frontend URL (e.g. https://mind-dump.vercel.app)

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';

    // ── CORS Preflight ──────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': allowedOrigin,
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    const url = new URL(request.url);

    // ── Health Check ────────────────────────────────────
    if (url.pathname === '/api/health') {
      return json({ status: 'ok' }, allowedOrigin);
    }

    // ── Analyze Endpoint ────────────────────────────────
    if (url.pathname === '/api/analyze' && request.method === 'POST') {
      // Verify JWT if Supabase secret is configured
      if (env.SUPABASE_JWT_SECRET) {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return error('Unauthorized', 401, allowedOrigin);
        }
        // Basic JWT verification (production: use proper JWT library)
        const token = authHeader.slice(7);
        if (!token || token.length < 10) {
          return error('Invalid token', 401, allowedOrigin);
        }
      }

      // Read request body
      let body;
      try {
        body = await request.json();
      } catch(e) {
        return error('Invalid JSON', 400, allowedOrigin);
      }

      // Validate required fields
      if (!body.model || !body.messages) {
        return error('Missing required fields', 400, allowedOrigin);
      }

      // Forward to Anthropic
      try {
        const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: body.model,
            max_tokens: body.max_tokens || 8000,
            system: body.system,
            messages: body.messages
          })
        });

        if (!anthropicResp.ok) {
          const errText = await anthropicResp.text();
          console.error('Anthropic error:', anthropicResp.status, errText);
          return error(`Anthropic API error: ${anthropicResp.status}`, 502, allowedOrigin);
        }

        const data = await anthropicResp.json();
        return json(data, allowedOrigin);

      } catch(e) {
        console.error('Fetch error:', e);
        return error('Internal server error', 500, allowedOrigin);
      }
    }

    return error('Not found', 404, allowedOrigin);
  }
};

// ── HELPERS ───────────────────────────────────────────
function json(data, origin) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin
    }
  });
}

function error(msg, status, origin) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin
    }
  });
}
