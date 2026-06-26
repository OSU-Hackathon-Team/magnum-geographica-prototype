export interface ApiRequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

export class ApiClientError extends Error {
  public override readonly name = "ApiClientError";
  constructor(
    public readonly status: number,
    public readonly body: ApiError,
  ) {
    super(body.message || body.error || `HTTP ${status}`);
  }
}

export interface ApiClientConfig {
  baseUrl: string;
  fetch?: typeof fetch;
  getAdminSecret?: () => string | undefined;
  getAuthToken?: () => string | undefined;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly getAdminSecret: () => string | undefined;
  private readonly getAuthToken: () => string | undefined;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.fetchImpl = config.fetch ?? fetch.bind(globalThis);
    this.getAdminSecret = config.getAdminSecret ?? (() => undefined);
    this.getAuthToken = config.getAuthToken ?? (() => undefined);
  }

  async request<T>(method: string, path: string, options: ApiRequestOptions = {}): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      ...options.headers,
    };

    let body: BodyInit | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const adminSecret = this.getAdminSecret();
    if (adminSecret) headers["x-admin-secret"] = adminSecret;

    const authToken = this.getAuthToken();
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

    const response = await this.fetchImpl(url.toString(), {
      method,
      headers,
      body,
      signal: options.signal,
    });

    if (!response.ok) {
      let errorBody: ApiError;
      try {
        errorBody = (await response.json()) as ApiError;
      } catch {
        errorBody = { error: "unknown", message: response.statusText };
      }
      throw new ApiClientError(response.status, errorBody);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  get<T>(path: string, query?: ApiRequestOptions["query"]) {
    return this.request<T>("GET", path, query ? { query } : {});
  }
  post<T>(path: string, body?: unknown, query?: ApiRequestOptions["query"]) {
    return this.request<T>("POST", path, { body, query });
  }
  put<T>(path: string, body?: unknown) {
    return this.request<T>("PUT", path, { body });
  }
  delete<T>(path: string) {
    return this.request<T>("DELETE", path);
  }
}
