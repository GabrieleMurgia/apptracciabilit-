/**
 * postUtil.js — POST-related helpers (payload building, error handling, validation).
 *
 */
sap.ui.define([
  "apptracciabilita/apptracciabilita/util/normalize"
], function (N) {
  "use strict";

  return {

    // Re-exports for backward compatibility (callers that do PostUtil.getCodAgg etc.)
    normEsito: N.normEsito,
    normMsg: N.normMsg,
    normalizeVendor10: N.normalizeVendor10,
    readODataError: N.readODataError,
    uuidv4: N.uuidv4,
    genGuidNew: N.genGuidNew,
    normalizeMultiString: N.normalizeMultiString,
    getCodAgg: N.getCodAgg,
    isBaseCodAgg: N.isBaseCodAgg,
    isTemplateRow: N.isTemplateRow,
    isEmptyRequiredValue: N.isEmpty,

    // -------------------------------------------------------
    // POST response extraction
    // -------------------------------------------------------

    /**
     * Extract the PostDataCollection array from a POST response.
     */
    extractPostResponseLines: function (oData) {
      if (!oData) {
        return [];
      }
      var col = oData.PostDataCollection;
      if (col && Array.isArray(col.results)) {
        return col.results;
      }
      if (Array.isArray(col)) {
        return col;
      }
      return [];
    },

    // -------------------------------------------------------
    // Multi-field helpers
    // -------------------------------------------------------

    /**
     * Build a map of field names that support multiple values.
     */
    getMultiFieldsMap: function (oDetail) {
      var a01 = (oDetail && oDetail.getProperty("/_mmct/s01")) || [];
      var a02 = (oDetail && oDetail.getProperty("/_mmct/s02")) || [];
      var m = {};

      [a01, a02].forEach(function (arr) {
        (arr || []).forEach(function (f) {
          if (!f || !f.ui || !f.multiple) {
            return;
          }
          var k = String(f.ui).trim();
          if (k.toUpperCase() === "STATO") {
            k = "Stato";
          }
          m[k] = true;
        });
      });

      return m;
    },

    /**
     * Normalize incoming rows: convert "|" separators to ";" for multi-value fields.
     */
    formatIncomingRowsMultiSeparators: function (aRows, mMulti) {
      var aKeys = Object.keys(mMulti || {});
      if (!aKeys.length) {
        return;
      }

      (aRows || []).forEach(function (r) {
        if (!r) {
          return;
        }
        aKeys.forEach(function (k) {
          var v = r[k];
          if (typeof v === "string" && v.indexOf("|") >= 0) {
            r[k] = N.normalizeMultiString(v, ";");
          }
        });
      });
    },

    // -------------------------------------------------------
    // Validation
    // -------------------------------------------------------

    /**
     * Build maps of required fields from MMCT config (S01 and S02).
     */
    getRequiredMapFromMmct: function (oDetail) {
      var a01 = (oDetail && oDetail.getProperty("/_mmct/s01")) || [];
      var a02 = (oDetail && oDetail.getProperty("/_mmct/s02")) || [];
      var req01 = {};
      var req02 = {};

      (a01 || []).forEach(function (f) {
        if (f && f.ui && f.required) {
          var k = String(f.ui).trim();
          if (k.toUpperCase() === "STATO") {
            k = "Stato";
          }
          req01[k] = f;
        }
      });

      (a02 || []).forEach(function (f) {
        if (f && f.ui && f.required) {
          var k = String(f.ui).trim();
          if (k.toUpperCase() === "STATO") {
            k = "Stato";
          }
          req02[k] = f;
        }
      });

      return { req01: req01, req02: req02 };
    },

    // -------------------------------------------------------
    // Stash deleted rows for POST
    // -------------------------------------------------------

    /**
     * When a parent is deleted, stash all its detail rows with CodAgg="D"
     * so they get sent in the next POST.
     */
    stashDeleteForPostFromCache: function (oParent, aRowsCache, oDetail) {
      if (!oParent) {
        return;
      }

      var g = N.getGuid(oParent);
      if (!g) {
        return;
      }

      // Don't stash new rows — they were never persisted
      if (N.isNewRow(oParent)) {
        return;
      }

      var aMatch = (aRowsCache || []).filter(function (r) {
        return N.rowGuidKey(r) === g;
      });

      var aToDelete = aMatch.filter(function (r) {
        var ca = N.getCodAgg(r);
        if (ca === "N" || ca === "D") {
          return false;
        }
        if (N.isNewRow(r)) {
          return false;
        }
        return true;
      });

      if (!aToDelete.length) {
        aToDelete = [oParent];
      }

      var aStash = oDetail.getProperty("/__deletedLinesForPost") || [];

      aToDelete.forEach(function (r) {
        var x = N.deepClone(r) || {};
        delete x.CODAGG;
        x.CodAgg = "D";
        x.__deletedAt = new Date().toISOString();
        aStash.push(x);
      });

      oDetail.setProperty("/__deletedLinesForPost", aStash);
    },

    // -------------------------------------------------------
    // Error display
    // -------------------------------------------------------

    /**
     * Show a toast summarizing POST errors.
     */
    showPostErrorMessagePage: function (aErrLines) {
      var aErr = Array.isArray(aErrLines) ? aErrLines : [];
      if (!aErr.length) {
        return;
      }

      var r0 = aErr[0] || {};
      var sMsg0 = N.normMsg(r0) || "Errore in salvataggio";

      var parts = [];
      if (r0.PartitaFornitore) {
        parts.push("Partita " + r0.PartitaFornitore);
      }
      if (r0.Fibra) {
        parts.push("Fibra " + r0.Fibra);
      }
      var sHead = parts.length ? (" (" + parts.join(" - ") + ")") : "";

      var sToast = "Salvataggio NON completato: " + sMsg0 + sHead;
      if (aErr.length > 1) {
        sToast += " (+ altri " + (aErr.length - 1) + ")";
      }

      sap.m.MessageToast.show(sToast, { duration: 6000, width: "30em" });
    }

    // NOTE: _touchCodAggParent was removed from this file.
    // It used `this._getODetail()`, `this._getOVm()` etc. which are controller
    // methods — it never worked as a standalone utility function.
    // This logic now lives in touchCodAggUtil.js (which is called from the controller).
  };
});
