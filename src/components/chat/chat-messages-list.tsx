"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, Check, CheckCheck, MessageSquarePlus, MoreHorizontal } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  receipt?: {
    sentAt: string;
    deliveredAt: string | null;
    readAt: string | null;
  } | null;
  attachments?: Array<{ name: string; mimeType: string; url?: string }>;
  reactions?: Array<{ messageId: string; userId: string; emoji: string; createdAt: string }>;
  threadReplies?: Array<{ id: string; messageId: string; userId: string; content: string; createdAt: string }>;
  status?: "sending" | "streaming" | "sent" | "queued" | "failed";
  retryPayload?: {
    message: string;
    imageDataUrl?: string;
    attachments?: Array<{ name: string; mimeType: string; size: number; url?: string }>;
  };
}

interface ChatMessagesListProps {
  messages: Message[];
  currentUserId: string;
  isLoading?: boolean;
  typingUsers?: Array<{ userId: string; conversationId: string | null }>;
  onMessageReaction?: (messageId: string, emoji: string) => void;
  onThreadReply?: (messageId: string) => void;
  onExplainMessage?: (message: Message) => void;
  onRetryMessage?: (message: Message) => void;
  onNewChat?: () => void;
  className?: string;
}

export function ChatMessagesList({
  messages,
  currentUserId: _currentUserId,
  isLoading,
  typingUsers = [],
  onMessageReaction,
  onThreadReply,
  onExplainMessage,
  onRetryMessage,
  onNewChat,
  className,
}: ChatMessagesListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [scrollState, setScrollState] = useState({
    canScrollUp: false,
    canScrollDown: false,
    isNearBottom: true,
  });
  void _currentUserId;

  const getViewport = useCallback(() => {
    return scrollAreaRef.current?.querySelector<HTMLElement>("[data-slot='scroll-area-viewport']") ?? null;
  }, []);

  const updateScrollState = useCallback(() => {
    const viewport = getViewport();
    if (!viewport) return;

    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const isNearBottom = distanceFromBottom < 80;
    isNearBottomRef.current = isNearBottom;
    setScrollState({
      canScrollUp: viewport.scrollTop > 8,
      canScrollDown: distanceFromBottom > 8,
      isNearBottom,
    });
  }, [getViewport]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  useEffect(() => {
    const viewport = getViewport();
    if (!viewport) return;

    updateScrollState();
    viewport.addEventListener("scroll", updateScrollState, { passive: true });
    return () => viewport.removeEventListener("scroll", updateScrollState);
  }, [getViewport, updateScrollState]);

  useEffect(() => {
    if (messages.length > 0 && isNearBottomRef.current) {
      scrollToBottom("smooth");
    }
    requestAnimationFrame(updateScrollState);
  }, [messages, scrollToBottom, updateScrollState]);

  const formatMessageTime = (dateString: string) => {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true });
  };

  const getReceiptIcon = (receipt: Message["receipt"]) => {
    if (!receipt) return null;

    if (receipt.readAt) {
      return <CheckCheck className="h-3.5 w-3.5 text-cyan-300" />;
    }
    if (receipt.deliveredAt) {
      return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />;
    }
    return <Check className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  return (
    <div className={cn("panel-surface relative flex min-h-0 flex-1 overflow-hidden", className)}>
      <div className={cn("scroll-fade-top", scrollState.canScrollUp && "opacity-100")} />
      <ScrollArea ref={scrollAreaRef} className="flex-1">
      <div className="min-h-full space-y-4 p-4 md:p-6">
        {messages.length === 0 && !isLoading ? (
          <div className="flex min-h-[min(42rem,60vh)] items-center justify-center text-center text-muted-foreground">
            <div className="surface-muted max-w-sm rounded-lg p-6">
              <MessageSquarePlus className="mx-auto mb-3 h-8 w-8 text-foreground" />
              <p className="text-base font-semibold text-foreground">No messages yet</p>
              <p className="mt-1 text-sm">Send your first message to begin the thread.</p>
              {onNewChat && (
                <Button type="button" className="mt-4" onClick={onNewChat}>
                  New Chat
                </Button>
              )}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "group flex gap-3 max-w-[85%]",
                message.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
              )}
            >
              {/* Avatar */}
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarFallback className="text-xs">
                  {message.role === "user" ? "U" : "AI"}
                </AvatarFallback>
              </Avatar>

              {/* Message Content */}
              <div
                className={cn(
                  "rounded-lg px-4 py-3 transition-all duration-150",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "surface-muted text-foreground"
                )}
              >
                {/* Message Text */}
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {message.content}
                </p>

                {/* Attachments */}
                {message.attachments && message.attachments.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {message.attachments.map((attachment, index) => (
                      <div
                        key={`${message.id}-attachment-${index}`}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-xs",
                          message.role === "user"
                            ? "border-white/20 bg-white/10 text-white"
                            : "surface-muted text-muted-foreground"
                        )}
                      >
                        Attachment: {attachment.name} ({attachment.mimeType})
                      </div>
                    ))}
                  </div>
                )}

                {/* Message Footer */}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "text-xs",
                      message.role === "user" ? "text-primary-foreground/75" : "text-muted-foreground"
                    )}
                  >
                    {formatMessageTime(message.createdAt)}
                  </span>

                  {/* Message Actions */}
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    {message.role === "assistant" && onExplainMessage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => onExplainMessage(message)}
                      >
                        Why?
                      </Button>
                    )}

                    {onThreadReply && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => onThreadReply(message.id)}
                      >
                        Reply
                      </Button>
                    )}

                    {onMessageReaction && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                          >
                            <MoreHorizontal className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-32">
                          <DropdownMenuItem onClick={() => onMessageReaction(message.id, "like")}>
                            Like
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onMessageReaction(message.id, "insightful")}>
                            Insightful
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  {/* Read Receipt */}
                  {message.role === "user" && (
                    <div className="flex items-center gap-2">
                      {message.status && message.status !== "sent" ? (
                        <span className={cn("text-xs", message.role === "user" ? "text-primary-foreground/75" : "text-muted-foreground")}>
                          {message.status === "failed"
                            ? "Failed"
                            : message.status === "queued"
                              ? "Queued"
                              : message.status === "streaming"
                                ? "Streaming"
                                : "Sending"}
                        </span>
                      ) : null}
                      {message.status === "failed" && onRetryMessage ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-white hover:bg-white/10 hover:text-white"
                          onClick={() => onRetryMessage(message)}
                        >
                          Retry
                        </Button>
                      ) : (
                        getReceiptIcon(message.receipt)
                      )}
                    </div>
                  )}
                </div>

                {/* Reactions */}
                {message.reactions && message.reactions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {message.reactions.map((reaction, index) => (
                      <span
                        key={`${message.id}-reaction-${index}`}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                          message.role === "user"
                            ? "border-white/20 bg-white/10 text-white"
                            : "surface-muted text-muted-foreground"
                        )}
                      >
                        {reaction.emoji}
                      </span>
                    ))}
                  </div>
                )}

                {/* Thread Replies */}
                {message.threadReplies && message.threadReplies.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      {message.threadReplies.length} thread {message.threadReplies.length === 1 ? "reply" : "replies"}
                    </div>
                    {message.threadReplies.slice(0, 2).map((reply) => (
                      <div
                        key={reply.id}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-xs",
                          message.role === "user"
                            ? "border-white/20 bg-white/10 text-white"
                            : "surface-muted text-muted-foreground"
                        )}
                      >
                        {reply.content}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {/* Typing Indicators */}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-3">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-xs">AI</AvatarFallback>
            </Avatar>
            <div className="surface-muted rounded-lg px-4 py-2">
              <div className="flex space-x-1">
                <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground"></div>
                <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "0.1s" }}></div>
                <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "0.2s" }}></div>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <MessageSkeleton key={i} />
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
      </ScrollArea>
      <div className={cn("scroll-fade-bottom", scrollState.canScrollDown && "opacity-100")} />
      {!scrollState.isNearBottom && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 shadow-lg hover:-translate-x-1/2"
          onClick={() => scrollToBottom("smooth")}
        >
          <ArrowDown className="h-4 w-4" />
          Jump to latest
        </Button>
      )}
    </div>
  );
}
