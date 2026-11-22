"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { loginWithGoogle } from "@/lib/api-client";

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: "standard" | "icon";
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              logo_alignment?: "left" | "center";
              width?: number | string;
            }
          ) => void;
          prompt: (notificationCallback?: (notification: unknown) => void) => void;
        };
      };
    };
  }
}

interface GoogleSignInButtonProps {
  mode?: "login" | "register";
  onError?: (message: string) => void;
  onSuccess?: () => void;
  className?: string;
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

export default function GoogleSignInButton({
  mode = "login",
  onError,
  onSuccess,
  className = "",
}: GoogleSignInButtonProps) {
  const router = useRouter();
  const googleBtnContainerRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(() => {
    return typeof window !== "undefined" && Boolean(window.google?.accounts?.id);
  });
  const [isLoading, setIsLoading] = useState(false);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const handleCredentialResponse = useCallback(
    async (response: { credential?: string }) => {
      if (!response.credential) {
        onError?.("Không nhận được token xác thực từ Google.");
        return;
      }

      setIsLoading(true);
      try {
        await loginWithGoogle(response.credential);
        if (onSuccess) {
          onSuccess();
        } else {
          router.push("/dashboard/chat");
        }
      } catch (err) {
        onError?.(err instanceof Error ? err.message : "Đăng nhập với Google thất bại.");
      } finally {
        setIsLoading(false);
      }
    },
    [onError, onSuccess, router]
  );


  useEffect(() => {
    if (!clientId || !scriptLoaded || !googleBtnContainerRef.current) return;

    try {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        const container = googleBtnContainerRef.current;
        container.innerHTML = "";

        const containerWidth = container.offsetWidth || 360;
        const buttonWidth = Math.min(Math.max(containerWidth, 200), 400);

        window.google.accounts.id.renderButton(container, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: buttonWidth,
        });
      }
    } catch (err) {
      console.warn("Failed to initialize Google Sign-In button:", err);
    }
  }, [clientId, scriptLoaded, mode, handleCredentialResponse]);

  return (
    <div className={`w-full ${className}`}>
      {clientId && (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={() => setScriptLoaded(true)}
          onError={() => onError?.("Không thể tải dịch vụ Google Identity Services.")}
        />
      )}

      <div className="flex w-full justify-center">
        {/* Outer wrapper enforcing rounded-xl, 44px height, matching Sign In button */}
        <div className="group relative flex h-11 w-full items-center justify-center overflow-hidden rounded-xl border border-[#cbd5e1] bg-white shadow-sm transition hover:border-[#94a3b8] hover:bg-[#f8fafc]">
          {isLoading ? (
            <span className="flex items-center gap-2 text-sm font-medium text-[#111c2d]">
              <svg
                className="h-4 w-4 animate-spin text-[#0050cb]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Connecting...
            </span>
          ) : (
            <div
              ref={googleBtnContainerRef}
              data-testid="google-signin-btn"
              className="flex h-full w-full items-center justify-center scale-y-[1.18] scale-x-[1.02] translate-x-1 origin-center [&_iframe]:!w-full [&_iframe]:!h-full [&>div]:!w-full [&>div]:!h-full"
            >
              {/* Fallback before Google script renders */}
              {!scriptLoaded && (
                <div className="flex h-full w-full items-center justify-center gap-3 px-4 text-sm font-medium text-[#111c2d]">
                  <GoogleIcon className="h-5 w-5 shrink-0" />
                  <span>Continue with Google</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
