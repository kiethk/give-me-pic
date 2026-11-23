import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-x-hidden bg-slate-950 px-4 py-8 sm:px-6 sm:py-12">
      {/* ── Background photo (visible on both Mobile and Desktop) ── */}
      <div className="fixed inset-0 z-0">
        <Image
          src="/login-background.png"
          alt="Students in lecture capturing notes"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center scale-105"
        />
        {/* Cinematic dark navy vignette overlay so the photo shows through with deep contrast */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/85 via-slate-900/70 to-slate-950/90 backdrop-blur-[1.5px]" />
      </div>

      {/* ── Content container ── */}
      <div className="relative z-10 flex w-full max-w-5xl items-center justify-between gap-10 lg:gap-16">
        {/* Left Branding (Desktop only) */}
        <div className="hidden max-w-lg flex-1 flex-col justify-between text-white lg:flex">
          <div>
            <div className="inline-flex items-center gap-2.5 rounded-xl bg-white/10 px-3.5 py-1.5 backdrop-blur-md ring-1 ring-white/20 shadow-sm">
              <Image src="/icons/icon-192x192.png" alt="Logo" width={28} height={28} className="h-7 w-7 rounded-md object-cover" priority />
              <span className="text-base font-bold tracking-tight text-white">Give Me Pic</span>
            </div>

            <div className="mt-12">
              <h1 className="mt-4 text-4xl font-extrabold leading-[1.15] tracking-tight text-white xl:text-5xl drop-shadow-md">
                Your notes, <br />
                <span className="bg-gradient-to-r from-blue-200 via-sky-200 to-indigo-200 bg-clip-text text-transparent">
                  in the right place.
                </span>
              </h1>

              <p className="mt-4 text-sm leading-relaxed text-slate-300 drop-shadow">
                Capture whiteboards and slides in class. Transcribe with OCR and chat with your notes instantly.
              </p>
            </div>
          </div>

          <div className="mt-16 border-t border-white/15 pt-4 text-xs text-slate-400">
            Private & encrypted study workspace
          </div>
        </div>

        {/* Right Auth Box (Centered on Mobile, Right on Desktop) */}
        <div className="mx-auto w-full max-w-[380px] lg:mx-0">
          {/* Mobile Top Logo Badge */}
          <div className="mb-4 flex flex-col items-center justify-center gap-1.5 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 p-2 shadow-md ring-1 ring-white/25 backdrop-blur-md">
              <Image src="/icons/icon-192x192.png" alt="Logo" width={32} height={32} className="h-8 w-8 rounded-lg object-cover" priority />
            </div>
            <span className="text-base font-semibold tracking-tight text-white drop-shadow-sm">Give Me Pic</span>
          </div>

          {/* Children: Login or Register glass card */}
          {children}
        </div>
      </div>
    </main>
  );
}
