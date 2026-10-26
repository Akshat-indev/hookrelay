import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Globe,
  Radio,
  BookOpen,
  RefreshCw,
  Zap,
  Server,
  Cpu,
  Send,
  Plus
} from 'lucide-react';
import { api } from '../api/client';
import { cn } from '../lib/utils';
import { Modal } from './Modal';
import { useToast } from './ToastContext';

export function Layout() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const toast = useToast();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSendEventOpen, setIsSendEventOpen] = useState(false);
  const [selectedEndpointId, setSelectedEndpointId] = useState('');
  const [eventType, setEventType] = useState('payment.completed');
  const [eventData, setEventData] = useState('{\n  "payment_id": "pay_987",\n  "amount": 2500,\n  "currency": "usd"\n}');
  const [isSending, setIsSending] = useState(false);

  // Poll health every 10 seconds
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
    refetchInterval: 10000,
    retry: 1
  });

  // Endpoints list for Send Event modal
  const { data: endpoints = [] } = useQuery({
    queryKey: ['endpoints'],
    queryFn: () => api.getEndpoints()
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleSendEvent = async (e) => {
    e.preventDefault();
    if (!selectedEndpointId) {
      toast.error('Please select an endpoint');
      return;
    }

    let parsedData;
    try {
      parsedData = JSON.parse(eventData);
    } catch {
      toast.error('Event data must be valid JSON');
      return;
    }

    try {
      setIsSending(true);
      const res = await api.ingestEvent(selectedEndpointId, {
        event_type: eventType,
        data: parsedData
      });
      toast.success(`Event ${res.event_id} queued successfully!`);
      setIsSendEventOpen(false);
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
    } catch (err) {
      toast.error(err.message || 'Failed to send event');
    } finally {
      setIsSending(false);
    }
  };

  const navItems = [
    { name: 'Overview', to: '/', icon: Activity },
    { name: 'Endpoints', to: '/endpoints', icon: Globe },
    { name: 'Events', to: '/events', icon: Radio },
    { name: 'API Reference', to: '/docs', icon: BookOpen }
  ];

  const getPageTitle = () => {
    if (location.pathname === '/') return 'System Overview';
    if (location.pathname === '/endpoints') return 'Webhook Endpoints';
    if (location.pathname.startsWith('/events/')) return 'Event Inspection';
    if (location.pathname === '/events') return 'Delivery Events';
    if (location.pathname === '/docs') return 'Developer API Reference';
    return 'HookRelay';
  };

  const isWorkerHealthy = health?.worker?.status === 'healthy';
  const isApiHealthy = health?.api === 'healthy';

  return (
    <div className="flex min-h-screen bg-[#0a0d14] text-slate-100">
      {/* Sidebar */}
      <aside className="w-64 border-r border-card-border bg-[#0d111a] flex flex-col shrink-0">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-card-border gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-bold tracking-tight text-slate-100 text-base">HookRelay</span>
            <span className="ml-2 px-1.5 py-0.2 rounded text-[10px] font-mono bg-indigo-950 text-indigo-400 border border-indigo-800/50">
              v1.0
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1.5 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  )
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Send Test Event Action */}
        <div className="p-4 border-t border-card-border">
          <button
            onClick={() => {
              if (endpoints.length > 0 && !selectedEndpointId) {
                setSelectedEndpointId(endpoints[0].id);
              }
              setIsSendEventOpen(true);
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all duration-150"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send Test Event</span>
          </button>
        </div>

        {/* System Health Status Indicator */}
        <div className="p-4 border-t border-card-border bg-[#0a0d14]/60">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-2 font-semibold">
            System Status
          </div>
          <div className="space-y-1.5 text-xs font-mono">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-400">
                <Server className="w-3 h-3 text-slate-500" /> API Server
              </span>
              <span className="flex items-center gap-1.5 text-[11px]">
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    isApiHealthy ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                  )}
                />
                <span className={isApiHealthy ? 'text-emerald-400' : 'text-rose-400'}>
                  {isApiHealthy ? 'Online' : 'Down'}
                </span>
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-400">
                <Cpu className="w-3 h-3 text-slate-500" /> Delivery Worker
              </span>
              <span className="flex items-center gap-1.5 text-[11px]">
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    isWorkerHealthy ? 'bg-emerald-400' : 'bg-rose-500'
                  )}
                />
                <span className={isWorkerHealthy ? 'text-emerald-400' : 'text-rose-400'}>
                  {isWorkerHealthy ? 'Active' : 'Offline'}
                </span>
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Topbar */}
        <header className="h-16 border-b border-card-border bg-[#0d111a]/80 backdrop-blur sticky top-0 z-30 px-8 flex items-center justify-between">
          <h1 className="text-base font-semibold text-slate-100">{getPageTitle()}</h1>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-card-border bg-[#11151f] hover:bg-slate-800 text-xs font-medium text-slate-300 transition-colors"
              title="Refresh all data"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
              <span>Refresh</span>
            </button>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Send Test Event Modal */}
      <Modal
        isOpen={isSendEventOpen}
        onClose={() => setIsSendEventOpen(false)}
        title="Send Webhook Event"
      >
        <form onSubmit={handleSendEvent} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Destination Endpoint
            </label>
            {endpoints.length === 0 ? (
              <p className="text-xs text-rose-400">
                No endpoints registered yet. Create an endpoint first.
              </p>
            ) : (
              <select
                value={selectedEndpointId}
                onChange={(e) => setSelectedEndpointId(e.target.value)}
                className="w-full bg-[#0d111a] border border-card-border rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                required
              >
                {endpoints.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    {ep.name} ({ep.destinationUrl})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Event Type
            </label>
            <input
              type="text"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              placeholder="e.g. payment.completed, user.created"
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
              disabled={isSending || endpoints.length === 0}
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
