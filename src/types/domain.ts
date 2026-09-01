export type Difficulty = 'Начальный' | 'Средний' | 'Продвинутый';
export type Specialty = 'Frontend' | 'Backend' | 'Mobile' | 'QA';

export type LearningTrack = {
  id: string;
  title: string;
  description: string;
  specialty: Specialty;
  lessons: number;
  durationMinutes: number;
  progress: number;
};

export type InterviewQuestion = {
  id: string;
  title: string;
  shortAnswer: string;
  fullAnswer: string;
  specialty: Specialty;
  difficulty: Difficulty;
  tags: string[];
  updatedAt: string;
  sourceLabel: string;
};

export type VideoLesson = {
  id: string;
  contentVersion: number;
  title: string;
  author: string;
  durationMinutes: number;
  specialty: Specialty;
  url: string;
  quiz?: { id: string; prompt: string; options: string[] }[];
};

export type PracticeTask = {
  id: string;
  contentVersion: number;
  title: string;
  description: string;
  specialty: Specialty;
  difficulty: Difficulty;
  estimatedMinutes: number;
  skills: string[];
  starterCode?: string;
  solution: string;
  runner?: { language: 'javascript'; entrypoint: string };
};

export type Vacancy = {
  id: string;
  title: string;
  company: string;
  location: string;
  workFormat: 'Удалённо' | 'Гибрид' | 'Офис';
  salary?: string;
  level: string;
  specialty: Specialty;
  skills: string[];
  description: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  collectedAt: string;
};
