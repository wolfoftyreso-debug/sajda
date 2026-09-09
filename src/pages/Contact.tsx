import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, LoaderCircle, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { applyDocumentMetadata, useLanguage } from "@/i18n/LanguageProvider";
import { contactCopy, contactErrorMessage } from "@/i18n/contactCopy";
import { CONTACT_EMAIL, CONTACT_LIMITS, ContactRequestError, prepareContactSubmission, sendContactSubmission,
  validateContactDraft, type ContactDraft, type ContactField, type ContactSubmission } from "@/lib/contact";

const emptyDraft: ContactDraft = { name: "", email: "", subject: "", message: "", website: "" };
const fieldOrder = ["name", "email", "subject", "message"] as const;
const linkClass = "font-medium text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function Contact() {
  const { language } = useLanguage();
  const copy = contactCopy[language];
  const [draft, setDraft] = useState<ContactDraft>(emptyDraft);
  const [invalidFields, setInvalidFields] = useState<ContactField[]>([]);
  const [error, setError] = useState<ContactRequestError>();
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<string>();
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const previousSubmission = useRef<ContactSubmission>();
  const activeRequest = useRef<AbortController>();
  const successHeading = useRef<HTMLHeadingElement>(null);
  const waitSeconds = Math.max(0, Math.ceil((retryAt - now) / 1000));

  useEffect(() => {
    // The provider handles language changes; this also covers SPA entry/exit
    // without letting either effect replace contact metadata with search copy.
    applyDocumentMetadata(language, "/contact");
    return () => applyDocumentMetadata(language, window.location.pathname);
  }, [language]);
  useEffect(() => () => activeRequest.current?.abort(), []);
  useEffect(() => { if (receipt) successHeading.current?.focus(); }, [receipt]);
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      if (timestamp >= retryAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeRequest.current || receipt || error?.code === "submission_expired" || Date.now() < retryAt) return;
    const invalid = validateContactDraft(draft);
    setInvalidFields(invalid);
    if (invalid.length) {
      setError(new ContactRequestError("invalid_request"));
      document.getElementById(`contact-${invalid.find(field => field !== "website") ?? "name"}`)?.focus();
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    setPending(true);
    setError(undefined);
    try {
      const submission = prepareContactSubmission(draft, language, previousSubmission.current);
      previousSubmission.current = submission;
      const accepted = await sendContactSubmission(submission, controller.signal);
      if (!controller.signal.aborted) setReceipt(accepted.requestId);
    } catch (cause) {
      if (!controller.signal.aborted) {
        const failure = cause instanceof ContactRequestError ? cause : new ContactRequestError("unconfirmed");
        setError(failure);
        if (failure.retryAfterSeconds) {
          const timestamp = Date.now();
          setNow(timestamp);
          setRetryAt(timestamp + failure.retryAfterSeconds * 1000);
        }
      }
    } finally {
      if (activeRequest.current === controller) activeRequest.current = undefined;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  function startAnother() {
    previousSubmission.current = undefined;
    setDraft(emptyDraft);
    setInvalidFields([]);
    setError(undefined);
    setReceipt(undefined);
    setRetryAt(0);
    requestAnimationFrame(() => document.getElementById("contact-name")?.focus());
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-7" aria-label={copy.title}>
          <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />{copy.back}
          </Link>
          <LanguageSwitcher />
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl px-5 py-9 sm:px-7 sm:py-12">
        <div className="max-w-2xl">
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{copy.title}</h1>
          <p className="mt-3 text-base leading-7 text-muted-foreground">{copy.lead}</p>
        </div>
        <div className="mt-8 grid min-w-0 gap-7 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-10">
          <section className="min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-7" aria-label={copy.message}>
            {receipt ? (
              <div role="status" className="space-y-4">
                <CheckCircle2 className="h-7 w-7 text-emerald-700" aria-hidden="true" />
                <h2 ref={successHeading} tabIndex={-1} className="text-xl font-semibold focus:outline-none">{copy.acceptedTitle}</h2>
                <p className="text-sm leading-6 text-muted-foreground">{copy.acceptedBody}</p>
                <p className="break-all text-xs text-muted-foreground">{copy.reference}: {receipt}</p>
                <Button type="button" onClick={startAnother} variant="outline" className="h-auto min-h-11 whitespace-normal">{copy.another}</Button>
              </div>
            ) : (
              <form noValidate onSubmit={submit} aria-busy={pending}>
                <fieldset disabled={pending} className="min-w-0 space-y-5">
                  {fieldOrder.map(field => {
                    const invalid = invalidFields.includes(field);
                    const describedBy = `${field === "message" ? "contact-message-hint " : ""}${invalid ? `contact-${field}-error` : ""}`.trim() || undefined;
                    const props = {
                      id: `contact-${field}`, name: field, value: draft[field], required: true,
                      maxLength: CONTACT_LIMITS[field], minLength: field === "message" ? 20 : field === "subject" ? 3 : field === "name" ? 2 : undefined,
                      "aria-invalid": invalid || undefined, "aria-describedby": describedBy,
                      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                        setDraft(current => ({ ...current, [field]: event.target.value }));
                        setInvalidFields(current => current.filter(item => item !== field));
                      },
                    };
                    return (
                      <div key={field} className="space-y-2">
                        <Label htmlFor={props.id}>{copy[field]}</Label>
                        {field === "message" ? <Textarea {...props} rows={7} className="min-h-40 resize-y text-base" />
                          : <Input {...props} type={field === "email" ? "email" : "text"}
                            autoComplete={field === "name" ? "name" : field === "email" ? "email" : "off"}
                            spellCheck={field !== "email"} className="min-h-11 text-base" />}
                        {field === "message" && <p id="contact-message-hint" className="text-xs leading-5 text-muted-foreground">{copy.messageHint}</p>}
                        {invalid && <p id={`contact-${field}-error`} className="text-sm text-destructive">{copy[`${field}Error`]}</p>}
                      </div>
                    );
                  })}
                  <div className="hidden" aria-hidden="true">
                    <label htmlFor="contact-website">Leave this field empty</label>
                    <input id="contact-website" name="website" tabIndex={-1} autoComplete="off" maxLength={CONTACT_LIMITS.website}
                      value={draft.website} onChange={event => setDraft(current => ({ ...current, website: event.target.value }))} />
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">{copy.privacy} <Link to="/legal#privacy" className={linkClass}>{copy.privacyLink}</Link></p>
                  {error && <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm leading-6">
                    <p>{contactErrorMessage(error.code, language)}</p>
                    {waitSeconds > 0 && <p className="mt-1">{copy.wait(waitSeconds)}</p>}
                  </div>}
                  <Button type="submit" disabled={pending || waitSeconds > 0 || error?.code === "submission_expired"} className="h-auto min-h-12 w-full whitespace-normal px-5 py-3">
                    {pending ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Mail className="h-4 w-4" aria-hidden="true" />}
                    {pending ? copy.sending : copy.submit}
                  </Button>
                </fieldset>
              </form>
            )}
          </section>
          <aside className="min-w-0 space-y-7 text-sm leading-6">
            <section>
              <h2 className="text-base font-semibold">{copy.fallback}</h2>
              <a href={`mailto:${CONTACT_EMAIL}`} className={`${linkClass} mt-2 inline-flex min-h-11 items-center break-all`}>{CONTACT_EMAIL}</a>
              <p className="mt-2 text-muted-foreground">{copy.fallbackHint}</p>
            </section>
            <section className="border-t border-border pt-6">
              <p className="text-muted-foreground">{copy.resetHint}</p>
              <Link to="/auth?mode=reset" className={`${linkClass} mt-2 inline-flex min-h-11 items-center`}>{copy.resetLink}</Link>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
