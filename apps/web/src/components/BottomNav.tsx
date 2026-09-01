import { NavLink } from 'react-router-dom';

const items = [
  { to: '/', label: 'Início', icon: '🏠', end: true },
  { to: '/buscar', label: 'Buscar', icon: '🔍' },
  { to: '/topicos', label: 'Tópicos', icon: '🏷️' },
  { to: '/salvos', label: 'Salvos', icon: '★' },
  { to: '/perfil', label: 'Perfil', icon: '👤' },
];

export function BottomNav() {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto max-w-app border-t border-border bg-panel/95 backdrop-blur">
      <div className="grid grid-cols-5">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) =>
              `tap flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] ${isActive ? 'text-yellow' : 'text-gray-muted'}`
            }
          >
            <span className="text-lg leading-none">{it.icon}</span>
            {it.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
