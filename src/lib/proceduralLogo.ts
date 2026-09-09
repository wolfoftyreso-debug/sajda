/**
 * Small, local logo-study generator.
 *
 * A concept is reproducible from a domain and seed, but a new seed produces a
 * fresh variation. It deliberately contains no network request or model call:
 * the result is a browser-generated SVG that a visitor can save and iterate on.
 */

export type LogoConceptVariant = "ribbon" | "orbit" | "facet" | "signal" | "blocks";

export interface ProceduralLogoConcept {
  domain: string;
  seed: number;
  variant: LogoConceptVariant;
  styleName: string;
  svg: string;
  dataUrl: string;
}

const STYLE_NAMES: Record<LogoConceptVariant, string> = {
  ribbon: "Folded ribbon",
  orbit: "Orbital mark",
  facet: "Prism cut",
  signal: "Signal line",
  blocks: "Offset blocks",
};

function hashDomain(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function randomFromSeed(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hsl(hue: number, saturation: number, lightness: number) {
  const safeHue = ((Math.round(hue) % 360) + 360) % 360;
  return `hsl(${safeHue} ${Math.round(saturation)}% ${Math.round(lightness)}%)`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function markForVariant(
  variant: LogoConceptVariant,
  colors: { primary: string; secondary: string; ink: string; soft: string },
  id: string,
) {
  switch (variant) {
    case "ribbon":
      return `
        <path d="M165 255c0-82 58-137 142-137 35 0 70 10 103 31l-38 61c-22-15-42-22-64-22-38 0-64 25-64 67 0 39 26 66 66 66 21 0 43-8 67-24l37 61c-33 22-70 33-108 33-84 0-141-55-141-136Z" fill="url(#${id}-gradient)"/>
        <path d="M281 116h83l-62 118h-83l62-118Z" fill="${colors.ink}" opacity=".9"/>
        <circle cx="391" cy="323" r="19" fill="${colors.secondary}"/>
      `;
    case "orbit":
      return `
        <circle cx="290" cy="255" r="118" fill="none" stroke="${colors.soft}" stroke-width="30"/>
        <path d="M174 294c50 67 173 67 231-4" fill="none" stroke="url(#${id}-gradient)" stroke-linecap="round" stroke-width="31"/>
        <path d="M190 215c38-84 160-112 223-34" fill="none" stroke="${colors.ink}" stroke-linecap="round" stroke-width="21" opacity=".92"/>
        <circle cx="394" cy="177" r="23" fill="${colors.secondary}"/>
      `;
    case "facet":
      return `
        <path d="M174 162 282 103l109 59-109 59-108-59Z" fill="${colors.soft}"/>
        <path d="m174 162 108 59v125l-108-59V162Z" fill="${colors.ink}" opacity=".92"/>
        <path d="m282 221 109-59v125l-109 59V221Z" fill="url(#${id}-gradient)"/>
        <path d="m282 221 66-36 43 23v79l-109 59v-125Z" fill="${colors.primary}" opacity=".36"/>
        <circle cx="406" cy="132" r="17" fill="${colors.secondary}"/>
      `;
    case "signal":
      return `
        <path d="M159 285c38-88 86-132 144-132 51 0 92 31 123 93" fill="none" stroke="${colors.soft}" stroke-linecap="round" stroke-width="28"/>
        <path d="M160 316c43-47 86-70 129-70 42 0 82 20 121 60" fill="none" stroke="url(#${id}-gradient)" stroke-linecap="round" stroke-width="29"/>
        <path d="M173 355c33 15 65 22 96 22 47 0 88-17 124-51" fill="none" stroke="${colors.ink}" stroke-linecap="round" stroke-width="19"/>
        <circle cx="429" cy="244" r="19" fill="${colors.secondary}"/>
      `;
    case "blocks":
      return `
        <rect x="172" y="142" width="104" height="104" rx="29" fill="${colors.ink}" opacity=".94"/>
        <rect x="287" y="142" width="104" height="104" rx="29" fill="url(#${id}-gradient)"/>
        <rect x="230" y="257" width="104" height="104" rx="29" fill="${colors.soft}"/>
        <circle cx="372" cy="312" r="20" fill="${colors.secondary}"/>
      `;
  }
}

/** Creates a random seed without needing an external service. */
export function createLogoConceptSeed() {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] ?? Date.now();
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

/**
 * Builds a self-contained SVG study. Passing the same domain + seed always
 * returns the same concept, which makes a saved preview reproducible.
 */
export function createProceduralLogoConcept(
  domain: string,
  seed = createLogoConceptSeed(),
): ProceduralLogoConcept {
  const normalizedDomain = domain.trim().toLowerCase() || "sajda.dev";
  const combinedSeed = (hashDomain(normalizedDomain) ^ seed) >>> 0;
  const random = randomFromSeed(combinedSeed);
  const variants: LogoConceptVariant[] = ["ribbon", "orbit", "facet", "signal", "blocks"];
  const variant = variants[Math.floor(random() * variants.length)] ?? "ribbon";
  const baseHue = (hashDomain(normalizedDomain) % 360 + Math.floor(random() * 55)) % 360;
  const primary = hsl(baseHue, 82, 54);
  const secondary = hsl(baseHue + 46 + Math.floor(random() * 30), 88, 55);
  const ink = hsl(baseHue + 219, 42, 17);
  const soft = hsl(baseHue + 13, 72, 88);
  const id = `sajda-${combinedSeed.toString(36)}`;
  const safeDomain = escapeXml(normalizedDomain);
  const mark = markForVariant(variant, { primary, secondary, ink, soft }, id);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" role="img" aria-label="${safeDomain} logo concept" fill="none">
  <defs>
    <linearGradient id="${id}-gradient" x1="168" y1="118" x2="426" y2="366" gradientUnits="userSpaceOnUse">
      <stop stop-color="${primary}"/>
      <stop offset="1" stop-color="${secondary}"/>
    </linearGradient>
    <filter id="${id}-shadow" x="96" y="55" width="410" height="405" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="${ink}" flood-opacity=".14"/>
    </filter>
  </defs>
  <rect width="960" height="540" rx="44" fill="white"/>
  <path d="M0 424c151-55 272 45 457-4 160-43 288 19 503-49" stroke="${soft}" stroke-width="1" opacity=".75"/>
  <path d="M0 457c147-55 275 45 456-4 162-43 293 19 504-49" stroke="${soft}" stroke-width="1" opacity=".45"/>
  <g filter="url(#${id}-shadow)">${mark}</g>
  <text x="505" y="238" fill="${ink}" font-family="Arial, Helvetica, sans-serif" font-size="23" font-weight="700" letter-spacing="4">LOGO STUDY</text>
  <text x="505" y="301" fill="${ink}" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="700" letter-spacing="-2">${safeDomain}</text>
  <text x="507" y="342" fill="${ink}" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="400" opacity=".62">A browser-generated brand direction</text>
  <text x="505" y="393" fill="${primary}" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700" letter-spacing="2">${STYLE_NAMES[variant].toUpperCase()}</text>
</svg>`;

  return {
    domain: normalizedDomain,
    seed,
    variant,
    styleName: STYLE_NAMES[variant],
    svg,
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  };
}

export function downloadProceduralLogoConcept(concept: ProceduralLogoConcept) {
  const blob = new Blob([concept.svg], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const fileName = concept.domain.replace(/[^a-z0-9.-]+/gi, "-").replace(/\.+/g, ".");

  link.href = objectUrl;
  link.download = `${fileName || "sajda-logo"}-logo-study.svg`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
