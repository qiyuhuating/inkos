import { ProxyAgent } from "undici";

type ProxyEnv = Record<string, string | undefined>;
type FetchInitWithDispatcher = RequestInit & { dispatcher?: unknown };

// Direct fetch uses the process-wide Undici pool. Proxy requests need a
// shared dispatcher as well; otherwise every model call creates a new pool.
const proxyDispatchers = new Map<string, ProxyAgent>();
const MAX_PROXY_DISPATCHERS = 8;

function proxyDispatcher(url: string): ProxyAgent {
  let dispatcher = proxyDispatchers.get(url);
  if (dispatcher) {
    proxyDispatchers.delete(url);
  } else {
    dispatcher = new ProxyAgent(url);
    if (proxyDispatchers.size >= MAX_PROXY_DISPATCHERS) {
      const oldest = proxyDispatchers.keys().next().value!;
      const evicted = proxyDispatchers.get(oldest)!;
      proxyDispatchers.delete(oldest);
      // Graceful close waits for outstanding requests.
      void evicted.close().catch(() => undefined);
    }
  }
  proxyDispatchers.set(url, dispatcher);
  return dispatcher;
}

export function resolveProxyUrl(explicitProxyUrl?: string, env: ProxyEnv = process.env): string | undefined {
  const candidate = [
    explicitProxyUrl,
    env.INKOS_LLM_PROXY_URL,
    env.HTTPS_PROXY,
    env.https_proxy,
    env.HTTP_PROXY,
    env.http_proxy,
  ].find((value) => typeof value === "string" && value.trim().length > 0)?.trim();

  if (!candidate) return undefined;
  const parsed = new URL(candidate);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported proxy protocol: ${parsed.protocol}`);
  }
  return candidate;
}

export function buildProxyFetchInit(
  init: RequestInit = {},
  explicitProxyUrl?: string,
  env: ProxyEnv = process.env,
): FetchInitWithDispatcher {
  const proxyUrl = resolveProxyUrl(explicitProxyUrl, env);
  if (!proxyUrl) return init;
  return {
    ...init,
    dispatcher: proxyDispatcher(proxyUrl),
  };
}

export function fetchWithProxy(
  input: Parameters<typeof fetch>[0],
  init: RequestInit = {},
  explicitProxyUrl?: string,
  env: ProxyEnv = process.env,
): ReturnType<typeof fetch> {
  return fetch(input, buildProxyFetchInit(init, explicitProxyUrl, env));
}
