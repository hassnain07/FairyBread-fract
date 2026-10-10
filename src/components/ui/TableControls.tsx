import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

interface TableControlsProps {
  search: string;
  onSearch: (q: string) => void;
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
  placeholder?: string;
  children?: React.ReactNode;
}

export function TableControls({ search, onSearch, page, totalPages, total, onPage, placeholder = 'Search…', children }: TableControlsProps) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
    .reduce<(number | '…')[]>((acc, p, i, arr) => {
      if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('…');
      acc.push(p);
      return acc;
    }, []);

  return (
    <div className="table-controls">
      <div className="table-controls-top">
        <div className="search-box">
          <Search size={14} />
          <input placeholder={placeholder} value={search} onChange={e => onSearch(e.target.value)} />
          {search && <button className="search-clear" onClick={() => onSearch('')}>×</button>}
        </div>
        {children}
      </div>
      <div className="table-pagination">
        <span className="table-pagination-info">{total} result{total !== 1 ? 's' : ''}</span>
        {totalPages > 1 && (
          <div className="table-pagination-btns">
            <button onClick={() => onPage(page - 1)} disabled={page === 1}><ChevronLeft size={14} /></button>
            {pages.map((p, i) =>
              p === '…'
                ? <span key={`e${i}`} className="table-pagination-ellipsis">…</span>
                : <button key={p} className={page === p ? 'active' : ''} onClick={() => onPage(p as number)}>{p}</button>
            )}
            <button onClick={() => onPage(page + 1)} disabled={page === totalPages}><ChevronRight size={14} /></button>
          </div>
        )}
      </div>
    </div>
  );
}
