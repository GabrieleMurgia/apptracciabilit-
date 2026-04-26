sap.ui.define([
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/core/BusyIndicator",
  "sap/m/MessageToast",
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/statusUtil",
  "apptracciabilita/apptracciabilita/util/i18nUtil"
], function (Filter, FilterOperator, BusyIndicator, MessageToast, N, StatusUtil, I18n) {
  "use strict";

  var validForce = ["ST", "AP", "RJ", "CH"];

  // Delegate to normalize.js (single source of truth)
  var rowGuidKey = N.rowGuidKey;
  var rowFibra = N.rowFibra;
  function pickCat(o) { return o ? String(o.CatMateriale || o.CATMATERIALE || o.CAT_MATERIALE || o.CATMAT || o.Cat_Materiale || "").trim() : ""; }

  function buildCfgFallbackFromObject(oAny) {
    var o = oAny || {};
    var aKeys = Object.keys(o).filter(function (k) { return !!k && k !== "__metadata" && k !== "AllData" && k.indexOf("__") !== 0; }).sort();
    if (!aKeys.length) aKeys = ["guidKey"];
    return aKeys.map(function (k) { return { ui: k, label: k, domain: "", required: false, locked: false, multiple: Array.isArray(o[k]) }; });
  }

  var S4Loader = {

    rowGuidKey: rowGuidKey,
    rowFibra: rowFibra,
    pickCat: pickCat,
    buildCfgFallbackFromObject: buildCfgFallbackFromObject,

    reloadDataFromBackend: function (opts, fnDone) {
      var oVm = opts.oVm;
      var sUserId = (oVm && oVm.getProperty("/userId")) || "";

      function done(a) { if (typeof fnDone === "function") fnDone(a || []); }
      function norm(v) { return String(v || "").trim().toUpperCase(); }

      var sVendor = String(opts.vendorId || "").trim();
      if (/^\d+$/.test(sVendor) && sVendor.length < 10) sVendor = sVendor.padStart(10, "0");

      var aFilters = [new Filter("UserID", FilterOperator.EQ, sUserId), new Filter("Fornitore", FilterOperator.EQ, sVendor)];

      var sCatMateriale = String(opts.catMateriale || "").trim();
      if (sCatMateriale) {
        aFilters.push(new Filter("CatMateriale", FilterOperator.EQ, sCatMateriale));
      } else {
        var sRouteMat = norm(opts.material);
        var aMatVariants = [sRouteMat];
        if (sRouteMat && !sRouteMat.endsWith("S")) aMatVariants.push(sRouteMat + "S");
        if (sRouteMat && sRouteMat.endsWith("S")) aMatVariants.push(sRouteMat.slice(0, -1));
        aMatVariants = aMatVariants.filter(function (v, i, a) { return !!v && a.indexOf(v) === i; });

        if (aMatVariants.length) {
          aFilters.push(new Filter({ filters: aMatVariants.map(function (m) { return new Filter("Materiale", FilterOperator.EQ, m); }), and: false }));
        }
      }

      var sSeason = String(opts.season || "").trim();
      if (sSeason) {
        aFilters.push(new Filter("Stagione", FilterOperator.EQ, sSeason));
      }

      BusyIndicator.show(0);
      opts.oDataModel.read("/DataSet", {
        filters: aFilters, urlParameters: { "sap-language": "IT" },
        success: function (oData) {
          BusyIndicator.hide();
          var a = (oData && oData.results) || [];
          done(a);
        },
        error: function () { BusyIndicator.hide(); MessageToast.show(I18n.text(null, "msg.detailLoadError", [], "Errore nel caricamento dei dettagli")); done([]); }
      });
    },

    buildRecords01ForCache: function (aAllRows, aCfg01, oVm) {
      var sRole = String((oVm && oVm.getProperty("/userType")) || "").trim().toUpperCase();
      var aCols01 = (aCfg01 || []).map(function (x) { return x && x.ui; }).filter(Boolean);
      var mIsMulti = {};
      (aCfg01 || []).forEach(function (f) { if (f && f.ui && f.multiple) mIsMulti[f.ui] = true; });

      function toArray(v) { if (Array.isArray(v)) return v; var s = String(v || "").trim(); return s ? s.split(/[;|]+/).map(function (x) { return x.trim(); }).filter(Boolean) : []; }

      var m = {}, a = [];
      (aAllRows || []).forEach(function (r) {
        if (N.isTemplateRow(r)) return;
        var sGuidKey = rowGuidKey(r), sKey = sGuidKey;
        var stRow = StatusUtil.normStatoRow(r);
        var oRec = m[sKey];
        if (!oRec) {
          oRec = {
            idx: a.length, guidKey: sGuidKey, Fibra: rowFibra(r),
            CodAgg: (r && (r.CodAgg || r.CODAGG)) || "",
            Stato: stRow, __status: stRow,
            __canEdit: StatusUtil.canEdit(sRole, stRow), __canApprove: StatusUtil.canApprove(sRole, stRow),
            __canReject: StatusUtil.canReject(sRole, stRow), __readOnly: !StatusUtil.canEdit(sRole, stRow)
          };
          aCols01.forEach(function (c) { oRec[c] = mIsMulti[c] ? toArray(r && r[c]) : ((r && r[c] !== undefined) ? r[c] : ""); });
          m[sKey] = oRec; a.push(oRec);
        } else {
          var merged = StatusUtil.mergeStatus(oRec.__status, stRow);
          if (merged !== oRec.__status) {
            oRec.__status = merged; oRec.Stato = merged;
            oRec.__canEdit = StatusUtil.canEdit(sRole, merged); oRec.__canApprove = StatusUtil.canApprove(sRole, merged);
            oRec.__canReject = StatusUtil.canReject(sRole, merged); oRec.__readOnly = !oRec.__canEdit;
          }
        }
      });
      return a;
    }
  };

  return S4Loader;
});
