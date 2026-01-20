sap.ui.define([], function () {
  "use strict";

  function ts() { return new Date().toISOString(); }

  function deepClone(x) {
    try { return JSON.parse(JSON.stringify(x)); }
    catch (e) { return x; }
  }

  function toStableString(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }

  // versione “robusta” (compatibile anche per S3 header/export)
  function valToText(v) {
    if (v === null || v === undefined) return "";
    if (Array.isArray(v)) return v.join(", ");
    if (typeof v === "object") {
      try { return JSON.stringify(v); } catch (e) { return String(v); }
    }
    return String(v);
  }

  return { ts: ts, deepClone: deepClone, toStableString: toStableString, valToText: valToText };
});
