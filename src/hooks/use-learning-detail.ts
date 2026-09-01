import { useEffect, useState } from 'react';

import { practiceTasks, questions, videoLessons } from '@/data/mock-data';
import {
  apiLearningRepository, type LearningContentMap, type LearningContentType,
} from '@/services/api-learning-repository';
import { cacheLearningItem, readLearningItem } from '@/services/learning-cache';

const details = { question: questions, task: practiceTasks, video: videoLessons } as const;

export function useLearningDetail<K extends Extract<LearningContentType, 'question' | 'task' | 'video'>>(type: K, id?: string) {
  const [state, setState] = useState<{ id?: string; item: LearningContentMap[K] | null | undefined }>(() => ({
    id, item: details[type].find((item) => item.id === id) as LearningContentMap[K] | undefined,
  }));
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      const cached = await readLearningItem(id);
      if (!cancelled && cached?.type === type) setState({ id, item: cached.item as LearningContentMap[K] });
      try {
        const live = await apiLearningRepository.byId(id, controller.signal);
        if (!cancelled && live && live.id === id && live.id.startsWith(`${type}-`)) {
          setState({ id, item: live as LearningContentMap[K] });
          await cacheLearningItem(type, live);
        } else if (!cancelled && !cached && !details[type].some((item) => item.id === id)) setState({ id, item: null });
      } catch {
        if (!cancelled && !cached && !details[type].some((item) => item.id === id)) setState({ id, item: null });
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [id, type]);
  const item = state.id === id ? state.item : undefined;
  return { item: id ? item : null, loading: Boolean(id) && item === undefined };
}
