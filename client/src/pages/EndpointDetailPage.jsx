import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Globe,
  Copy,
  Check,
  Power,
  Trash2,
  Edit2,
  Send,
  ExternalLink,
  Radio,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { api, getApiRootUrl } from '../api/client';
import { StatusBadge, HttpBadge } from '../components/StatusBadge';
import { CodeBlock } from '../components/CodeBlock';
import { Modal } from '../components/Modal';
import { useToast } from '../components/ToastContext';
import { formatDate, formatTimeAgo } from '../lib/utils';

export function EndpointDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [copiedId, setCopiedId] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSendEventOpen, setIsSendEventOpen] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editRetries, setEditRetries] = useState(5);

  // Send event form state
  const [eventType, setEventType] = useState('payment.completed');
  const [eventData, setEventData] = useState('{\n  "payment_id": "pay_sample_123",\n  "amount": 4900,\n  "currency": "usd"\n}');
  const [isSending, setIsSending] = useState(false);

  // Fetch Endpoint details
  const { data: endpoint, isLoading, isError, error } = useQuery({
    queryKey: ['endpoint', id],
    queryFn: () => api.getEndpoint(id)
  });

  // Fetch Events for this specific endpoint
  const { data: eventsData, isLoading: isLoadingEvents } = useQuery({
    queryKey: ['events', { endpointId: id, limit: 15 }],
    queryFn: () => api.getEvents({ endpointId: id, limit: 15 }),
    refetchInterval: 3000
  });

  // Toggle Endpoint Enabled state
  const toggleMutation = useMutation({
    mutationFn: (enabled) => api.updateEndpoint(id, { enabled }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['endpoint', id] });
      queryClient.invalidateQueries({ queryKey: ['endpoints'] });
      toast.info(`Endpoint is now ${data.enabled ? 'enabled' : 'disabled'}`);
    },
    onError: (err) => toast.error(err.message || 'Failed to update endpoint')
  });

  // Edit Endpoint
  const editMutation = useMutation({
    mutationFn: (data) => api.updateEndpoint(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['endpoint', id] });
      queryClient.invalidateQueries({ queryKey: ['endpoints'] });
      setIsEditOpen(false);
      toast.success('Endpoint updated successfully');
    },
    onError: (err) => toast.error(err.message || 'Failed to update endpoint')
  });

  // Delete Endpoint
  const deleteMutation = useMutation({
    mutationFn: () => api.deleteEndpoint(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['endpoints'] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      if (data.action === 'disabled') {
        toast.info(data.message);
        queryClient.invalidateQueries({ queryKey: ['endpoint', id] });
      } else {
        toast.success('Endpoint deleted successfully');
        navigate('/endpoints');
      }
    },
    onError: (err) => toast.error(err.message || 'Failed to delete endpoint')
  });

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {}
  };

  const handleOpenEdit = () => {
    if (endpoint) {
      setEditName(endpoint.name);
      setEditUrl(endpoint.destinationUrl);
      setEditRetries(endpoint.maxRetries);
      setIsEditOpen(true);
    }
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    editMutation.mutate({
      name: editName,
      destinationUrl: editUrl,
      maxRetries: parseInt(editRetries, 10)
    });
  };

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete "${endpoint.name}"? If it has historical events, it will be safely disabled.`)) {
      deleteMutation.mutate();
    }
  };

  const handleSendEvent = async (e) => {
    e.preventDefault();
    let parsedData;
    try {
      parsedData = JSON.parse(eventData);
    } catch {
      toast.error('Event data must be valid JSON');
      return;
    }

    try {
      setIsSending(true);
      const res = await api.ingestEvent(id, {
        event_type: eventType,
        data: parsedData
      });
      toast.success(`Event ${res.event_id} queued for delivery!`);
      setIsSendEventOpen(false);
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      queryClient.invalidateQueries({ queryKey: ['endpoint', id] });
    } catch (err) {
      toast.error(err.message || 'Failed to send event');
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500 font-mono text-xs">
        <div className="animate-spin mr-2 h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full" />
        Loading endpoint details...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <Link to="/endpoints" className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Endpoints
        </Link>
        <div className="p-4 rounded-xl border border-rose-900/60 bg-rose-950/20 text-rose-300 text-xs font-mono">
          Failed to load endpoint: {error.message}
        </div>
      </div>
    );
  }

  const events = eventsData?.events || [];
  const apiRoot = getApiRootUrl();

  const curlExample = `curl -X POST ${apiRoot}/api/endpoints/${endpoint.id}/events \\
  -H "Content-Type: application/json" \\
  -d '{
    "event_type": "payment.completed",
    "data": {
      "order_id": "ord_101",
      "amount": 4900,
      "currency": "usd"
    }
  }'`;

  const pwshExample = `Invoke-RestMethod -Uri "${apiRoot}/api/endpoints/${endpoint.id}/events" \`
  -Method Post \`
  -ContentType "application/json" \`
  -Body '{"event_type": "payment.completed", "data": {"order_id": "ord_101", "amount": 4900, "currency": "usd"}}'`;

  return (
    <div className="space-y-8 max-w-6xl pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/endpoints"
            className="p-1.5 rounded-lg border border-card-border hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-slate-100">{endpoint.name}</h2>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium border ${
                  endpoint.enabled
                    ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-400'
                    : 'bg-slate-900 border-slate-700 text-slate-400'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${endpoint.enabled ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                {endpoint.enabled ? 'ENABLED' : 'DISABLED'}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-xs text-slate-400">{endpoint.id}</span>
              <button
                onClick={handleCopyId}
                className="text-slate-500 hover:text-slate-300 p-0.5"
                title="Copy Endpoint ID"
              >
                {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSendEventOpen(true)}
            disabled={!endpoint.enabled}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send Event</span>
          </button>

          <button
            onClick={handleOpenEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-card-border bg-[#0d111a] hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>

          <button
            onClick={() => toggleMutation.mutate(!endpoint.enabled)}
            className={`p-1.5 rounded-lg border transition-colors ${
              endpoint.enabled
                ? 'border-card-border text-slate-400 hover:text-amber-400 hover:border-amber-800/50'
                : 'border-emerald-800/60 text-emerald-400 hover:bg-emerald-950/30'
            }`}
            title={endpoint.enabled ? 'Disable Endpoint' : 'Enable Endpoint'}
          >
            <Power className="w-4 h-4" />
          </button>

          <button
            onClick={handleDelete}
            className="p-1.5 rounded-lg border border-card-border text-slate-400 hover:text-rose-400 hover:border-rose-800/50 hover:bg-rose-950/20 transition-colors"
            title="Delete Endpoint"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Configuration Metadata Grid */}
      <div className="p-4 rounded-xl border border-card-border bg-[#0d111a] grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
        <div className="md:col-span-2">
          <span className="text-slate-500 block mb-1">Destination URL</span>
          <a
            href={endpoint.destinationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-indigo-400 hover:underline flex items-center gap-1.5 truncate"
          >
            <span className="truncate">{endpoint.destinationUrl}</span>
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        </div>

        <div>
          <span className="text-slate-500 block mb-1">Max Retries</span>
          <span className="font-mono text-slate-200 font-semibold">{endpoint.maxRetries} attempts</span>
        </div>

        <div>
          <span className="text-slate-500 block mb-1">Total Events</span>
          <span className="font-mono text-slate-200 font-semibold">{endpoint._count?.events ?? events.length}</span>
        </div>

        <div>
          <span className="text-slate-500 block mb-1">Created At</span>
          <span className="font-mono text-slate-300">{formatDate(endpoint.createdAt)}</span>
        </div>

        <div>
          <span className="text-slate-500 block mb-1">Updated At</span>
          <span className="font-mono text-slate-300">{formatDate(endpoint.updatedAt)}</span>
        </div>
      </div>

      {/* Integration Code Examples */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
          Event Ingestion Example for this Endpoint
        </h3>
        <p className="text-xs text-slate-400">
          Use the real endpoint ID <code className="text-indigo-300 font-mono bg-indigo-950/60 px-1 py-0.5 rounded">{endpoint.id}</code> to send events directly to this destination:
        </p>

        <div className="grid grid-cols-1 gap-3">
          <CodeBlock code={curlExample} language="bash" title="Submit Webhook Event (Bash / curl)" />
          <CodeBlock code={pwshExample} language="powershell" title="Submit Webhook Event (Windows PowerShell)" />
        </div>
      </div>

      {/* Related Events Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
            Recent Events for this Endpoint ({events.length})
          </h3>
        </div>

        {events.length === 0 ? (
          <div className="p-8 text-center rounded-xl border border-card-border bg-[#0d111a] text-slate-500 text-xs font-mono space-y-2">
            <Radio className="w-8 h-8 text-slate-600 mx-auto" />
            <p>No events submitted to this endpoint yet.</p>
            <button
              onClick={() => setIsSendEventOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send First Event</span>
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-card-border bg-[#0d111a] overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-card-border/80 bg-[#111624] text-slate-400 font-mono">
                  <th className="py-3 px-4 font-medium">Event ID</th>
                  <th className="py-3 px-4 font-medium">Event Type</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">Attempts</th>
                  <th className="py-3 px-4 font-medium">Last HTTP</th>
                  <th className="py-3 px-4 font-medium">Latency</th>
                  <th className="py-3 px-4 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border/40 font-mono">
                {events.map((evt) => (
                  <tr
                    key={evt.id}
                    onClick={() => navigate(`/events/${evt.id}`)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 text-indigo-400 font-semibold">
                      {evt.id}
                    </td>
                    <td className="py-3 px-4 font-sans font-medium text-slate-200">
                      {evt.eventType}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={evt.status} size="sm" />
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {evt.attempts} / {evt.maxRetries}
                    </td>
                    <td className="py-3 px-4">
                      <HttpBadge statusCode={evt.lastStatusCode} />
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {evt.lastLatencyMs != null ? `${evt.lastLatencyMs}ms` : '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      {formatTimeAgo(evt.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Endpoint Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Webhook Endpoint"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Endpoint Name
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full bg-[#0d111a] border border-card-border rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Destination URL
            </label>
            <input
              type="url"
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              className="w-full bg-[#0d111a] border border-card-border rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Max Retry Attempts
            </label>
            <input
              type="number"
              min={0}
              max={20}
              value={editRetries}
              onChange={(e) => setEditRetries(e.target.value)}
              className="w-full bg-[#0d111a] border border-card-border rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsEditOpen(false)}
              className="px-4 py-2 rounded-lg border border-card-border text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={editMutation.isPending}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-medium text-white transition-colors"
            >
              {editMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Send Event Modal */}
      <Modal
        isOpen={isSendEventOpen}
        onClose={() => setIsSendEventOpen(false)}
        title={`Send Webhook Event to ${endpoint.name}`}
      >
        <form onSubmit={handleSendEvent} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Event Type
            </label>
            <input
              type="text"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              placeholder="e.g. payment.completed"
              className="w-full bg-[#0d111a] border border-card-border rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Payload JSON (Data)
            </label>
            <textarea
              rows={5}
              value={eventData}
              onChange={(e) => setEventData(e.target.value)}
              className="w-full bg-[#0d111a] border border-card-border rounded-lg p-3 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsSendEventOpen(false)}
              className="px-4 py-2 rounded-lg border border-card-border text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSending}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-medium text-white transition-colors"
            >
              {isSending ? 'Enqueueing...' : 'Enqueue Event'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
