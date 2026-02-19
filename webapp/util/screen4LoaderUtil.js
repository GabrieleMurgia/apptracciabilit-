sap.ui.define([
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/core/BusyIndicator",
  "sap/m/MessageToast",
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/statusUtil"
], function (Filter, FilterOperator, BusyIndicator, MessageToast, N, StatusUtil) {
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
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var bMockS4 = !!mock.mockS4;
      var sForceStato = String(mock.forceStato || "").trim().toUpperCase();
      var sUserId = (oVm && oVm.getProperty("/userId")) || "E_ZEMAF";
      var logFn = opts.logFn || function () {};

      function done(a) { if (typeof fnDone === "function") fnDone(a || []); }
      function norm(v) { return String(v || "").trim().toUpperCase(); }

      if (bMockS4) {
        var sUrl = sap.ui.require.toUrl("apptracciabilita/apptracciabilita/mock/DataSet.json");
        var oJ = new sap.ui.model.json.JSONModel(sUrl);
        try { oJ.loadData(sUrl, null, false); } catch (e) { logFn("[MOCK S4] sync FAIL", e && e.message); }
        var d = oJ.getData();
        var aMock = (d && d.results) || (d && d.d && d.d.results) || d;
        if (!Array.isArray(aMock)) {
          if (aMock && Array.isArray(aMock.results)) aMock = aMock.results;
          else if (aMock && aMock.d && Array.isArray(aMock.d.results)) aMock = aMock.d.results;
          else aMock = [];
        }
        if (validForce.indexOf(sForceStato) >= 0) aMock.forEach(function (r) { r.Stato = sForceStato; });
        done(aMock); return;
      }

      var sVendor = String(opts.vendorId || "").trim();
      if (/^\d+$/.test(sVendor) && sVendor.length < 10) sVendor = sVendor.padStart(10, "0");
      var sRouteMat = norm(opts.material);
      var aMatVariants = [sRouteMat];
      if (sRouteMat && !sRouteMat.endsWith("S")) aMatVariants.push(sRouteMat + "S");
      if (sRouteMat && sRouteMat.endsWith("S")) aMatVariants.push(sRouteMat.slice(0, -1));
      aMatVariants = aMatVariants.filter(function (v, i, a) { return !!v && a.indexOf(v) === i; });

      var aFilters = [new Filter("UserID", FilterOperator.EQ, sUserId), new Filter("Fornitore", FilterOperator.EQ, sVendor)];
      if (aMatVariants.length) {
        aFilters.push(new Filter({ filters: aMatVariants.map(function (m) { return new Filter("Materiale", FilterOperator.EQ, m); }), and: false }));
      }

      BusyIndicator.show(0);
      opts.oDataModel.read("/DataSet", {
        filters: aFilters, urlParameters: { "sap-language": "IT" },
        success: function (oData) {
          BusyIndicator.hide();
          var a = (oData && oData.results) || [];
          if (validForce.indexOf(sForceStato) >= 0) a.forEach(function (r) { r.Stato = sForceStato; });
          done(a);
        },
        error: function () { BusyIndicator.hide(); MessageToast.show("Errore nel caricamento dei dettagli"); done([]); }
      });
    },

    buildRecords01ForCache: function (aAllRows, aCfg01, oVm) {
      var sRole = String((oVm && oVm.getProperty("/userType")) || "").trim().toUpperCase();
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var sForce = String(mock.forceStato || "").trim().toUpperCase();
      var aCols01 = (aCfg01 || []).map(function (x) { return x && x.ui; }).filter(Boolean);
      var mIsMulti = {};
      (aCfg01 || []).forEach(function (f) { if (f && f.ui && f.multiple) mIsMulti[f.ui] = true; });

      function toArray(v) { if (Array.isArray(v)) return v; var s = String(v || "").trim(); return s ? s.split(/[;|]+/).map(function (x) { return x.trim(); }).filter(Boolean) : []; }

      var m = {}, a = [];
      (aAllRows || []).forEach(function (r) {
        var sGuidKey = rowGuidKey(r), sKey = sGuidKey;
        var stRow = (validForce.indexOf(sForce) >= 0) ? sForce : StatusUtil.normStatoRow(r, oVm);
        var oRec = m[sKey];
        if (!oRec) {
          oRec = {
            idx: a.length, guidKey: sGuidKey, Fibra: rowFibra(r), Stato: stRow, __status: stRow,
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