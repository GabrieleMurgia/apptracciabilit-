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
  "sap/ui/mdc/Field",
  "sap/ui/mdc/p13n/StateUtil"
], function (
  Controller,
  History,
  JSONModel,
  Filter,
  FilterOperator,
  BusyIndicator,
  MessageToast,
  MdcColumn,
  MdcField,
  StateUtil
) {
  "use strict";

  function ts() { return new Date().toISOString(); }

  return Controller.extend("apptracciabilita.apptracciabilita.controller.Screen4", {

    onInit: function () {
      this._log("onInit");

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
        RowsCount: 0,
        _mmct: { cat: "", s02: [] }
      });

      this.getView().setModel(oDetail, "detail");
    },

    // =========================
    // LOG
    // =========================
    _log: function () {
      var a = Array.prototype.slice.call(arguments);
      a.unshift("[S4] " + ts());
      console.log.apply(console, a);
    },

    _logTable: function (label) {
      var oTbl = this.byId("mdcTable4");
      if (!oTbl) return this._log(label, "NO TABLE");

      var aCols = (oTbl.getColumns && oTbl.getColumns()) || [];
      var vis = aCols.filter(function (c) { return c.getVisible && c.getVisible(); }).length;

      var oRB = oTbl.getRowBinding && oTbl.getRowBinding();
      var oIB = oTbl.getItemBinding && oTbl.getItemBinding();

      this._log(label, {
        id: oTbl.getId && oTbl.getId(),
        colsCount: aCols.length,
        visibleCols: vis,
        delegate: oTbl.getDelegate && oTbl.getDelegate(),
        hasRowBinding: !!oRB,
        hasItemBinding: !!oIB
      });
    },

    // =========================
    // ✅ FIX: visible rows = rows length (cap 10)
    // =========================
    _setTableRowsToData: async function (sTableId, iLen) {
      try {
        var oMdc = this.byId(sTableId);
        if (!oMdc) return;

        if (oMdc.initialized) await oMdc.initialized();

        var oInner = (oMdc.getInnerTable && oMdc.getInnerTable()) || oMdc._oTable;
        if (!oInner) return;

        var n = Math.max(1, Math.min(10, parseInt(iLen, 10) || 0)); // cap=10

        var oRowMode = oInner.getRowMode && oInner.getRowMode();
        if (oRowMode && oRowMode.setMinRowCount && oRowMode.setMaxRowCount) {
          oRowMode.setMinRowCount(n);
          oRowMode.setMaxRowCount(n);
        } else if (oInner.setVisibleRowCount) {
          oInner.setVisibleRowCountMode && oInner.setVisibleRowCountMode("Fixed");
          oInner.setVisibleRowCount(n);
        }
      } catch (e) {
        console.error("_setTableRowsToData error", e);
      }
    },

    // =========================
    // Route
    // =========================
    _onRouteMatched: function (oEvent) {
      var oArgs = oEvent.getParameter("arguments") || {};
      this._sMode = oArgs.mode || "A";
      this._sVendorId = decodeURIComponent(oArgs.vendorId || "");
      this._sMaterial = decodeURIComponent(oArgs.material || "");
      this._sRecordKey = decodeURIComponent(oArgs.recordKey || "0");

      this._log("_onRouteMatched args", oArgs);

      var oDetail = this.getView().getModel("detail");
      oDetail.setData({
        VendorId: this._sVendorId,
        Material: this._sMaterial,
        recordKey: this._sRecordKey,
        guidKey: "",
        Fibra: "",
        RowsAll: [],
        Rows: [],
        RowsCount: 0,
        _mmct: { cat: "", s02: [] }
      }, true);

      this._logTable("TABLE STATE @ before _loadSelectedRecordRows");

      this._loadSelectedRecordRows(function () {
        this._bindRowsAndColumns();
      }.bind(this));
    },

    // =========================
    // CACHE VM
    // =========================
    _ensureVmCache: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      if (!oVm) oVm = new JSONModel({});

      if (!oVm.getProperty("/cache")) oVm.setProperty("/cache", {});
      if (!oVm.getProperty("/cache/dataRowsByKey")) oVm.setProperty("/cache/dataRowsByKey", {});
      if (!oVm.getProperty("/cache/recordsByKey")) oVm.setProperty("/cache/recordsByKey", {});
      if (!oVm.getProperty("/mdcCfg")) oVm.setProperty("/mdcCfg", {});

      this.getOwnerComponent().setModel(oVm, "vm");
      return oVm;
    },

    _getCacheKeySafe: function () {
      return encodeURIComponent((this._sVendorId || "") + "||" + (this._sMaterial || ""));
    },

    // =========================
    // MMCT
    // =========================
    _getMmctCfgForCat: function (sCat) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var aUserInfos = (oVm && (oVm.getProperty("/UserInfosMMCT") || oVm.getProperty("/userInfosMMCT"))) || [];
      if (!Array.isArray(aUserInfos)) return [];

      var oCat = aUserInfos.find(function (x) { return String(x && x.CatMateriale) === String(sCat); });
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
    // ODATA READ (solo se cache non c'è)
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
    // Record select (come Screen3)
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

      var aAllRows = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || null;
      var aRecords = oVm.getProperty("/cache/recordsByKey/" + sKey) || null;

      var after = function () {
        var oDetail = this.getView().getModel("detail");

        var iIdx = parseInt(this._sRecordKey, 10);
        if (isNaN(iIdx) || iIdx < 0) iIdx = 0;

        var oRec = (aRecords && aRecords[iIdx]) || (aRecords && aRecords[0]) || null;
        if (!oRec) {
          oDetail.setProperty("/RowsAll", []);
          oDetail.setProperty("/Rows", []);
          oDetail.setProperty("/RowsCount", 0);
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
        oDetail.setProperty("/RowsCount", (aSelected || []).length);

        this._log("_loadSelectedRecordRows", {
          cacheKey: sKey,
          recIdx: iIdx,
          guidKey: sGuidKey,
          fibra: sFibra,
          rows: (aSelected || []).length,
          s02Cols: aCfg02.length
        });

        if (typeof fnDone === "function") fnDone();
      }.bind(this);

      if (Array.isArray(aAllRows) && aAllRows.length && Array.isArray(aRecords) && aRecords.length) {
        after();
        return;
      }

      this._reloadDataFromBackend(function (aResults) {
        aAllRows = aResults;
        aRecords = this._buildRecordsForCache(aResults);

        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aResults);
        oVm.setProperty("/cache/recordsByKey/" + sKey, aRecords);

        after();
      }.bind(this));
    },

    // =========================
    // MDC cfg + columns + bind
    // =========================
    _ensureMdcCfgScreen4: function (aCfg02) {
      var oVm = this._ensureVmCache();

      var aProps = (aCfg02 || []).map(function (f) {
        return { name: f.ui, label: f.label || f.ui, dataType: "String" };
      });

      oVm.setProperty("/mdcCfg/screen4", {
        modelName: "detail",
        collectionPath: "/Rows",
        properties: aProps
      });

      this._log("vm>/mdcCfg/screen4 set", { props: aProps.length });
    },

    _rebuildColumnsHard: async function (oTbl, aCfg02) {
      if (!oTbl) return;
      if (oTbl.initialized) await oTbl.initialized();

      var aOld = (oTbl.getColumns && oTbl.getColumns()) || [];
      aOld.slice().forEach(function (c) {
        oTbl.removeColumn(c);
        c.destroy();
      });

      (aCfg02 || []).forEach(function (f) {
        var sKey = String(f.ui || "").trim();
        if (!sKey) return;

        oTbl.addColumn(new MdcColumn({
          header: f.label || sKey,
          visible: true,
          dataProperty: sKey,
          template: new MdcField({
            value: "{detail>" + sKey + "}",
            editMode: "Display"
          })
        }));
      });

      this._log("HARD rebuild columns done", (oTbl.getColumns && oTbl.getColumns().length) || 0);
    },

    _forceP13nAllVisible: async function (oTbl, reason) {
      if (!oTbl || !StateUtil) return;
      try {
        var st = await StateUtil.retrieveExternalState(oTbl);
        var patched = JSON.parse(JSON.stringify(st || {}));

        var arr =
          patched.items ||
          patched.columns ||
          patched.Columns ||
          (patched.table && patched.table.items) ||
          null;

        if (Array.isArray(arr) && arr.length) {
          arr.forEach(function (it) {
            if (!it) return;
            if (it.visible === false) it.visible = true;
            if (it.visible == null) it.visible = true;
          });

          await StateUtil.applyExternalState(oTbl, patched);
          this._log("P13N applyExternalState FORCED visible @ " + reason);
          if (typeof oTbl.rebind === "function") oTbl.rebind();
        }
      } catch (e) {
        this._log("P13N force visible FAILED @ " + reason, e && e.message);
      }
    },

    _bindRowsAndColumns: async function () {
      var oDetail = this.getView().getModel("detail");
      var oTbl = this.byId("mdcTable4");
      if (!oTbl) return;

      var aCfg02 = oDetail.getProperty("/_mmct/s02") || [];
      this._ensureMdcCfgScreen4(aCfg02);

      await this._rebuildColumnsHard(oTbl, aCfg02);

      if (oTbl.initialized) await oTbl.initialized();
      oTbl.setModel(oDetail, "detail");

      if (typeof oTbl.bindRows === "function") oTbl.bindRows({ path: "detail>/Rows" });
      if (typeof oTbl.rebind === "function") oTbl.rebind();

      await this._forceP13nAllVisible(oTbl, "t0");
      setTimeout(function () { this._forceP13nAllVisible(oTbl, "t300"); this._logTable("TABLE STATE @ t300"); }.bind(this), 300);
      setTimeout(function () { this._forceP13nAllVisible(oTbl, "t900"); this._logTable("TABLE STATE @ t900"); }.bind(this), 900);

      this._logTable("TABLE STATE @ after bindRowsAndColumns");

      // ✅ FIX: adatta righe ai dati
      await this._setTableRowsToData("mdcTable4", (oDetail.getProperty("/Rows") || []).length);
    },

    // =========================
    // Global filter
    // =========================
    onGlobalFilter: function (oEvt) {
      var q = String(oEvt.getParameter("value") || "").trim().toUpperCase();
      var oDetail = this.getView().getModel("detail");
      var aAll = oDetail.getProperty("/RowsAll") || [];

      if (!q) {
        oDetail.setProperty("/Rows", aAll);
        oDetail.setProperty("/RowsCount", (aAll || []).length);
        this._setTableRowsToData("mdcTable4", (aAll || []).length);
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
      oDetail.setProperty("/RowsCount", (aFiltered || []).length);
      this._setTableRowsToData("mdcTable4", (aFiltered || []).length);
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
