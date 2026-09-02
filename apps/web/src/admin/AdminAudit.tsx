import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Spinner, timeAgo } from '../components/ui.js';

interface Log { id: number; actor: string; action: string; entity?: string; entity_id?: string; detail?: string; created_at: string }

export function AdminAudit() {
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [usage, setUsage] = useState<{ total?: Record<string, unknown>; daily?: Array<Record<string, unknown>> }>({});
  useEffect(() => {
    api.admin.audit().then((r) => setLogs(r.logs as unknown as Log[])).catch(() => setLogs([]));
    api.admin.aiUsage().then(setUsage).catch(() => {});
  }, []);
  if (!logs) return <Spinner />;

  return (
    <div>
      {usage.total && (
        <div className="card mb-4 p-3 text-sm">
          <div className="font-semibold">Consumo de IA</div>
          <div className="text-xs text-gray">Custo total: ${Number(usage.total.cost ?? 0).toFixed(4)} · {Number(usage.total.tokens ?? 0)} tokens</div>
        </div>
      )}
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray">Auditoria</h2>
      <div className="card divide-y divide-border">
        {logs.map((l) => (
          <div key={l.id} className="px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-medium text-white">{l.action}</span>
              <span className="text-gray-muted">{l.entity}{l.entity_id ? `#${l.entity_id}` : ''}</span>
              <span className="ml-auto text-gray-muted">{timeAgo(l.created_at)}</span>
            </div>
            <div className="text-gray-muted">por {l.actor}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
