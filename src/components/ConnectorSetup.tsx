import { useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Clipboard, LoaderCircle, Plug, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { connectorCopy, type ConnectorCopy } from "@/i18n/connectorCopy";
import type { Language } from "@/i18n/languagePreference";

type Assistant = "chatgpt" | "claude" | "grok";
const assistants: { id: Assistant; name: string; documentation: string }[] = [
  { id: "chatgpt", name: "ChatGPT", documentation: "https://developers.openai.com/plugins/deploy/connect-chatgpt" },
  { id: "claude", name: "Claude", documentation: "https://claude.com/docs/connectors/building/directory-vs-custom" },
  { id: "grok", name: "Grok", documentation: "https://docs.x.ai/grok/connectors" },
];

function publicMcpUrl(origin: string): string | null {
  try {
    const url = new URL(origin);
    // Native must use its configured HTTPS service, never capacitor://localhost.
    // Do not put credentials, local/private hosts or arbitrary paths in a setup link.
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.includes(":") ||
      /^\d+(?:\.\d+){3}$/u.test(host) || !host.includes(".")) return null;
    return new URL("/api/mcp/public", url).href;
  } catch { return null; }
}

async function copyText(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value); return;
  }
  if (typeof document === "undefined" || typeof document.execCommand !== "function") throw new Error("clipboard_unavailable");
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const input = document.createElement("textarea");
  input.value = value; input.readOnly = true; input.tabIndex = -1;
  input.style.position = "fixed"; input.style.opacity = "0";
  document.body.appendChild(input);
  try {
    input.select(); input.setSelectionRange(0, value.length);
    if (!document.execCommand("copy")) throw new Error("clipboard_unavailable");
  } finally { input.remove(); if (previous?.isConnected) previous.focus({ preventScroll: true }); }
}

