"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface TypingUser {
  userId: string;
  conversationId: string | null;
  timestamp: number;
}

export interface UseTypingIndicatorOptions {
  conversationId?: string | null;
  userId: string;
  typingTimeout?: number;
}

export function useTypingIndicator(options: UseTypingIndicatorOptions) {
  const { conversationId, typingTimeout = 3000 } = options;
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startTyping = useCallback(async () => {
    try {
      await fetch("/api/chat/typing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId,
          typing: true,
        }),
      });
    } catch (error) {
      console.error("Failed to send typing indicator:", error);
    }
  }, [conversationId]);

  const stopTyping = useCallback(async () => {
    try {
      await fetch("/api/chat/typing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId,
          typing: false,
        }),
      });
    } catch (error) {
      console.error("Failed to stop typing indicator:", error);
    }
  }, [conversationId]);

  const handleTypingEvent = useCallback((userId: string, conversationId: string | null, isTyping: boolean) => {
    if (isTyping) {
      setTypingUsers(prev => {
        // Remove existing entry for this user
        const filtered = prev.filter(u => u.userId !== userId);
        // Add new entry
        return [...filtered, {
          userId,
          conversationId,
          timestamp: Date.now(),
        }];
      });
    } else {
      setTypingUsers(prev => prev.filter(u => u.userId !== userId));
    }
  }, []);

  // Auto-clear stale typing indicators
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingUsers(prev =>
        prev.filter(user => now - user.timestamp < typingTimeout)
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [typingTimeout]);

  // Debounced typing indicator
  const debouncedStartTyping = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    startTyping();

    timeoutRef.current = setTimeout(() => {
      stopTyping();
    }, typingTimeout);
  }, [startTyping, stopTyping, typingTimeout]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      stopTyping();
    };
  }, [stopTyping]);

  // Filter typing users for current conversation
  const currentTypingUsers = typingUsers.filter(
    user => user.conversationId === conversationId || user.conversationId === null
  );

  return {
    typingUsers: currentTypingUsers,
    isUserTyping: currentTypingUsers.length > 0,
    startTyping: debouncedStartTyping,
    stopTyping,
    handleTypingEvent,
  };
}