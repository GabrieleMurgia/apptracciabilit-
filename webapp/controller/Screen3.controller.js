// Screen3.controller.js
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

  return Controller.extend("apptracciabilita.apptracciabilita.controller.Screen3", {

    onInit: function () {
      var oRouter = this.getOwnerComponent().getRouter();
      oRouter.getRoute("Screen3").attachPatternMatched(this._onRouteMatched, this);

      // detail model
      var oDetail = new JSONModel({
        VendorId: "",
        Material: "",
        RecordsAll: [],
        Records: [],
        RecordsCount: 0,
        _mmct: { cat: "", s01: [], s02: [] }
      });

      this.getView().setModel(oDetail);
      this.getView().setModel(oDetail, "detail");

      // vm model (serve per la config del delegate: /mdcCfg/screen3)
      var oVm = this.getOwnerComponent().getModel("vm");
      if (!oVm) {
        oVm = new JSONModel({ cache: {}, mdcCfg: {} });
        this.getOwnerComponent().setModel(oVm, "vm");
      }
      this.getView().setModel(oVm, "vm");

      this._bSelAttached = false;
      this._sMode = "A";
      this._sVendorId = "";
      this._sMaterial = "";
    },

    _onRouteMatched: function (oEvent) {
      var oArgs = oEvent.getParameter("arguments") || {};
      this._sMode = oArgs.mode || "A";
      this._sVendorId = decodeURIComponent(oArgs.vendorId || "");
      this._sMaterial = decodeURIComponent(oArgs.material || "");

      var oDetail = this.getView().getModel("detail");
      oDetail.setData({
        VendorId: this._sVendorId,
        Material: this._sMaterial,
        RecordsAll: [],
        Records: [],
        RecordsCount: 0,
        _mmct: { cat: "", s01: [], s02: [] }
      }, true);

      this._loadDataOnce();
    },

    // =========================
    // MDC TABLE HELPERS
    // =========================
    _getMdcTable: function () {
      return this.byId("mdcTable3");
    },

    _getMdcColumnCompat: function () {
      var oMeta = MdcColumn && MdcColumn.getMetadata && MdcColumn.getMetadata();
      var bHasPropertyKey = !!(oMeta && oMeta.getProperty && oMeta.getProperty("propertyKey"));
      var bHasDataProperty = !!(oMeta && oMeta.getProperty && oMeta.getProperty("dataProperty"));
      return { bHasPropertyKey: bHasPropertyKey, bHasDataProperty: bHasDataProperty };
    },

    _attachSelectionOnce: async function () {
      if (this._bSelAttached) return;
      var oTbl = this._getMdcTable();
      if (!oTbl || typeof oTbl.attachSelectionChange !== "function") return;

      if (oTbl.initialized) await oTbl.initialized();

      this._bSelAttached = true;
      oTbl.attachSelectionChange(this.onSelectionChange3, this);
    },

    _rebuildColumns: async function (aColumns, sEditMode) {
      var oTbl = this._getMdcTable();
      if (!oTbl) return;

      if (oTbl.initialized) await oTbl.initialized();

      var aOld = oTbl.getColumns ? (oTbl.getColumns() || []) : [];
      (aOld || []).slice().forEach(function (c) {
        oTbl.removeColumn(c);
        c.destroy();
      });

      var compat = this._getMdcColumnCompat();
      var that = this;

      (aColumns || []).forEach(function (c) {
        var key = String(c.key || "").trim();
        if (!key) return;

        var label = c.label || key;
        var path = c.path || key;

        var mSettings = {
          header: label,
          template: new MdcField({
            value: "{detail>" + path + "}",
            editMode: sEditMode || "Display"
          })
        };

        if (compat.bHasPropertyKey) mSettings.propertyKey = key;
        else if (compat.bHasDataProperty) mSettings.dataProperty = key;

        oTbl.addColumn(new MdcColumn(mSettings));
      });

      // selection handler
      await that._attachSelectionOnce();
    },

    _setDelegateCfgAndRebind: async function (cfg) {
      var oTbl = this._getMdcTable();
      if (!oTbl) return;

      if (oTbl.initialized) await oTbl.initialized();

      var oVm = this.getView().getModel("vm");
      if (!oVm) return;

      // scrivo SOLO la config, il delegate la legge da model (no setDelegate runtime)
      oVm.setProperty("/mdcCfg/screen3", {
        modelName: cfg.modelName || "detail",
        collectionPath: cfg.collectionPath || "/Records",
        properties: cfg.properties || [],
        bindingPaths: cfg.bindingPaths || {},
        editMode: cfg.editMode || "Display"
      });

      // dati: devono stare sul model target al path indicato
      var oDetail = this.getView().getModel("detail");
      if (oDetail) {
        oDetail.setProperty(cfg.collectionPath || "/Records", cfg.rows || []);
        oDetail.refresh(true);
      }

      if (typeof oTbl.rebind === "function") oTbl.rebind();
      else if (typeof oTbl.rebindTable === "function") oTbl.rebindTable();
    },

    // =========================
    // CACHE
    // =========================
    _getCacheKeyRaw: function () {
      return (this._sVendorId || "") + "||" + (this._sMaterial || "");
    },

    _getCacheKeySafe: function () {
      return encodeURIComponent(this._getCacheKeyRaw());
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

    _loadDataOnce: function () {
      var oVm = this._ensureVmCache();
      var sKey = this._getCacheKeySafe();

      var aRows = (oVm && oVm.getProperty("/cache/dataRowsByKey/" + sKey)) || null;
      var aRecs = (oVm && oVm.getProperty("/cache/recordsByKey/" + sKey)) || null;

      if (Array.isArray(aRows) && aRows.length && Array.isArray(aRecs) && aRecs.length) {
        this._hydrateMmctFromRows(aRows);
        this._bindRecords(aRecs);
        return;
      }

      this._reloadDataFromBackend(function (aResults) {
        this._hydrateMmctFromRows(aResults);

        var aRecordsBuilt = this._buildRecords01(aResults);

        if (oVm) {
          oVm.setProperty("/cache/dataRowsByKey/" + sKey, aResults);
          oVm.setProperty("/cache/recordsByKey/" + sKey, aRecordsBuilt);
        }

        this._bindRecords(aRecordsBuilt);
      }.bind(this));
    },

    // =========================
    // MMCT (CatMateriale -> Screen01/02)
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

    _cfgForScreen: function (sCat, sScreen) {
      var a = this._getMmctCfgForCat(sCat) || [];
      var sTarget = String(sScreen || "").padStart(2, "0");

      return (a || [])
        .filter(function (c) { return String(c.LivelloSchermata || "").padStart(2, "0") === sTarget; })
        .map(function (c) {
          var ui = String(c.UiFieldname || c.UIFIELDNAME || "").trim();
          if (!ui) return null;
          return { ui: ui, label: (c.Descrizione || c.DESCRIZIONE || ui) };
        })
        .filter(Boolean);
    },

    _hydrateMmctFromRows: function (aRows) {
      var r0 = (Array.isArray(aRows) && aRows.length) ? (aRows[0] || {}) : {};
      var sCat = String(r0.CatMateriale || "").trim();

      var oDetail = this.getView().getModel("detail");
      var a01 = sCat ? this._cfgForScreen(sCat, "01") : [];
      var a02 = sCat ? this._cfgForScreen(sCat, "02") : [];
      oDetail.setProperty("/_mmct", { cat: sCat, s01: a01, s02: a02 });
    },

    // =========================
    // DATA LOAD
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
          MessageToast.show("Errore nel caricamento dei dati");
          done([]);
        }
      });
    },

    // =========================
    // BUILD RECORDS (Screen01)
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

    _buildRecords01: function (aAllRows) {
      var oDetail = this.getView().getModel("detail");
      var aCfg01 = oDetail.getProperty("/_mmct/s01") || [];

      var aCols01 = aCfg01
        .map(function (x) { return x.ui; })
        .filter(Boolean)
        .filter(function (c) { return c !== "idx" && c !== "guidKey" && c !== "Fibra"; });

      var m = {};
      var a = [];

      (aAllRows || []).forEach(function (r) {
        var sGuidKey = this._rowGuidKey(r);
        var sFibra = this._rowFibra(r);
        var sKey = sGuidKey + "||" + sFibra;
        if (m[sKey]) return;
        m[sKey] = true;

        var rec = { idx: a.length, guidKey: sGuidKey, Fibra: sFibra };

        aCols01.forEach(function (c) {
          rec[c] = (r && r[c] !== undefined) ? r[c] : "";
        });

        a.push(rec);
      }.bind(this));

      return a;
    },

    _buildColumns01ForTable: function (aRecords) {
      var oDetail = this.getView().getModel("detail");
      var aCfg01 = oDetail.getProperty("/_mmct/s01") || [];

      var aCols = (aCfg01 || []).map(function (f) {
        var ui = String(f.ui || "").trim();
        if (!ui) return null;
        if (ui === "idx" || ui === "guidKey" || ui === "Fibra") return null;
        return { key: ui, label: f.label || ui, path: ui, dataType: "String" };
      }).filter(Boolean);

      if (!aCols.length && Array.isArray(aRecords) && aRecords.length) {
        var r0 = aRecords[0] || {};
        aCols = Object.keys(r0).filter(function (k) {
          return k !== "idx" && k !== "guidKey" && k !== "Fibra";
        }).map(function (k) {
          return { key: k, label: k, path: k, dataType: "String" };
        });
      }

      return aCols;
    },

    _bindRecords: async function (aRecords) {
      var oDetail = this.getView().getModel("detail");
      var a = aRecords || [];

      oDetail.setProperty("/RecordsAll", a);
      oDetail.setProperty("/Records", a);
      oDetail.setProperty("/RecordsCount", a.length);

      var aCols = this._buildColumns01ForTable(a);

      // 1) colonne visibili
      await this._rebuildColumns(aCols, "Display");

      // 2) config delegate + rebind (NESSUN setDelegate runtime)
      var mBindingPaths = {};
      aCols.forEach(function (c) { mBindingPaths[c.key] = c.path || c.key; });

      await this._setDelegateCfgAndRebind({
        modelName: "detail",
        collectionPath: "/Records",
        rows: a,
        properties: aCols.map(function (c) {
          return { name: c.key, label: c.label || c.key, dataType: c.dataType || "String" };
        }),
        bindingPaths: mBindingPaths,
        editMode: "Display"
      });
    },

    // =========================
    // SELECTION -> Screen4
    // =========================
    onSelectionChange3: function (oEvent) {
      var aCtx = oEvent.getParameter("selectedContexts") || [];
      if (!aCtx.length) return;

      var oRow = aCtx[0].getObject();
      var iIdx = (oRow && oRow.idx != null) ? oRow.idx : 0;

      this.getOwnerComponent().getRouter().navTo("Screen4", {
        vendorId: encodeURIComponent(this._sVendorId),
        material: encodeURIComponent(this._sMaterial),
        recordKey: encodeURIComponent(String(iIdx)),
        mode: this._sMode || "A"
      });
    },

    // =========================
    // GLOBAL FILTER (client side)
    // =========================
    onGlobalFilter: async function (oEvt) {
      var q = String(oEvt.getParameter("value") || "").trim().toUpperCase();
      var oDetail = this.getView().getModel("detail");
      var aAll = oDetail.getProperty("/RecordsAll") || [];

      var aFiltered;
      if (!q) aFiltered = aAll;
      else {
        aFiltered = aAll.filter(function (r) {
          return Object.keys(r || {}).some(function (k) {
            if (k === "idx" || k === "guidKey" || k === "Fibra") return false;
            var v = r[k];
            if (v === null || v === undefined) return false;
            return String(v).toUpperCase().indexOf(q) >= 0;
          });
        });
      }

      oDetail.setProperty("/Records", aFiltered);
      oDetail.setProperty("/RecordsCount", aFiltered.length);

      var oTbl = this._getMdcTable();
      if (oTbl) {
        if (typeof oTbl.rebind === "function") oTbl.rebind();
        else if (typeof oTbl.rebindTable === "function") oTbl.rebindTable();
      }
    },

    // =========================
    // NAV
    // =========================
    onNavBack: function () {
      var oHistory = History.getInstance();
      var sPreviousHash = oHistory.getPreviousHash();

      if (sPreviousHash !== undefined) window.history.go(-1);
      else {
        this.getOwnerComponent().getRouter().navTo("Screen2", {
          vendorId: encodeURIComponent(this._sVendorId),
          mode: this._sMode || "A"
        }, true);
      }
    }

  });
});
