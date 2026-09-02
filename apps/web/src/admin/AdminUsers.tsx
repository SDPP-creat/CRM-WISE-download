import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../store.js';
import { Spinner, EmptyState } from '../components/ui.js';

interface U { id: number; name: string; phone: string; role: string; active: number }

export function AdminUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState<U[] | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', password: '', role: 'reader' });
  const [err, setErr] = useState('');

  const load = () => api.admin.users().then((r) => setUsers(r.users as unknown as U[])).catch(() => setUsers([]));
  useEffect(() => { load(); }, []);

  if (user?.role !== 'admin') return <EmptyState icon="🔒" title="Somente administradores" hint="Gerenciamento de usuários é restrito ao papel admin." />;
  if (!users) return <Spinner />;

  const add = async () => {
    setErr('');
    if (!form.name || !form.phone || !form.password) { setErr('Preencha todos os campos.'); return; }
    try { await api.admin.addUser(form); setForm({ name: '', phone: '', password: '', role: 'reader' }); load(); }
    catch (e) { setErr((e as Error).message); }
  };

  return (
    <div>
      <div className="card mb-4 space-y-2 p-3">
        <div className="text-sm font-semibold">Novo usuário</div>
        <input className="input" placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="input" placeholder="Telefone (+55…)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input className="input" type="password" placeholder="Senha" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="reader">Leitor</option>
          <option value="editor">Editor</option>
          <option value="admin">Administrador</option>
        </select>
        {err && <div className="text-xs text-alert">{err}</div>}
        <button onClick={add} className="btn-primary w-full py-2">Criar</button>
      </div>

      <div className="card divide-y divide-border">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-2 px-3 py-3 text-sm">
            <div>
              <div className="font-medium">{u.name}</div>
              <div className="text-xs text-gray-muted">{u.phone}</div>
            </div>
            <span className="chip ml-auto bg-panel2 text-yellow">{u.role}</span>
            <span className={`chip ${u.active ? 'bg-confirmed/15 text-confirmed' : 'bg-gray/10 text-gray-muted'}`}>{u.active ? 'ativo' : 'inativo'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
