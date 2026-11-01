import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiClientError } from './api-client';

describe('apiClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('performs successful GET request and unpacks envelope', async () => {
    const mockResponse = {
      success: true,
      data: { status: 'healthy', version: '0.1.0' },
      meta: null,
    };

    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => mockResponse,
    });

    const result = await apiClient.get<{ status: string; version: string }>('health');

    expect(result.success).toBe(true);
    expect(result.data.status).toBe('healthy');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/health'),
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
      })
    );
  });

  it('throws ApiClientError with standard envelope details on 4xx/5xx', async () => {
    const mockErrorEnvelope = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: [{ field: 'email', message: 'Email is required' }],
      },
    };

    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: { get: () => 'application/json' },
      json: async () => mockErrorEnvelope,
    });

    await expect(apiClient.post('users', { name: 'Test' })).rejects.toThrow(
      ApiClientError
    );

    try {
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: { get: () => 'application/json' },
        json: async () => mockErrorEnvelope,
      });
      await apiClient.post('users', { name: 'Test' });
    } catch (err: unknown) {
      const apiErr = err as ApiClientError;
      expect(apiErr.status).toBe(400);
      expect(apiErr.code).toBe('VALIDATION_ERROR');
      expect(apiErr.message).toBe('Invalid request payload');
      expect(apiErr.details).toHaveLength(1);
      expect(apiErr.details[0].field).toBe('email');
    }
  });

  it('handles network connectivity failure safely', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new TypeError('Failed to fetch')
    );

    try {
      await apiClient.get('health');
      expect.fail('Should have thrown an error');
    } catch (err: unknown) {
      const apiErr = err as ApiClientError;
      expect(apiErr.status).toBe(0);
      expect(apiErr.code).toBe('NETWORK_ERROR');
      expect(apiErr.message).toBe('Failed to fetch');
    }
  });

  it('appends query parameters correctly', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true, data: [], meta: null }),
    });

    await apiClient.get('tasks', {
      params: { page: 1, limit: 10, filter: 'todo' },
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/[?&]page=1/),
      expect.anything()
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/[?&]limit=10/),
      expect.anything()
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/[?&]filter=todo/),
      expect.anything()
    );
  });
});
