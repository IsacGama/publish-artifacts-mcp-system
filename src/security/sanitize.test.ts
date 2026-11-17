import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { sanitizeStrict } from "./sanitize.js";

describe("sanitized artifacts", () => {
  for (const html of [
    "<h1>Safe</h1><script>alert(1)</script>",
    '<img src=x onerror="alert(1)"><button onclick="alert(1)">Safe</button>',
    '<a href="javascript:alert(1)">Safe</a><input onfocus="alert(1)">',
    '<svg onload="alert(1)"><a href="javascript:alert(1)">Safe</a></svg>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe><p>Safe</p>',
  ])
    it(`removes executable markup after parsing: ${html}`, () => {
      const result = sanitizeStrict(html);
      const dom = new JSDOM(result);
      try {
        const document = dom.window.document;
        assert.strictEqual(
          document.querySelector("script,iframe,object,embed"),
          null,
        );
        for (const element of document.querySelectorAll("*")) {
          for (const attribute of element.attributes) {
            assert.doesNotMatch(attribute.name, /^on/i);
            if (
              ["href", "src", "xlink:href", "action", "formaction"].includes(
                attribute.name,
              )
            )
              assert.doesNotMatch(
                attribute.value.replace(/[\s\u0000-\u001f]/g, ""),
                /^(javascript|vbscript):/i,
              );
          }
        }
        assert.ok(document.body.textContent?.includes("Safe"));
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
      assert.strictEqual(dom.window.document.title, "Report");
      assert.strictEqual(dom.window.document.documentElement.lang, "pt-BR");
      assert.strictEqual(
        dom.window.document.querySelector("a")?.href,
        "https://example.com/",
      );
    } finally {
      dom.window.close();
    }
  });
});
