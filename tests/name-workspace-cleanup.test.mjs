import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { cleanupNameWorkspaceFixtures } from "../scripts/name-workspace-cleanup.mjs";

const runId = "4414eb38-aea1-4a74-8924-43bb83e7fa44";
const testIp = "2001:db8:12ab:34cd::1";
const users = ["a", "b"].map(suffix => ({ id: `OpaqueSdkFixture${suffix}`, email: `name-workspace-${runId}-${suffix}@example.test` }));
const subject = (scope, id) => createHash("sha256").update(scope === "name-projects" ? `name-projects:preview:${id}` : `saved-domains:${id}`).digest("hex");

/** Memory-only PG double: no credentials, sockets, HTTP or real account data. */
function fakePg({ rows = users, failures = {}, retainedChildren = {} } = {}) {
  const state = { rows: rows.map(row => ({ ...row })), calls: [], deletes: new Map(), children: new Map(), verifications: new Set(users.map(row => row.id)),
    rates: new Set(users.flatMap(row => ["name-projects", "saved-domains"].map(scope => `${scope}:${subject(scope, row.id)}`))),
    sdkRates: new Set(["/sign-up/email", "/verify-email"].map(route => `${testIp}|${route}`)) };
  for (const row of users) for (const table of ["sajda.name_projects", "sajda.name_project_domains", "public.sajda_auth_account", "public.sajda_auth_session"])
    state.children.set(`${table}:${row.id}`, retainedChildren[`${table}:${row.id}`] || state.rows.some(value => value.id === row.id) ? 1 : 0);
  const database = { state, query: async (sql, values = []) => {
    state.calls.push({ sql, values });
    if (sql.startsWith("SELECT id,email FROM public.sajda_auth_user")) {
      const result = sql.includes("ANY")
        ? state.rows.filter(row => values[0].includes(row.email) || values[1]?.includes(row.id))
        : state.rows.filter(row => row.id === values[0] || row.email === values[1]);
      return { rows: result.map(row => ({ ...row })) };
    }
    if (sql.startsWith("DELETE FROM public.sajda_auth_user")) {
      assert.match(sql, /WHERE id=\$1 AND email=\$2 RETURNING id$/u);
      const id = values[0], attempt = (state.deletes.get(id) ?? 0) + 1; state.deletes.set(id, attempt);
      const mode = failures[id]?.[attempt - 1];
      if (mode === "before") throw new Error("database password=PRIVATE_SYNTHETIC_TOKEN");
      const removed = state.rows.filter(row => row.id === id && row.email === values[1]);
      state.rows = state.rows.filter(row => !(row.id === id && row.email === values[1]));
      for (const table of ["sajda.name_projects", "sajda.name_project_domains", "public.sajda_auth_account", "public.sajda_auth_session"])
        if (!retainedChildren[`${table}:${id}`]) state.children.set(`${table}:${id}`, 0);
      if (mode === "after") throw new Error("database password=PRIVATE_SYNTHETIC_TOKEN");
      return { rows: removed.map(row => ({ id: row.id })) };
    }
    if (sql.startsWith("DELETE FROM public.sajda_auth_verification")) { state.verifications.delete(values[0]); return { rows: [] }; }
    if (sql.startsWith("DELETE FROM sajda.function_rate_limits")) {
      const scope = sql.includes("scope='name-projects'") ? "name-projects" : "saved-domains";
      state.rates.delete(`${scope}:${values[0]}`); return { rows: [] };
    }
    if (sql.startsWith("DELETE FROM public.sajda_auth_rate_limit")) { values[0].forEach(key => state.sdkRates.delete(key)); return { rows: [] }; }
    if (sql.startsWith("SELECT count(*)::integer AS count")) {
      let count;
      if (sql.includes("FROM public.sajda_auth_user")) count = state.rows.filter(row => values[0].includes(row.email) || values[1]?.includes(row.id)).length;
      else if (sql.includes("FROM public.sajda_auth_verification")) count = Number(state.verifications.has(values[0]));
      else if (sql.includes("FROM sajda.function_rate_limits")) count = Number(state.rates.has(`${sql.includes("scope='name-projects'") ? "name-projects" : "saved-domains"}:${values[0]}`));
      else if (sql.includes("FROM public.sajda_auth_rate_limit")) count = values[0].filter(key => state.sdkRates.has(key)).length;
      else { const table = /FROM ([\w.]+) WHERE/u.exec(sql)?.[1]; count = state.children.get(`${table}:${values[0]}`) ?? 0; }
      return { rows: [{ count }] };
    }
    throw new Error("unexpected fake query");
  } };
  return database;
}
const cleanup = (database, overrides = {}) => cleanupNameWorkspaceFixtures(database, { runId, users, testIp, ...overrides });

test("cleanup reconciles a lost signup acknowledgment using only the two run-bound exact emails", async () => {
  const database = fakePg();
  assert.deepEqual(await cleanup(database, { users: [users[0]] }), { retiredFixtures: 2, remainingFixtures: 0 });
  assert.equal(database.state.rows.length, 0); assert.equal(database.state.rates.size, 0);
});

test("a committed DELETE with lost ACK is positively reread, without aborting the other fixture", async () => {
  const database = fakePg({ failures: { [users[0].id]: ["after"] } });
  await cleanup(database);
  assert.equal(database.state.rows.length, 0); assert.equal(database.state.deletes.get(users[0].id), 1);
  assert.equal(database.state.deletes.get(users[1].id), 1); assert.equal(database.state.rates.size, 0);
});

