"use client";

import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
    askChatStream,
    ChatCitation,
    ChatHistoryMessage,
    ChatSession,
    getChatSessionMessages,
    getChatSessions,
    getSubjects,
    QuotaExceededError,
    Subject,
    renameChatSession,
} from "@/lib/api-client";
import { BottomSheet } from "@/components/BottomSheet";

function generateTempId(prefix: string): string {
    return `${prefix}-${Date.now()}`;
}

export default function ChatPage() {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [messages, setMessages] = useState<ChatHistoryMessage[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [subjectFilter, setSubjectFilter] = useState<string>("");
    const [question, setQuestion] = useState("");
    const [error, setError] = useState(""); // global error — only for full-page failures
    const [isSending, setIsSending] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [previewCitation, setPreviewCitation] = useState<ChatCitation | null>(null);
    const [showHistorySheet, setShowHistorySheet] = useState(false);
    const [openSourcesMap, setOpenSourcesMap] = useState<Record<string, boolean>>({});
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

    // Typewriter streaming queue refs
    const typewriterQueueRef = useRef<string>("");
    const typewriterTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isStreamCompletedRef = useRef<boolean>(false);
    const activeAssistantIdRef = useRef<string | null>(null);
    
    // Rename state
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
    const [editingTitle, setEditingTitle] = useState("");
    const [isRenaming, setIsRenaming] = useState(false);

    // Stores the last failed send payload so it can be retried inline
    const [failedPayload, setFailedPayload] = useState<{ question: string; sessionId: string | null; subjectId: string | null } | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const shouldAutoScrollRef = useRef(true);

    const handleScroll = () => {
        const el = chatContainerRef.current;
        if (!el) return;
        const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 100;
        shouldAutoScrollRef.current = isAtBottom;
    };

    const stopTypewriter = () => {
        if (typewriterTimerRef.current) {
            clearInterval(typewriterTimerRef.current);
            typewriterTimerRef.current = null;
        }
        typewriterQueueRef.current = "";
        isStreamCompletedRef.current = false;
        activeAssistantIdRef.current = null;
    };

    const startTypewriter = (assistantId: string) => {
        stopTypewriter();
        activeAssistantIdRef.current = assistantId;
        typewriterQueueRef.current = "";
        isStreamCompletedRef.current = false;

        typewriterTimerRef.current = setInterval(() => {
            const queue = typewriterQueueRef.current;
            if (queue.length > 0) {
                // Adaptive step size: 1-4 chars per 16ms tick
                const chunkSize = queue.length > 80 ? 4 : queue.length > 30 ? 2 : 1;
                const chars = queue.slice(0, chunkSize);
                typewriterQueueRef.current = queue.slice(chunkSize);

                setMessages((current) =>
                    current.map((m) =>
                        m.messageId === activeAssistantIdRef.current
                            ? { ...m, content: m.content + chars }
                            : m
                    )
                );
            } else if (isStreamCompletedRef.current) {
                stopTypewriter();
                setIsStreaming(false);
                setStreamingMessageId(null);
            }
        }, 16);
    };

    function handleStopGenerating() {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        stopTypewriter();
        setIsStreaming(false);
        setIsSending(false);
        setStreamingMessageId(null);
    }

    const toggleSources = (messageId: string) => {
        setOpenSourcesMap((prev) => ({
            ...prev,
            [messageId]: !prev[messageId],
        }));
    };

    const handleCopy = async (text: string, messageId: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedMessageId(messageId);
            setTimeout(() => setCopiedMessageId(null), 2000);
        } catch {
            // ignore clipboard permissions errors
        }
    };

    useEffect(() => {
        return () => {
            if (typewriterTimerRef.current) {
                clearInterval(typewriterTimerRef.current);
            }
        };
    }, []);

    async function loadSessions() {
        try {
            setSessions(await getChatSessions());
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Could not load chat history.");
        }
    }

    async function loadSessionMessages(sessionId: string) {
        setIsLoadingHistory(true);
        try {
            setMessages(await getChatSessionMessages(sessionId));
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Could not load session messages.");
        } finally {
            setIsLoadingHistory(false);
        }
    }

    function handleSelectSession(sessionId: string) {
        if (isStreaming) {
            handleStopGenerating();
        }
        setCurrentSessionId(sessionId);
        loadSessionMessages(sessionId);
    }

    function startNewChat() {
        if (isStreaming) {
            handleStopGenerating();
        }
        setCurrentSessionId(null);
        setMessages([]);
        setFailedPayload(null);
        setError("");
        typewriterQueueRef.current = "";
    }

    async function handleSend(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const trimmed = question.trim();
        if (!trimmed || isSending || isStreaming) return;

        setIsSending(true);
        setIsStreaming(true);
        setQuestion("");
        setFailedPayload(null);
        shouldAutoScrollRef.current = true;

        const tempUserMessage: ChatHistoryMessage = {
            messageId: generateTempId("user"),
            role: "user",
            content: trimmed,
            createdAt: new Date().toISOString(),
            citations: [],
        };

        const assistantId = generateTempId("assistant");
        setStreamingMessageId(assistantId);

        const tempAssistantMessage: ChatHistoryMessage = {
            messageId: assistantId,
            role: "assistant",
            content: "",
            createdAt: new Date().toISOString(),
            citations: [],
        };

        setMessages((current) => [...current, tempUserMessage, tempAssistantMessage]);

        const payload = {
            question: trimmed,
            sessionId: currentSessionId,
            subjectId: subjectFilter || null,
        };

        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        startTypewriter(assistantId);

        try {
            await askChatStream(
                payload,
                {
                    onMetadata: (data) => {
                        if (!currentSessionId && data.sessionId) {
                            setCurrentSessionId(data.sessionId);
                            loadSessions();
                        }
                        setMessages((current) =>
                            current.map((m) =>
                                m.messageId === assistantId
                                    ? { ...m, citations: data.citations }
                                    : m
                            )
                        );
                    },
                    onDelta: (deltaText) => {
                        typewriterQueueRef.current += deltaText;
                    },
                    onDone: () => {
                        isStreamCompletedRef.current = true;
                        loadSessions();
                    },
                    onError: (streamErr) => {
                        stopTypewriter();
                        const errorText = streamErr.message || "Could not complete answer.";
                        setMessages((current) =>
                            current.map((m) =>
                                m.messageId === assistantId
                                    ? { ...m, content: `__error__${errorText}` }
                                    : m
                            )
                        );
                        setFailedPayload(payload);
                        setIsStreaming(false);
                        setStreamingMessageId(null);
                    },
                },
                abortController.signal,
            );
        } catch (sendError: unknown) {
            stopTypewriter();
            if (abortController.signal.aborted) {
                setMessages((current) =>
                    current.map((m) =>
                        m.messageId === assistantId && !m.content
                            ? { ...m, content: "(Generation stopped)" }
                            : m
                    )
                );
            } else if (sendError instanceof QuotaExceededError) {
                setMessages((current) =>
                    current.filter(
                        (m) =>
                            m.messageId !== tempUserMessage.messageId &&
                            m.messageId !== assistantId
                    )
                );
                setQuestion(trimmed);
                window.dispatchEvent(
                    new CustomEvent("open-upgrade-modal", {
                        detail: {
                            message: sendError.message,
                            quotaType: sendError.quotaType,
                        },
                    })
                );
            } else {
                const errorText = sendError instanceof Error ? sendError.message : "Could not send question.";
                setMessages((current) =>
                    current.map((m) =>
                        m.messageId === assistantId
                            ? { ...m, content: `__error__${errorText}` }
                            : m
                    )
                );
                setFailedPayload(payload);
            }
            setIsStreaming(false);
            setStreamingMessageId(null);
        } finally {
            setIsSending(false);
            abortControllerRef.current = null;
        }
    }

    async function handleRetry() {
        if (!failedPayload || isSending || isStreaming) return;
        setMessages((current) => current.filter((m) => !m.content.startsWith("__error__")));

        const payload = failedPayload;
        setIsSending(true);
        setIsStreaming(true);
        setFailedPayload(null);
        shouldAutoScrollRef.current = true;

        const assistantId = generateTempId("assistant");
        setStreamingMessageId(assistantId);

        const tempAssistantMessage: ChatHistoryMessage = {
            messageId: assistantId,
            role: "assistant",
            content: "",
            createdAt: new Date().toISOString(),
            citations: [],
        };
        setMessages((current) => [...current, tempAssistantMessage]);

        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        startTypewriter(assistantId);

        try {
            await askChatStream(
                payload,
                {
                    onMetadata: (data) => {
                        if (!currentSessionId && data.sessionId) {
                            setCurrentSessionId(data.sessionId);
                            loadSessions();
                        }
                        setMessages((current) =>
                            current.map((m) =>
                                m.messageId === assistantId
                                    ? { ...m, citations: data.citations }
                                    : m
                            )
                        );
                    },
                    onDelta: (deltaText) => {
                        typewriterQueueRef.current += deltaText;
                    },
                    onDone: () => {
                        isStreamCompletedRef.current = true;
                        loadSessions();
                    },
                    onError: (streamErr) => {
                        stopTypewriter();
                        const errorText = streamErr.message || "Could not complete answer.";
                        setMessages((current) =>
                            current.map((m) =>
                                m.messageId === assistantId
                                    ? { ...m, content: `__error__${errorText}` }
                                    : m
                            )
                        );
                        setFailedPayload(payload);
                        setIsStreaming(false);
                        setStreamingMessageId(null);
                    },
                },
                abortController.signal,
            );
        } catch (retryError: unknown) {
            stopTypewriter();
            if (abortController.signal.aborted) {
                setMessages((current) =>
                    current.map((m) =>
                        m.messageId === assistantId && !m.content
                            ? { ...m, content: "(Generation stopped)" }
                            : m
                    )
                );
            } else if (retryError instanceof QuotaExceededError) {
                setMessages((current) =>
                    current.filter((m) => m.messageId !== assistantId)
                );
                window.dispatchEvent(
                    new CustomEvent("open-upgrade-modal", {
                        detail: {
                            message: retryError.message,
                            quotaType: retryError.quotaType,
                        },
                    })
                );
            } else {
                const errorText = retryError instanceof Error ? retryError.message : "Could not send question.";
                setMessages((current) =>
                    current.map((m) =>
                        m.messageId === assistantId
                            ? { ...m, content: `__error__${errorText}` }
                            : m
                    )
                );
                setFailedPayload(payload);
            }
            setIsStreaming(false);
            setStreamingMessageId(null);
        } finally {
            setIsSending(false);
            abortControllerRef.current = null;
        }
    }

    useEffect(() => {
        Promise.all([
            getChatSessions().then(setSessions),
            getSubjects().then(setSubjects),
        ]).catch(() => {
            // Handled gracefully: layout redirects to login if unauthenticated
        });
    }, []);

    async function handleRenameSubmit(e: React.FormEvent, sessionId: string) {
        e.preventDefault();
        const trimmed = editingTitle.trim();
        setIsRenaming(true);
        try {
            await renameChatSession(sessionId, trimmed);
            await loadSessions();
            setEditingSessionId(null);
        } catch (err) {
            alert(err instanceof Error ? err.message : "Cannot rename session");
        } finally {
            setIsRenaming(false);
        }
    }

    useEffect(() => {
        if (shouldAutoScrollRef.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    if (!subjects && !sessions) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-[#727687]">
                Loading…
            </div>
        );
    }
    return (
        <div className="flex h-full flex-col md:flex-row">
            {/* ── Sessions sidebar (Desktop) ── */}
            <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-[#e2e8f0] bg-white">
                <div className="border-b border-[#e2e8f0] px-4 py-4">
                    <button
                        onClick={startNewChat}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0050cb] py-2.5 text-sm font-semibold text-white hover:bg-[#0066ff] transition-colors"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        New chat
                    </button>
                </div>

                <div className="px-3 py-3">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#727687] px-2">
                        Search scope
                    </label>
                    <select
                        value={subjectFilter}
                        onChange={(e) => setSubjectFilter(e.target.value)}
                        className="mt-1.5 h-9 w-full rounded-lg border border-[#e2e8f0] bg-[#f9f9ff] px-2.5 text-sm text-[#424656] outline-none transition focus:border-[#0050cb]"
                    >
                        <option value="">All subjects</option>
                        {subjects.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                </div>

                <div className="flex-1 overflow-y-auto px-3 pb-3">
                    <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-[#727687]">
                        History
                    </p>
                    <div className="mt-2 space-y-0.5">
                        {sessions.length === 0 ? (
                            <p className="px-2 py-2 text-sm text-[#727687]">No conversations yet.</p>
                        ) : (
                            sessions.map((session) => (
                                <div key={session.sessionId} className="group relative flex items-center">
                                    {editingSessionId === session.sessionId ? (
                                        <form onSubmit={(e) => handleRenameSubmit(e, session.sessionId)} className="flex w-full items-center gap-2 px-2 py-1">
                                            <input
                                                autoFocus
                                                value={editingTitle}
                                                onChange={(e) => setEditingTitle(e.target.value)}
                                                className="h-8 flex-1 rounded-md border border-[#0050cb] px-2 text-sm outline-none"
                                                disabled={isRenaming}
                                                onBlur={() => setEditingSessionId(null)}
                                            />
                                        </form>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => handleSelectSession(session.sessionId)}
                                                className={`flex flex-1 items-center rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                                                    currentSessionId === session.sessionId
                                                        ? "bg-[#e7eeff] font-medium text-[#0050cb]"
                                                        : "text-[#424656] hover:bg-[#f0f3ff]"
                                                }`}
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mr-2 shrink-0 opacity-60">
                                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                                </svg>
                                                <span className="truncate pr-6">{session.title || "New conversation"}</span>
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setEditingSessionId(session.sessionId);
                                                    setEditingTitle(session.title || "");
                                                }}
                                                className="absolute right-2 opacity-0 group-hover:opacity-100 p-1.5 text-[#727687] hover:text-[#0050cb] transition-opacity bg-white rounded-md shadow-sm border border-[#e2e8f0]"
                                                title="Rename"
                                            >
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                                </svg>
                                            </button>
                                        </>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </aside>

            {/* ── Chat area ── */}
            <div className="flex flex-1 flex-col overflow-hidden relative bg-white">
                {/* Desktop Chat Header */}
                <div className="hidden md:flex shrink-0 items-center border-b border-[#e2e8f0] bg-white px-6 py-3">
                    <h2 className="text-lg font-bold text-[#111c2d]">
                        {currentSessionId
                            ? sessions.find(s => s.sessionId === currentSessionId)?.title || "Chat"
                            : "New conversation"}
                    </h2>
                </div>

                {/* Mobile controls (Subject filter + New Chat + History) */}
                <div className="md:hidden flex flex-col border-b border-[#e2e8f0] bg-white shrink-0">
                    {/* Row 1: session title centered */}
                    <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
                        <button
                            onClick={() => setShowHistorySheet(true)}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#424656] active:bg-[#f0f3ff] transition-colors"
                            aria-label="History"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
                            </svg>
                        </button>

                        <h2 className="flex-1 text-center text-[15px] font-semibold text-[#111c2d] truncate">
                            {currentSessionId
                                ? sessions.find(s => s.sessionId === currentSessionId)?.title || "Chat"
                                : "New chat"}
                        </h2>

                        <button
                            onClick={startNewChat}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#0050cb] active:bg-[#e7eeff] transition-colors"
                            aria-label="New chat"
                        >
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                        </button>
                    </div>

                    {/* Row 2: subject filter as compact pill row */}
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-3 pb-2.5 pt-0.5">
                        <button
                            onClick={() => setSubjectFilter("")}
                            className={`shrink-0 h-7 rounded-full px-3 text-[11px] font-semibold transition-colors active:scale-95 ${
                                subjectFilter === ""
                                    ? "bg-[#0050cb] text-white"
                                    : "bg-[#f0f3ff] text-[#424656]"
                            }`}
                        >
                            All
                        </button>
                        {subjects.map((s) => (
                            <button
                                key={s.id}
                                onClick={() => setSubjectFilter(s.id)}
                                className={`shrink-0 h-7 rounded-full px-3 text-[11px] font-semibold transition-colors active:scale-95 ${
                                    subjectFilter === s.id
                                        ? "bg-[#0050cb] text-white"
                                        : "bg-[#f0f3ff] text-[#424656]"
                                }`}
                            >
                                {s.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Error banner */}
                {error && (
                    <div className="mx-4 md:mx-6 mt-4 rounded-xl border border-[#ffdad6] bg-[#fff5f5] px-4 py-3 text-sm text-[#93000a]">
                        {error}
                    </div>
                )}

                {/* Messages */}
                <div ref={chatContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
                    {isLoadingHistory ? (
                        <div className="flex h-full items-center justify-center">
                            <p className="text-sm text-[#727687]">Loading conversation…</p>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center text-center">
                            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#e7eeff]">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0050cb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                </svg>
                            </div>
                            <p className="mt-4 text-base font-semibold text-[#111c2d]">What do you want to ask about your notes?</p>
                            <p className="mt-1 text-sm text-[#727687]">Answers will cite the exact photos you uploaded.</p>
                        </div>
                    ) : (
                        <div className="space-y-6 max-w-3xl mx-auto w-full">
                            {messages.map((message) => {
                                const isError = message.content.startsWith("__error__");
                                const displayContent = isError
                                    ? message.content.replace("__error__", "")
                                    : message.content;
                                const isStreamingThis = isStreaming && message.messageId === streamingMessageId;
                                const isSourcesOpen = !!openSourcesMap[message.messageId];

                                if (message.role === "user") {
                                    return (
                                        <div key={message.messageId} className="flex justify-end">
                                            <div className="max-w-[85%] md:max-w-xl rounded-2xl bg-[#f1f5f9] px-4 py-2.5 text-sm text-[#0f172a] leading-relaxed shadow-xs">
                                                {displayContent}
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div key={message.messageId} className="flex flex-col w-full group">
                                        {isError ? (
                                            <div className="rounded-xl border border-[#ffdad6] bg-[#fff5f5] px-4 py-3 text-sm text-[#93000a] flex items-center justify-between gap-3">
                                                <span>⚠ {displayContent}</span>
                                                {failedPayload && (
                                                    <button
                                                        type="button"
                                                        onClick={handleRetry}
                                                        disabled={isSending || isStreaming}
                                                        className="shrink-0 rounded-md bg-[#0050cb] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#0066ff] disabled:opacity-50 transition-colors"
                                                    >
                                                        Retry
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <>
                                                <div className="prose prose-slate max-w-none text-sm text-[#0f172a] leading-relaxed prose-p:my-2 prose-pre:my-2 prose-pre:bg-[#f8fafc] prose-pre:text-[#0f172a] prose-pre:border prose-pre:border-[#e2e8f0]">
                                                    {displayContent ? (
                                                        <ReactMarkdown
                                                            remarkPlugins={[remarkGfm, remarkMath]}
                                                            rehypePlugins={[rehypeKatex]}
                                                        >
                                                            {displayContent}
                                                        </ReactMarkdown>
                                                    ) : null}
                                                    {isStreamingThis && (
                                                        <span className="inline-block animate-pulse font-bold text-[#0050cb] select-none ml-0.5">
                                                            ▍
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Citations / Sources collapsible dropdown */}
                                                {!isError && message.role === "assistant" && message.citations && message.citations.length > 0 && (
                                                    <div className="mt-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleSources(message.messageId)}
                                                            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-[#64748b] hover:text-[#0f172a] hover:bg-[#f1f5f9] transition-all"
                                                        >
                                                            <span>Source</span>
                                                            <svg
                                                                width="12"
                                                                height="12"
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                strokeWidth="2.5"
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                className={`transition-transform duration-200 ${isSourcesOpen ? "rotate-180" : ""}`}
                                                            >
                                                                <polyline points="6 9 12 15 18 9" />
                                                            </svg>
                                                        </button>

                                                        {isSourcesOpen && (
                                                            <div className="mt-2 flex flex-wrap gap-2.5 pt-1">
                                                                {message.citations.map((citation, idx) => (
                                                                    <button
                                                                        key={citation.chunkId}
                                                                        type="button"
                                                                        onClick={() => setPreviewCitation(citation)}
                                                                        className="group relative h-20 w-20 overflow-hidden rounded-xl border border-[#e2e8f0] bg-white shadow-xs transition-all hover:border-[#0050cb] hover:shadow-md hover:scale-105 active:scale-95 cursor-pointer"
                                                                        title={`View source citation ${idx + 1}`}
                                                                    >
                                                                        <Image
                                                                            src={citation.imageUrl}
                                                                            alt={`Source ${idx + 1}`}
                                                                            fill
                                                                            unoptimized
                                                                            className="object-cover transition-transform group-hover:scale-110"
                                                                        />
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Action buttons (copy response) */}
                                                {!isStreamingThis && displayContent && (
                                                    <div className="mt-2 flex items-center gap-2 text-[#94a3b8] opacity-80 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCopy(displayContent, message.messageId)}
                                                            className="flex items-center gap-1 rounded p-1 hover:bg-[#f1f5f9] hover:text-[#0f172a] transition-colors"
                                                            title="Copy response"
                                                        >
                                                            {copiedMessageId === message.messageId ? (
                                                                <>
                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                        <polyline points="20 6 9 17 4 12" />
                                                                    </svg>
                                                                    <span className="text-[11px] font-medium text-[#16a34a]">Copied</span>
                                                                </>
                                                            ) : (
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                                                </svg>
                                                            )}
                                                        </button>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>

                {/* Input bar */}
                <form onSubmit={handleSend} className="shrink-0 border-t border-[#e2e8f0] bg-white px-4 md:px-6 py-3 md:py-4">
                    <div className="flex items-center gap-3 rounded-xl border border-[#c2c6d8] bg-[#f9f9ff] px-4 py-2 transition-colors focus-within:border-[#0050cb] focus-within:ring-2 focus-within:ring-[#0050cb]/15">
                        <input
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            placeholder="Ask anything about your notes…"
                            disabled={isSending || isStreaming}
                            className="flex-1 bg-transparent text-sm text-[#111c2d] placeholder:text-[#727687] outline-none disabled:opacity-60"
                        />
                        {isStreaming && (
                            <button
                                type="button"
                                onClick={handleStopGenerating}
                                className="flex items-center gap-1.5 rounded-lg border border-[#ba1a1a] bg-white px-2.5 py-1 text-xs font-semibold text-[#ba1a1a] hover:bg-[#fff5f5] active:scale-95 transition-all shadow-sm"
                                title="Stop generating"
                            >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                                    <rect x="4" y="4" width="16" height="16" rx="2" />
                                </svg>
                                <span>Stop</span>
                            </button>
                        )}
                        <button
                            type="submit"
                            disabled={isSending || isStreaming || !question.trim()}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0050cb] text-white hover:bg-[#0066ff] disabled:opacity-50 transition-colors"
                        >
                            {isSending && !isStreaming ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                                </svg>
                            ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                                </svg>
                            )}
                        </button>
                    </div>
                </form>
            </div>

            {/* Citation preview modal */}
            {previewCitation && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
                    onClick={() => setPreviewCitation(null)}
                >
                    <div
                        className="max-h-[85vh] max-w-2xl overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-[#e2e8f0] px-5 py-3">
                            <p className="truncate text-sm font-semibold text-[#111c2d]">Source photo</p>
                            <button onClick={() => setPreviewCitation(null)} className="text-[#727687] hover:text-[#111c2d] transition-colors">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        </div>
                        <div className="flex max-h-[70vh] items-center justify-center overflow-auto bg-[#f0f3ff] p-4">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={previewCitation.imageUrl}
                                alt="Source photo"
                                className="max-h-[65vh] rounded-lg object-contain"
                            />
                        </div>
                    </div>
                </div>
            )}
            {/* Mobile History Sheet */}
            <BottomSheet
                open={showHistorySheet}
                onClose={() => setShowHistorySheet(false)}
                title="Chat History"
            >
                <div className="px-5 py-2">
                    <div className="space-y-1 pb-4">
                        {sessions.length === 0 ? (
                            <p className="py-4 text-center text-sm text-[#727687]">No conversations yet.</p>
                        ) : (
                            sessions.map((session) => (
                                <div key={session.sessionId} className="relative flex items-center">
                                    {editingSessionId === session.sessionId ? (
                                        <form onSubmit={(e) => handleRenameSubmit(e, session.sessionId)} className="flex w-full items-center gap-2 py-2">
                                            <input
                                                autoFocus
                                                value={editingTitle}
                                                onChange={(e) => setEditingTitle(e.target.value)}
                                                className="h-10 flex-1 rounded-lg border border-[#0050cb] px-3 text-sm outline-none"
                                                disabled={isRenaming}
                                                onBlur={() => setEditingSessionId(null)}
                                            />
                                        </form>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => {
                                                    handleSelectSession(session.sessionId);
                                                    setShowHistorySheet(false);
                                                }}
                                                className={`flex flex-1 items-center rounded-xl px-4 py-3.5 text-left text-[15px] transition-colors ${
                                                    currentSessionId === session.sessionId
                                                        ? "bg-[#e7eeff] font-medium text-[#0050cb]"
                                                        : "text-[#111c2d] hover:bg-[#f0f3ff]"
                                                }`}
                                            >
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mr-3 shrink-0 opacity-60">
                                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                                </svg>
                                                <span className="truncate pr-8">{session.title || "New conversation"}</span>
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setEditingSessionId(session.sessionId);
                                                    setEditingTitle(session.title || "");
                                                }}
                                                className="absolute right-3 p-2 text-[#727687] hover:text-[#0050cb]"
                                                title="Rename"
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                                </svg>
                                            </button>
                                        </>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </BottomSheet>
        </div>
    );
}