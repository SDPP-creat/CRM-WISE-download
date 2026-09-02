import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { IconBell } from './icons.js';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function bufToB64url(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

type State = 'idle' | 'working' | 'on' | 'denied' | 'unsupported' | 'error';

export function NotifyButton() {
  const [state, setState] = useState<State>('idle');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!supported) { setState('unsupported'); return; }
    if (Notification.permission === 'denied') { setState('denied'); return; }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => { if (sub) setState('on'); })
      .catch(() => {});
  }, []);

  const enable = async () => {
    setMsg(''); setState('working');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState('denied'); return; }
      const { publicKey } = await api.pushKey();
      if (!publicKey) { setState('error'); setMsg('Servidor sem chave de push configurada.'); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const json = sub.toJSON() as { endpoint?: string };
      await api.pushSubscribe({
        endpoint: json.endpoint || sub.endpoint,
        keys: { p256dh: bufToB64url(sub.getKey('p256dh')), auth: bufToB64url(sub.getKey('auth')) },
      });
      setState('on');
    } catch (e) {
      setState('error'); setMsg((e as Error).message);
    }
  };

  if (state === 'unsupported') return null;

  if (state === 'on') {
    return (
      <div className="card mt-4 flex items-center gap-3 p-4 text-sm">
        <IconBell width={18} height={18} className="text-confirmed" />
        <span className="text-confirmed">Notificações ativadas neste aparelho</span>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <button onClick={enable} disabled={state === 'working'} className="btn-ghost w-full py-3">
        <IconBell width={18} height={18} /> {state === 'working' ? 'Ativando…' : 'Ativar notificações no celular'}
      </button>
      {state === 'denied' && <p className="mt-2 text-center text-xs text-alert">Permissão negada. Ative nas configurações do navegador para este site.</p>}
      {state === 'error' && <p className="mt-2 text-center text-xs text-alert">{msg || 'Não foi possível ativar.'}</p>}
      <p className="mt-2 text-center text-xs text-gray-muted">Avisa quando houver mudança oficial ou alerta de alto impacto. No iPhone, instale o app na tela inicial primeiro.</p>
    </div>
  );
}
