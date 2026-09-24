#!/bin/bash
set -euo pipefail

# Runs only in a disposable macOS CI runner. Does not authenticate, search,
# start Trading work, or bypass Vercel protection. Readiness proves the native
# search screen renders, not end-to-end native account/network behavior.
# Each simulator phase has its own deadline and emits its name. A successful
# bootstatus line is not evidence that install/launch subsequently completed.
run_step() {
  node -e '
    const {spawnSync}=require("node:child_process");
    const [stage,seconds,command,...args]=process.argv.slice(1);
    console.log(JSON.stringify({event:"simulator_step_started",stage,at:new Date().toISOString()}));
    const result=spawnSync(command,args,{stdio:"inherit",timeout:Number(seconds)*1000,killSignal:"SIGKILL"});
    console.log(JSON.stringify({event:"simulator_step_finished",stage,status:result.status,
      signal:result.signal,error:result.error?.code,at:new Date().toISOString()}));
    process.exit(result.status===0 && !result.error ? 0 : 1);
  ' "$@"
}

SAJDA_SIMULATOR_TARGET=$(xcrun simctl list --json | node scripts/ios-simulator-target.mjs "$(xcrun --sdk iphonesimulator --show-sdk-version)")
printf '%s\n' "$SAJDA_SIMULATOR_TARGET"
SAJDA_SIMULATOR_RUNTIME=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).runtimeIdentifier)' "$SAJDA_SIMULATOR_TARGET")
SAJDA_SIMULATOR_TYPE=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).deviceTypeIdentifier)' "$SAJDA_SIMULATOR_TARGET")
# A fresh device avoids migrating stale pre-created runner device state. Only
# this newly created, job-owned simulator is shut down/deleted by the trap.
SAJDA_SIMULATOR_ID=$(xcrun simctl create "Sajda CI Smoke" "$SAJDA_SIMULATOR_TYPE" "$SAJDA_SIMULATOR_RUNTIME")
trap 'run_step shutdown 30 xcrun simctl shutdown "$SAJDA_SIMULATOR_ID" || true; run_step delete 30 xcrun simctl delete "$SAJDA_SIMULATOR_ID" || true' EXIT
run_step boot 30 xcrun simctl boot "$SAJDA_SIMULATOR_ID"
# First boot runs Apple's system migrations on hosted runners. Allow that
# bounded setup time; never treat a timeout as a successful app boot.
run_step boot-ready 900 xcrun simctl bootstatus "$SAJDA_SIMULATOR_ID" -b
run_step install 120 xcrun simctl install "$SAJDA_SIMULATOR_ID" ios/App/build/Build/Products/Debug-iphonesimulator/App.app
run_step launch 45 env SIMCTL_CHILD_SAJDA_CI_SMOKE=1 xcrun simctl launch "$SAJDA_SIMULATOR_ID" com.hypbit.sajda
SAJDA_APP_CONTAINER=$(xcrun simctl get_app_container "$SAJDA_SIMULATOR_ID" com.hypbit.sajda data)
SAJDA_READY=0
run_step app-ready 75 node scripts/assert-ios-ready.mjs "$SAJDA_APP_CONTAINER/tmp/sajda-ui-smoke.json" ios/App/build/sajda-ui-smoke.json && SAJDA_READY=1
run_step screenshot 30 xcrun simctl io "$SAJDA_SIMULATOR_ID" screenshot ios/App/build/sajda-iphone-smoke.png
if [ "$SAJDA_READY" -ne 1 ]; then
  echo "Native search UI did not become ready; see sajda-ui-smoke.json and screenshot."
  exit 1
fi
