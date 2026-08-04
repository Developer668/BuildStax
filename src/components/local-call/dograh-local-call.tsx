"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, TriangleAlert } from "lucide-react";

const SCRIPT_ID = "dograh-widget-script";

export type DograhWidgetConfig = {
  scriptUrl: string;
  attrs: Record<string, string>;
  origin: string;
};

type LoadState = "loading" | "ready" | "error";

/**
 * Client surface that embeds the self-hosted Dograh Web Call widget (inline mode).
 * Dograh renders the live call + transcript UI inside `#dograh-inline-container`;
 * we own the loading, error, and cleanup chrome around it.
 */
export function DograhCallSurface({ config }: { config: DograhWidgetConfig }) {
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;
    const markReady = () => { if (!cancelled) setState("ready"); };
    const markError = () => { if (!cancelled) setState("error"); };
    // Stop any active call before leaving the page. The widget may not expose end().
    const endActiveCall = () => {
      try {
        (window as unknown as { DograhWidget?: { end?: () => void } }).DograhWidget?.end?.();
      } catch {
        // ignore — nothing to end
      }
    };

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      // The widget script persists across route navigations; reflect its state without a sync render.
      if (existing.dataset.dograhLoaded === "true") queueMicrotask(markReady);
      else {
        existing.addEventListener("load", markReady);
        existing.addEventListener("error", markError);
      }
      return () => {
        cancelled = true;
        existing.removeEventListener("load", markReady);
        existing.removeEventListener("error", markError);
        endActiveCall();
      };
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = config.scriptUrl;
    script.async = true;
    for (const [key, value] of Object.entries(config.attrs)) script.setAttribute(key, value);
    const onLoad = () => { script.dataset.dograhLoaded = "true"; markReady(); };
    script.addEventListener("load", onLoad);
    script.addEventListener("error", markError);
    document.body.appendChild(script);
    return () => {
      cancelled = true;
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", markError);
      endActiveCall();
    };
  }, [config.scriptUrl, config.attrs]);

  return (
    <section className="panel flex min-h-[420px] flex-col p-4" aria-label="Local voice call">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Self-hosted Dograh</p>
          <h2 className="section-title">Local voice call</h2>
        </div>
        {config.origin ? (
          <a
            href={config.origin}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-blue hover:underline"
          >
            Open Dograh <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </div>

      {state === "error" ? (
        <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-2 rounded-[6px] border border-[#efc4bd] bg-[#fff1ef] p-6 text-center text-[#8f392f]">
          <TriangleAlert className="size-5" />
          <p className="text-[11px] font-bold">The Dograh widget could not load.</p>
          <p className="max-w-sm text-[10px] leading-4">
            Make sure your local Dograh stack is running and that <span className="mono">DOGRAH_WIDGET_SCRIPT_URL</span> points at
            {config.origin ? <> <span className="mono">{config.origin}</span></> : " it"}. The BuildStax dev origin must also be in the widget&apos;s Allowed Domains.
          </p>
        </div>
      ) : (
        <div className="relative flex-1">
          {state === "loading" ? (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <p className="text-[10px]">Loading the local voice agent…</p>
            </div>
          ) : null}
          {/* Dograh mounts its inline call UI here. */}
          <div id="dograh-inline-container" className="h-full min-h-[340px]" />
        </div>
      )}

      <p className="mt-3 text-[9px] leading-4 text-muted-foreground">
        Local demo call — the agent runs on your machine via Dograh. Use the customer brief to role-play the prospect. Full transcript and recording are saved in the Dograh dashboard.
      </p>
    </section>
  );
}
