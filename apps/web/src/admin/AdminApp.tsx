import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../store.js';
import { Spinner } from '../components/ui.js';
import { IconArrowLeft } from '../components/icons.js';
import { AdminDashboard } from './AdminDashboard.js';
import { AdminSources } from './AdminSources.js';
import { AdminReview } from './AdminReview.js';
import { AdminHealth } from './AdminHealth.js';
import { AdminKeywords } from './AdminKeywords.js';
import { AdminUsers } from './AdminUsers.js';
import { AdminAudit } from './AdminAudit.js';

const TABS = [
  { to: '/admin', label: 'Painel', end: true },
  { to: '/admin/fontes', label: 'Fontes' },
  { to: '/admin/saude', label: 'Saúde' },
  { to: '/admin/revisao', label: 'Revisão' },
  { to: '/admin/palavras', label: 'Palavras' },
  { to: '/admin/usuarios', label: 'Usuários' },
  { to: '/admin/auditoria', label: 'Auditoria' },
];

export function AdminApp() {
  const { user, loading } = useAuth();
  const nav = useNavigate();

  if (loading) return <Spinner />;
  if (!user || (user.role !== 'admin' && user.role !== 'editor')) {
    return (
      <div className="p-8 text-center">
        <p className="mb-4 text-gray">Acesso restrito ao painel administrativo.</p>
        <button onClick={() => nav('/login')} className="btn-primary px-6 py-2">Entrar</button>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <header className="safe-top sticky top-0 z-30 border-b border-border bg-panel/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => nav('/')} className="tap text-gray"><IconArrowLeft width={20} height={20} /></button>
          <span className="font-bold text-yellow">WISE NEWS · Admin</span>
          <span className="ml-auto text-xs text-gray-muted">{user.name} ({user.role})</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `chip tap whitespace-nowrap px-3 ${isActive ? 'bg-yellow text-black' : 'bg-panel2 text-gray'}`}>{t.label}</NavLink>
          ))}
        </nav>
      </header>
      <div className="p-4">
        <Routes>
          <Route path="/" element={<AdminDashboard />} />
          <Route path="/fontes" element={<AdminSources />} />
          <Route path="/saude" element={<AdminHealth />} />
          <Route path="/revisao" element={<AdminReview />} />
          <Route path="/palavras" element={<AdminKeywords />} />
          <Route path="/usuarios" element={<AdminUsers />} />
          <Route path="/auditoria" element={<AdminAudit />} />
        </Routes>
      </div>
    </div>
  );
}
