/** Deterministic stored ZIP for the small text-only connector kit. No executable installer. */
export function createConnectorZip(entries) {
  const names = new Set(), local = [], central = [];
  let offset = 0;
  if (!entries.length || entries.length > 100) throw new Error("Unexpected connector kit size");
  for (const entry of entries) {
    if (!/^[a-zA-Z0-9_.\-/]+$/u.test(entry.name) || entry.name.startsWith("/") || entry.name.split("/").some(part => !part || part === "..") || names.has(entry.name)) throw new Error("Unsafe or duplicate kit path");
    names.add(entry.name);
    const name = Buffer.from(entry.name), data = Buffer.from(entry.data);
    if (data.length > 256_000) throw new Error("Connector kit file exceeds text limit");
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x800, 8); directory.writeUInt16LE(33, 14); directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    local.push(header, name, data); central.push(directory, name);
    offset += header.length + name.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
