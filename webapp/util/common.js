/**
 * common.js — DEPRECATED: Use normalize.js directly.
 *
 * This module exists only for backward compatibility.
 * All new code should import from:
 *   "apptracciabilita/apptracciabilita/util/normalize"
 */
sap.ui.define([
  "apptracciabilita/apptracciabilita/util/normalize"
], function (N) {
  "use strict";

  // Re-export everything from normalize so existing callers
  // (Common.ts, Common.deepClone, etc.) keep working.
  return N;
});