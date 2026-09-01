import { NavLink } from 'react-router-dom';
import type { ComponentType, SVGProps } from 'react';
import { IconHome, IconSearch, IconChat, IconBookmark, IconUser } from './icons.js';

const items: Array<{ to: string; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>>; end?: boolean }> = [
  { to: '/', label: 'Início', Icon: IconHome, end: true },
  { to: '/buscar', label: 'Buscar', Icon: IconSearch },
  { to: '/perguntar', label: 'Perguntar', Icon: IconChat },
  { to: '/salvos', label: 'Salvos', Icon: IconBookmark },
  { to: '/perfil', label: 'Perfil', Icon: IconUser },
];

export function BottomNav() {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto max-w-app border-t border-border bg-panel/95 backdrop-blur">
      <div className="grid grid-cols-5">
        {items.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `tap flex flex-col items-center justify-center gap-1 py-2 text-[11px] ${isActive ? 'text-yellow' : 'text-gray-muted'}`
            }
          >
            <Icon width={22} height={22} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
