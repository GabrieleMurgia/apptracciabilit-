/**
 * normalize.js — Single source of truth for all data normalization.
 *
 */
sap.ui.define([], function () {
  "use strict";

  // -------------------------------------------------------
  // Primitive helpers
  // -------------------------------------------------------

  /**
   * ISO timestamp string — used for logging.
   */
  function ts() {
    return new Date().toISOString();
  }

  /**
   * Deep clone via JSON round-trip.
   * Returns the original value if serialization fails (e.g. circular refs).
   */
  function deepClone(x) {
    if (x === null || x === undefined) {
      return x;
    }
    try {
      return JSON.parse(JSON.stringify(x));
    } catch (e) {
      console.warn("[normalize] deepClone failed, returning original", e.message);
      return x;
    }
  }

  /**
   * Coerce any value to a stable string representation.
   * null/undefined -> "", objects -> JSON.stringify, primitives -> String().
   */
  function toStableString(v) {
    if (v === null || v === undefined) {
      return "";
    }
    if (typeof v === "string") {
      return v;
    }
    if (typeof v === "number" || typeof v === "boolean") {
      return String(v);
    }
    try {
      return JSON.stringify(v);
    } catch (e) {
      return String(v);
    }
  }

  /**
   * Convert any value to a display-safe text.
   * Arrays -> join(", "), objects -> JSON, everything else -> String.
   */
  function valToText(v) {
    if (v === null || v === undefined) {
      return "";
    }
    if (Array.isArray(v)) {
      return v.join(", ");
    }
    if (typeof v === "object") {
      try {
        return JSON.stringify(v);
      } catch (e) {
        return String(v);
      }
    }
    return String(v);
  }

  /**
   * Trim + uppercase normalization for short codes (status, CodAgg, etc.).
   */
  function normCode(v) {
    return String(v == null ? "" : v).trim().toUpperCase();
  }

  /**
   * Check if a value is "empty" for required-field validation purposes.
   */
  function isEmpty(v) {
    if (v == null) {
      return true;
    }
    if (Array.isArray(v)) {
      return v.length === 0;
    }
    if (typeof v === "string") {
      return v.trim() === "";
    }
    return false;
  }

  // -------------------------------------------------------
  // Vendor normalization
  // -------------------------------------------------------

  /**
   * Pad a numeric vendor ID to 10 digits with leading zeros.
   * E.g. "123456" -> "0000123456".
   */
  function normalizeVendor10(v) {
    var s = String(v || "").trim();
    if (/^\d+$/.test(s) && s.length < 10) {
      s = ("0000000000" + s).slice(-10);
    }
    return s;
  }

  // -------------------------------------------------------
  // Row field accessors (unified)
  //
  // The backend returns property names inconsistently:
  //   Guid / GUID / guidKey / GuidKey / ItmGuid / ItemGuid / GUID_ITM
  //   CodAgg / CODAGG
  //   Fibra / FIBRA
  //   Stato / STATO / Zstatus
  //
  // These accessors handle ALL known variants in ONE place.
  // -------------------------------------------------------

  /**
   * Extract the GUID key from a row, trying all known property names.
   */
  function getGuid(row) {
    if (!row) {
      return "";
    }
    var v = row.guidKey != null ? row.guidKey
      : row.Guid != null ? row.Guid
      : row.GUID != null ? row.GUID
      : row.GuidKey != null ? row.GuidKey
      : row.ItmGuid != null ? row.ItmGuid
      : row.ItemGuid != null ? row.ItemGuid
      : row.GUID_ITM != null ? row.GUID_ITM
      : "";
    return toStableString(v);
  }

  /**
   * Alias for getGuid — used as the canonical "row GUID key" accessor.
   */
  var rowGuidKey = getGuid;

  /**
   * Extract Fibra from a row.
   */
  function rowFibra(row) {
    if (!row) {
      return "";
    }
    var v = row.Fibra != null ? row.Fibra
      : row.FIBRA != null ? row.FIBRA
      : "";
    return toStableString(v);
  }

  /**
   * Extract CodAgg from a row, normalized to uppercase.
   */
  function getCodAgg(row) {
    if (!row) {
      return "";
    }
    var v = row.CodAgg != null ? row.CodAgg
      : row.CODAGG != null ? row.CODAGG
      : "";
    return normCode(v);
  }

  /**
   * Check if row has a "base" CodAgg (empty or "N" = template).
   */
  function isBaseCodAgg(row) {
    var ca = getCodAgg(row);
    return ca === "" || ca === "N";
  }

  /**
   * Check if row is a template row (CodAgg === "N").
   */
  function isTemplateRow(row) {
    return getCodAgg(row) === "N";
  }

  /**
   * Check if a row is "new" (GUID contains "-new" or __isNew flag).
   */
  function isNewRow(row) {
    if (!row) {
      return false;
    }
    if (row.__isNew) {
      return true;
    }
    var g = getGuid(row);
    return g.indexOf("-new") >= 0;
  }

  /**
   * Extract the status from a row, trying known property names.
   */
  function getStatus(row) {
    if (!row) {
      return "";
    }
    var v = row.Stato != null ? row.Stato
      : row.STATO != null ? row.STATO
      : row.Zstatus != null ? row.Zstatus
      : row.__status != null ? row.__status
      : "";
    return normCode(v);
  }

  // -------------------------------------------------------
  // Multi-value field helpers
  // -------------------------------------------------------

  /**
   * Parse a multi-value string (separated by ; | ,) into a deduplicated array.
   */
  function toArrayMulti(v) {
    if (Array.isArray(v)) {
      var seen = {};
      return v
        .map(function (x) { return String(x || "").trim(); })
        .filter(function (x) { return !!x; })
        .filter(function (x) {
          if (seen[x]) { return false; }
          seen[x] = true;
          return true;
        });
    }
    var str = String(v || "").trim();
    if (!str) {
      return [];
    }
    var seen2 = {};
    return str.split(/[;|,]+/)
      .map(function (x) { return String(x || "").trim(); })
      .filter(function (x) { return !!x; })
      .filter(function (x) {
        if (seen2[x]) { return false; }
        seen2[x] = true;
        return true;
      });
  }

  /**
   * Normalize a multi-value string: split on ; or |, rejoin with the given separator.
   */
  function normalizeMultiString(v, sSepOut) {
    if (v == null) {
      return v;
    }
    if (Array.isArray(v)) {
      return v
        .map(function (x) { return String(x || "").trim(); })
        .filter(Boolean)
        .join(sSepOut);
    }
    var s = String(v || "").trim();
    if (!s) {
      return "";
    }
    if (s.indexOf(";") < 0 && s.indexOf("|") < 0) {
      return s;
    }
    return s.split(/[;|]+/)
      .map(function (x) { return String(x || "").trim(); })
      .filter(Boolean)
      .join(sSepOut);
  }

  // -------------------------------------------------------
  // OData error extraction
  // -------------------------------------------------------

  /**
   * Extract a human-readable error message from an OData error response.
   */
  function readODataError(oError) {
    try {
      var s = oError && (oError.responseText || (oError.response && oError.response.body));
      if (!s) {
        return "";
      }
      var j = JSON.parse(s);
      return (j && j.error && j.error.message &&
        (j.error.message.value || j.error.message)) || "";
    } catch (e) {
      return "";
    }
  }

  /**
   * Normalize the "Esito" field from a POST response line.
   */
  function normEsito(v) {
    return normCode(v);
  }

  /**
   * Extract the "Message" from a POST response line.
   */
  function normMsg(o) {
    var m = (o && (o.Message != null ? o.Message : o.message)) || "";
    return String(m == null ? "" : m).trim();
  }

  // -------------------------------------------------------
  // UUID generation
  // -------------------------------------------------------

  /**
   * Generate a base64-encoded UUID (for OData binary GUID fields).
   */
  function uuidv4() {
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    var bin = "";
    for (var i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin);
  }

  /**
   * Generate a new GUID string with "-new" suffix (marks unsaved rows).
   */
  function genGuidNew() {
    var base = "";
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      base = crypto.randomUUID().replace(/-/g, "");
    } else if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      var a = new Uint8Array(16);
      crypto.getRandomValues(a);
      base = Array.prototype.map.call(a, function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
    } else {
      base = (Date.now().toString(16) + Math.random().toString(16).slice(2))
        .replace(/\./g, "");
    }
    return base + "-new";
  }

  // -------------------------------------------------------
  // Cache key helpers
  // -------------------------------------------------------

  /**
   * Build a safe cache key from vendor + material.
   */
  function buildCacheKeySafe(sVendorId, sMaterial) {
    return encodeURIComponent(
      String(sVendorId || "").trim() + "||" + String(sMaterial || "").trim()
    );
  }

  /**
   * Build the full export cache key (prefixed with MOCK| or REAL|).
   */
  function buildExportCacheKey(bIsMock, sVendorId, sMaterial) {
    return (bIsMock ? "MOCK|" : "REAL|") + buildCacheKeySafe(sVendorId, sMaterial);
  }

  // -------------------------------------------------------
  // Status display helpers
  // -------------------------------------------------------

  var STATUS_TEXT_MAP = {
    "ST": "In attesa",
    "AP": "Approvato",
    "RJ": "Respinto",
    "CH": "Modificato"
  };

  /**
   * Convert a status code to display text.
   */
  function statusText(sCode) {
    var c = normCode(sCode);
    return STATUS_TEXT_MAP[c] || c || "";
  }

  // -------------------------------------------------------
  // Safe string helpers (previously in Screen2_controller.js)
  // -------------------------------------------------------

  /**
   * Coerce to string, null/undefined -> "".
   */
  function safeStr(x) {
    return (x === null || x === undefined) ? "" : String(x);
  }

  /**
   * Lowercase safe string.
   */
  function lc(x) {
    return safeStr(x).toLowerCase();
  }

  // -------------------------------------------------------
  // Public API
  //
  // This is the SINGLE SOURCE OF TRUTH for all data
  // normalization. Other modules should import from here
  // instead of duplicating these functions.
  // -------------------------------------------------------

  return {
    // Primitives
    ts: ts,
    deepClone: deepClone,
    toStableString: toStableString,
    valToText: valToText,
    normCode: normCode,
    isEmpty: isEmpty,
    safeStr: safeStr,
    lc: lc,

    // Vendor
    normalizeVendor10: normalizeVendor10,

    // Row field accessors
    getGuid: getGuid,
    rowGuidKey: rowGuidKey,
    rowFibra: rowFibra,
    getCodAgg: getCodAgg,
    isBaseCodAgg: isBaseCodAgg,
    isTemplateRow: isTemplateRow,
    isNewRow: isNewRow,
    getStatus: getStatus,

    // Multi-value
    toArrayMulti: toArrayMulti,
    normalizeMultiString: normalizeMultiString,

    // OData errors
    readODataError: readODataError,
    normEsito: normEsito,
    normMsg: normMsg,

    // UUID
    uuidv4: uuidv4,
    genGuidNew: genGuidNew,

    // Cache keys
    buildCacheKeySafe: buildCacheKeySafe,
    buildExportCacheKey: buildExportCacheKey,

    // Status display
    statusText: statusText,
    STATUS_TEXT_MAP: STATUS_TEXT_MAP
  };
});