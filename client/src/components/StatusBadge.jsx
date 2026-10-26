import React from 'react';
import { cn } from '../lib/utils';
import { CheckCircle2, XCircle, RefreshCw, Clock, ArrowRightCircle } from 'lucide-react';

const STATUS_CONFIG = {
  DELIVERED: {
    label: 'DELIVERED',
    bg: 'bg-emerald-950/60',
    border: 'border-emerald-800/60',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
    icon: CheckCircle2
  },
  FAILED: {
    label: 'FAILED',
    bg: 'bg-rose-950/60',
    border: 'border-rose-800/60',
    text: 'text-rose-400',
    dot: 'bg-rose-400',
    icon: XCircle
  },
  RETRYING: {
    label: 'RETRYING',
    bg: 'bg-amber-950/60',
    border: 'border-amber-800/60',
    text: 'text-amber-400',
    dot: 'bg-amber-400',
    icon: RefreshCw,
    animate: true
  },
  DELIVERING: {
    label: 'DELIVERING',
    bg: 'bg-indigo-950/60',
    border: 'border-indigo-800/60',
    text: 'text-indigo-400',
    dot: 'bg-indigo-400',
    icon: ArrowRightCircle,
    animate: true
  },
  QUEUED: {
    label: 'QUEUED',
    bg: 'bg-slate-900/60',
    border: 'border-slate-800',
    text: 'text-slate-400',
    dot: 'bg-slate-400',
    icon: Clock
  }
};

export function StatusBadge({ status, size = 'default', showIcon = true }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.QUEUED;
  const Icon = config.icon;

  const isSmall = size === 'sm';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md font-mono font-medium border uppercase tracking-wider',
        config.bg,
        config.border,
        config.text,
        isSmall ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
      )}
    >
      {showIcon && (
        <Icon
          className={cn(
            isSmall ? 'w-3 h-3' : 'w-3.5 h-3.5',
            config.animate && 'animate-spin'
          )}
        />
      )}
      {config.label}
    </span>
  );
}

export function HttpBadge({ statusCode }) {
  if (!statusCode) {
    return <span className="font-mono text-xs text-slate-500">—</span>;
  }

  const is2xx = statusCode >= 200 && statusCode < 300;
  const is4xx = statusCode >= 400 && statusCode < 500;
  const is5xx = statusCode >= 500;

  let colorClass = 'bg-slate-800/70 border-slate-700 text-slate-300';
  if (is2xx) colorClass = 'bg-emerald-950/60 border-emerald-800/60 text-emerald-400';
  else if (is4xx) colorClass = 'bg-amber-950/60 border-amber-800/60 text-amber-400';
  else if (is5xx) colorClass = 'bg-rose-950/60 border-rose-800/60 text-rose-400';

  return (
    <span className={cn('px-2 py-0.5 rounded font-mono text-xs border font-medium', colorClass)}>
      {statusCode}
    </span>
  );
}
