export type ThemeId = 'graphite' | 'midnight' | 'slate' | 'paper' | 'sten' | 'system';
export type BackgroundId = 'none' | 'geometry';
export type DensityId = 'minimal' | 'compact' | 'comfort';

export type AppearanceSettings = {
  theme: ThemeId;
  background: BackgroundId;
  density: DensityId;
  showAvatars: boolean;
  showTime: boolean;
  showSources: boolean;
  showActions: boolean;
};

export type AppearanceUser = {
  id: string;
  organizationId?: string | null;
};

export type ChatRole = 'user' | 'assistant';
export type ChatAction = 'copy' | 'toSecretary' | 'details';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  sources?: Array<{
    id?: string;
    uri?: string;
    title?: string;
    kind?: string;
    excerpt?: string;
  }>;
  model?: string;
  formulaVersion?: string;
  actions?: ChatAction[];
}

export interface StenAvatarProps {
  size?: number;
  className?: string;
}

export interface UserAvatarProps {
  user: {
    id?: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
  } | null;
  size?: number;
  className?: string;
}

export interface MessageActionsProps {
  message: ChatMessage;
  onCopy: () => void;
  onToSecretary: () => void;
  onDetails: () => void;
}
