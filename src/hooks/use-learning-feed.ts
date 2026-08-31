import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { practiceTasks, questions, tracks, videoLessons } from '@/data/mock-data';
import {
  apiLearningRepository, type LearningContentMap, type LearningContentType,
} from '@/services/api-learning-repository';
import { cacheLearningPage, readLearningPage } from '@/services/learning-cache';
import type { Specialty } from '@/types/domain';

const fallback = { question: questions, task: practiceTasks, video: videoLessons, track: tracks };

export function useLearningFeed<K extends LearningContentType>(type: K, specialty: Specialty) {
  const demoItems = useMemo(
    () => fallback[type].filter((item) => item.specialty === specialty) as LearningContentMap[K][],
    [specialty, type],
  );
  const [items, setItems] = useState<LearningContentMap[K][]>(demoItems);
  const feedKey = `${type}:${specialty}`;
  const [itemsKey, setItemsKey] = useState(feedKey);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const current = ++requestId.current;
    const controller = new AbortController();
    let cancelled = false;
    const timer = setTimeout(() => { void (async () => {
      const cached = await readLearningPage(type, specialty);
      if (cancelled || current !== requestId.current) return;
      setItems(cached?.items.length ? cached.items : demoItems); setItemsKey(feedKey);
      setSyncedAt(cached?.syncedAt ?? null);
      setStale(true);
      try {
        const page = await apiLearningRepository.list(type, specialty, undefined, controller.signal);
        if (cancelled || current !== requestId.current) return;
        setItems(page.items.length ? page.items : demoItems); setItemsKey(feedKey);
        setSyncedAt(page.syncedAt); setStale(page.items.length === 0); setError(null);
        await cacheLearningPage(type, specialty, page);
      } catch {
        if (!controller.signal.aborted) setError('Показываем сохранённые материалы — CMS API временно недоступен.');
      } finally {
        if (!cancelled && current === requestId.current) { setLoading(false); setRefreshing(false); }
      }
    })(); }, version ? 0 : 250);
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [demoItems, feedKey, specialty, type, version]);

  const refresh = useCallback(() => { setRefreshing(true); setVersion((value) => value + 1); }, []);
  return { items: itemsKey === feedKey ? items : demoItems, syncedAt, stale, loading, refreshing, error, refresh };
}
