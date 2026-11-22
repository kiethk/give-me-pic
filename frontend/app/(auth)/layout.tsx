import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen bg-[#f8fafc]">
      {/* Left panel - Branding (hidden on small screens) */}
      <section className="relative hidden w-[48%] flex-col justify-between overflow-hidden p-12 text-white lg:flex xl:w-[46%] xl:p-16">
        {/* Background photo */}
        <Image
          src="/login-background.png"
          alt="Students in lecture capturing notes"
          fill
          priority
          sizes="48vw"
          className="object-cover object-center"
        />

        {/* Sophisticated dark navy vignette & gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#020b1e]/95 via-[#031c4e]/70 to-[#020b1e]/85 backdrop-blur-[0.5px]" />

        {/* Top brand header */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 p-1 backdrop-blur-md ring-1 ring-white/20 shadow-md">
              <Image src="/icons/icon-192x192.png" alt="Give Me Pic logo" width={36} height={36} className="h-9 w-9 rounded-lg object-cover" priority />
            </div>
            <span className="text-xl font-bold tracking-tight text-white drop-shadow-sm">Give Me Pic</span>
          </div>

          <div className="mt-16 xl:mt-24">

            <h1 className="mt-5 max-w-lg text-4xl font-extrabold leading-[1.15] tracking-tight text-white xl:text-5xl drop-shadow-sm">
              Your notes, <br />
              <span className="bg-gradient-to-r from-white via-[#dbeafe] to-[#93c5fd] bg-clip-text text-transparent">
                in the right place.
              </span>
            </h1>

            <p className="mt-5 max-w-md text-base leading-relaxed text-[#c7d7fe] drop-shadow-sm">
              Capture whiteboards, slides, and notebook pages during class. Turn photos into an instant, searchable knowledge base you can chat with.
            </p>



          </div>
        </div>

        {/* Bottom footer */}
        <div className="relative z-10 border-t border-white/15 pt-6 text-xs text-white/70">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              
              Private & encrypted study workspace
            </span>
            <span className="font-mono text-white/50">v1.0</span>
          </div>
        </div>
      </section>

      {/* Right panel - Auth forms */}
      <section className="relative flex flex-1 flex-col items-center justify-center p-6 sm:p-10 lg:p-12 xl:p-16">
        {/* Subtle decorative background ambient glows */}
        <div className="pointer-events-none absolute right-10 top-10 -z-10 h-80 w-80 rounded-full bg-blue-100/50 blur-3xl" />
        <div className="pointer-events-none absolute bottom-10 left-10 -z-10 h-80 w-80 rounded-full bg-indigo-100/40 blur-3xl" />

        <div className="w-full max-w-[440px]">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
            <Image src="/icons/icon-192x192.png" alt="Give Me Pic logo" width={40} height={40} className="h-10 w-10 rounded-xl object-cover shadow-sm" priority />
            <span className="text-xl font-bold tracking-tight text-[#0f172a]">Give Me Pic</span>
          </div>

          {children}
        </div>
      </section>
    </main>
  );
}
