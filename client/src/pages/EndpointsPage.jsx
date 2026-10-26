import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Globe,
  Copy,
  Check,
  Power,
  Trash2,
  AlertTriangle,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { api } from '../api/client';
import { Modal } from '../components/Modal';
import { CodeBlock } from '../components/CodeBlock';
import { useToast } from '../components/ToastContext';
import { formatDate } from '../lib/utils';

export function EndpointsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createdSecretData, setCreatedSecretData] = useState(null);
  const [name, setName] = useState('');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [maxRetries, setMaxRetries] = useState(5);
  const [copiedId, setCopiedId] = useState(null);

  // Fetch endpoints
  const { data: endpoints = [], isLoading, isError, error } = useQuery({
    queryKey: ['endpoints'],
    queryFn: () => api.getEndpoints()
  });

  // Create Endpoint mutation
  const createMutation = useMutation({
    mutationFn: (data) => api.createEndpoint(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['endpoints'] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      setIsCreateOpen(false);
      setName('');
      setDestinationUrl('');
      setMaxRetries(5);
      // Show created secret modal
      setCreatedSecretData(data);
      toast.success(`Endpoint "${data.name}" created successfully!`);
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to create endpoint');
    }
  });

  // Toggle Endpoint Enabled state
  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }) => api.updateEndpoint(id, { enabled }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['endpoints'] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      toast.info(`Endpoint "${data.name}" is now ${data.enabled ? 'enabled' : 'disabled'}`);
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to update endpoint');
    }
  });

  // Delete Endpoint
  const deleteMutation = useMutation({
    mutationFn: (id) => api.deleteEndpoint(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['endpoints'] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      if (data.action === 'disabled') {
        toast.info(data.message);
      } else {
        toast.success('Endpoint deleted successfully');
      }
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to delete endpoint');
    }
  });

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate({
      name,
      destinationUrl,
      maxRetries: parseInt(maxRetries, 10)
    });
  };

  const handleCopyId = async (id) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const handleDelete = (endpoint) => {
    if (confirm(`Are you sure you want to delete "${endpoint.name}"? If it has historical events, it will be disabled to preserve history.`)) {
      deleteMutation.mutate(endpoint.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Create Action */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Registered Endpoints</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure destination URLs and signing secrets for webhook deliveries.
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Endpoint</span>
        </button>
      </div>

      {/* Endpoints Table / Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-500 font-mono text-xs">
          <div className="animate-spin mr-2 h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full" />
          Loading endpoints...
        </div>
      ) : isError ? (
        <div className="p-4 rounded-xl border border-rose-900/60 bg-rose-950/20 text-rose-300 text-xs">
          Failed to load endpoints: {error.message}
        </div>
      ) : endpoints.length === 0 ? (
        <div className="p-12 text-center rounded-xl border border-card-border bg-[#0d111a] space-y-3">
          <Globe className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-200">No endpoints registered</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Create your first endpoint to start receiving and delivering webhook events.
          </p>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Endpoint</span>
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-card-border bg-[#0d111a] overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-card-border/80 bg-[#111624] text-slate-400 font-mono">
                <th className="py-3 px-4 font-medium">Name</th>
                <th className="py-3 px-4 font-medium">Destination URL</th>
                <th className="py-3 px-4 font-medium">Endpoint ID</th>
                <th className="py-3 px-4 font-medium">Max Retries</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium">Events</th>
                <th className="py-3 px-4 font-medium">Created</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border/40">
              {endpoints.map((ep) => (
                <tr key={ep.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-4 font-medium text-slate-200">
                    {ep.name}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-300 max-w-xs truncate" title={ep.destinationUrl}>
                    {ep.destinationUrl}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-400">
                    <button
                      onClick={() => handleCopyId(ep.id)}
                      className="inline-flex items-center gap-1.5 hover:text-slate-200 bg-slate-900/60 px-2 py-0.5 rounded border border-card-border/60 transition-colors"
                      title="Copy endpoint ID"
                    >
                      <span>{ep.id.slice(0, 10)}...</span>
                      {copiedId === ep.id ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3 text-slate-500" />
                      )}
                    </button>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-300">
                    {ep.maxRetries}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium border ${
                        ep.enabled
                          ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-400'
                          : 'bg-slate-900 border-slate-700 text-slate-400'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${ep.enabled ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                      {ep.enabled ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-300">
                    {ep._count?.events ?? 0}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                    {formatDate(ep.createdAt)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => toggleMutation.mutate({ id: ep.id, enabled: !ep.enabled })}
                        className={`p-1.5 rounded-md border transition-colors ${
                          ep.enabled
                            ? 'border-card-border text-slate-400 hover:text-amber-400 hover:border-amber-800/50 hover:bg-amber-950/20'
                            : 'border-emerald-800/50 text-emerald-400 hover:bg-emerald-950/30'
                        }`}
                        title={ep.enabled ? 'Disable endpoint' : 'Enable endpoint'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(ep)}
                        className="p-1.5 rounded-md border border-card-border text-slate-400 hover:text-rose-400 hover:border-rose-800/50 hover:bg-rose-950/20 transition-colors"
                        title="Delete endpoint"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Endpoint Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Register New Webhook Endpoint"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Endpoint Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Stripe Webhook Receiver"
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
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
              placeholder="https://api.example.com/webhooks"
              className="w-full bg-[#0d111a] border border-card-border rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
              required
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Must be http:// or https://. Outbound SSRF restrictions apply.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Max Retry Attempts
            </label>
            <input
              type="number"
              min={0}
              max={20}
              value={maxRetries}
              onChange={(e) => setMaxRetries(e.target.value)}
              className="w-full bg-[#0d111a] border border-card-border rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
              required
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Number of automatic retry attempts before marking the event as FAILED.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="px-4 py-2 rounded-lg border border-card-border text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-medium text-white transition-colors"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Endpoint'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Secret Display Modal (Shown only once after creation) */}
      <Modal
        isOpen={!!createdSecretData}
        onClose={() => setCreatedSecretData(null)}
        title="Signing Secret Generated"
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-lg border border-amber-800/80 bg-amber-950/30 text-amber-300 text-xs flex gap-3 items-start">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-1">Important: Save your signing secret now</p>
              <p className="text-amber-300/80">
                This secret is used to generate HMAC-SHA256 signatures for outgoing webhooks. For security, it will <strong>never</strong> be displayed again.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Endpoint ID
            </label>
            <div className="font-mono text-xs bg-[#0d111a] border border-card-border p-2.5 rounded-lg text-slate-200">
              {createdSecretData?.id}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Webhook Signing Secret
            </label>
            <CodeBlock code={createdSecretData?.signingSecret || ''} language="secret" title="Signing Secret" />
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => setCreatedSecretData(null)}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors"
            >
              I have stored this secret safely
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
