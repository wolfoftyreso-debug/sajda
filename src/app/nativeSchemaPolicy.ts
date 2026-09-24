import { config } from "zod/v4/core";

// The signed app forbids eval. Apply before importing application schemas so
// Zod uses its ordinary parser without probing Function() or compiling JIT code.
// Schema validation remains identical; this does not relax the native CSP.
config({ jitless: true });
