#!/bin/bash
set -euo pipefail

# Runs only in a disposable macOS CI runner. Does not authenticate, search,
# start Trading work, or bypass Vercel protection. The screenshot verifies boot,
# not end-to-end native account/network behavior.
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

SAJDA_SIMULATOR_ID=$(xcrun simctl list devices available --json | node -e '
let data=""; process.stdin.on("data",chunk=>data+=chunk); process.stdin.on("end",()=>{
  const device=Object.entries(JSON.parse(data).devices)
    .filter(([runtime])=>runtime.includes(".iOS-"))
    .flatMap(([,devices])=>devices).find(device=>device.isAvailable && device.name.startsWith("iPhone"));
  if(!device) process.exit(1); process.stdout.write(device.udid);
});')
trap 'run_step shutdown 30 xcrun simctl shutdown "$SAJDA_SIMULATOR_ID" || true' EXIT
run_step boot 30 xcrun simctl boot "$SAJDA_SIMULATOR_ID"
run_step boot-ready 420 xcrun simctl bootstatus "$SAJDA_SIMULATOR_ID" -b
run_step install 120 xcrun simctl install "$SAJDA_SIMULATOR_ID" ios/App/build/Build/Products/Debug-iphonesimulator/App.app
run_step launch 45 xcrun simctl launch "$SAJDA_SIMULATOR_ID" com.hypbit.sajda
sleep 10
run_step screenshot 30 xcrun simctl io "$SAJDA_SIMULATOR_ID" screenshot ios/App/build/sajda-iphone-smoke.png
