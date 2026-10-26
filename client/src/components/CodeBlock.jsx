import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '../lib/utils';

export function CodeBlock({ code, language = 'json', title, maxHeight = 'max-h-96' }) {
  const [copied, setCopied] = useState(false);

  const formattedCode = typeof code === 'object' ? JSON.stringify(code, null, 2) : String(code || '');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formattedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="rounded-lg border border-card-border bg-[#0d111a] overflow-hidden">
      {(title || true) && (
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-card-border/80 bg-[#111624]">
          <span className="text-xs font-mono text-slate-400 font-medium">
            {title || language.toUpperCase()}
          </span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors py-0.5 px-2 rounded hover:bg-slate-800"
            title="Copy code"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      )}
      <div className={cn('p-3.5 overflow-x-auto font-mono text-xs text-slate-200 leading-relaxed', maxHeight)}>
        <pre><code>{formattedCode}</code></pre>
      </div>
    </div>
  );
}
