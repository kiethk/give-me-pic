export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen bg-[#f0f3ff]">
      {/* Left panel - Branding (hidden on small screens) */}
      <section className="hidden w-[45%] flex-col justify-between bg-[#0050cb] p-12 text-white lg:flex">
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <img src="/icons/icon-192x192.png" alt="Give Me Pic logo" className="h-10 w-10 rounded-xl object-cover shadow-sm" />
            <span className="text-lg font-bold tracking-tight">Give Me Pic</span>
          </div>
          <h1 className="mt-20 max-w-lg text-4xl font-bold leading-tight tracking-tight text-white xl:text-5xl">
            Your notes,<br />in the right place.
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-[#b3c5ff]">
            Capture the moment in class. Build an intelligent study archive you can return to when the details matter most.
          </p>
        </div>
        
        <div className="relative z-10 border-t border-white/20 pt-6 text-sm text-[#b3c5ff]">
          <div className="flex items-center justify-between">
            <span>Private & secure workspace</span>
            <span>Give Me Pic 1.0</span>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute right-0 top-0 h-full w-full overflow-hidden opacity-10 pointer-events-none">
          <svg className="absolute -right-[20%] -top-[10%] h-[80%] w-[80%]" viewBox="0 0 100 100" preserveAspectRatio="none">
            <circle cx="50" cy="50" r="50" fill="currentColor" />
          </svg>
          <svg className="absolute -bottom-[20%] -left-[10%] h-[60%] w-[60%]" viewBox="0 0 100 100" preserveAspectRatio="none">
            <circle cx="50" cy="50" r="50" fill="currentColor" />
          </svg>
        </div>
      </section>

      {/* Right panel - Auth forms */}
      <section className="flex flex-1 flex-col items-center justify-center p-6 sm:p-12 lg:p-16">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <img src="/icons/icon-192x192.png" alt="Give Me Pic logo" className="h-10 w-10 rounded-xl object-cover shadow-sm" />
            <span className="text-xl font-bold tracking-tight text-[#111c2d]">Give Me Pic</span>
          </div>

          {children}
        </div>
      </section>
    </main>
  );
}
