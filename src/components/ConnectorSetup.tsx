import { useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Clipboard, LoaderCircle, Plug, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { connectorCopy, type ConnectorCopy } from "@/i18n/connectorCopy";
import type { Language } from "@/i18n/languagePreference";
import { CONNECTOR_HOSTS, connectorInstallUrl, connectorConfig, publicMcpUrl, type ConnectorHost } from "@/lib/connectorSetup";
import { connectorDirectoryCopy, connectorInstructions } from "@/i18n/connectorDirectoryCopy";
import { PUBLIC_CONNECTOR_ORIGIN } from "@/lib/publicConnector";
import { CONNECTOR_HOST_INSTRUCTIONS, getConnectorOffer } from "../../shared/connector-policy";

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
      ? <p aria-labelledby={id} className="mt-3 select-text whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{value}</p>
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
  const c = connectorCopy[language], directory = connectorDirectoryCopy[language], id = useId();
  const [selected, setSelected] = useState<ConnectorHost>("chatgpt");
  const [companionEnabled, setCompanionEnabled] = useState(false);
  const endpoint = publicMcpUrl(origin);
  const assistant = CONNECTOR_HOSTS.find(item => item.id === selected)!;
  const { steps, action } = connectorInstructions(language, assistant);
  const configuration = connectorConfig(selected, endpoint);
  const destination = connectorInstallUrl(selected, endpoint);
  const placement = selected === "cursor" ? c.cursorCompanion : selected === "replit" ? c.replitCompanion
    : selected === "lovable" ? c.lovableCompanion : c.assistantCompanion;
  const companionInstructions = `${CONNECTOR_HOST_INSTRUCTIONS}\n\n${getConnectorOffer(language)}`;
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
            {(["assistant", "builder", "editor"] as const).map(category => <div key={category} className="mt-4 first:mt-0">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{directory[category]}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{CONNECTOR_HOSTS.filter(item => item.category === category).map(item => <button key={item.id} type="button" id={id + "-" + item.id}
              onClick={() => setSelected(item.id)} aria-pressed={selected === item.id} aria-controls={id + "-steps"}
              className={"flex min-h-14 min-w-0 items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                (selected === item.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary")}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white p-1"><img src={item.logo} alt="" width={24} height={24} className="h-6 w-6 object-contain" /></span>
                <span className="min-w-0 break-words">{item.name}</span>
              </button>)}</div>
            </div>)}
          </fieldset>
          <div id={id + "-steps"} role="region" aria-labelledby={id + "-" + selected}>
            <ol className="mt-6 space-y-4">{steps.map((step, index) => <li key={index} className="flex items-start gap-3 text-sm leading-6">
              <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold">{index + 1}</span><span>{step}</span>
            </li>)}</ol>
            <p className="mt-5 text-xs leading-5 text-muted-foreground">{c.noAuth}</p>
            {(selected === "perplexity" || selected === "windsurf") && <p className="mt-3 rounded-xl bg-secondary p-3 text-sm leading-6">{directory[selected]}</p>}
            {destination && endpoint ? <a href={destination} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex min-h-11 max-w-full items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">{action}<ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" /></a> : null}
            {selected === "claude" && endpoint && <p className="mt-3 text-xs leading-5 text-muted-foreground">{c.claudeNote}</p>}
            {(selected === "cursor" || selected === "replit") && endpoint ? <p className="mt-3 text-xs leading-5 text-muted-foreground">{c.installNote}</p> : null}
            <a href={assistant.documentation} target="_blank" rel="noopener noreferrer" className="mt-3 flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline">{c.documentation}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>
            {configuration ? <div className="mt-4"><CopyField value={configuration} label={selected === "cursor" ? c.cursorConfig : directory.config}
              action={selected === "cursor" ? c.copyConfig : directory.copyConfig} confirmed={selected === "cursor" ? c.configCopied : directory.configCopied} c={c} multiline /></div> : null}
          </div>
        </div>
      </div>
      <div className="mt-6 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h3 className="text-lg font-semibold">{c.companionTitle}</h3>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{c.companionLead}</p>
        <blockquote className="mt-4 border-l-2 border-primary pl-4 text-base font-medium">{getConnectorOffer(language)}</blockquote>
        <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
          <input type="checkbox" checked={companionEnabled} onChange={event => setCompanionEnabled(event.target.checked)}
            className="h-4 w-4 shrink-0 accent-primary" />{c.companionOptIn}
        </label>
        {companionEnabled ? <div className="mt-4 space-y-3">
          <p className="text-sm leading-6 text-muted-foreground">{placement}</p>
          <CopyField value={companionInstructions} label={c.companionInstructions} action={c.copyInstructions}
            confirmed={c.instructionsCopied} c={c} multiline />
        </div> : null}
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{c.companionCaveat}</p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          <a href={PUBLIC_CONNECTOR_ORIGIN + "/#setup"} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline">{c.setupKit}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>
          <a href={PUBLIC_CONNECTOR_ORIGIN + "/downloads/sajda-connector.zip"} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">{c.downloadKit}</a>
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
      <p className="mt-4 text-xs leading-5 text-muted-foreground">{directory.review}</p>
      <aside className="mt-6 border-t border-border pt-5">
        <h3 className="text-sm font-semibold">{c.privateTitle}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{c.privateBody}</p>
        <a href="#mcp" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">{c.privateAction}</a>
      </aside>
    </div>
  </section>;
}
