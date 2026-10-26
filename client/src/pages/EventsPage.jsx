import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Radio,
  ExternalLink
} from 'lucide-react';
import { api } from '../api/client';
import { StatusBadge, HttpBadge } from '../components/StatusBadge';
import { formatDate, formatTimeAgo } from '../lib/utils';

export function EventsPage() {
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('ALL');
  const [endpointId, setEndpointId] = useState('');
  const [eventType, setEventType] = useState('');

  // Fetch endpoints for filter dropdown
  const { data: endpoints = [] } = useQuery({
    queryKey: ['endpoints'],
    queryFn: () => api.getEndpoints()
  });

  // Fetch paginated & filtered events
  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['events', { page, limit: 15, status, endpointId, eventType }],
    queryFn: () => api.getEvents({ page, limit: 15, status, endpointId, eventType }),
    refetchInterval: 3000 // Live polling every 3s
  });

  const events = data?.events || [];
  const pagination = data?.pagination || { page: 1, total: 0, totalPages: 1 };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Delivery Events</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Monitor, inspect, and filter historical webhook events and deliveries.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-card-border bg-[#0d111a] hover:bg-slate-800 text-xs text-slate-300 font-medium transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="p-3.5 rounded-xl border border-card-border bg-[#0d111a] flex flex-wrap items-center gap-3">
        {/* Event Type Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={eventType}
            onChange={(e) => {
              setEventType(e.target.value);
              setPage(1);
            }}
            placeholder="Search event type..."
            className="w-full bg-[#11151f] border border-card-border/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Status:</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="bg-[#11151f] border border-card-border/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="QUEUED">QUEUED</option>
            <option value="DELIVERING">DELIVERING</option>
            <option value="RETRYING">RETRYING</option>
            <option value="DELIVERED">DELIVERED</option>
            <option value="FAILED">FAILED</option>
          </select>
        </div>

        {/* Endpoint Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Endpoint:</span>
          <select
            value={endpointId}
            onChange={(e) => {
              setEndpointId(e.target.value);
              setPage(1);
            }}
            className="bg-[#11151f] border border-card-border/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 max-w-[180px] truncate"
          >
            <option value="">All Endpoints</option>
            {endpoints.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Events Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-slate-500 font-mono text-xs">
          <div className="animate-spin mr-2 h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full" />
          Loading events...
        </div>
      ) : isError ? (
        <div className="p-4 rounded-xl border border-rose-900/60 bg-rose-950/20 text-rose-300 text-xs font-mono">
          Failed to load events: {error.message}
        </div>
      ) : events.length === 0 ? (
        <div className="p-12 text-center rounded-xl border border-card-border bg-[#0d111a] space-y-2">
          <Radio className="w-8 h-8 text-slate-600 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-200">No events found</h3>
          <p className="text-xs text-slate-400">
            {status !== 'ALL' || endpointId || eventType
              ? 'Try adjusting your filters.'
              : 'Trigger a webhook event to see delivery records here.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-card-border bg-[#0d111a] overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-card-border/80 bg-[#111624] text-slate-400 font-mono">
                <th className="py-3 px-4 font-medium">Event ID</th>
                <th className="py-3 px-4 font-medium">Event Type</th>
                <th className="py-3 px-4 font-medium">Endpoint</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium">Attempts</th>
                <th className="py-3 px-4 font-medium">Last HTTP</th>
                <th className="py-3 px-4 font-medium">Latency</th>
                <th className="py-3 px-4 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border/40 font-mono">
              {events.map((event) => (
                <tr
                  key={event.id}
                  onClick={() => navigate(`/events/${event.id}`)}
                  className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4 text-indigo-400 font-semibold flex items-center gap-1.5">
                    <span>{event.id}</span>
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </td>
                  <td className="py-3 px-4 font-sans font-medium text-slate-200">
                    {event.eventType}
                  </td>
                  <td className="py-3 px-4 text-slate-300 max-w-[140px] truncate" title={event.endpointName}>
                    {event.endpointName}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={event.status} size="sm" />
                  </td>
                  <td className="py-3 px-4 text-slate-400">
                    {event.attempts} / {event.maxRetries}
                  </td>
                  <td className="py-3 px-4">
                    <HttpBadge statusCode={event.lastStatusCode} />
                  </td>
                  <td className="py-3 px-4 text-slate-400">
                    {event.lastLatencyMs != null ? `${event.lastLatencyMs}ms` : '—'}
                  </td>
                  <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                    {formatDate(event.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-card-border/80 bg-[#111624] text-xs text-slate-400 font-mono">
            <div>
              Total: <span className="text-slate-200 font-semibold">{pagination.total}</span> events
            </div>

            <div className="flex items-center gap-3">
              <span>
                Page {pagination.page} of {pagination.totalPages || 1}
              </span>
              <div className="flex gap-1">
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1 rounded border border-card-border hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="p-1 rounded border border-card-border hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
