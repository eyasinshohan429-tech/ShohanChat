export type MessageType = 'text' | 'image' | 'file' | 'audio' | 'sticker' | 'gif';
export type CallType = 'audio' | 'video';
export type CallStatus = 'incoming' | 'accepted' | 'declined' | 'missed' | 'ended';

export interface Profile {
  id: string;
  display_name: string;
  nickname: string;
  bio: string;
  avatar_url: string;
  last_seen: string;
  online: boolean;
  is_admin: boolean;
  created_at: string;
}

export interface Conversation {
  id: string;
  user1_id: string;
  user2_id: string;
  is_self_chat: boolean;
  chat_theme: string;
  created_at: string;
  archived_by: string[];
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  message_type: MessageType;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  created_at: string;
  read_at: string | null;
  is_pinned: boolean;
  pinned_by: string | null;
  deleted_for: string[];
}

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface BlockedUser {
  blocker_id: string;
  blocked_id: string;
  created_at: string;
}

export interface CallRecord {
  id: string;
  conversation_id: string;
  caller_id: string;
  receiver_id: string;
  call_type: CallType;
  status: CallStatus;
  started_at: string;
  ended_at: string | null;
}

export interface ConversationWithDetails extends Conversation {
  other_user?: Profile;
  last_message?: {
    content: string | null;
    message_type: MessageType;
    sender_id: string;
    created_at: string;
  } | null;
}

export interface SearchResult {
  id: string;
  display_name: string;
  nickname: string;
  bio: string;
  avatar_url: string;
  online: boolean;
  email: string;
}
