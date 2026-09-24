# Release decisions: privacy and paid subscriptions

Status: **operator review required**, 24 September 2026. Internal release worksheet, not public terms, a privacy policy or a representation of legal approval. Keep this file out of public policy generation. No checked box below implies a provider contract exists or a live workflow passed.

## Already established — do not ask the owner again

- Sajda's operator is **Landvex AB**, confirmed by the owner. Company-published particulars: Swedish registration number **559141-7042**, Antennvägen 2, 135 48 Tyresö, Sweden, registered office Tyresö; telephone +46 10 198 58 81. [Company source](https://landvex.com/company).
- Contact and support recipient: **dev@hypbit.com**. Intended account-email sender domain: **mail.hypbit.com**. Reset links and deletion codes go to the account holder, never automatically to support.
- Infrastructure intent: Vercel and Neon. Better Auth runs in the application. Source includes conditional Resend, Stripe, Apple, registry/registrar requests and optional AI. A source reference is not proof that a vendor is enabled in production.
- Website pricing is USD/month. Current shared prices are in `shared/plans.ts`; do not duplicate amounts here. The pricing page explicitly distinguishes current functionality from planned paid features and does not offer Basic/Premium checkout.
- Apple enrolment is not yet completed. This does not by itself prevent a separately ready web release; it does prevent claiming an App Store release is ready.

## Decision 1 — data purposes and lawful basis

The engineering inventory is in [APP-PRIVACY-INVENTORY.md](APP-PRIVACY-INVENTORY.md) and [AI-PRIVACY.md](AI-PRIVACY.md). For each actual release flow, the operator's reviewer needs to approve the role, purpose and applicable lawful basis, including any legitimate-interest assessment or consent requirement. **Do not treat accepting a privacy notice as consent to every use.**

| Processing group | Source-observed purpose | Operator decision still needed |
| --- | --- | --- |
| Account, secure sessions and recovery | Authenticate, protect and restore account access | Controller/processor role; necessary fields; lawful basis; security-log purpose |
| Saved names, projects and Trading work | Store and reopen the user's work | Lawful basis; organization/customer-data roles where relevant |
| Public domain, brand and social lookups | Perform the requested lookup and show source evidence | Lawful basis where inputs/outputs are personal data; actual enabled recipients and source rights |
| Optional AI | Generate/refine names after versioned opt-in | Lawful basis and exact consent scope; enabled model/provider contractual settings |
| Support/contact | Respond to a submitted request | Lawful basis; mailbox access owner; retention and rights handling |
| Abuse counters and operational logs | Limit abuse, retries and diagnose failures | Lawful basis; access limits; retention |
| Payments, if enabled | Payment, access lifecycle and financial records | Landvex seller/provider alignment; legal obligations and record categories |

## Decision 2 — retention and deletion boundaries

Engineering must retrieve actual vendor/environment settings where connected access permits. The operator must approve retention policy and exceptions; do not make up durations in the public notice. These distinctions are already confirmed from code:

| Record | What the implementation establishes | What it does **not** establish |
| --- | --- | --- |
| Web session | Seven-day validity, daily refresh policy in `account-server.ts` | A seven-day physical purge of every database or backup copy |
| Email verification / deletion code | One-hour verification validity; 15-minute deletion challenge validity | Resend or mailbox erasure at expiry |
| Contact retry/abuse records | Opportunistic bounded cleanup of records older than 30 days in `contact-guard.ts` | A guaranteed cleanup deadline; removal of support email |
| Guest search snapshot | 30-minute restoration window | Physical browser deletion after 30 minutes |
| Brand cache | Bounded server-memory entries with five-/15-minute freshness windows | General provider or hosting retention |
| Account-owned records | Explicit deletes and foreign-key cascades in the account deletion flow | Immediate deletion from provider logs, backups, support messages or downloaded reports |

Complete and sign off retention/exception criteria for: account data, inactive accounts, auth/recovery records, API/abuse records, research evidence, support mailbox, Vercel logs, Neon backups, Resend records and financial records where applicable. Implement scheduled cleanup if the approved policy requires a deadline that opportunistic pruning cannot meet.

## Decision 3 — vendor agreements and international transfers

Engineering can inventory enabled vendors, account regions, request payloads, logs and exposed settings. The operator's authorized contract owner must confirm the applicable agreements and any international-transfer mechanism. Do not infer all data stays in the EU from one EU database region.

Record for each enabled recipient: service/account, purpose, relevant data, role, processing locations, agreement reference, transfer safeguard where applicable, retention setting, who can approve changes. Include user-selected external MCP clients as separate user-directed disclosures; Sajda cannot promise to erase the client's copied responses or secrets.

## Decision 4 — paid offer and consumer rights

Before enabling real subscription sales, approve one coherent offer matching the actual entitlement implementation: seller, exact included features/quotas, monthly renewal, taxes/final total, start date, cancellation effect, complaint route and statutory rights. Domain purchases from a registrar are separate from a Sajda subscription.

Source contains technical cancellation and billing flows, not evidence of an approved consumer contract or a complete withdrawal process. For applicable Swedish/EU distance contracts, assess the actual service and provide any required online withdrawal function and durable receipt. Do not classify SaaS automatically as exempt digital content. Do not replace statutory rights with a “no refunds” clause.

Technical checkout should remain unavailable for an offer that cannot be delivered or whose required disclosures/workflows are unfinished. No live debit is needed to review or sandbox-test this.

## Decision 5 — operational responsibility

- Identify the responsible person/team for support, rights requests, security incidents and consumer withdrawal/refund requests. No DPO appointment is implied.
- Verify a controlled message reaches the intended mailbox; a provider `200` is insufficient. Verify that unavailable email does not trap the user.
- Test identity verification and account deletion with a disposable account. Preserve data-minimization: do not collect passports/identity documents by default or ask for account passwords.
- Confirm who can approve final public policy wording and merchant/Apple agreements. These approvals must come from an authorized person, not be inferred from an agent's code changes.

## Minimal owner response once engineering evidence is collected

1. Who at Landvex approves privacy/consumer terms and handles requests at dev@hypbit.com?
2. Approve the prepared purposes/lawful-bases, retention and vendor/transfer matrix, or provide the existing policy/contracts for reconciliation.
3. Confirm the initial paid offer and consumer-sales markets; authorize only offers whose included benefits and withdrawal/cancellation handling have passed release tests.

Production domain/access, API keys, sender verification, vendor regions and runtime failures are engineering tasks first. Do not ask the owner to reproduce a task an available connector can safely perform. Apple enrolment and personal/company agreement acceptance remain separate human boundaries.

## Sources and implementation changes

- [GDPR Articles 6, 12–22, 28, 44–49 and 77](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679): checked 24 September 2026.
- [IMY — individual rights](https://www.imy.se/privatperson/dataskydd/dina-rattigheter/) and [complaints](https://www.imy.se/privatperson/utfora-arenden/lamna-ett-klagomal/): checked 24 September 2026.
- Consumer/App Store sources and outstanding evidence: [launch legal review](LAUNCH-LEGAL-2026-09-17.md).

This pass adds five-language rights/request/complaint guidance and actionable legal/support links; it removes the blanket privacy-policy “agreement” claim from the authentication presentation and its unused copies. It neither supplies missing lawful bases/retention facts nor certifies compliance. The separate explicit optional-AI permission control is unchanged.
