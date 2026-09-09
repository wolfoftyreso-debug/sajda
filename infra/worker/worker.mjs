/*
 * Minimal local worker for queued scans and scheduled maintenance.
 *
 * It deliberately uses only Node's built-in fetch API so it can run on the
 * local server without another package ecosystem. Keep it on the private
 * Docker network (or localhost) because it holds the service-role key.
 */

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const config = {
  supabaseUrl: required("SUPABASE_INTERNAL_URL").replace(/\/$/, ""),
  serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  jobSecret: required("JOB_SECRET"),
  pollMs: Number(process.env.WORKER_POLL_MS ?? 15_000),
  scheduledJobs: process.env.ENABLE_SCHEDULED_JOBS === "true",
  nightlyHour: Number(process.env.NIGHTLY_SCAN_HOUR ?? 2),
};

if (!Number.isFinite(config.pollMs) || config.pollMs < 1_000) throw new Error("WORKER_POLL_MS must be at least 1000");
if (!Number.isInteger(config.nightlyHour) || config.nightlyHour < 0 || config.nightlyHour > 23) throw new Error("NIGHTLY_SCAN_HOUR must be 0-23");

let stopping = false;
let active = false;
let lastScheduledMinute = "";

function apiHeaders(extra = {}) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    ...extra,
  };
}

async function api(path, init = {}) {
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    ...init,
    headers: apiHeaders(init.headers),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path} failed (${response.status}): ${typeof payload === "string" ? payload.slice(0, 240) : JSON.stringify(payload)}`);
  return payload;
}

async function claimQueuedScan() {
  // The database function atomically claims only rows created through the
  // authenticated request RPC. It returns a dispatch token which the Edge
  // function checks before doing any privileged work.
  const claimed = await api("/rest/v1/rpc/claim_next_trusted_user_scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const scan = Array.isArray(claimed) ? claimed[0] : null;
  if (!scan?.scan_id || !scan?.dispatch_token) return null;
  return { id: scan.scan_id, dispatchToken: scan.dispatch_token };
}

async function runQueuedScan() {
  const scan = await claimQueuedScan();
  if (!scan) return false;

  try {
    const response = await fetch(`${config.supabaseUrl}/functions/v1/user-domain-scan`, {
      method: "POST",
      headers: apiHeaders({ "Content-Type": "application/json", "x-job-secret": config.jobSecret }),
      body: JSON.stringify({ scanId: scan.id, dispatchToken: scan.dispatchToken }),
    });
    if (!response.ok) throw new Error(`user-domain-scan returned ${response.status}: ${(await response.text()).slice(0, 240)}`);
    console.info(`[worker] completed scan ${scan.id}`);
  } catch (error) {
    console.error(`[worker] scan ${scan.id} failed`, error);
    await api(`/rest/v1/user_scans?id=eq.${encodeURIComponent(scan.id)}&status=eq.running`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "failed", completed_at: new Date().toISOString() }),
    }).catch((statusError) => console.error("[worker] could not mark scan failed", statusError));
  }
  return true;
}

function stockholmClock() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    key: `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

async function invokeScheduled(functionName) {
  const response = await fetch(`${config.supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json", "x-job-secret": config.jobSecret }),
    body: "{}",
  });
  if (!response.ok) throw new Error(`${functionName} returned ${response.status}: ${(await response.text()).slice(0, 240)}`);
  console.info(`[worker] scheduled ${functionName} completed`);
}

async function runScheduledJobs() {
  if (!config.scheduledJobs) return;
  const clock = stockholmClock();
  if (clock.minute !== 0 || clock.key === lastScheduledMinute) return;
  lastScheduledMinute = clock.key;

  if (clock.hour === config.nightlyHour) await invokeScheduled("nightly-domain-scan");
  if (clock.hour === (config.nightlyHour + 1) % 24) await invokeScheduled("send-daily-notification");
}

async function tick() {
  if (active || stopping) return;
  active = true;
  try {
    // One scan per tick gives a predictable upper bound to resource use.
    await runQueuedScan();
    await runScheduledJobs();
  } catch (error) {
    console.error("[worker] tick failed", error);
  } finally {
    active = false;
  }
}

console.info(`[worker] started; polling every ${config.pollMs} ms`);
await tick();
const timer = setInterval(tick, config.pollMs);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.info(`[worker] received ${signal}; stopping`);
    stopping = true;
    clearInterval(timer);
  });
}
