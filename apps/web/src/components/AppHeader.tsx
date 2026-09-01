import { useNavigate } from 'react-router-dom';
import { Logo } from './ui.js';
import { IconSearch } from './icons.js';

export function AppHeader({ showSearch = true }: { showSearch?: boolean }) {
  const nav = useNavigate();
  return (
    <header className="safe-top sticky top-0 z-30 bg-bg/95 px-4 pb-3 pt-4 backdrop-blur">
      <div className="flex items-center justify-between">
        <Logo width={150} />
      </div>
      {showSearch && (
        <button
          onClick={() => nav('/buscar')}
          className="mt-3 flex w-full items-center gap-2 rounded-xl border border-border bg-panel2 px-4 py-2.5 text-left text-sm text-gray-muted"
        >
          <IconSearch width={16} height={16} /> Buscar notícias, países, erros…
        </button>
      )}
    </header>
  );
}
