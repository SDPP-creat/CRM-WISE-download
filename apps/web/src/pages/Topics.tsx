import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Spinner, Section } from '../components/ui.js';

export function Topics() {
  const [cats, setCats] = useState<Array<{ slug: string; label: string; description: string; count: number }> | null>(null);
  const [countries, setCountries] = useState<Array<{ code: string; name: string; flag: string; count: number }>>([]);

  useEffect(() => {
    api.categories().then((r) => setCats(r.categories)).catch(() => setCats([]));
    api.countries().then((r) => setCountries(r.countries)).catch(() => {});
  }, []);

  return (
    <div className="px-4 pt-5">
      <h1 className="mb-4 text-xl font-bold">Tópicos</h1>
      {!cats && <Spinner />}
      {cats && (
        <Section title="Categorias">
          <div className="grid grid-cols-2 gap-2">
            {cats.map((c) => (
              <Link key={c.slug} to={`/buscar?category=${c.slug}`} className="card p-3">
                <div className="text-sm font-semibold text-yellow">{c.label}</div>
                <div className="mt-1 line-clamp-2 text-xs text-gray">{c.description}</div>
                <div className="mt-2 text-xs text-gray-muted">{c.count} notícias</div>
              </Link>
            ))}
          </div>
        </Section>
      )}
      {countries.length > 0 && (
        <Section title="Países" action={<Link to="/paises" className="text-xs text-yellow">ver todos</Link>}>
          <div className="flex flex-wrap gap-2">
            {countries.slice(0, 12).map((c) => (
              <Link key={c.code} to={`/paises?code=${c.code}`} className="chip bg-panel2 text-gray tap px-3">
                <span>{c.flag}</span> {c.name} <span className="text-gray-muted">{c.count}</span>
              </Link>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
