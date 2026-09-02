import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../store.js';
import { api } from '../api.js';
import { Logo } from '../components/ui.js';
import { IconGlobe, IconShield, IconTag, IconBolt, IconChevronRight } from '../components/icons.js';
import { NotifyButton } from '../components/NotifyButton.js';

export function Profile() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [notifs, setNotifs] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (user) api.notifications().then((r) => setNotifs(r.notifications)).catch(() => {});
  }, [user]);

  return (
    <div className="px-4 pt-5">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <Logo size="lg" />
      </div>

      {user ? (
        <div className="card mb-4 p-4">
          <div className="text-sm text-gray">Conectado como</div>
          <div className="font-semibold">{user.name} <span className="chip bg-panel2 text-yellow ml-1">{user.role}</span></div>
          <div className="text-xs text-gray-muted">{user.phone}</div>
          <button onClick={() => logout()} className="btn-ghost mt-3 w-full py-2">Sair</button>
        </div>
      ) : null}

      {user && <NotifyButton />}

      {!user && (
        <Link to="/login" className="btn-primary mb-4 w-full py-3">Entrar</Link>
      )}

      <div className="card divide-y divide-border">
        <Link to="/paises" className="tap flex items-center gap-3 px-4 py-3.5 text-sm"><IconGlobe width={18} height={18} className="text-gray" /> Países <IconChevronRight width={16} height={16} className="ml-auto text-gray-muted" /></Link>
        <Link to="/fontes" className="tap flex items-center gap-3 px-4 py-3.5 text-sm"><IconShield width={18} height={18} className="text-gray" /> Fontes <IconChevronRight width={16} height={16} className="ml-auto text-gray-muted" /></Link>
        <Link to="/topicos" className="tap flex items-center gap-3 px-4 py-3.5 text-sm"><IconTag width={18} height={18} className="text-gray" /> Tópicos <IconChevronRight width={16} height={16} className="ml-auto text-gray-muted" /></Link>
        {user && (user.role === 'admin' || user.role === 'editor') && (
          <button onClick={() => nav('/admin')} className="tap flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm text-yellow"><IconBolt width={18} height={18} /> Painel administrativo <IconChevronRight width={16} height={16} className="ml-auto" /></button>
        )}
      </div>

      {user && notifs.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 px-1 text-sm font-bold uppercase tracking-wide text-gray">Alertas</h2>
          <div className="card divide-y divide-border">
            {notifs.slice(0, 8).map((n) => (
              <div key={String(n.id)} className="px-4 py-3">
                <div className="text-sm font-medium">{String(n.title)}</div>
                {n.body ? <div className="text-xs text-gray">{String(n.body)}</div> : null}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-8 text-center text-xs text-gray-muted">
        WISE NEWS · agrega e traduz fontes públicas, sempre com link e atribuição à origem.
      </p>
    </div>
  );
}
