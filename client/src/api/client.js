// Centralized API Client for HookRelay
const rawBase = import.meta.env.VITE_API_BASE_URL || '';
export const API_BASE = rawBase ? `${rawBase.replace(/\/+$/, '')}/api` : '/api';

/**
 * Returns the public root URL of the API for integration examples.
 */
export function getApiRootUrl() {
  if (rawBase) {
    return rawBase.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:4000';
}

/**
 * Generic fetch wrapper with timeout and standardized error extraction.
 */
async function request(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      let errorMessage = `HTTP ${res.status}: ${res.statusText || 'Request failed'}`;
      try {
        const errorJson = await res.json();
        if (errorJson.error) {
          errorMessage = errorJson.error;
        }
        if (errorJson.details && Array.isArray(errorJson.details)) {
          errorMessage += `: ${errorJson.details.map((d) => d.message || d.path).join(', ')}`;
        }
      } catch {
        // Non-JSON response
      }
      const err = new Error(errorMessage);
      err.status = res.status;
      throw err;
    }

    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      const timeoutErr = new Error(`Request timed out after ${timeoutMs}ms`);
      timeoutErr.status = 408;
      throw timeoutErr;
    }
    throw err;
  }
}

export const api = {
  // Health
  async getHealth() {
    return request(`${API_BASE}/health`, { method: 'GET' }, 8000);
  },

  // Overview Metrics
  async getOverview() {
    return request(`${API_BASE}/overview`, { method: 'GET' });
  },

  // Endpoints
  async getEndpoints() {
    return request(`${API_BASE}/endpoints`, { method: 'GET' });
  },

  async getEndpoint(id) {
    return request(`${API_BASE}/endpoints/${id}`, { method: 'GET' });
  },

  async createEndpoint(data) {
    return request(`${API_BASE}/endpoints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },

  async updateEndpoint(id, data) {
    return request(`${API_BASE}/endpoints/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },

  async deleteEndpoint(id) {
    return request(`${API_BASE}/endpoints/${id}`, {
      method: 'DELETE'
    });
  },

  // Events
  async getEvents(params = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.status && params.status !== 'ALL') query.set('status', params.status);
    if (params.endpointId) query.set('endpointId', params.endpointId);
    if (params.eventType) query.set('eventType', params.eventType);

    const qs = query.toString() ? `?${query.toString()}` : '';
    return request(`${API_BASE}/events${qs}`, { method: 'GET' });
  },

  async getEvent(id) {
    return request(`${API_BASE}/events/${id}`, { method: 'GET' });
  },

  async replayEvent(id) {
    return request(`${API_BASE}/events/${id}/replay`, {
      method: 'POST'
    });
  },

  async ingestEvent(endpointId, payload, idempotencyKey = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    return request(`${API_BASE}/endpoints/${endpointId}/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }
};