test("a DELETE that failed before commit is retried at most once and confirmed absent", async () => {
  const database = fakePg({ failures: { [users[0].id]: ["before"] } });
  await cleanup(database);
  assert.equal(database.state.rows.length, 0); assert.equal(database.state.deletes.get(users[0].id), 2);
});

test("already removed known users still have their exact child rows and fixture hashes checked", async () => {
  const database = fakePg({ rows: [] });
  await cleanup(database);
  assert.equal(database.state.rates.size, 0); assert.equal(database.state.verifications.size, 0);
  for (const user of users) for (const table of ["sajda.name_projects", "sajda.name_project_domains", "public.sajda_auth_account", "public.sajda_auth_session"])
    assert.ok(database.state.calls.some(call => call.sql.includes(`FROM ${table} WHERE`) && call.values[0] === user.id));
});

test("persistent failure for one fixture still cleans the other, never claims success or leaks database details", async () => {
  const database = fakePg({ failures: { [users[0].id]: ["before", "before"] } });
  await assert.rejects(cleanup(database), error => error.message === "name_workspace_cleanup_unconfirmed" && !String(error).includes("PRIVATE_SYNTHETIC_TOKEN"));
  assert.deepEqual(database.state.rows.map(row => row.id), [users[0].id]);
  assert.equal(database.state.deletes.get(users[0].id), 2); assert.equal(database.state.deletes.get(users[1].id), 1);
});

test("cleanup validates exact run, SDK id/email and local documentation IP bounds before any database call", async () => {
  for (const override of [{ runId: "arbitrary-prefix" }, { runId: runId.toUpperCase() }, { testIp: "127.0.0.1" },
    { users: [{ ...users[0], email: "existing-user@example.test" }] }, { users: [users[0], users[0]] },
    { users: [users[0], { ...users[1], id: users[0].id }] }, { users: [{ ...users[0], id: "id with spaces" }] },
    { users: [{ ...users[0], unexpected: true }] }, { users: [users[0], users[1], users[0]] }]) {
    const database = fakePg();
    await assert.rejects(cleanup(database, override), { message: "name_workspace_fixture_invalid" });
    assert.equal(database.state.calls.length, 0);
  }
});

test("changed or duplicated exact bindings fail closed before any destructive statement", async () => {
  for (const rows of [[{ ...users[0], id: "ReplacementSdkId" }, users[1]],
    [{ ...users[0], email: "foreign-user@example.test" }, users[1]],
    [{ ...users[0], id: users[1].id }, { ...users[1], id: users[0].id }], [users[0], users[0]]]) {
    const database = fakePg({ rows });
    await assert.rejects(cleanup(database), { message: "name_workspace_fixture_binding_mismatch" });
    assert.equal(database.state.calls.filter(call => call.sql.startsWith("DELETE")).length, 0);
  }
});

test("absence of a known parent does not falsely confirm cleanup when its child survives", async () => {
  const database = fakePg({ rows: [], retainedChildren: { [`sajda.name_projects:${users[0].id}`]: true } });
  await assert.rejects(cleanup(database), { message: "name_workspace_cleanup_unconfirmed" });
  assert.equal(database.state.rates.size, 0); assert.equal(database.state.sdkRates.size, 0);
  assert.ok(database.state.calls.some(call => call.sql.includes('FROM public.sajda_auth_session WHERE') && call.values[0] === users[1].id));
});

test("both permanently failing deletes remain bounded and neither failure prevents the other attempt", async () => {
  const database = fakePg({ failures: { [users[0].id]: ["before", "before"], [users[1].id]: ["before", "before"] } });
  await assert.rejects(cleanup(database), { message: "name_workspace_cleanup_unconfirmed" });
  assert.equal(database.state.rows.length, 2);
  assert.equal(database.state.deletes.get(users[0].id), 2); assert.equal(database.state.deletes.get(users[1].id), 2);
  assert.equal(database.state.rates.size, 0); assert.equal(database.state.sdkRates.size, 0);
});

test("positive cleanup reads and exact predicates preserve unrelated rows and rate-limit subjects", async () => {
  const database = fakePg();
  const foreign = { id: "UnrelatedSdkOwner", email: "unrelated@example.test" };
  database.state.rows.push(foreign); database.state.verifications.add(foreign.id);
  database.state.rates.add(`name-projects:${subject("name-projects", foreign.id)}`);
  database.state.sdkRates.add("2001:db8:ffff:eeee::1|/sign-up/email");
  await cleanup(database);
  assert.deepEqual(database.state.rows, [foreign]); assert.ok(database.state.verifications.has(foreign.id));
  assert.equal(database.state.rates.size, 1); assert.equal(database.state.sdkRates.size, 1);
  assert.ok(database.state.calls.some(call => call.sql.startsWith("SELECT count(*)") && call.sql.includes("FROM public.sajda_auth_rate_limit")));
  const final = database.state.calls.at(-1);
  assert.match(final.sql, /WHERE email=ANY\(\$1::text\[\]\) OR id=ANY\(\$2::text\[\]\)$/u);
  assert.deepEqual(final.values[1], users.map(user => user.id));
});

test("unreadable cleanup confirmation is failure, not an inferred successful deletion", async () => {
  const database = fakePg(), original = database.query;
  database.query = async (sql, values) => {
    if (sql.startsWith("SELECT count(*)") && sql.includes("FROM public.sajda_auth_session")) throw new Error("PRIVATE_SYNTHETIC_TOKEN");
    return original(sql, values);
  };
  await assert.rejects(cleanup(database), { message: "name_workspace_cleanup_unconfirmed" });
  assert.equal(database.state.rows.length, 0); assert.equal(database.state.rates.size, 0);
});
