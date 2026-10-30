const baseHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function allowedOrigins() {
  const configured = (Deno.env.get("ALLOWED_ORIGIN") || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  if (/https?:\/\/(localhost|127\.0\.0\.1|kong)(:\d+)?/i.test(supabaseUrl)) {
    configured.push("http://localhost:5173", "http://127.0.0.1:5173");
  }
  return new Set(configured);
}

export function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  const headers: Record<string, string> = { ...baseHeaders };
  if (origin && allowedOrigins().has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function isAllowedOrigin(origin: string | null) {
  return !origin || allowedOrigins().has(origin);
}

export function preflight(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) return new Response("Origin not allowed", { status: 403 });
  return new Response("ok", { status: 204, headers: corsHeaders(request) });
}

export function jsonResponse(request: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function rejectOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return isAllowedOrigin(origin) ? null : jsonResponse(request, { error: "Origin is not allowed." }, 403);
}
