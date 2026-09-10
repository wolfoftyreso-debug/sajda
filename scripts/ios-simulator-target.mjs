import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Select the active Xcode SDK's runtime, not the first preinstalled device. */
export function selectSimulatorTarget(inventory, sdkVersion) {
  if (!/^\d+\.\d+(?:\.\d+)?$/u.test(sdkVersion)) throw new Error("Unknown iOS Simulator SDK version.");
  const sdk = sdkVersion.split(".").slice(0, 2).join(".");
  const runtimes = (inventory.runtimes ?? []).filter(runtime => runtime.isAvailable === true &&
    typeof runtime.identifier === "string" && /^com\.apple\.CoreSimulator\.SimRuntime\.iOS-/u.test(runtime.identifier) &&
    typeof runtime.version === "string" && runtime.version.split(".").slice(0, 2).join(".") === sdk)
    .sort((a, b) => b.version.localeCompare(a.version, "en", { numeric: true }));
  for (const runtime of runtimes) {
    const devices = inventory.devices?.[runtime.identifier] ?? [];
    for (const device of devices) {
      if (device.isAvailable !== true || typeof device.name !== "string" || !device.name.startsWith("iPhone")) continue;
      const type = (inventory.devicetypes ?? []).find(type => type.identifier === device.deviceTypeIdentifier || type.name === device.name);
      if (!type || !/^com\.apple\.CoreSimulator\.SimDeviceType\.iPhone-/u.test(type.identifier)) continue;
      return { runtimeIdentifier: runtime.identifier, deviceTypeIdentifier: type.identifier,
        runtimeVersion: runtime.version, deviceName: device.name };
    }
  }
  throw new Error(`No available iPhone runtime matches the active iOS Simulator SDK ${sdkVersion}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  process.stdout.write(JSON.stringify(selectSimulatorTarget(JSON.parse(input), process.argv[2] ?? "")));
}
