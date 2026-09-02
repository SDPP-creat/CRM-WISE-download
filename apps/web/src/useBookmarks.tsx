import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { api } from './api.js';
import { useAuth } from './store.js';

interface BookmarkState {
  ids: Set<number>;
  isSaved: (id: number) => boolean;
  toggle: (id: number) => void;
}

const Ctx = createContext<BookmarkState | null>(null);
const LS_KEY = 'wn_bookmarks';

function loadLocal(): Set<number> {
  try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]')); } catch { return new Set(); }
}
function saveLocal(ids: Set<number>): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify([...ids])); } catch { /* ignore */ }
}

export function BookmarkProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ids, setIds] = useState<Set<number>>(() => loadLocal());

  useEffect(() => {
    if (user) api.bookmarks().then((r) => setIds(new Set(r.posts.map((p) => p.id)))).catch(() => {});
  }, [user]);

  const toggle = useCallback((id: number) => {
    setIds((prev) => {
      const next = new Set(prev);
      const has = next.has(id);
      if (has) next.delete(id); else next.add(id);
      if (user) {
        (has ? api.removeBookmark(id) : api.addBookmark(id)).catch(() => {});
      } else {
        saveLocal(next);
      }
      return next;
    });
  }, [user]);

  const isSaved = useCallback((id: number) => ids.has(id), [ids]);

  return <Ctx.Provider value={{ ids, isSaved, toggle }}>{children}</Ctx.Provider>;
}

export function useBookmarks(): BookmarkState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBookmarks fora do BookmarkProvider');
  return ctx;
}
