import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";

/**
 * Optional STRICT sanitization tier.
 *
 * By default artifacts are NOT sanitized — that would strip the scripts and
 * interactivity that make an artifact useful, and isolation is instead provided
 * by origin separation + CSP. Callers that want a hardened, script-free artifact
 * can opt in; this removes <script>, event handlers, and other active content.
 */
let purifier: ReturnType<typeof createDOMPurify> | null = null;

function getPurifier() {
  if (!purifier) {
    const { window } = new JSDOM("");
    // dompurify's factory expects a window-like object; jsdom's window provides it.
    purifier = createDOMPurify(window as unknown as Parameters<typeof createDOMPurify>[0]);
  }
  return purifier;
}

export function sanitizeStrict(html: string): string {
  return getPurifier().sanitize(html, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: ["script"],
    FORBID_ATTR: ["onerror", "onload", "onclick"],
    ADD_ATTR: ["target"],
  });
}
