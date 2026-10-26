import React from 'react';
import { CodeBlock } from '../components/CodeBlock';
import { Shield, Send, Globe, RefreshCw, Cpu } from 'lucide-react';

export function DocsPage() {
  const curlCreateEndpoint = `curl -X POST http://localhost:4000/api/endpoints \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Production Payment Receiver",
    "destinationUrl": "https://api.mycompany.com/webhooks/payments",
    "maxRetries": 5
  }'`;

  const pwshCreateEndpoint = `Invoke-RestMethod -Uri "http://localhost:4000/api/endpoints" \`
  -Method Post \`
  -ContentType "application/json" \`
  -Body '{"name": "Production Payment Receiver", "destinationUrl": "https://api.mycompany.com/webhooks/payments", "maxRetries": 5}'`;

  const curlSendEvent = `curl -X POST http://localhost:4000/api/endpoints/ep_YOUR_ENDPOINT_ID/events \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: pay_order_12345" \\
  -d '{
    "event_type": "payment.completed",
    "data": {
      "payment_id": "pay_123",
      "amount": 4999,
      "currency": "usd",
      "customer": "cust_8821"
    }
  }'`;

  const pwshSendEvent = `Invoke-RestMethod -Uri "http://localhost:4000/api/endpoints/ep_YOUR_ENDPOINT_ID/events" \`
  -Method Post \`
  -Headers @{ "Idempotency-Key" = "pay_order_12345" } \`
  -ContentType "application/json" \`
  -Body '{"event_type": "payment.completed", "data": {"payment_id": "pay_123", "amount": 4999, "currency": "usd", "customer": "cust_8821"}}'`;

  const webhookEnvelope = `{
  "event_id": "evt_7d82b1c4e9",
  "event_type": "payment.completed",
  "timestamp": "2026-10-26T14:30:00.000Z",
  "data": {
    "payment_id": "pay_123",
    "amount": 4999,
    "currency": "usd",
    "customer": "cust_8821"
  }
}`;

  const nodeVerification = `import crypto from 'node:crypto';

// In your webhook receiver endpoint:
function verifyWebhook(req, signingSecret) {
  const signatureHeader = req.headers['x-hookrelay-signature']; // sha256=<hex>
  const rawBody = req.rawBody || JSON.stringify(req.body);

  const hmac = crypto.createHmac('sha256', signingSecret);
  hmac.update(rawBody, 'utf8');
  const expectedSignature = \`sha256=\${hmac.digest('hex')}\`;

  const isValid = crypto.timingSafeEqual(
    Buffer.from(signatureHeader || ''),
    Buffer.from(expectedSignature)
  );

  return isValid;
}`;

  const pythonVerification = `import hmac
import hashlib

def verify_webhook(raw_body_bytes, signature_header, signing_secret):
    """
    signature_header: "sha256=<hex_digest>"
    """
    expected = "sha256=" + hmac.new(
        signing_secret.encode('utf-8'),
        raw_body_bytes,
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(signature_header, expected)`;

  return (
    <div className="space-y-8 max-w-4xl pb-12">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-100">API Documentation & Integration Guide</h2>
        <p className="text-xs text-slate-400 mt-1">
          Everything you need to integrate, authenticate, and verify webhooks delivered by HookRelay.
        </p>
      </div>

      {/* 1. Registering an Endpoint */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-200">1. Registering an Endpoint</h3>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Create an endpoint by specifying a name, a valid destination URL (http:// or https://), and max retry attempts.
          Upon creation, HookRelay generates a unique signing secret prefixed with <code className="text-indigo-300 bg-indigo-950/60 px-1 py-0.5 rounded font-mono">whsec_</code>.
        </p>
        <div className="grid grid-cols-1 gap-3">
          <CodeBlock code={curlCreateEndpoint} language="bash" title="Register Endpoint (Bash / macOS / Linux / Git Bash)" />
          <CodeBlock code={pwshCreateEndpoint} language="powershell" title="Register Endpoint (Windows PowerShell)" />
        </div>
      </section>

      {/* 2. Submitting an Event */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-200">2. Enqueuing Webhook Events</h3>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Send an HTTP POST request to <code className="text-indigo-300 bg-indigo-950/60 px-1 py-0.5 rounded font-mono">/api/endpoints/:id/events</code>.
          HookRelay persists the event immediately and responds with <code className="text-emerald-400 font-mono">HTTP 202 Accepted</code>, scheduling it for background delivery.
        </p>
        <div className="grid grid-cols-1 gap-3">
          <CodeBlock code={curlSendEvent} language="bash" title="Submit Event (Bash / macOS / Linux / Git Bash)" />
          <CodeBlock code={pwshSendEvent} language="powershell" title="Submit Event (Windows PowerShell)" />
        </div>
      </section>

      {/* 3. Outbound Envelope Specification */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-200">3. Outbound Payload Envelope</h3>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Every HTTP POST sent to your destination URL wraps your payload in a standardized envelope containing the event ID, event type, and creation timestamp:
        </p>
        <CodeBlock code={webhookEnvelope} language="json" title="Delivered JSON Envelope" />
      </section>

      {/* 4. Signature Verification */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-200">4. Verifying Webhook Signatures</h3>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          HookRelay signs the raw bytes of every outgoing request using HMAC-SHA256 with the endpoint’s secret and passes it in the <code className="text-indigo-300 bg-indigo-950/60 px-1 py-0.5 rounded font-mono">X-HookRelay-Signature</code> header.
        </p>

        <div className="space-y-4">
          <div>
            <h4 className="text-xs font-semibold text-slate-400 mb-1.5 font-mono">Node.js Verification</h4>
            <CodeBlock code={nodeVerification} language="javascript" title="Node.js (crypto)" />
          </div>

          <div>
            <h4 className="text-xs font-semibold text-slate-400 mb-1.5 font-mono">Python Verification</h4>
            <CodeBlock code={pythonVerification} language="python" title="Python (hmac)" />
          </div>
        </div>
      </section>

      {/* 5. Retry and Backoff Semantics */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-200">5. Retry & Backoff Engine</h3>
        </div>
        <div className="p-4 rounded-xl border border-card-border bg-[#0d111a] space-y-2 text-xs text-slate-300">
          <p>
            <strong>Success condition:</strong> Any <code className="text-emerald-400 font-mono">2xx</code> HTTP status code is recorded as a successful delivery.
          </p>
          <p>
            <strong>Retryable failures:</strong> Network timeouts, connection errors, DNS resolution errors, and HTTP <code className="text-amber-400 font-mono">408</code>, <code className="text-amber-400 font-mono">429</code>, and <code className="text-amber-400 font-mono">5xx</code> server errors are automatically retried.
          </p>
          <p>
            <strong>Permanent failures:</strong> Other <code className="text-rose-400 font-mono">4xx</code> client errors (e.g. 400, 401, 404) immediately transition the event to <span className="text-rose-400 font-mono font-bold">FAILED</span> without unnecessary retries.
          </p>
          <p>
            <strong>Exponential backoff:</strong> Initial delay begins at ~2s and doubles on each retry (2s, 4s, 8s, 16s...) with added random jitter to prevent thundering herds. <code className="text-slate-200 font-mono">Retry-After</code> response headers are automatically parsed and respected.
          </p>
        </div>
      </section>
    </div>
  );
}
