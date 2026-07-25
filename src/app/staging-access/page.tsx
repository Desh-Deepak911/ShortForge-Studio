import { Suspense } from "react";
import { notFound } from "next/navigation";

import { classifyStagingHeadlessControlPlaneActivation } from "@/features/headless-renderer/control-plane/runtime/staging-control-plane-activation";
import { StagingAccessForm } from "./StagingAccessForm";

export const dynamic = "force-dynamic";

export default function StagingAccessPage() {
  if (classifyStagingHeadlessControlPlaneActivation() !== "active") {
    notFound();
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 py-16 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
          ShortForge staging
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Private testing access
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Use your personal testing code. This is a temporary staging gate, not
          the public product account system.
        </p>
        <Suspense fallback={<p className="mt-8 text-sm text-zinc-400">Loading…</p>}>
          <StagingAccessForm />
        </Suspense>
      </section>
    </main>
  );
}
