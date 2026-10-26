import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  RotateCcw,
  Clock,
  Globe,
  Radio,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Copy,
  Check,
  Calendar,
  Layers
} from 'lucide-react';
import { api } from '../api/client';
import { StatusBadge, HttpBadge } from '../components/StatusBadge';
import { CodeBlock } from '../components/CodeBlock';
import { Modal } from '../components/Modal';
import { useToast } from '../components/ToastContext';
import { formatDate, formatTimeAgo } from '../lib/utils';

export function EventDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [isReplayConfirmOpen, setIsReplayConfirmOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // Poll event detail while delivering/retrying
  const { data: event, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['event', id],
    queryFn: () => api.getEvent(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'DELIVERING' || status === 'RETRYING' || status === 'QUEUED' ? 2000 : false;
    }
  });

  // Replay mutation
  const replayMutation = useMutation({
    mutationFn: () => api.replayEvent(id),
    onSuccess: (data) => {
      setIsReplayConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ['event', id] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      toast.success('Event enqueued for replay!');
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to replay event');
    }
  });

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {}
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500 font-mono text-xs">
        <div className="animate-spin mr-2 h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full" />
        Loading event details...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <Link to="/events" className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Events
        </Link>
        <div className="p-4 rounded-xl border border-rose-900/60 bg-rose-950/20 text-rose-300 text-xs font-mono">
          Failed to load event: {error.message}
        </div>
      </div>
    );
  }

  const isDelivering = event.status === 'DELIVERING';
  const attempts = event.deliveryAttempts || [];

  return (
    <div className="space-y-6">
      {/* Navigation & Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/events"
            className="p-1.5 rounded-lg border border-card-border hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold font-mono text-slate-100">{event.id}</h2>
              <button
                onClick={handleCopyId}
                className="text-slate-400 hover:text-slate-200 p-1 rounded"
                title="Copy Event ID"
              >
                {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <StatusBadge status={event.status} />
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Type: <span className="text-slate-200 font-semibold">{event.eventType}</span>
            </p>
          </div>
        </div>

        {/* Replay Action */}
        <button
          onClick={() => setIsReplayConfirmOpen(true)}
          disabled={isDelivering || replayMutation.isPending}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-colors"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${replayMutation.isPending ? 'animate-spin' : ''}`} />
          <span>Replay Event</span>
        </button>
      </div>

      {/* Event Metadata Card */}
      <div className="p-4 rounded-xl border border-card-border bg-[#0d111a] grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div>
          <span className="text-slate-500 block mb-1">Destination</span>
          <span className="font-medium text-slate-200 truncate block" title={event.endpoint?.name}>
            {event.endpoint?.name || 'Endpoint'}
          </span>
          <span className="font-mono text-[11px] text-slate-400 truncate block" title={event.endpoint?.destinationUrl}>
            {event.endpoint?.destinationUrl}
          </span>
        </div>

        <div>
          <span className="text-slate-500 block mb-1">Attempt Count</span>
          <span className="font-mono font-medium text-slate-200">
            {event.attempts} of {event.maxRetries} max
          </span>
        </div>

        <div>
          <span className="text-slate-500 block mb-1">Created At</span>
          <span className="font-mono text-slate-300">
            {formatDate(event.createdAt)}
          </span>
          <span className="text-slate-500 text-[11px] block">
            ({formatTimeAgo(event.createdAt)})
          </span>
        </div>

        <div>
          <span className="text-slate-500 block mb-1">Next Attempt</span>
          {event.status === 'RETRYING' ? (
            <span className="font-mono text-amber-400">
              {formatDate(event.nextAttemptAt)}
            </span>
          ) : (
            <span className="text-slate-500 font-mono">—</span>
          )}
        </div>
      </div>

      {/* Main Grid: Original Payload & Delivery Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Payload */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
            Original JSON Payload
          </h3>
          <CodeBlock
            code={event.payload}
            language="json"
            title="Event Data"
            maxHeight="max-h-[500px]"
          />
        </div>

        {/* Right Column: Delivery Attempts Timeline */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
              Delivery Attempts ({attempts.length})
            </h3>
            <span className="text-[11px] text-slate-500 font-mono">
              Chronological order
            </span>
          </div>

          {attempts.length === 0 ? (
            <div className="p-8 text-center rounded-xl border border-card-border bg-[#0d111a] text-slate-500 text-xs font-mono">
              No delivery attempts recorded yet. Event is currently queued.
            </div>
          ) : (
            <div className="space-y-3">
              {attempts.map((att) => (
                <div
                  key={att.id}
                  className="rounded-xl border border-card-border bg-[#0d111a] p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-slate-800 text-slate-200 border border-slate-700">
                        Attempt #{att.attemptNumber}
                      </span>
                      <HttpBadge statusCode={att.statusCode} />
                    </div>

                    <div className="text-xs font-mono text-slate-400">
                      Latency: <span className="text-slate-200">{att.latencyMs != null ? `${att.latencyMs}ms` : '—'}</span>
                    </div>
                  </div>

                  {att.errorMessage && (
                    <div className="p-2.5 rounded-lg border border-rose-900/60 bg-rose-950/30 text-rose-300 text-xs font-mono">
                      {att.errorMessage}
                    </div>
                  )}

                  {att.responseBody && (
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500">
                        Response Snippet
                      </span>
                      <div className="p-2.5 rounded-lg bg-[#080b12] border border-card-border/60 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-32">
                        {att.responseBody}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono pt-1 border-t border-card-border/50">
                    <span>Started: {formatDate(att.startedAt)}</span>
                    <span>Completed: {formatDate(att.completedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Replay */}
      <Modal
        isOpen={isReplayConfirmOpen}
        onClose={() => setIsReplayConfirmOpen(false)}
        title="Confirm Event Replay"
      >
        <div className="space-y-4 text-xs text-slate-300">
          <p>
            Are you sure you want to trigger a manual delivery replay for event{' '}
            <strong className="text-slate-100 font-mono">{event.id}</strong>?
          </p>
          <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-800/40 text-indigo-300 space-y-1">
            <p className="font-semibold">Replay Semantics:</p>
            <ul className="list-disc pl-4 space-y-1 text-indigo-300/80">
              <li>The event status will transition to QUEUED for immediate background processing.</li>
              <li>Previous attempt history ({attempts.length} attempts) will remain completely intact.</li>
              <li>A new attempt will be recorded upon outbound delivery.</li>
            </ul>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setIsReplayConfirmOpen(false)}
              className="px-4 py-2 rounded-lg border border-card-border text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => replayMutation.mutate()}
              disabled={replayMutation.isPending}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium transition-colors"
            >
              {replayMutation.isPending ? 'Queuing Replay...' : 'Confirm Replay'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
