import type {
  EngineStatus,
  ExportJob,
  ExportRequest,
  FocusBook,
  FocusBookSummary,
  FocusSettings,
  ReadingPosition,
  SentenceAudio,
} from '../../../shared/focus';
import { RequestError, request } from '../api';

export const fetchFocusLibrary = () => request<{ books: FocusBookSummary[]; settings: FocusSettings }>('/api/focus/library');

export const fetchFocusBook = (bookId: string) => request<FocusBook>(`/api/focus/books/${bookId}`);

// The EPUB goes up as raw bytes; its name rides in a header.
export async function uploadEpub(file: File): Promise<FocusBookSummary> {
  const response = await fetch('/api/focus/books', {
    method: 'POST',
    headers: { 'Content-Type': 'application/epub+zip', 'X-File-Name': encodeURIComponent(file.name) },
    body: file,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new RequestError(body?.error ?? `Import failed (${response.status})`, response.status);
  return body;
}

export const deleteFocusBook = (bookId: string) => request<void>(`/api/focus/books/${bookId}`, { method: 'DELETE' });

// keepalive lets the save finish even while the app is closing.
export const saveFocusPosition = (bookId: string, position: ReadingPosition) =>
  request<void>(`/api/focus/books/${bookId}/position`, { method: 'PUT', body: JSON.stringify(position), keepalive: true });

export const saveFocusSettings = (settings: Partial<FocusSettings>) =>
  request<FocusSettings>('/api/focus/settings', { method: 'PUT', body: JSON.stringify(settings) });

export const fetchEngineStatus = () => request<EngineStatus>('/api/focus/engine');

export const startEngine = () => request<EngineStatus>('/api/focus/engine/start', { method: 'POST' });

export const fetchSentenceAudio = (bookId: string, chapter: number, sentence: number, voice: string, priority: 'high' | 'low') =>
  request<SentenceAudio>(
    `/api/focus/books/${bookId}/audio?chapter=${chapter}&sentence=${sentence}&voice=${voice}&priority=${priority}`
  );

export const fetchVoicePreview = (voice: string) => request<{ url: string }>(`/api/focus/voices/${voice}/preview`);

export const startExport = (input: ExportRequest) =>
  request<ExportJob>('/api/focus/exports', { method: 'POST', body: JSON.stringify(input) });

export const fetchExport = (jobId: string) => request<ExportJob>(`/api/focus/exports/${jobId}`);

export const stopExport = (jobId: string) => request<ExportJob>(`/api/focus/exports/${jobId}/stop`, { method: 'POST' });

export const revealExport = (jobId: string) => request<void>(`/api/focus/exports/${jobId}/reveal`, { method: 'POST' });

export const chooseFolder = (folder: string) =>
  request<{ folder: string | null }>('/api/focus/choose-folder', { method: 'POST', body: JSON.stringify({ folder }) });
