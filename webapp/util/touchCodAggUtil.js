/**
 * touchCodAggUtil.js — CodAgg management helpers.
 *
 */
sap.ui.define([
  "apptracciabilita/apptracciabilita/util/normalize"
], function (N) {
  "use strict";

  var TouchCodAggUtil = {

    /**
     * Read CodAgg (normalized) from a row/record object.
     */
    getCodAgg: N.getCodAgg,

    /**
     * Mark CodAgg = "U" on a single detail row (Screen4 level).
     * Skips rows already marked "D".
     */
    touchCodAggRow: function (row) {
      if (!row) {
        return;
      }
      var ca = N.getCodAgg(row);
      var isNew = N.isNewRow(row);

      if (isNew) {
        row.CodAgg = "U";
        return;
      }
      if (ca === "" || ca === "N" || ca === "I") {
        row.CodAgg = "U";
      }
    },

    /**
     * Update CodAgg on a parent row and its raw rows in cache.
     *
     * @param {object} p - Parent row object
     * @param {string} sPath - Binding path in oDetail model (e.g. "/Records/3")
     * @param {object} opts - { oDetail, oVm, cacheKey }
     */
    touchCodAggParent: function (p, sPath, opts) {
      if (!p) {
        return;
      }

      var ca = N.getCodAgg(p);
      var isNew = N.isNewRow(p);

var newCa = ca;
if (isNew) {
  newCa = "I";
} else if (ca === "" || ca === "N" || ca === "I") {  // ← N → U
  newCa = "U";
}

      var parentChanged = (newCa !== ca);
      if (parentChanged) {
        p.CodAgg = newCa;
        if (p.CODAGG !== undefined) {
          delete p.CODAGG;
        }

        try {
          var oDetail = opts.oDetail;
          if (oDetail) {
            if (sPath && typeof sPath === "string") {
              oDetail.setProperty(sPath + "/CodAgg", p.CodAgg);
            }
            var idx = (p.idx != null) ? parseInt(p.idx, 10) : NaN;
            if (!isNaN(idx)) {
              var aAll = oDetail.getProperty("/RecordsAll") || [];
              for (var i = 0; i < aAll.length; i++) {
                if (parseInt(aAll[i] && aAll[i].idx, 10) === idx) {
                  oDetail.setProperty("/RecordsAll/" + i + "/CodAgg", p.CodAgg);
                  break;
                }
              }
            }
          }
        } catch (e) {
          console.warn("[touchCodAggUtil] touchCodAggParent detail update failed", e.message);
        }
      }

      // Update raw rows in VM cache
      var g = N.toStableString(N.getGuid(p));
      if (!g) {
        return;
      }

      var oVm = opts.oVm;
      var sKey = opts.cacheKey;
      var aRaw = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || [];
      if (!Array.isArray(aRaw)) {
        aRaw = [];
      }

      var changed = false;

      aRaw.forEach(function (r) {
        if (!r) {
          return;
        }
        if (N.rowGuidKey(r) !== g) {
          return;
        }

        var rc = N.getCodAgg(r);
        var rIsNew = N.isNewRow(r);

        /* if (rc === "N" || rc === "D") { */
        if (rc === "D") {  
          return;
        }

        if (rIsNew) {
          if (r.CodAgg !== "I") {
            r.CodAgg = "I";
            changed = true;
          }
        } else {
          /* if (rc === "" || rc === "I") */ if (rc === "" || rc === "N" || rc === "I"){
            if (r.CodAgg !== "U") {
              r.CodAgg = "U";
              changed = true;
            }
          }
        }

        if (r.CODAGG !== undefined) {
          delete r.CODAGG;
          changed = true;
        }
      });

      if (changed) {
        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aRaw);
      }
    }
  };

  return TouchCodAggUtil;
});
