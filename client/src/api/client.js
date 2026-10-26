const API_BASE = '/api';

async function handleResponse(res) {
  if (!res.ok) {
    let errorMessage = `Request failed with status ${res.status}`;
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
  return res.json();
}

export const api = {
  // Health
  async getHealth() {
    const res = await fetch(`${API_BASE}/health`);
    return handleResponse(res);
  },

  // Overview Metrics
  async getOverview() {
    const res = await fetch(`${API_BASE}/overview`);
    return handleResponse(res);
  },

  // Endpoints
  async getEndpoints() {
    const res = await fetch(`${API_BASE}/endpoints`);
    return handleResponse(res);
  },

  async getEndpoint(id) {
    const res = await fetch(`${API_BASE}/endpoints/${id}`);
    return handleResponse(res);
  },

  async createEndpoint(data) {
    const res = await fetch(`${API_BASE}/endpoints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async updateEndpoint(id, data) {
    const res = await fetch(`${API_BASE}/endpoints/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async deleteEndpoint(id) {
    const res = await fetch(`${API_BASE}/endpoints/${id}`, {
      method: 'DELETE'
    });
    return handleResponse(res);
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
    const res = await fetch(`${API_BASE}/events${qs}`);
    return handleResponse(res);
  },

  async getEvent(id) {
    const res = await fetch(`${API_BASE}/events/${id}`);
    return handleResponse(res);
  },

  async replayEvent(id) {
    const res = await fetch(`${API_BASE}/events/${id}/replay`, {
      method: 'POST'
    });
    return handleResponse(res);
  },

  async ingestEvent(endpointId, payload, idempotencyKey = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    const res = await fetch(`${API_BASE}/endpoints/${endpointId}/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    return handleResponse(res);
  }
};
