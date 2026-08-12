import { sanitizeRichText, isRichText } from "../src/lib/rich-text";

const cases: { name: string; input: string; expected: string }[] = [
  // Pre-pass: markup the tag-stripping regex can't see
  { name: "strips HTML comment",          input: "a<!-- comment -->b",          expected: "ab" },
  { name: "strips DOCTYPE",               input: "<!DOCTYPE html>text",          expected: "text" },
  { name: "strips CDATA",                 input: "a<![CDATA[x]]>b",              expected: "ab" },
  { name: "strips processing instruction", input: "a<?pi x?>b",                  expected: "ab" },
  // Block tags: closing tag -> <br> so pasted paragraphs don't merge
  { name: "two paragraphs keep a break",  input: "<p>One</p><p>Two</p>",         expected: "One<br>Two<br>" },
  { name: "div close becomes br",         input: "<div>A</div>",                 expected: "A<br>" },
  { name: "heading close becomes br",     input: "<h1>Title</h1>Body",           expected: "Title<br>Body" },
  // ol -> ul (a pasted numbered list keeps its items as a bullet list)
  { name: "ol becomes ul",                input: "<ol><li>x</li></ol>",          expected: "<ul><li>x</li></ul>" },
  // Regression: existing behaviour preserved
  { name: "b normalized to strong",       input: "a<b>bold</b>",                 expected: "a<strong>bold</strong>" },
  { name: "script stripped, text kept",   input: "<script>alert(1)</script>",    expected: "alert(1)" },
  { name: "attributes stripped",          input: '<strong style="x">ok</strong>', expected: "<strong>ok</strong>" },
  { name: "self-closing br normalized",   input: "<br/>",                        expected: "<br>" },
  { name: "plain text untouched",         input: "Hello world",                  expected: "Hello world" },
  { name: "allowed list untouched",       input: "<ul><li>a</li></ul>",          expected: "<ul><li>a</li></ul>" },
];

let failures = 0;
for (const c of cases) {
  const got = sanitizeRichText(c.input);
  if (got === c.expected) {
    console.log("PASS:", c.name);
  } else {
    failures++;
    console.log(`FAIL: ${c.name}\n  input:    ${JSON.stringify(c.input)}\n  expected: ${JSON.stringify(c.expected)}\n  got:      ${JSON.stringify(got)}`);
  }
}

// isRichText must recognise ol now, or an ol-only value gets escaped as legacy text.
const olRecognised = isRichText("<ol><li>x</li></ol>");
console.log(olRecognised ? "PASS: isRichText recognises ol" : "FAIL: isRichText does not recognise ol");
if (!olRecognised) failures++;

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
