import { useCallback, useRef } from 'react';

interface UseInfiniteScrollOptions {
  onLoadMore: () => void;
  hasMore: boolean;
  loading?: boolean;
  threshold?: number;
}

export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  loading = false,
  threshold = 0.8,
}: UseInfiniteScrollOptions) {
  const observerRef = useRef<IntersectionObserver | null>(null);

  const lastElementRef = useCallback(
    (node: HTMLElement | null) => {
      if (loading) return;
      
      if (observerRef.current) {
        observerRef.current.disconnect();
      }

      if (!hasMore || !node) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            onLoadMore();
          }
        },
        {
          threshold,
        }
      );

      observerRef.current.observe(node);
    },
    [loading, hasMore, onLoadMore, threshold]
  );

  return lastElementRef;
}

