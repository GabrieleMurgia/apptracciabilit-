sap.ui.define([
  "apptracciabilita/apptracciabilita/util/common",
  "apptracciabilita/apptracciabilita/util/postUtil",
  "apptracciabilita/apptracciabilita/util/recordsUtil"
], function (Common, PostUtil, RecordsUtil) {
  "use strict";

  var TouchCodAggUtil = {

    /**
     * Aggiorna il CodAgg del parent e delle righe raw in cache.
     * @param {object} p - record parent
     * @param {string} sPath - binding path
     * @param {object} opts
     * @param {sap.ui.model.json.JSONModel} opts.oDetail
     * @param {sap.ui.model.json.JSONModel} opts.oVm
     * @param {string} opts.cacheKey - export cache key
     */
    touchCodAggParent: function (p, sPath, opts) {
      if (!p) return;

      var ca = PostUtil.getCodAgg(p);
      var isNew = !!p.__isNew || String(p.guidKey || p.Guid || p.GUID || "").indexOf("-new") >= 0;

      if (ca === "N") return;

      var newCa = ca;
      if (isNew) {
        newCa = "I";
      } else if (ca === "" || ca === "I") {
        newCa = "U";
      }

      var parentChanged = (newCa !== ca);
      if (parentChanged) {
        p.CodAgg = newCa;
        if (p.CODAGG !== undefined) delete p.CODAGG;

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
        } catch (e) { }
      }

      var g = Common.toStableString(p.guidKey || p.Guid || p.GUID);
      if (!g) return;

      var oVm = opts.oVm;
      var sKey = opts.cacheKey;
      var aRaw = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || [];
      if (!Array.isArray(aRaw)) aRaw = [];

      var changed = false;

      aRaw.forEach(function (r) {
        if (!r) return;
        if (RecordsUtil.rowGuidKey(r) !== g) return;

        var rc = PostUtil.getCodAgg(r);
        var rIsNew = !!r.__isNew || String(r.Guid || r.GUID || r.guidKey || "").indexOf("-new") >= 0;

        if (rc === "N" || rc === "D") return;

        if (rIsNew) {
          if (r.CodAgg !== "I") { r.CodAgg = "I"; changed = true; }
        } else {
          if (rc === "" || rc === "I") {
            if (r.CodAgg !== "U") { r.CodAgg = "U"; changed = true; }
          }
        }

        if (r.CODAGG !== undefined) { delete r.CODAGG; changed = true; }
      });

      if (changed) {
        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aRaw);
      }
    }
  };

  return TouchCodAggUtil;
});