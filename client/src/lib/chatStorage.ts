const STORAGE_KEY_PREFIX = "urorads_chat_";
const EXPIRY_HOURS = 48;

export interface LocalChatMessage {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: number;
}

interface StoredChatData {
  messages: LocalChatMessage[];
  lastUpdated: number;
}

function getStorageKey(caseId: string): string {
  return `${STORAGE_KEY_PREFIX}${caseId}`;
}

function isExpired(lastUpdated: number): boolean {
  const now = Date.now();
  const expiryMs = EXPIRY_HOURS * 60 * 60 * 1000;
  return now - lastUpdated > expiryMs;
}

export function getChatMessages(caseId: string): LocalChatMessage[] {
  try {
    const key = getStorageKey(caseId);
    const stored = localStorage.getItem(key);
    
    if (!stored) {
      return [];
    }
    
    const data: StoredChatData = JSON.parse(stored);
    
    if (isExpired(data.lastUpdated)) {
      localStorage.removeItem(key);
      return [];
    }
    
    return data.messages;
  } catch {
    return [];
  }
}

export function saveChatMessage(caseId: string, message: Omit<LocalChatMessage, "id" | "timestamp">): LocalChatMessage {
  const newMessage: LocalChatMessage = {
    ...message,
    id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
  };
  
  try {
    const key = getStorageKey(caseId);
    const existing = getChatMessages(caseId);
    
    const data: StoredChatData = {
      messages: [...existing, newMessage],
      lastUpdated: Date.now(),
    };
    
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    console.warn("Failed to save chat message to localStorage");
  }
  
  return newMessage;
}

export function clearChatMessages(caseId: string): void {
  try {
    const key = getStorageKey(caseId);
    localStorage.removeItem(key);
  } catch {
    console.warn("Failed to clear chat messages from localStorage");
  }
}

export function cleanupExpiredChats(): void {
  try {
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
        const stored = localStorage.getItem(key);
        if (stored) {
          try {
            const data: StoredChatData = JSON.parse(stored);
            if (isExpired(data.lastUpdated)) {
              keysToRemove.push(key);
            }
          } catch {
            keysToRemove.push(key);
          }
        }
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch {
    console.warn("Failed to cleanup expired chats");
  }
}
