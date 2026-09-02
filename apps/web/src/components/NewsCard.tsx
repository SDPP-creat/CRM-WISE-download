import { Link } from 'react-router-dom';
import type { FeedPost } from '@wise-news/shared';
import { categoryLabel } from '@wise-news/shared';
import { ImpactBadge, VerificationBadge, timeAgo } from './ui.js';
import { IconArrowUpRight, IconBookmark } from './icons.js';
import { Flag } from './Flag.js';
import { useBookmarks } from '../useBookmarks.js';

export function NewsCard({ post }: { post: FeedPost }) {
  const { isSaved, toggle } = useBookmarks();
  const saved = isSaved(post.id);
  return (
    <article className="card mb-3 overflow-hidden">
      <Link to={`/post/${post.id}`} className="block p-4">
        <div className="mb-2 flex items-center gap-2 text-xs text-gray">
          <Flag code={post.countryCode} name={post.countryName} size={18} />
          <span className="chip bg-panel2 text-yellow">{categoryLabel(post.categoryPrimary)}</span>
          <span className="ml-auto">{timeAgo(post.createdAt)}</span>
        </div>
        <h3 className="mb-1 font-semibold leading-snug text-white">{post.title}</h3>
        {post.summary && <p className="mb-2 line-clamp-2 text-sm text-gray">{post.summary}</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          <VerificationBadge status={post.verificationStatus} />
          <ImpactBadge impact={post.impact} />
          {post.relatedCount > 1 && <span className="chip bg-panel2 text-gray">{post.relatedCount} relatos</span>}
          {post.processingStatus === 'pending' && <span className="chip bg-panel2 text-gray-muted">análise pendente</span>}
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-muted">
          <span>{post.sourceName}</span>
          <span>·</span>
          <span>@{post.author}</span>
        </div>
      </Link>
      <div className="flex border-t border-border">
        <a href={post.url} target="_blank" rel="noreferrer" className="tap flex flex-1 items-center justify-center gap-1.5 py-2.5 text-center text-xs font-medium text-gray hover:text-white">
          <IconArrowUpRight width={15} height={15} /> Abrir original
        </a>
        <button
          onClick={() => toggle(post.id)}
          className={`tap flex flex-1 items-center justify-center gap-1.5 border-l border-border py-2.5 text-center text-xs font-medium ${saved ? 'text-yellow' : 'text-gray hover:text-white'}`}
        >
          <IconBookmark width={15} height={15} filled={saved} /> {saved ? 'Salvo' : 'Salvar'}
        </button>
      </div>
    </article>
  );
}
