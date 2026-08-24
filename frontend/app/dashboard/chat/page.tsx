"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
    askChat,
    ChatCitation,
    ChatHistoryMessage,
    ChatSession,
    getChatSessionMessages,
    getChatSessions,
    getProfile,
    getSubjects,
    Subject,
    UserProfile,
} from "@/lib/api-client";

export default function ChatPage() {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [messages, setMessages] = useState<ChatHistoryMessage[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [subjectFilter, setSubjectFilter] = useState<string>("");
    const [question, setQuestion] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [previewCitation, setPreviewCitation] = useState<ChatCitation | null>(null);
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

        setError("");
        setIsSending(true);
        setQuestion("");

        const tempUserMessage: ChatHistoryMessage = {
            messageId: `temp-${Date.now()}`,
            role: "user",
            content: trimmed,
            createdAt: new Date().toISOString(),
            citations: [],
        };
        setMessages((current) => [...current, tempUserMessage]);

        try {
            const response = await askChat({
                question: trimmed,
                sessionId: currentSessionId,
                subjectId: subjectFilter || null,
            });

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
            setError(sendError instanceof Error ? sendError.message : "Không thể gửi câu hỏi.");
        } finally {
            setIsSending(false);
        }
    }

    useEffect(() => {
        getProfile()
            .then((profileData) => {
                setProfile(profileData);
                return Promise.all([loadSessions(), getSubjects().then(setSubjects)]);
            })
            .catch(() => setError("Bạn cần đăng nhập để xem trang này."));
    }, []);

    useEffect(() => {
        if (currentSessionId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            loadSessionMessages(currentSessionId);
        }
    }, [currentSessionId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    if (!profile) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-[var(--background)] text-[var(--ink-muted)]">
                Loading...
            </main>
        );
    }

    return (
        <main className="flex h-screen bg-[var(--background)]">
            {/* Sidebar */}
            <aside className="flex w-72 flex-col border-r border-[var(--line)] bg-[#fbfaf6] p-5">
                <Link
                    href="/dashboard"
                    className="text-sm font-medium text-[var(--forest)] underline underline-offset-4"
                >
                    ← Back to dashboard
                </Link>

                <button
                    onClick={startNewChat}
                    className="mt-5 flex h-11 w-full items-center justify-center bg-[var(--coral)] px-4 font-semibold text-white transition-transform hover:-translate-y-0.5"
                >
                    + New chat
                </button>

                <div className="mt-5">
                    <label className="block text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                        Phạm vi tra cứu
                    </label>
                    <select
                        value={subjectFilter}
                        onChange={(event) => setSubjectFilter(event.target.value)}
                        className="mt-2 h-10 w-full border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--forest)]"
                    >
                        <option value="">Toàn bộ dữ liệu</option>
                        {subjects.map((subject) => (
                            <option key={subject.id} value={subject.id}>
                                {subject.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="mt-6 flex-1 overflow-y-auto">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                        Lịch sử hội thoại
                    </p>
                    <div className="mt-3 space-y-1">
                        {sessions.length === 0 ? (
                            <p className="text-sm text-[var(--ink-muted)]">Chưa có hội thoại nào.</p>
                        ) : (
                            sessions.map((session) => (
                                <button
                                    key={session.sessionId}
                                    onClick={() => setCurrentSessionId(session.sessionId)}
                                    className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm ${
                                        currentSessionId === session.sessionId
                                            ? "bg-[#eef4ee] font-medium text-[var(--forest)]"
                                            : "text-[var(--ink-muted)] hover:bg-white"
                                    }`}
                                >
                                    {session.title || "Hội thoại mới"}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </aside>

            {/* Main chat area */}
            <div className="flex flex-1 flex-col">
                <header className="border-b border-[var(--line)] px-8 py-5">
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--coral)]">
                        Give Me Pic
                    </p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight">Ask your notes</h1>
                </header>

                {error && (
                    <div className="mx-8 mt-4 border border-[var(--coral)] bg-[#fdf0ee] px-4 py-3 text-sm text-[var(--coral)]">
                        {error}
                    </div>
                )}

                <div className="flex-1 overflow-y-auto px-8 py-6">
                    {isLoadingHistory ? (
                        <p className="text-sm text-[var(--ink-muted)]">Đang tải hội thoại...</p>
                    ) : messages.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center text-center text-[var(--ink-muted)]">
                            <p className="text-lg font-medium">Bạn muốn hỏi gì về tài liệu đã học?</p>
                            <p className="mt-1 text-sm">Câu trả lời sẽ trích dẫn đúng ảnh gốc bạn đã upload.</p>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {messages.map((message) => (
                                <div
                                    key={message.messageId}
                                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                                >
                                    <div
                                        className={`max-w-2xl px-4 py-3 text-sm ${
                                            message.role === "user"
                                                ? "bg-[var(--forest)] text-white"
                                                : "border border-[var(--line)] bg-[#fbfaf6]"
                                        }`}
                                    >
                                        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>

                                        {message.role === "assistant" && message.citations.length > 0 && (
                                            <div className="mt-3 border-t border-[var(--line)] pt-3">
                                                <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                                                    Nguồn trích dẫn
                                                </p>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {message.citations.map((citation) => (
                                                        <button
                                                            key={citation.chunkId}
                                                            type="button"
                                                            onClick={() => setPreviewCitation(citation)}
                                                            className="flex items-center gap-2 border border-[var(--line)] bg-white px-2 py-1 text-left hover:-translate-y-0.5 transition-transform"
                                                        >
                                                            <img
                                                                src={citation.imageUrl}
                                                                alt={citation.fileName}
                                                                className="h-6 w-6 object-cover"
                                                            />
                                                            <span className="max-w-[120px] truncate text-xs font-medium">
                                                                {citation.fileName}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>

                <form onSubmit={handleSend} className="border-t border-[var(--line)] px-8 py-5">
                    <div className="flex gap-3">
                        <input
                            value={question}
                            onChange={(event) => setQuestion(event.target.value)}
                            placeholder="Nhập câu hỏi tự nhiên..."
                            disabled={isSending}
                            className="h-12 flex-1 border-b border-[var(--line)] bg-transparent px-1 outline-none transition-colors focus:border-[var(--forest)] disabled:opacity-60"
                        />
                        <button
                            type="submit"
                            disabled={isSending || !question.trim()}
                            className="flex h-12 items-center justify-center bg-[var(--coral)] px-6 font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSending ? "Đang trả lời..." : "Gửi"}
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
                        className="max-h-[85vh] max-w-2xl overflow-hidden border border-[var(--line)] bg-white"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
                            <p className="truncate text-sm font-medium">{previewCitation.fileName}</p>
                            <button
                                onClick={() => setPreviewCitation(null)}
                                className="text-lg font-bold text-[var(--ink-muted)]"
                            >
                                &times;
                            </button>
                        </div>
                        <div className="flex max-h-[70vh] items-center justify-center overflow-auto bg-[#eef4ee] p-4">
                            <img
                                src={previewCitation.imageUrl}
                                alt={previewCitation.fileName}
                                className="max-h-[65vh] object-contain"
                            />
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}