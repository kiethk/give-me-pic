"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
    askChat,
    ChatCitation,
    ChatHistoryMessage,
    ChatSession,
    getChatSessionMessages,
    getChatSessions,
    getSubjects,
    Subject,
    renameChatSession,
} from "@/lib/api-client";
import { BottomSheet } from "@/components/BottomSheet";

export default function ChatPage() {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [messages, setMessages] = useState<ChatHistoryMessage[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [subjectFilter, setSubjectFilter] = useState<string>("");
    const [question, setQuestion] = useState("");
    const [error, setError] = useState(""); // global error — only for full-page failures
    const [isSending, setIsSending] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [previewCitation, setPreviewCitation] = useState<ChatCitation | null>(null);
    const [showHistorySheet, setShowHistorySheet] = useState(false);
    
    // Rename state
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
    const [editingTitle, setEditingTitle] = useState("");
    const [isRenaming, setIsRenaming] = useState(false);

    // Stores the last failed send payload so it can be retried inline
    const [failedPayload, setFailedPayload] = useState<{ question: string; sessionId: string | null; subjectId: string | null } | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    async function loadSessions() {
        try {
            setSessions(await getChatSessions());
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Không tải được lịch sử hội thoại.");
        }
    }

    async function loadSessionMessages(sessionId: string) {
        setIsLoadingHistory(true);
        try {
            setMessages(await getChatSessionMessages(sessionId));
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Không tải được nội dung hội thoại.");
        } finally {
            setIsLoadingHistory(false);
        }
    }

    function startNewChat() {
        setCurrentSessionId(null);
        setMessages([]);
    }

    async function handleSend(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const trimmed = question.trim();
        if (!trimmed || isSending) return;

        setIsSending(true);
        setQuestion("");
        setFailedPayload(null);

        const tempUserMessage: ChatHistoryMessage = {
            messageId: `temp-${Date.now()}`,
            role: "user",
            content: trimmed,
            createdAt: new Date().toISOString(),
            citations: [],
        };
        setMessages((current) => [...current, tempUserMessage]);

        const payload = {
            question: trimmed,
            sessionId: currentSessionId,
            subjectId: subjectFilter || null,
        };

        try {
            const response = await askChat(payload);

            if (!currentSessionId) {
                setCurrentSessionId(response.sessionId);
                await loadSessions();
            }

            const assistantMessage: ChatHistoryMessage = {
                messageId: response.messageId,
                role: "assistant",
                content: response.answer,
                createdAt: new Date().toISOString(),
                citations: response.citations,
            };
            setMessages((current) => [...current, assistantMessage]);
        } catch (sendError) {
            const errorText = sendError instanceof Error ? sendError.message : "Could not send question.";
            // Append an inline error bubble instead of a global banner
            const errorMessage: ChatHistoryMessage = {
                messageId: `error-${Date.now()}`,
                role: "assistant",
                content: `__error__${errorText}`,
                createdAt: new Date().toISOString(),
                citations: [],
            };
            setMessages((current) => [...current, errorMessage]);
            setFailedPayload(payload);
        } finally {
            setIsSending(false);
        }
    }

    async function handleRetry() {
        if (!failedPayload || isSending) return;
        // Remove the last error bubble before retrying
        setMessages((current) => current.filter((m) => !m.content.startsWith("__error__")));

        setIsSending(true);
        setFailedPayload(null);
        try {
            const response = await askChat(failedPayload);
            if (!currentSessionId) {
                setCurrentSessionId(response.sessionId);
                await loadSessions();
            }
            const assistantMessage: ChatHistoryMessage = {
                messageId: response.messageId,
                role: "assistant",
                content: response.answer,
                createdAt: new Date().toISOString(),
                citations: response.citations,
            };
            setMessages((current) => [...current, assistantMessage]);
        } catch (retryError) {
            const errorText = retryError instanceof Error ? retryError.message : "Could not send question.";
            const errorMessage: ChatHistoryMessage = {
                messageId: `error-${Date.now()}`,
                role: "assistant",
                content: `__error__${errorText}`,
                createdAt: new Date().toISOString(),
                citations: [],
            };
            setMessages((current) => [...current, errorMessage]);
            setFailedPayload(failedPayload);
        } finally {
            setIsSending(false);
        }
    }

    useEffect(() => {
        Promise.all([getChatSessions().then(setSessions), getSubjects().then(setSubjects)]);
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
        if (currentSessionId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            loadSessionMessages(currentSessionId);
        }
    }, [currentSessionId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
                                                onClick={() => setCurrentSessionId(session.sessionId)}
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
            <div className="flex flex-1 flex-col overflow-hidden relative">
                {/* Mobile controls (Subject filter + New Chat + History) */}
                <div className="md:hidden flex items-center justify-between border-b border-[#e2e8f0] bg-[#f9f9ff] px-4 py-2 shrink-0">
                    <button
                        onClick={() => setShowHistorySheet(true)}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-[#424656]"
                        aria-label="History"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
                        </svg>
                    </button>

                    <select
                        value={subjectFilter}
                        onChange={(e) => setSubjectFilter(e.target.value)}
                        className="h-8 w-32 rounded-md border border-[#c2c6d8] bg-white px-2 text-xs text-[#111c2d] outline-none"
                    >
                        <option value="">All subjects</option>
                        {subjects.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>

                    <button
                        onClick={startNewChat}
                        className="flex h-8 items-center gap-1.5 rounded-md bg-[#0050cb] px-3 text-xs font-semibold text-white active:scale-95 transition-transform"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        New
                    </button>
                </div>

                {/* Error banner */}
                {error && (
                    <div className="mx-4 md:mx-6 mt-4 rounded-xl border border-[#ffdad6] bg-[#fff5f5] px-4 py-3 text-sm text-[#93000a]">
                        {error}
                    </div>
                )}

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-6">
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
                        <div className="space-y-4">
                            {messages.map((message) => {
                                const isError = message.content.startsWith("__error__");
                                const displayContent = isError
                                    ? message.content.replace("__error__", "")
                                    : message.content;

                                return (
                                    <div
                                        key={message.messageId}
                                        className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                                    >
                                        <div
                                            className={`max-w-2xl rounded-2xl px-4 py-3 text-sm ${
                                                message.role === "user"
                                                    ? "bg-[#0050cb] text-white"
                                                    : isError
                                                      ? "border border-[#ffdad6] bg-[#fff5f5] text-[#93000a]"
                                                      : "border border-[#e2e8f0] bg-white text-[#111c2d]"
                                            }`}
                                        >
                                            {isError ? (
                                                <div className="flex items-center gap-3">
                                                    <span>⚠ {displayContent}</span>
                                                    {failedPayload && (
                                                        <button
                                                            type="button"
                                                            onClick={handleRetry}
                                                            disabled={isSending}
                                                            className="shrink-0 rounded-md bg-[#0050cb] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#0066ff] disabled:opacity-50 transition-colors"
                                                        >
                                                            {isSending ? "Retrying…" : "Retry"}
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="prose prose-sm max-w-none text-current marker:text-current prose-p:leading-relaxed prose-pre:bg-[#f0f3ff] prose-pre:text-[#111c2d] prose-a:text-current prose-strong:text-current prose-headings:text-current prose-code:text-current">
                                                    <ReactMarkdown
                                                        remarkPlugins={[remarkGfm, remarkMath]}
                                                        rehypePlugins={[rehypeKatex]}
                                                    >
                                                        {displayContent}
                                                    </ReactMarkdown>
                                                </div>
                                            )}

                                            {!isError && message.role === "assistant" && message.citations.length > 0 && (
                                                <div className="mt-3 border-t border-[#e2e8f0] pt-3">
                                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#727687]">Sources</p>
                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                        {message.citations.map((citation) => (
                                                            <button
                                                                key={citation.chunkId}
                                                                type="button"
                                                                onClick={() => setPreviewCitation(citation)}
                                                                className="flex items-center gap-2 rounded-lg border border-[#e2e8f0] bg-[#f9f9ff] px-2 py-1.5 text-left hover:bg-[#e7eeff] transition-colors"
                                                            >
                                                                <img
                                                                    src={citation.imageUrl}
                                                                    alt={citation.fileName}
                                                                    className="h-6 w-6 rounded object-cover"
                                                                />
                                                                <span className="max-w-[110px] truncate text-xs font-medium text-[#424656]">
                                                                    {citation.fileName}
                                                                </span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
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
                            disabled={isSending}
                            className="flex-1 bg-transparent text-sm text-[#111c2d] placeholder:text-[#727687] outline-none disabled:opacity-60"
                        />
                        <button
                            type="submit"
                            disabled={isSending || !question.trim()}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0050cb] text-white hover:bg-[#0066ff] disabled:opacity-50 transition-colors"
                        >
                            {isSending ? (
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
                            <p className="truncate text-sm font-semibold text-[#111c2d]">{previewCitation.fileName}</p>
                            <button onClick={() => setPreviewCitation(null)} className="text-[#727687] hover:text-[#111c2d] transition-colors">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        </div>
                        <div className="flex max-h-[70vh] items-center justify-center overflow-auto bg-[#f0f3ff] p-4">
                            <img
                                src={previewCitation.imageUrl}
                                alt={previewCitation.fileName}
                                className="max-h-[65vh] rounded-lg object-contain"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}