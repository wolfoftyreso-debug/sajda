#!/bin/bash
set -euo pipefail

# Runs only in a disposable macOS CI runner. Does not authenticate, search,
# start Trading work, or bypass Vercel protection. The screenshot verifies boot,
# not end-to-end native account/network behavior.
SAJDA_SIMULATOR_ID=$(xcrun simctl list devices available --json | node -e '
let data=""; process.stdin.on("data",chunk=>data+=chunk); process.stdin.on("end",()=>{
  const device=Object.entries(JSON.parse(data).devices)
    .filter(([runtime])=>runtime.includes(".iOS-"))
    .flatMap(([,devices])=>devices).find(device=>device.isAvailable && device.name.startsWith("iPhone"));
  if(!device) process.exit(1); process.stdout.write(device.udid);
});')
trap 'xcrun simctl shutdown "$SAJDA_SIMULATOR_ID" >/dev/null 2>&1 || true' EXIT
xcrun simctl boot "$SAJDA_SIMULATOR_ID"
xcrun simctl bootstatus "$SAJDA_SIMULATOR_ID" -b
xcrun simctl install "$SAJDA_SIMULATOR_ID" ios/App/build/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch "$SAJDA_SIMULATOR_ID" com.hypbit.sajda
sleep 10
xcrun simctl io "$SAJDA_SIMULATOR_ID" screenshot ios/App/build/sajda-iphone-smoke.png
# Preserve app bundle permissions inside the downloadable artifact.
ditto -c -k --keepParent ios/App/build/Build/Products/Debug-iphonesimulator/App.app ios/App/build/Sajda-Simulator.zip
