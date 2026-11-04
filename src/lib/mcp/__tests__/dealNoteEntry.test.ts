import { describe, it, expect } from "vitest";
import { entryToHtml } from "../dealNoteEntry";

describe("entryToHtml", () => {
  it("turns plain text into paragraphs, bullets and headings", () => {
    expect(entryToHtml("# Call recap\nQ: Bank?\n- Chase\n- SVB", "text")).toBe(
      "<h3>Call recap</h3><p>Q: Bank?</p><ul><li><p>Chase</p></li><li><p>SVB</p></li></ul>",
    );
  });
  it("escapes HTML in text mode", () => {
    expect(entryToHtml("<script>x</script> & **bold**", "text")).toBe("<p>&lt;script&gt;x&lt;/script&gt; &amp; <strong>bold</strong></p>");
  });
  it("passes HTML through in html mode", () => {
    expect(entryToHtml(" <p>hi</p> ", "html")).toBe("<p>hi</p>");
  });
});
