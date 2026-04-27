"use client";

import { useState } from "react";

/* ------------------------------------------------------------------ */
/*  API definitions                                                    */
/* ------------------------------------------------------------------ */

type Param = { name: string; placeholder: string; required?: boolean };

type ApiDef = {
  id: string;
  method: "GET" | "POST";
  path: string;
  description: string;
  category: string;
  params?: Param[];          // query params for GET
  bodyTemplate?: string;     // JSON template for POST
  contentType?: string;      // override content-type
};

const APIS: ApiDef[] = [
  // ── Boot / Config ──────────────────────────────────────────────────
  {
    id: "get-operators",
    method: "GET",
    path: "/api/operators",
    description: "Fetch all active operators (id, name, role)",
    category: "Boot / Config",
  },
  {
    id: "get-parts",
    method: "GET",
    path: "/api/parts",
    description: "Fetch parts list, optionally filtered by machine",
    category: "Boot / Config",
    params: [{ name: "machine_id", placeholder: "JYOTI-01" }],
  },
  {
    id: "get-machine-config",
    method: "GET",
    path: "/api/machine/config",
    description: "Fetch machine configuration (shifts, lunch, etc.)",
    category: "Boot / Config",
    params: [{ name: "machine_id", placeholder: "JYOTI-01", required: true }],
  },
  // ── Auth ────────────────────────────────────────────────────────────
  {
    id: "post-auth-login",
    method: "POST",
    path: "/api/auth/login",
    description: "Log an operator into a machine for a shift",
    category: "Auth",
    bodyTemplate: JSON.stringify(
      {
        operator_id: "OP-RK-042",
        machine_id: "JYOTI-01",
        shift: "A",
        ts: new Date().toISOString(),
      },
      null,
      2
    ),
  },
  // ── Events ──────────────────────────────────────────────────────────
  {
    id: "post-event",
    method: "POST",
    path: "/api/events",
    description: "Ingest a single machine event (idempotent on event_id)",
    category: "Events",
    bodyTemplate: JSON.stringify(
      {
        event_id: "00000000-0000-0000-0000-000000000000",
        machine_id: "JYOTI-01",
        event_type: "CYCLE_START",
        timestamp: new Date().toISOString(),
        payload: { cycle: 1 },
      },
      null,
      2
    ),
  },
  {
    id: "get-events",
    method: "GET",
    path: "/api/events",
    description: "Fetch recent events for a machine",
    category: "Events",
    params: [
      { name: "machine_id", placeholder: "JYOTI-01", required: true },
      { name: "limit", placeholder: "100" },
    ],
  },
  {
    id: "post-events-batch",
    method: "POST",
    path: "/api/events/batch",
    description: "Batch sync up to 500 queued events (offline → online)",
    category: "Events",
    bodyTemplate: JSON.stringify(
      {
        events: [
          {
            event_id: "00000000-0000-0000-0000-000000000001",
            machine_id: "JYOTI-01",
            event_type: "CYCLE_START",
            timestamp: new Date().toISOString(),
            payload: { cycle: 1, _queued: 1 },
          },
        ],
      },
      null,
      2
    ),
  },
  // ── Images ──────────────────────────────────────────────────────────
  {
    id: "get-images",
    method: "GET",
    path: "/api/images",
    description: "List uploaded machine images",
    category: "Images",
    params: [
      { name: "machine_id", placeholder: "JYOTI-01" },
      { name: "limit", placeholder: "50" },
    ],
  },
  // ── Health ──────────────────────────────────────────────────────────
  {
    id: "get-health",
    method: "GET",
    path: "/api/health",
    description: "Health check endpoint",
    category: "Health",
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

type ApiResult = {
  status: number;
  statusText: string;
  body: string;
  latency: number;
};

export default function ApiExplorer() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const categories = [...new Set(APIS.map((a) => a.category))];

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-200 font-sans">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[10px] tracking-[3px] text-red-500 font-semibold uppercase">
              Codespire QualityOS
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              API Explorer
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-500 font-mono">
              Bearer Token
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="DEVICE_API_KEY"
                className="bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm font-mono text-neutral-300 w-64 pr-16 placeholder:text-neutral-600 focus:outline-none focus:border-red-500"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-neutral-500 hover:text-neutral-300 px-2 py-0.5 rounded bg-neutral-700/50"
              >
                {showKey ? "HIDE" : "SHOW"}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">
        {!apiKey && (
          <div className="rounded-md border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-400 font-mono">
            Enter your DEVICE_API_KEY above to make authenticated API calls.
          </div>
        )}

        {categories.map((cat) => (
          <section key={cat}>
            <h2 className="text-xs font-semibold uppercase tracking-[2px] text-neutral-500 mb-4 border-b border-neutral-800 pb-2">
              {cat}
            </h2>
            <div className="space-y-4">
              {APIS.filter((a) => a.category === cat).map((api) => (
                <ApiCard key={api.id} api={api} apiKey={apiKey} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="max-w-6xl mx-auto px-6 py-8 text-xs text-neutral-600 font-mono border-t border-neutral-800">
        OEE MES API Explorer &middot; Dynatech &times; Codespire
      </footer>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  Single API card                                                    */
/* ------------------------------------------------------------------ */

function ApiCard({ api, apiKey }: { api: ApiDef; apiKey: string }) {
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [body, setBody] = useState(api.bodyTemplate ?? "");
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function execute() {
    setLoading(true);
    setResult(null);
    setExpanded(true);

    const start = performance.now();
    try {
      let url = api.path;
      if (api.method === "GET" && api.params) {
        const qs = api.params
          .map((p) => {
            const v = paramValues[p.name]?.trim();
            return v ? `${p.name}=${encodeURIComponent(v)}` : null;
          })
          .filter(Boolean)
          .join("&");
        if (qs) url += "?" + qs;
      }

      const headers: Record<string, string> = {};
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      if (api.method === "POST") headers["Content-Type"] = "application/json";

      const res = await fetch(url, {
        method: api.method,
        headers,
        body: api.method === "POST" ? body : undefined,
      });

      const latency = Math.round(performance.now() - start);
      let responseBody: string;
      try {
        const json = await res.json();
        responseBody = JSON.stringify(json, null, 2);
      } catch {
        responseBody = await res.text();
      }

      setResult({
        status: res.status,
        statusText: res.statusText,
        body: responseBody,
        latency,
      });
    } catch (err) {
      setResult({
        status: 0,
        statusText: "Network Error",
        body: err instanceof Error ? err.message : String(err),
        latency: Math.round(performance.now() - start),
      });
    } finally {
      setLoading(false);
    }
  }

  const isGet = api.method === "GET";
  const methodColor = isGet
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    : "bg-red-500/15 text-red-400 border-red-500/30";
  const statusColor =
    result && result.status >= 200 && result.status < 300
      ? "text-emerald-400"
      : result && result.status >= 400
      ? "text-red-400"
      : "text-amber-400";

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded border ${methodColor} font-mono`}
        >
          {api.method}
        </span>
        <code className="text-sm text-neutral-300 font-mono flex-1">
          {api.path}
        </code>
        <span className="text-xs text-neutral-500 hidden sm:inline">
          {api.description}
        </span>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-neutral-600 hover:text-neutral-300 text-sm ml-2"
        >
          {expanded ? "▾" : "▸"}
        </button>
      </div>

      {/* Expandable body */}
      {expanded && (
        <div className="border-t border-neutral-800 px-4 py-4 space-y-4">
          <p className="text-xs text-neutral-500 sm:hidden">{api.description}</p>

          {/* Query params for GET */}
          {isGet && api.params && (
            <div className="space-y-2">
              <div className="text-[10px] tracking-[1.5px] text-neutral-500 font-semibold uppercase">
                Query Parameters
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {api.params.map((p) => (
                  <div key={p.name} className="flex items-center gap-2">
                    <label className="text-xs font-mono text-neutral-400 w-28 flex-shrink-0">
                      {p.name}
                      {p.required && (
                        <span className="text-red-500 ml-0.5">*</span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={paramValues[p.name] ?? ""}
                      onChange={(e) =>
                        setParamValues((prev) => ({
                          ...prev,
                          [p.name]: e.target.value,
                        }))
                      }
                      placeholder={p.placeholder}
                      className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm font-mono text-neutral-300 flex-1 placeholder:text-neutral-600 focus:outline-none focus:border-red-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Body editor for POST */}
          {!isGet && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] tracking-[1.5px] text-neutral-500 font-semibold uppercase">
                  Request Body (JSON)
                </div>
                {api.bodyTemplate && (
                  <button
                    type="button"
                    onClick={() => {
                      // Reset with fresh UUIDs / timestamps
                      const fresh = api.bodyTemplate!
                        .replace(
                          /00000000-0000-0000-0000-000000000000/g,
                          crypto.randomUUID()
                        )
                        .replace(
                          /00000000-0000-0000-0000-000000000001/g,
                          crypto.randomUUID()
                        )
                        .replace(
                          /"timestamp":\s*"[^"]*"/g,
                          `"timestamp": "${new Date().toISOString()}"`
                        )
                        .replace(
                          /"ts":\s*"[^"]*"/g,
                          `"ts": "${new Date().toISOString()}"`
                        );
                      setBody(fresh);
                    }}
                    className="text-[10px] text-neutral-500 hover:text-red-400 font-mono"
                  >
                    RESET + NEW IDs
                  </button>
                )}
              </div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={Math.min(body.split("\n").length + 1, 20)}
                className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-sm font-mono text-neutral-300 resize-y focus:outline-none focus:border-red-500"
                spellCheck={false}
              />
            </div>
          )}

          {/* Execute button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={execute}
              disabled={loading}
              className="bg-red-600 hover:bg-red-700 disabled:bg-neutral-700 disabled:text-neutral-500 text-white text-sm font-semibold px-5 py-2 rounded transition"
            >
              {loading ? "Sending..." : `Send ${api.method}`}
            </button>
            {result && (
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className={statusColor}>
                  {result.status} {result.statusText}
                </span>
                <span className="text-neutral-600">{result.latency}ms</span>
              </div>
            )}
          </div>

          {/* Response */}
          {result && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] tracking-[1.5px] text-neutral-500 font-semibold uppercase">
                  Response
                </div>
                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard.writeText(result.body)
                  }
                  className="text-[10px] text-neutral-500 hover:text-red-400 font-mono"
                >
                  COPY
                </button>
              </div>
              <pre
                className={`bg-neutral-950 border rounded px-3 py-2 text-xs font-mono overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap break-words ${
                  result.status >= 200 && result.status < 300
                    ? "border-emerald-900/50 text-emerald-300/80"
                    : "border-red-900/50 text-red-300/80"
                }`}
              >
                {result.body}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
