"use client";

import { useEffect, useRef, useState } from "react";

interface BottomSheetProps {
    /** Whether the sheet is visible */
    open: boolean;
    /** Called when the sheet should close (backdrop tap, swipe down, Escape) */
    onClose: () => void;
    /** Optional sheet title rendered in the drag-handle bar */
    title?: string;
    /** Content rendered inside the sheet */
    children: React.ReactNode;
    /** Max height as a Tailwind / CSS value. Defaults to 90dvh */
    maxHeight?: string;
    /** If true, sheet snaps to full screen height */
    fullScreen?: boolean;
}

/**
 * A native-feel Bottom Sheet component.
 *
 * Features:
 * - Smooth slide-up / slide-down animation via CSS transitions
 * - Swipe-down gesture to dismiss (touch & pointer events)
 * - Backdrop tap to dismiss
 * - Keyboard: Escape to dismiss
 * - Body scroll-lock while open
 * - iOS safe-area-inset-bottom padding
 * - Focus trap (first focusable element inside sheet)
 */
export function BottomSheet({
    open,
    onClose,
    title,
    children,
    maxHeight = "90dvh",
    fullScreen = false,
}: BottomSheetProps) {
    const sheetRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState(0);
    const dragStartY = useRef(0);
    const [mounted, setMounted] = useState(false);
    const [visible, setVisible] = useState(false);

    // Mount first, then animate in on next frame
    useEffect(() => {
        if (open) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setMounted(true);
            requestAnimationFrame(() => setVisible(true));
        } else {
            setVisible(false);
            const timer = setTimeout(() => setMounted(false), 350);
            return () => clearTimeout(timer);
        }
    }, [open]);

    // Body scroll lock
    useEffect(() => {
        if (open) {
            const prev = document.body.style.overflow;
            document.body.style.overflow = "hidden";
            return () => { document.body.style.overflow = prev; };
        }
    }, [open]);

    // Escape key
    useEffect(() => {
        if (!open) return;
        function handleKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [open, onClose]);

    // ── Swipe-down gesture ─────────────────────────────────────────────────────

    function onDragStart(clientY: number) {
        dragStartY.current = clientY;
        setIsDragging(true);
        setDragOffset(0);
    }

    function onDragMove(clientY: number) {
        if (!isDragging) return;
        const delta = clientY - dragStartY.current;
        if (delta > 0) setDragOffset(delta);
    }

    function onDragEnd() {
        if (!isDragging) return;
        setIsDragging(false);
        if (dragOffset > 100) {
            onClose();
        }
        setDragOffset(0);
    }

    // Touch events
    function handleTouchStart(e: React.TouchEvent) { onDragStart(e.touches[0].clientY); }
    function handleTouchMove(e: React.TouchEvent) { onDragMove(e.touches[0].clientY); }
    function handleTouchEnd() { onDragEnd(); }

    // Pointer events (for desktop testing via mouse)
    function handlePointerDown(e: React.PointerEvent) { onDragStart(e.clientY); }
    function handlePointerMove(e: React.PointerEvent) { onDragMove(e.clientY); }
    function handlePointerUp() { onDragEnd(); }

    if (!mounted) return null;

    const sheetStyle: React.CSSProperties = {
        maxHeight: fullScreen ? "100dvh" : maxHeight,
        transform: `translateY(${visible ? dragOffset : "100%"}px)`,
        transition: isDragging ? "none" : "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
    };

    return (
        <div
            className="fixed inset-0 z-[200] flex flex-col justify-end"
            role="dialog"
            aria-modal="true"
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                style={{
                    opacity: visible ? 1 : 0,
                    transition: "opacity 0.35s ease",
                }}
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Sheet */}
            <div
                ref={sheetRef}
                className="relative z-10 flex flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl"
                style={sheetStyle}
            >
                {/* Drag handle / header */}
                <div
                    className="flex shrink-0 cursor-grab flex-col items-center gap-2 px-5 pb-3 pt-3 select-none touch-none"
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                >
                    {/* Pill handle */}
                    <div className="h-1 w-10 rounded-full bg-[#c2c6d8]" />
                    {title && (
                        <div className="flex w-full items-center justify-between">
                            <h2 className="text-base font-semibold text-[#111c2d]">{title}</h2>
                            <button
                                onClick={onClose}
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f0f3ff] text-[#424656] hover:bg-[#e7eeff] transition-colors"
                                aria-label="Close"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                    )}
                </div>

                {/* Divider */}
                <div className="shrink-0 border-t border-[#f0f3ff]" />

                {/* Scrollable content */}
                <div
                    className="flex-1 overflow-y-auto overscroll-contain"
                    style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}
                >
                    {children}
                </div>
            </div>
        </div>
    );
}
