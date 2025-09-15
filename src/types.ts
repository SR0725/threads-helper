export interface LikeThreshold {
  id: string;
  min: number;
  max: number;
  color: string;
}

export interface ExtensionSettings {
  thresholds: LikeThreshold[];
}

export const DEFAULT_THRESHOLDS: LikeThreshold[] = [
  { id: 'green', min: 100, max: 299, color: '#22C55E' },
  { id: 'yellow', min: 300, max: 699, color: '#EAB308' },
  { id: 'orange', min: 700, max: 999, color: '#F97316' },
  { id: 'red', min: 1000, max: 999999, color: '#EF4444' }
];

export interface PostData {
  id: string;
  publishedAt: string;
  content: string;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  shareCount: number;
}