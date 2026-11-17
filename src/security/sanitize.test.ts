import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { sanitizeStrict } from "./sanitize.js";

describe("sanitized artifacts", () => {
  it.each([
    "<h1>Safe</h1><script>alert(1)</script>",
    '<img src=x onerror="alert(1)"><button onclick="alert(1)">Safe</button>',
    '<a href="javascript:alert(1)">Safe</a><input onfocus="alert(1)">',
    '<svg onload="alert(1)"><a href="javascript:alert(1)">Safe</a></svg>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe><p>Safe</p>',
  ])("removes executable markup after parsing: %s", (html) => {
    const result = sanitizeStrict(html);
    const dom = new JSDOM(result);
    try {
      const document = dom.window.document;
      expect(document.querySelector("script,iframe,object,embed")).toBeNull();
      for (const element of document.querySelectorAll("*")) {
        for (const attribute of element.attributes) {
          expect(attribute.name).not.toMatch(/^on/i);
          if (
            ["href", "src", "xlink:href", "action", "formaction"].includes(
              attribute.name,
            )
          )
            expect(
              attribute.value.replace(/[\s\u0000-\u001f]/g, ""),
            ).not.toMatch(/^(javascript|vbscript):/i);
        }
      }
      expect(document.body.textContent).toContain("Safe");
    } finally {
      dom.window.close();
    }
  });

  it("preserves document structure, readable content and safe links", () => {
    const result = sanitizeStrict(
      '<!doctype html><html lang="pt-BR"><head><title>Report</title></head><body><h1>Hello</h1><a href="https://example.com">Read</a></body></html>',
    );
    const dom = new JSDOM(result);
    try {
      expect(dom.window.document.title).toBe("Report");
      expect(dom.window.document.documentElement.lang).toBe("pt-BR");
      expect(dom.window.document.querySelector("a")?.href).toBe(
        "https://example.com/",
      );
    } finally {
      dom.window.close();
    }
  });
});
