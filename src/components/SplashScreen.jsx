import React, { useEffect, useState } from "react";

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png";

/**
 * Branded full-screen splash shown during initial app load while auth,
 * public settings, and the responsive layout initialize.
 * Fades out smoothly when `ready` becomes true.
 */
export default function SplashScreen({ ready }) {
  const [minTimePassed, setMinTimePassed] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);

  // Guarantee the splash is visible for a brief moment so it doesn't flash
  useEffect(() => {
    const t = setTimeout(() => setMinTimePassed(true), 600);
    return () => clearTimeout(t);
  }, []);

  // When ready, trigger the fade-out then unmount after the transition
  useEffect(() => {
    if (ready && minTimePassed) {
      setFadingOut(true);
    }
  }, [ready, minTimePassed]);

  if (fadingOut) {
    // Keep the element mounted during the fade so the transition plays,
    // but we rely on the parent to stop rendering after a short delay.
  }

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950 transition-opacity duration-500 ${
        fadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{
        paddingTop: "max(env(safe-area-inset-top), 0px)",
        paddingBottom: "max(env(safe-area-inset-bottom), 0px)",
      }}
    >
      {/* Subtle radial glow background */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(circle at 50% 40%, rgba(226,4,4,0.18) 0%, transparent 60%)",
        }}
      />

      {/* Logo */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-6">
        <img
          src={LOGO_URL}
          alt="Elite Engine Development"
          className="h-16 sm:h-20 md:h-24 object-contain animate-[splashPulse_1.8s_ease-in-out_infinite]"
          style={{ filter: "drop-shadow(0 4px 24px rgba(226,4,4,0.35))" }}
        />

        {/* Brand name */}
        <div className="text-center">
          <h1 className="text-white text-lg sm:text-xl font-semibold tracking-wide">
            Elite Engine Development
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1 tracking-wider uppercase">
            Customer Portal
          </p>
        </div>

        {/* Loading bar */}
        <div className="w-40 sm:w-56 h-1 bg-slate-800 rounded-full overflow-hidden mt-2">
          <div
            className="h-full rounded-full bg-[#e20404]"
            style={{
              animation: "splashLoad 1.4s ease-in-out infinite",
            }}
          />
        </div>
      </div>

      {/* Footer text */}
      <p className="absolute bottom-6 text-slate-600 text-[10px] sm:text-xs tracking-widest uppercase z-10">
        Precision Engine Development
      </p>
    </div>
  );
}