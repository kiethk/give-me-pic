"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
    BillingOrder,
    BillingPlanCode,
    BillingSummary,
    createBillingOrder,
    getBillingOrderStatus,
} from "@/lib/api-client";
import { BottomSheet } from "@/components/BottomSheet";

interface UpgradeProModalProps {
    open: boolean;
    onClose: () => void;
    summary: BillingSummary | null;
    onUpgraded: () => void;
    initialNotice?: string | null;
}

type ModalStep = "select" | "qr" | "success";

interface PlanOption {
    code: BillingPlanCode;
    label: string;
    priceDisplay: string;
    badge?: string;
}

const PLAN_OPTIONS: PlanOption[] = [
    {
        code: "pro_monthly",
        label: "Monthly",
        priceDisplay: "49,000đ / month",
    },
    {
        code: "pro_yearly",
        label: "Yearly",
        priceDisplay: "490,000đ / year",
        badge: "Save 17%",
    },
];

function formatVnd(amount: number): string {
    return `${amount.toLocaleString("en-US")} VND`;
}

function formatExpiryDate(iso: string | null): string | null {
    if (!iso) return null;
    try {
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return null;
        return new Intl.DateTimeFormat("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        }).format(date);
    } catch {
        return null;
    }
}

function UpgradeProContent({
    open,
    onClose,
    summary,
    onUpgraded,
    initialNotice,
}: UpgradeProModalProps) {
    const [step, setStep] = useState<ModalStep>("select");
    const [selectedPlan, setSelectedPlan] = useState<BillingPlanCode>("pro_monthly");
    const [order, setOrder] = useState<BillingOrder | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const onUpgradedRef = useRef(onUpgraded);
    useEffect(() => {
        onUpgradedRef.current = onUpgraded;
    }, [onUpgraded]);

    const orderCode = order?.orderCode;
    const orderStatus = order?.status;

    // Poll PayOS order status every 3000ms while waiting for QR payment
    useEffect(() => {
        if (!open || step !== "qr" || !orderCode || orderStatus !== "pending") {
            return;
        }

        let cancelled = false;
        const intervalId = setInterval(async () => {
            try {
                const latest = await getBillingOrderStatus(orderCode);
                if (cancelled) return;
                setOrder(latest);
                if (latest.status === "active") {
                    setErrorMessage(null);
                    setStep("success");
                    onUpgradedRef.current();
                } else if (latest.status === "cancelled" || latest.status === "expired") {
                    setErrorMessage(
                        latest.status === "expired"
                            ? "This VietQR code has expired. Please generate a new QR code to continue."
                            : "This payment was cancelled. Please generate a new QR code to try again.",
                    );
                }
            } catch {
                // Transient network error while polling — retry on next tick
            }
        }, 3000);

        return () => {
            cancelled = true;
            clearInterval(intervalId);
        };
    }, [open, step, orderCode, orderStatus]);

    async function handleCreateOrder(planToCreate: BillingPlanCode = selectedPlan) {
        setIsCreating(true);
        setErrorMessage(null);
        try {
            const created = await createBillingOrder(planToCreate);
            setOrder(created);
            if (created.status === "active") {
                setStep("success");
                onUpgradedRef.current();
            } else {
                setStep("qr");
            }
        } catch (err) {
            setErrorMessage(
                err instanceof Error ? err.message : "Could not create payment order. Please try again.",
            );
        } finally {
            setIsCreating(false);
        }
    }

    function handleBackToPlans() {
        setStep("select");
        setOrder(null);
        setErrorMessage(null);
    }

    const isPro = summary?.tier === "pro";
    const proExpiresLabel = formatExpiryDate(summary?.expiresAt ?? null);
    const isOrderTerminalFailure = order?.status === "cancelled" || order?.status === "expired";

    return (
        <div className="px-5 py-4 space-y-4">
            {initialNotice && step === "select" && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-amber-600">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{initialNotice}</span>
                </div>
            )}

            {errorMessage && (
                <div className="flex items-start gap-2.5 rounded-xl bg-[#ffdad6] px-3.5 py-2.5 text-[13px] text-[#93000a]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{errorMessage}</span>
                </div>
            )}

            {step === "select" && (
                <div className="space-y-4">
                    {isPro && (
                        <div className="flex items-center justify-between rounded-xl border border-[#0050cb]/20 bg-[#f0f3ff] px-3.5 py-2.5">
                            <div>
                                <p className="text-[13px] font-semibold text-[#0050cb]">
                                    Pro plan active
                                </p>
                                <p className="text-[12px] text-[#424656]">
                                    {proExpiresLabel
                                        ? `Valid until ${proExpiresLabel}`
                                        : "Your Pro subscription is currently active."}
                                </p>
                            </div>
                            <span className="rounded-full bg-[#0050cb] px-2.5 py-0.5 text-[11px] font-semibold text-white">
                                PRO
                            </span>
                        </div>
                    )}

                    {/* Plan toggle */}
                    <div className="grid grid-cols-2 gap-2.5">
                        {PLAN_OPTIONS.map((plan) => {
                            const selected = selectedPlan === plan.code;
                            return (
                                <button
                                    key={plan.code}
                                    type="button"
                                    onClick={() => setSelectedPlan(plan.code)}
                                    className={`relative flex flex-col items-start rounded-xl border p-3.5 text-left transition-all ${
                                        selected
                                            ? "border-[#0050cb] bg-[#f0f3ff] ring-2 ring-[#0050cb]/15"
                                            : "border-[#e2e8f0] bg-[#f8fafc] hover:border-[#c2c6d8]"
                                    }`}
                                >
                                    <div className="flex w-full items-center justify-between gap-1">
                                        <span className="text-[13px] font-semibold text-[#0f172a]">
                                            {plan.label}
                                        </span>
                                        {plan.badge && (
                                            <span className="rounded-full bg-[#0050cb] px-2 py-0.5 text-[10px] font-semibold text-white">
                                                {plan.badge}
                                            </span>
                                        )}
                                    </div>
                                    <span className="mt-1.5 text-[14px] font-bold text-[#0050cb]">
                                        {plan.priceDisplay}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Free vs Pro comparison */}
                    <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3.5 space-y-2.5">
                        <div className="rounded-lg border border-[#e2e8f0] bg-white px-3 py-2.5">
                            <p className="text-[12px] font-semibold uppercase tracking-wide text-[#727687]">
                                Free
                            </p>
                            <p className="mt-1 text-[13px] text-[#424656]">
                                20 photos/mo · 30 AI questions/mo · 500 MB
                            </p>
                        </div>
                        <div className="rounded-lg border border-[#0050cb]/30 bg-white px-3 py-2.5">
                            <div className="flex items-center justify-between">
                                <p className="text-[12px] font-semibold uppercase tracking-wide text-[#0050cb]">
                                    Pro
                                </p>
                                <span className="text-[11px] font-medium text-[#0050cb]">
                                    Recommended
                                </span>
                            </div>
                            <p className="mt-1 text-[13px] font-medium text-[#0f172a]">
                                500 photos/mo · 500 AI questions/mo · 10 GB
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => handleCreateOrder()}
                        disabled={isCreating}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0050cb] px-4 py-3 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-[#0042a8] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isCreating ? (
                            <>
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                Creating VietQR order…
                            </>
                        ) : (
                            "Pay with VietQR"
                        )}
                    </button>
                </div>
            )}

            {step === "qr" && order && (
                <div className="space-y-4">
                    <div className="flex flex-col items-center rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-5 text-center">
                        <div className="rounded-2xl border border-[#e2e8f0] bg-white p-3.5 shadow-sm">
                            {order.qrCode ? (
                                <QRCodeSVG
                                    value={order.qrCode}
                                    size={200}
                                    level="M"
                                    bgColor="#ffffff"
                                    fgColor="#0f172a"
                                />
                            ) : (
                                <div className="flex h-[200px] w-[200px] items-center justify-center text-xs text-[#727687]">
                                    QR code unavailable — use checkout link below
                                </div>
                            )}
                        </div>

                        <p className="mt-4 text-lg font-bold text-[#0f172a]">
                            {formatVnd(order.amountVnd)}
                        </p>
                        <p className="mt-0.5 text-[13px] text-[#424656]">
                            Order code: <span className="font-mono font-semibold text-[#0f172a]">#{order.orderCode}</span>
                        </p>
                        <p className="mt-1.5 text-[12px] text-[#727687]">
                            Scan with any Vietnamese banking app. QR code expires in 15 minutes.
                        </p>

                        {!isOrderTerminalFailure && (
                            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#e7eeff] px-3 py-1 text-[12px] font-medium text-[#0050cb]">
                                <span className="h-2 w-2 animate-pulse rounded-full bg-[#0050cb]" />
                                Waiting for payment confirmation…
                            </div>
                        )}
                    </div>

                    {isOrderTerminalFailure ? (
                        <div className="flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={() => handleCreateOrder(order.plan)}
                                disabled={isCreating}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0050cb] px-4 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-[#0042a8] disabled:opacity-60"
                            >
                                {isCreating ? "Creating new QR…" : "Generate new VietQR"}
                            </button>
                            <button
                                type="button"
                                onClick={handleBackToPlans}
                                className="w-full rounded-xl border border-[#e2e8f0] bg-white px-4 py-2.5 text-[13px] font-medium text-[#424656] hover:bg-[#f8fafc]"
                            >
                                Change plan
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {order.checkoutUrl && (
                                <a
                                    href={order.checkoutUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#0050cb] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0050cb] transition-colors hover:bg-[#f0f3ff]"
                                >
                                    Open PayOS checkout page
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                        <polyline points="15 3 21 3 21 9" />
                                        <line x1="10" y1="14" x2="21" y2="3" />
                                    </svg>
                                </a>
                            )}
                            <button
                                type="button"
                                onClick={handleBackToPlans}
                                className="w-full rounded-xl border border-[#e2e8f0] bg-white px-4 py-2.5 text-[13px] font-medium text-[#424656] hover:bg-[#f8fafc]"
                            >
                                Back to plans
                            </button>
                        </div>
                    )}
                </div>
            )}

            {step === "success" && (
                <div className="flex flex-col items-center rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] px-5 py-6 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#d3e5cf] text-[#2e5c26]">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    </div>
                    <h3 className="mt-3 text-lg font-bold text-[#0f172a]">
                        Pro unlocked!
                    </h3>
                    <p className="mt-1 text-[13px] text-[#424656]">
                        Your account now has 500 photos/mo, 500 AI questions/mo, and 10 GB storage.
                    </p>
                    <button
                        type="button"
                        onClick={onClose}
                        className="mt-5 w-full rounded-xl bg-[#0050cb] px-4 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-[#0042a8]"
                    >
                        Done
                    </button>
                </div>
            )}
        </div>
    );
}

export function UpgradeProModal(props: UpgradeProModalProps) {
    const [sessionKey, setSessionKey] = useState(0);
    const [prevOpen, setPrevOpen] = useState(props.open);

    if (props.open !== prevOpen) {
        setPrevOpen(props.open);
        if (props.open) {
            setSessionKey((k) => k + 1);
        }
    }

    return (
        <BottomSheet
            open={props.open}
            onClose={props.onClose}
            title="Upgrade to Pro"
        >
            <UpgradeProContent key={sessionKey} {...props} />
        </BottomSheet>
    );
}
