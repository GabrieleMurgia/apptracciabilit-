/**
 * recordsUtil.js — Record building, comparison, and display helpers.
 *
 * REFACTORED:
 * - Uses normalize.js as single source of truth for rowGuidKey, rowFibra,
 *   statusText, toArrayMulti, toStableString, valToText
 * - Removed _bindRecords (was a controller method using `this`, not a util)
 */
sap.ui.define([
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/statusUtil"
], function (N, StatusUtil) {
  "use strict";

  return {

    // =========================
    // ROW KEY HELPERS (delegate to normalize.js)
    // =========================
    rowGuidKey: N.rowGuidKey,
    rowFibra: N.rowFibra,

    // =========================
    // STATUS TEXT (delegate to normalize.js)
    // =========================
    statusText: N.statusText,

    // =========================
    // TO ARRAY MULTI (delegate to normalize.js)
    // =========================
    toArrayMulti: N.toArrayMulti,

    // =========================
    // BUILD RECORDS 01 (Screen3)
    // =========================
    buildRecords01: function (aAllRows, opts) {
      var oDetail = opts.oDetail;
      var oVm = opts.oVm;

      var aCfg01 = oDetail.getProperty("/_mmct/s01") || [];
      var aCols01 = aCfg01.map(function (x) { return x.ui; }).filter(Boolean);

      var mIsMulti = {};
      (aCfg01 || []).forEach(function (f) {
        if (f && f.ui && f.multiple) mIsMulti[f.ui] = true;
      });

      var sRole = (oVm && oVm.getProperty("/userType")) || "";
      sRole = String(sRole || "").trim().toUpperCase();

      var m = {};
      var a = [];

      (aAllRows || []).forEach(function (r) {
        if (N.isTemplateRow(r)) return;

        var sGuidKey = N.rowGuidKey(r);
        var sFibra = N.rowFibra(r);
        var sKey = sGuidKey;

        var stRow = StatusUtil.normStatoRow(r, oVm);

        var oRec = m[sKey];

        if (!oRec) {
          oRec = {
            idx: a.length,
            guidKey: sGuidKey,
            Fibra: sFibra,

            Stato: stRow,
            StatoText: N.statusText(stRow),
            __status: stRow,

            __canEdit: StatusUtil.canEdit(sRole, stRow),
            __canApprove: StatusUtil.canApprove(sRole, stRow),
            __canReject: StatusUtil.canReject(sRole, stRow),

            __readOnly: !StatusUtil.canEdit(sRole, stRow)
          };

          aCols01.forEach(function (c) {
            var v = (r && r[c] !== undefined) ? r[c] : "";
            oRec[c] = mIsMulti[c] ? N.toArrayMulti(v) : v;
          });

          m[sKey] = oRec;
          a.push(oRec);

        } else {
          var merged = StatusUtil.mergeStatus(oRec.__status, stRow);
          if (merged !== oRec.__status) {
            oRec.__status = merged;
            oRec.Stato = merged;
            oRec.StatoText = N.statusText(merged);

            oRec.__canEdit = StatusUtil.canEdit(sRole, merged);
            oRec.__canApprove = StatusUtil.canApprove(sRole, merged);
            oRec.__canReject = StatusUtil.canReject(sRole, merged);

            oRec.__readOnly = !oRec.__canEdit;
          }
        }
      });

      return a;
    },

    // =========================
    // COMPUTE OPEN ODA FROM ROWS
    // =========================
    computeOpenOdaFromRows: function (aRows) {
      var hasSignalProp = false;

      var bHasOpen = (aRows || []).some(function (r) {
        if (!r) return false;

        if (r.Open !== undefined || r.OpenPo !== undefined || r.OdaAperti !== undefined) {
          hasSignalProp = true;
        }

        var v = r.Open;
        if (v === true || v === 1) return true;

        v = String(v == null ? "" : v).trim().toUpperCase();
        if (v === "X" || v === "1" || v === "TRUE") return true;

        var n = Number(r.OpenPo || r.OdaAperti || r.Aperti || 0);
        return n > 0;
      });

      return { hasSignalProp: hasSignalProp, flag: bHasOpen ? "X" : "" };
    },

    // =========================
    // REFRESH HEADER 3 FIELDS
    // =========================
    refreshHeader3Fields: function (oDetail) {
      var aHdr = oDetail.getProperty("/_mmct/hdr3") || [];
      var r0 = oDetail.getProperty("/_mmct/raw0") || {};

      var a = (aHdr || [])
        .slice()
        .sort(function (a, b) { return (a.order ?? 9999) - (b.order ?? 9999); })
        .map(function (f) {
          var kRaw = String(f.ui || "").trim();
          var k = (kRaw.toUpperCase() === "STATO") ? "Stato" : kRaw;

          return {
            key: k,
            label: f.label || kRaw || k,
            value: N.valToText(r0[k])
          };
        });

      var seen = Object.create(null);
      a = a.filter(function (x) {
        var k = String(x && x.key || "").trim().toUpperCase();
        if (!k) return false;
        if (k === "STATO") k = "STATO";
        if (seen[k]) return false;
        seen[k] = true;
        return true;
      });

      oDetail.setProperty("/Header3Fields", a);
    },

    // =========================
    // HAS UNSAVED CHANGES
    // =========================
    hasUnsavedChanges: function (oDetail, snapshotRecords) {
      var aCurrent = oDetail.getProperty("/RecordsAll") || [];
      var aSnapshot = snapshotRecords || [];

      var normalizeObject = function (obj) {
        var cleanEntries = Object.entries(obj).map(function (entry) {
          var key = entry[0];
          var value = entry[1];
          if (Array.isArray(value)) {
            return [key, [...new Set(value)].sort()];
          }
          return [key, value];
        });
        return Object.fromEntries(cleanEntries);
      };

      aSnapshot = aSnapshot.map(normalizeObject);
      aCurrent = aCurrent.map(normalizeObject);

      if (!aSnapshot || !aSnapshot.length) return false;
      if (aCurrent.length !== aSnapshot.length) return true;

      return aCurrent.some(function (rCurr, i) {
        var rSnap = aSnapshot[i];
        if (!rSnap) return true;

        return Object.keys(rCurr).some(function (k) {
          if (k.indexOf("__") === 0) return false;
          if (k === "idx" || k === "guidKey" || k === "StatoText") return false;

          var vCurr = rCurr[k];
          var vSnap = rSnap[k];

          if (Array.isArray(vCurr) && Array.isArray(vSnap)) {
            if (vCurr.length !== vSnap.length) return true;
            return vCurr.some(function (v, j) { return v !== vSnap[j]; });
          }

          return vCurr !== vSnap;
        });
      });
    }
  };
});