import { useState, useMemo } from 'react';

/** Pagination only — caller is responsible for filtering by search term. */
export function usePagination<T>(items: T[], pageSize = 20) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize],
  );
  function onPage(p: number) { setPage(Math.max(1, Math.min(p, totalPages))); }
  return { page: safePage, totalPages, paged, onPage, total: items.length };
}

/** Search state only — returns search string and setter that resets to page 1. */
export function useSearch(resetPage?: () => void) {
  const [search, setSearch] = useState('');
  function onSearch(q: string) { setSearch(q); resetPage?.(); }
  return { search, onSearch };
}
