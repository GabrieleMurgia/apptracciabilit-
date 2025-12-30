// Screen4.controller.js
sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/routing/History",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/core/BusyIndicator",
  "sap/m/MessageToast",
  "sap/ui/mdc/table/Column",
  "sap/ui/mdc/Field"
], function (
  Controller,
  History,
  JSONModel,
  Filter,
  FilterOperator,
  BusyIndicator,
  MessageToast,
  MdcColumn,
  MdcField
) {
  "use strict";

  return Controller.extend("apptracciabilita.apptracciabilita.controller.Screen4", {

    onInit: function () {
      var oRouter = this.getOwnerComponent().getRouter();
      oRouter.getRoute("Screen4").attachPatternMatched(this._onRouteMatched, this);

      var oDetail = new JSONModel({
        VendorId: "",
        Material: "",
        recordKey: "0",
        guidKey: "",
        Fibra: "",
        RowsAll: [],
        Rows: [],
        _mmct: { cat: "", s02: [] }
      });

      this.getView().setModel(oDetail);
      this.getView().setModel(oDetail, "detail");
    },

    _onRouteMatched: function (oEvent) {
      var oArgs = oEvent.getParameter("arguments") || {};
      this._sMode = oArgs.mode || "A";
      this._sVendorId = decodeURIComponent(oArgs.vendorId || "");
      this._sMaterial = decodeURIComponent(oArgs.material || "");
      this._sRecordKey = decodeURIComponent(oArgs.recordKey || "0");

      var oDetail = this.getView().getModel("detail");
      oDetail.setData({
        VendorId: this._sVendorId,
        Material: this._sMaterial,
        recordKey: this._sRecordKey,
        guidKey: "",
        Fibra: "",
        RowsAll: [],
        Rows: [],
        _mmct: { cat: "", s02: [] }
      }, true);

      this._loadSelectedRecordRows(function () {
        this._rebuildMdcColumns02();
      }.bind(this));
    },

    // =========================
    // MDC columns builder (Screen 02)
    // =========================
    _rebuildMdcColumns02: async function () {
      try {
        var oTbl = this.byId("mdcTable4");
        if (!oTbl) return;

        if (oTbl.initialized) await oTbl.initialized();

        var aOld = oTbl.getColumns ? oTbl.getColumns() : [];
        (aOld || []).slice().forEach(function (c) {
          oTbl.removeColumn(c);
          c.destroy();
        });

        var oDetail = this.getView().getModel("detail");
        var aCfg02 = oDetail.getProperty("/_mmct/s02") || [];

        (aCfg02 || []).forEach(function (f) {
          var ui = String(f.ui || "").trim();
          if (!ui) return;

          oTbl.addColumn(new MdcColumn({
            propertyKey: ui,
            header: f.label || ui,
            template: new MdcField({
              value: { path: ui },
              editMode: "Display"
            })
          }));
        });
      } catch (e) {
        console.error("Errore rebuild colonne Screen4", e);
      }
    },

    // =========================
    // MMCT
    // =========================
    _getMmctCfgForCat: function (sCat) {
      var oVm = this.getOwnerComponent().getModel("vm");
      if (!oVm || !sCat) return [];

      var mByCat = oVm.getProperty("/mmctFieldsByCat");
      if (mByCat && Array.isArray(mByCat[sCat])) return mByCat[sCat];

      var aUserInfos = oVm.getProperty("/UserInfosMMCT") || oVm.getProperty("/userInfosMMCT") || [];
      if (!Array.isArray(aUserInfos) || !aUserInfos.length) return [];

      var oCat = aUserInfos.find(function (x) {
        return String(x && x.CatMateriale) === String(sCat);
      });

      var aFields = (oCat && oCat.UserMMCTFields && oCat.UserMMCTFields.results) ? oCat.UserMMCTFields.results : [];
      return Array.isArray(aFields) ? aFields : [];
    },

    _cfgForScreen02: function (sCat) {
      var a = this._getMmctCfgForCat(sCat) || [];
      return (a || [])
        .filter(function (c) { return String(c.LivelloSchermata || "").padStart(2, "0") === "02"; })
        .map(function (c) {
          var ui = String(c.UiFieldname || c.UIFIELDNAME || "").trim();
          if (!ui) return null;
          return { ui: ui, label: (c.Descrizione || c.DESCRIZIONE || ui) };
        })
        .filter(Boolean);
    },

    // =========================
    // Data Load
    // =========================
    _reloadDataFromBackend: function (fnDone) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var sUserId = (oVm && oVm.getProperty("/userId")) || "E_ZEMAF";
      var oODataModel = this.getOwnerComponent().getModel();

      function norm(v) { return String(v || "").trim().toUpperCase(); }

      var sVendor = String(this._sVendorId || "").trim();
      if (/^\d+$/.test(sVendor) && sVendor.length < 10) sVendor = sVendor.padStart(10, "0");

      var sRouteMat = norm(this._sMaterial);

      function buildMaterialVariants(routeMat) {
        var set = {};
        function add(x) { x = norm(x); if (x) set[x] = true; }
        add(routeMat);
        if (routeMat && !routeMat.endsWith("S")) add(routeMat + "S");
        if (routeMat && routeMat.endsWith("S")) add(routeMat.slice(0, -1));
        return Object.keys(set);
      }

      var aMatVariants = buildMaterialVariants(sRouteMat);

      function done(a) { if (typeof fnDone === "function") fnDone(a || []); }

      var aFilters = [
        new Filter("UserID", FilterOperator.EQ, sUserId),
        new Filter("Fornitore", FilterOperator.EQ, sVendor)
      ];

      if (aMatVariants.length) {
        var aMatFilters = aMatVariants.map(function (m) { return new Filter("Materiale", FilterOperator.EQ, m); });
        aFilters.push(new Filter({ filters: aMatFilters, and: false }));
      }

      BusyIndicator.show(0);
      oODataModel.read("/DataSet", {
        filters: aFilters,
        urlParameters: { "sap-language": "IT" },
        success: function (oData) {
          BusyIndicator.hide();
          done((oData && oData.results) || []);
        },
        error: function (oError) {
          BusyIndicator.hide();
          console.error("Errore lettura DataSet", oError);
          MessageToast.show("Errore nel caricamento dei dettagli");
          done([]);
        }
      });
    },

    // =========================
    // Record select: cache Screen3 (se c'è) oppure ricostruisce
    // =========================
    _toStableString: function (v) {
      if (v === null || v === undefined) return "";
      if (typeof v === "string") return v;
      if (typeof v === "number" || typeof v === "boolean") return String(v);
      try { return JSON.stringify(v); } catch (e) { return String(v); }
    },

    _rowGuidKey: function (r) {
      var v = r && (r.Guid || r.GUID || r.ItmGuid || r.ItemGuid || r.GUID_ITM || r.GUID_ITM2);
      return this._toStableString(v);
    },

    _rowFibra: function (r) {
      var v = r && (r.Fibra || r.FIBRA || r.Fiber || r.FIBER);
      return this._toStableString(v);
    },

    _ensureVmCache: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      if (!oVm) return null;

      var oCache = oVm.getProperty("/cache") || {};
      if (!oCache.dataRowsByKey) oCache.dataRowsByKey = {};
      if (!oCache.recordsByKey) oCache.recordsByKey = {};
      oVm.setProperty("/cache", oCache);
      return oVm;
    },

    _getCacheKeyRaw: function () {
      return (this._sVendorId || "") + "||" + (this._sMaterial || "");
    },

    _getCacheKeySafe: function () {
      return encodeURIComponent(this._getCacheKeyRaw());
    },

    _buildRecordsForCache: function (aAllRows) {
      var m = {};
      var a = [];

      (aAllRows || []).forEach(function (r) {
        var sGuidKey = this._rowGuidKey(r);
        var sFibra = this._rowFibra(r);
        var sKey = sGuidKey + "||" + sFibra;
        if (m[sKey]) return;
        m[sKey] = true;
        a.push({ idx: a.length, guidKey: sGuidKey, Fibra: sFibra });
      }.bind(this));

      return a;
    },

    _loadSelectedRecordRows: function (fnDone) {
      var oVm = this._ensureVmCache();
      var sKey = this._getCacheKeySafe();

      var aAllRows = (oVm && oVm.getProperty("/cache/dataRowsByKey/" + sKey)) || null;
      var aRecords = (oVm && oVm.getProperty("/cache/recordsByKey/" + sKey)) || null;

      var after = function () {
        var oDetail = this.getView().getModel("detail");

        var iIdx = parseInt(this._sRecordKey, 10);
        if (isNaN(iIdx) || iIdx < 0) iIdx = 0;

        var oRec = (aRecords && aRecords[iIdx]) || (aRecords && aRecords[0]) || null;
        if (!oRec) {
          oDetail.setProperty("/RowsAll", []);
          oDetail.setProperty("/Rows", []);
          if (typeof fnDone === "function") fnDone();
          return;
        }

        var sGuidKey = this._toStableString(oRec.guidKey);
        var sFibra = this._toStableString(oRec.Fibra);

        var aSelected = (aAllRows || []).filter(function (r) {
          return this._rowGuidKey(r) === sGuidKey && this._rowFibra(r) === sFibra;
        }.bind(this));

        var r0 = aSelected[0] || {};
        var sCat = String(r0.CatMateriale || "").trim();
        var aCfg02 = sCat ? this._cfgForScreen02(sCat) : [];

        oDetail.setProperty("/guidKey", sGuidKey);
        oDetail.setProperty("/Fibra", sFibra);
        oDetail.setProperty("/_mmct", { cat: sCat, s02: aCfg02 });

        oDetail.setProperty("/RowsAll", aSelected || []);
        oDetail.setProperty("/Rows", aSelected || []);

        if (typeof fnDone === "function") fnDone();
      }.bind(this);

      if (Array.isArray(aAllRows) && aAllRows.length && Array.isArray(aRecords) && aRecords.length) {
        after();
        return;
      }

      this._reloadDataFromBackend(function (aResults) {
        aAllRows = aResults;
        aRecords = this._buildRecordsForCache(aResults);

        if (oVm) {
          oVm.setProperty("/cache/dataRowsByKey/" + sKey, aResults);
          oVm.setProperty("/cache/recordsByKey/" + sKey, aRecords);
        }

        after();
      }.bind(this));
    },

    // =========================
    // Global filter (client side)
    // =========================
    onGlobalFilter: function (oEvt) {
      var q = String(oEvt.getParameter("value") || "").trim().toUpperCase();
      var oDetail = this.getView().getModel("detail");
      var aAll = oDetail.getProperty("/RowsAll") || [];

      if (!q) {
        oDetail.setProperty("/Rows", aAll);
        return;
      }

      var aFiltered = aAll.filter(function (r) {
        return Object.keys(r || {}).some(function (k) {
          if (k === "__metadata" || k === "AllData") return false;
          var v = r[k];
          if (v === null || v === undefined) return false;
          return String(v).toUpperCase().indexOf(q) >= 0;
        });
      });

      oDetail.setProperty("/Rows", aFiltered);
    },

    onNavBack: function () {
      var oHistory = History.getInstance();
      var sPreviousHash = oHistory.getPreviousHash();

      if (sPreviousHash !== undefined) window.history.go(-1);
      else {
        this.getOwnerComponent().getRouter().navTo("Screen3", {
          vendorId: encodeURIComponent(this._sVendorId),
          material: encodeURIComponent(this._sMaterial),
          mode: this._sMode || "A"
        }, true);
      }
    }
  });
});
