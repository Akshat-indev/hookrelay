import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight,
  TrendingUp,
  Radio,
  Globe
} from 'lucide-react';
import { api } from '../api/client';
import { StatusBadge, HttpBadge } from '../components/StatusBadge';
import { formatDate, formatTimeAgo } from '../lib/utils';

export function OverviewPage() {
  const { data: metrics, isLoading, isError, error } = useQuery({
    queryKey: ['overview'],
    queryFn: () => api.getOverview(),
    refetchInterval: 3000 // Poll overview every 3s for live updates
  });

  const { data: eventsData } = useQuery({
    queryKey: ['events', { limit: 6 }],
    queryFn: () => api.getEvents({ limit: 6 }),
    refetchInterval: 3000
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500 font-mono text-xs">
        <div className="animate-spin mr-2 h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full" />
        Loading metrics...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 rounded-xl border border-rose-900/60 bg-rose-950/20 text-rose-300 text-sm">
        <p className="font-semibold mb-1">Failed to load overview metrics</p>
        <p className="text-xs text-rose-400 font-mono">{error.message}</p>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Events',
      value: metrics?.totalEvents ?? 0,
      icon: Send,
      color: 'text-indigo-400',
      bgColor: 'bg-indigo-950/40',
      borderColor: 'border-indigo-800/40'
    },
    {
      title: 'Delivered',
      value: metrics?.deliveredEvents ?? 0,
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-950/40',
      borderColor: 'border-emerald-800/40'
    },
    {
      title: 'Failed',
      value: metrics?.failedEvents ?? 0,
      icon: XCircle,
      color: 'text-rose-400',
      bgColor: 'bg-rose-950/40',
      borderColor: 'border-rose-800/40'
    },
    {
      title: 'Pending / Retrying',
      value: metrics?.pendingEvents ?? 0,
      icon: Clock,
      color: 'text-amber-400',
      bgColor: 'bg-amber-950/40',
      borderColor: 'border-amber-800/40'
    },
    {
      title: 'Success Rate',
      value: `${metrics?.successRate ?? 100}%`,
      icon: TrendingUp,
      color: 'text-indigo-300',
      bgColor: 'bg-indigo-950/30',
      borderColor: 'border-indigo-800/30'
    },
    {
      title: 'Endpoints',
      value: `${metrics?.activeEndpoints ?? 0} / ${metrics?.totalEndpoints ?? 0} active`,
      icon: Globe,
      color: 'text-slate-300',
      bgColor: 'bg-slate-900/40',
      borderColor: 'border-slate-800/60'
    }
  ];

  const recentEvents = eventsData?.events || [];
  const recentAttempts = metrics?.recentAttempts || [];

  return (
    <div className="space-y-8">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div
              key={idx}
              className={`p-4 rounded-xl border ${stat.borderColor} ${stat.bgColor} flex flex-col justify-between`}
            >
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium">{stat.title}</span>
                <Icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div className="text-xl font-bold font-mono tracking-tight text-slate-100">
                {stat.value}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Events Table (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider font-mono">
              Recent Webhook Events
            </h2>
            <Link
              to="/events"
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition-colors"
            >
              View all <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="rounded-xl border border-card-border bg-[#0d111a] overflow-hidden">
            {recentEvents.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs font-mono">
                No events recorded yet. Send your first event to see it here!
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-card-border/80 bg-[#11151f] text-slate-400 font-mono">
                    <th className="py-3 px-4 font-medium">Event ID</th>
                    <th className="py-3 px-4 font-medium">Event Type</th>
                    <th className="py-3 px-4 font-medium">Endpoint</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium">Attempts</th>
                    <th className="py-3 px-4 font-medium">HTTP</th>
                    <th className="py-3 px-4 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border/40 font-mono">
                  {recentEvents.map((event) => (
                    <tr
                      key={event.id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      <td className="py-3 px-4">
                        <Link
                          to={`/events/${event.id}`}
                          className="text-indigo-400 hover:text-indigo-300 underline font-medium"
                        >
                          {event.id.slice(0, 14)}...
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-slate-200 font-sans font-medium">
                        {event.eventType}
                      </td>
                      <td className="py-3 px-4 text-slate-400 max-w-[120px] truncate" title={event.endpointName}>
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
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                        {formatTimeAgo(event.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Live Delivery Activity Feed (1 Col) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider font-mono flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Live Delivery Stream
            </h2>
          </div>

          <div className="rounded-xl border border-card-border bg-[#0d111a] p-4 space-y-3">
            {recentAttempts.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs font-mono">
                No delivery attempts yet.
              </div>
            ) : (
              recentAttempts.map((att) => (
                <div
                  key={att.id}
                  className="p-3 rounded-lg border border-card-border/60 bg-[#11151f] flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200 truncate max-w-[140px]" title={att.eventType}>
                      {att.eventType || 'Webhook'}
                    </span>
                    <HttpBadge statusCode={att.statusCode} />
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span className="truncate max-w-[150px]" title={att.endpointName}>
                      {att.endpointName || att.destinationUrl}
                    </span>
                    <span className="text-slate-500">{att.latencyMs != null ? `${att.latencyMs}ms` : '—'}</span>
                  </div>

                  {att.errorMessage && (
                    <div className="text-[11px] font-mono text-rose-400 truncate" title={att.errorMessage}>
                      {att.errorMessage}
                    </div>
                  )}

                  <div className="text-[10px] text-slate-500 font-mono text-right">
                    {formatTimeAgo(att.createdAt)} (Attempt #{att.attemptNumber})
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