function CopyField({ value, label, action, confirmed, c, multiline = false }: {
  value: string; label: string; action: string; confirmed: string; c: ConnectorCopy; multiline?: boolean;
}) {
  const id = useId();
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const attempt = useRef({ generation: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLayoutEffect(() => {
    const state = attempt.current;
    state.generation++; setStatus("idle");
    return () => { state.generation++; if (timer.current) clearTimeout(timer.current); };
  }, [value]);
  async function copy() {
    const current = ++attempt.current.generation;
    if (timer.current) clearTimeout(timer.current);
    setStatus("copying");
    try {
      await copyText(value);
      if (attempt.current.generation !== current) return;
      setStatus("copied");
      timer.current = setTimeout(() => { if (attempt.current.generation === current) setStatus("idle"); }, 3000);
    } catch { if (attempt.current.generation === current) setStatus("error"); }
  }
  return <div className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5">
    <p id={id} className="text-sm font-semibold">{label}</p>
    {multiline
      ? <p aria-labelledby={id} className="mt-3 select-text whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{value}</p>
      : <code aria-labelledby={id} className="mt-3 block select-text break-all text-sm font-medium text-primary">{value}</code>}
    <Button type="button" variant="outline" onClick={() => void copy()} disabled={status === "copying"}
      className="mt-4 min-h-11 h-auto max-w-full whitespace-normal text-left" aria-describedby={status === "error" ? id + "-status" : undefined}>
      {status === "copying" ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
        : status === "copied" ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Clipboard className="h-4 w-4 shrink-0" aria-hidden="true" />}
      {status === "copying" ? c.copying : status === "copied" ? confirmed : action}
    </Button>
    <p id={id + "-status"} role={status === "error" ? "alert" : "status"} className={status === "error" ? "mt-3 text-sm text-destructive" : "sr-only"}>
      {status === "error" ? c.copyError : status === "copied" ? confirmed : ""}
    </p>
  </div>;
}

export default function ConnectorSetup({ language, origin }: { language: Language; origin: string }) {
  const c = connectorCopy[language], id = useId();
  const [selected, setSelected] = useState<Assistant>("chatgpt");
  const endpoint = publicMcpUrl(origin);
  const assistant = assistants.find(item => item.id === selected)!;
  const steps = selected === "chatgpt" ? [c.chatgptStep1, c.chatgptStep2, c.chatgptStep3]
    : selected === "claude" ? [c.claudeStep1, c.claudeStep2, c.claudeStep3] : [c.grokStep1, c.grokStep2, c.grokStep3];
  const action = selected === "chatgpt" ? c.chatgptAction : selected === "claude" ? c.claudeAction : c.grokAction;
  const destination = selected === "chatgpt" ? "https://chatgpt.com/plugins" : selected === "grok" ? "https://grok.com/connectors"
    : endpoint ? "https://claude.ai/customize/connectors?" + new URLSearchParams({ modal: "add-custom-connector", connectorName: "Sajda", connectorUrl: endpoint }).toString() : null;
  return <section id="ai-assistants" aria-labelledby={id + "-title"} className="scroll-mt-24 border-y border-border/80 bg-secondary/35">
    <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-7 sm:py-16">
      <div className="max-w-3xl">
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.13em] text-primary"><Plug className="h-4 w-4" aria-hidden="true" />MCP</span>
        <h2 id={id + "-title"} className="mt-3 text-balance text-3xl font-semibold tracking-[-.04em] sm:text-4xl">{c.title}</h2>
        <p className="mt-4 text-pretty leading-7 text-muted-foreground sm:text-lg">{c.lead}</p>
        <p className="mt-4 flex items-start gap-2 text-sm font-semibold"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{c.noAccount}</p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{c.priceHint}</p>
      </div>
      <div className="mt-7 grid min-w-0 gap-5 lg:grid-cols-2 lg:gap-8">
        <div className="min-w-0 space-y-4">
          {endpoint ? <CopyField value={endpoint} label={c.endpoint} action={c.copyUrl} confirmed={c.urlCopied} c={c} />
            : <p role="status" className="rounded-2xl border border-border bg-card p-5 text-sm leading-6">{c.endpointUnavailable}</p>}
          <CopyField value={c.prompt} label={c.exampleTitle} action={c.copyPrompt} confirmed={c.promptCopied} c={c} multiline />
        </div>
        <div className="min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-6">
          <fieldset>
            <legend className="mb-3 text-sm font-semibold">{c.choose}</legend>
            <div className="grid grid-cols-3 gap-2">{assistants.map(item => <button key={item.id} type="button" id={id + "-" + item.id}
              onClick={() => setSelected(item.id)} aria-pressed={selected === item.id} aria-controls={id + "-steps"}
              className={"min-h-11 rounded-xl border px-2 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                (selected === item.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary")}>{item.name}</button>)}</div>
          </fieldset>
          <div id={id + "-steps"} role="region" aria-labelledby={id + "-" + selected}>
            <ol className="mt-6 space-y-4">{steps.map((step, index) => <li key={index} className="flex items-start gap-3 text-sm leading-6">
              <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold">{index + 1}</span><span>{step}</span>
            </li>)}</ol>
            <p className="mt-5 text-xs leading-5 text-muted-foreground">{c.noAuth}</p>
            {destination && endpoint ? <a href={destination} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex min-h-11 max-w-full items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">{action}<ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" /></a> : null}
            {selected === "claude" && endpoint && <p className="mt-3 text-xs leading-5 text-muted-foreground">{c.claudeNote}</p>}
            <a href={assistant.documentation} target="_blank" rel="noopener noreferrer" className="mt-3 flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline">{c.documentation}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>
          </div>
        </div>
      </div>
      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        <details className="rounded-xl border border-border bg-card px-5">
          <summary className="min-h-11 cursor-pointer py-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{c.boundariesTitle}</summary>
          <div className="space-y-3 pb-5 text-sm leading-6 text-muted-foreground"><p>{c.pricing}</p><p>{c.limits}</p><p>{c.privacy}</p></div>
        </details>
        <details className="rounded-xl border border-border bg-card px-5">
          <summary className="min-h-11 cursor-pointer py-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{c.availabilityTitle}</summary>
          <div className="space-y-3 pb-5 text-sm leading-6 text-muted-foreground"><p>{c.clientPolicy}</p><p>{c.listing}</p><p>{c.verification}</p></div>
        </details>
      </div>
      <aside className="mt-6 border-t border-border pt-5">
        <h3 className="text-sm font-semibold">{c.privateTitle}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{c.privateBody}</p>
        <a href="#mcp" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">{c.privateAction}</a>
      </aside>
    </div>
  </section>;
}
