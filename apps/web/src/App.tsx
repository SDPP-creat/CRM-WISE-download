import { Routes, Route, useLocation } from 'react-router-dom';
import { BottomNav } from './components/BottomNav.js';
import { BookmarkProvider } from './useBookmarks.js';
import { Home } from './pages/Home.js';
import { Search } from './pages/Search.js';
import { Topics } from './pages/Topics.js';
import { Countries } from './pages/Countries.js';
import { Saved } from './pages/Saved.js';
import { Profile } from './pages/Profile.js';
import { PostDetail } from './pages/PostDetail.js';
import { Login } from './pages/Login.js';
import { SourcesPage } from './pages/SourcesPage.js';
import { Questions } from './pages/Questions.js';
import { QuestionDetail } from './pages/QuestionDetail.js';
import { AdminApp } from './admin/AdminApp.js';

export function App() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');

  return (
    <BookmarkProvider>
      <div className="mx-auto flex min-h-full max-w-app flex-col">
        <main className={isAdmin ? '' : 'flex-1 pb-20'}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/buscar" element={<Search />} />
            <Route path="/topicos" element={<Topics />} />
            <Route path="/perguntar" element={<Questions />} />
            <Route path="/pergunta/:id" element={<QuestionDetail />} />
            <Route path="/paises" element={<Countries />} />
            <Route path="/fontes" element={<SourcesPage />} />
            <Route path="/salvos" element={<Saved />} />
            <Route path="/perfil" element={<Profile />} />
            <Route path="/post/:id" element={<PostDetail />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin/*" element={<AdminApp />} />
            <Route path="*" element={<div className="p-8 text-center text-gray">Página não encontrada.</div>} />
          </Routes>
        </main>
        {!isAdmin && <BottomNav />}
      </div>
    </BookmarkProvider>
  );
}
