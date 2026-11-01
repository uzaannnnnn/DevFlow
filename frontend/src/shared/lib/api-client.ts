import { config } from './config';

/**
 * Standard DevFlow API success response envelope.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  meta: {
    page?: number;
    page_size?: number;
    total?: number;
  } | null;
}

/**
 * Field-level error validation detail.
 */
export interface ApiErrorDetail {
  field?: string;
  message: string;
}

/**
 * Standard DevFlow API error payload.
 */
export interface ApiError {
  code: string;
  message: string;
  details: ApiErrorDetail[];
}

/**
 * Standard DevFlow API error response envelope.
 */
export interface ApiErrorEnvelope {
  success: false;
  error: ApiError;
}

/**
 * Custom error thrown on non-2xx responses or network failure.
 */
export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details: ApiErrorDetail[];

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = error.code;
    this.details = error.details || [];
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

// In-memory access token storage (NEVER in localStorage/sessionStorage)
let inMemoryAccessToken: string | null = null;

export const setAuthToken = (token: string | null): void => {
  inMemoryAccessToken = token;
};

export const getAuthToken = (): string | null => {
  return inMemoryAccessToken;
};

/**
 * Builds the full URL including query parameters.
 */
function buildUrl(endpoint: string, params?: Record<string, string | number | boolean | undefined>): string {
  let base: string;
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    base = endpoint;
  } else {
    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    if (cleanEndpoint.startsWith('health')) {
      base = `${config.backendUrl}/${cleanEndpoint}`;
    } else if (cleanEndpoint.startsWith('api/v1/')) {
      base = `${config.backendUrl}/${cleanEndpoint}`;
    } else {
      base = `${config.apiUrl.replace(/\/+$/, '')}/${cleanEndpoint}`;
    }
  }

  if (!params) {
    return base;
  }

  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.append(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Core fetch wrapper with JSON serialization, error envelope parsing, in-memory auth injection, and credentials.
 */
async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const { params, body, headers, ...customOptions } = options;
  const url = buildUrl(endpoint, params);

  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(headers as Record<string, string>),
  };

  // Inject in-memory access token if available and not explicitly overridden
  if (inMemoryAccessToken && !requestHeaders['Authorization']) {
    requestHeaders['Authorization'] = `Bearer ${inMemoryAccessToken}`;
  }

  let serializedBody: BodyInit | undefined;
  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
    serializedBody = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...customOptions,
      headers: requestHeaders,
      body: serializedBody,
      credentials: 'include', // Includes HttpOnly refresh cookies
    });
  } catch (err: unknown) {
    throw new ApiClientError(0, {
      code: 'NETWORK_ERROR',
      message: err instanceof Error ? err.message : 'Unable to connect to the server',
      details: [],
    });
  }

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');

  if (!response.ok) {
    if (isJson) {
      try {
        const errorBody = (await response.json()) as ApiErrorEnvelope;
        if (errorBody && errorBody.error) {
          throw new ApiClientError(response.status, errorBody.error);
        }
      } catch (e) {
        if (e instanceof ApiClientError) {
          throw e;
        }
      }
    }
    throw new ApiClientError(response.status, {
      code: `HTTP_${response.status}`,
      message: response.statusText || 'An unexpected HTTP error occurred',
      details: [],
    });
  }

  if (isJson) {
    return (await response.json()) as ApiResponse<T>;
  }

  return {
    success: true,
    data: (await response.text()) as unknown as T,
    meta: null,
  };
}

/**
 * DevFlow API Client
 */
export const apiClient = {
  get: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'POST', body }),

  patch: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'PATCH', body }),

  delete: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),
};
