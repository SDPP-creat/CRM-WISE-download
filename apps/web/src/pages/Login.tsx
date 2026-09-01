import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store.js';
import { Logo } from '../components/ui.js';

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await login(phone, password);
      nav('/perfil');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-10">
      <div className="mb-8"><Logo size="lg" /></div>
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <h1 className="text-lg font-bold">Entrar</h1>
        <div>
          <label className="label">Telefone</label>
          <input className="input" inputMode="tel" placeholder="+55…" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label className="label">Senha</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <div className="rounded-lg bg-alert/10 px-3 py-2 text-sm text-alert">{error}</div>}
        <button className="btn-primary w-full py-3" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        <p className="text-center text-xs text-gray-muted">O acesso é criado pelo administrador.</p>
      </form>
    </div>
  );
}
