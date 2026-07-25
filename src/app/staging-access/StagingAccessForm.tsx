"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function safeReturnTo(value: string | null): string {
  return value != null && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

export function StagingAccessForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [accessCode, setAccessCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/staging-access/session", {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then((response) => response.json())
      .then((body) => {
        if (body?.authenticated === true) {
          router.replace(safeReturnTo(searchParams.get("returnTo")));
        }
      })
      .catch(() => undefined);
  }, [router, searchParams]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/staging-access/session", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accessCode }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.authenticated !== true) {
        setMessage("That access code was not accepted.");
        return;
      }
      router.replace(safeReturnTo(searchParams.get("returnTo")));
      router.refresh();
    } catch {
      setMessage("Staging access is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <label className="block text-sm font-medium text-zinc-200">
        Staging access code
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={accessCode}
          onChange={(event) => setAccessCode(event.target.value)}
          className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
          placeholder="Enter your personal code"
          required
        />
      </label>
      {message != null ? (
        <p role="alert" className="text-sm text-rose-300">
          {message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy || accessCode.length === 0}
        className="w-full rounded-xl bg-emerald-400 px-4 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Checking…" : "Continue to staging"}
      </button>
    </form>
  );
}
