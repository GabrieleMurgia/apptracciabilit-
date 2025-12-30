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

  return Controller.extend("apptracciabilita.apptracciabilita.controller.Screen3", {
    onInit: function () {
      this._log("onInit");

      var oRouter = this.getOwnerComponent().getRouter();
      oRouter.getRoute("Screen3").attachPatternMatched(this._onRouteMatched, this);

      var oDetail = new JSONModel({
        VendorId: "",
        Material: "",
        RecordsAll: [],
        Records: [],
        RecordsCount: 0,
        _mmct: { cat: "", s01: [], s02: [] }
      });

      this.getView().setModel(oDetail, "detail");

      setTimeout(function () {
        this._logTable("TABLE STATE @ after onInit (timeout 0)");
      }.bind(this), 0);
    },

    // =========================
    // LOG
    // =========================
    _log: function () {
      var a = Array.prototype.slice.call(arguments);
      a.unshift("[S3] " + ts());
      console.log.apply(console, a);
    },

    _logTable: function (label) {
      var oTbl = this.byId("mdcTable3");
      if (!oTbl) return this._log(label, "NO TABLE");

      var aCols = (oTbl.getColumns && oTbl.getColumns()) || [];
      var vis = aCols.filter(function (c) { return c.getVisible && c.getVisible(); }).length;

      this._log(label, {
        id: oTbl.getId && oTbl.getId(),
        colsCount: aCols.length,
        visibleCols: vis,
        delegate: oTbl.getDelegate && oTbl.getDelegate()
      });

      var oRB = oTbl.getRowBinding && oTbl.getRowBinding();
      var oIB = oTbl.getItemBinding && oTbl.getItemBinding();
      this._log("TABLE BINDINGS @ " + label, { rowBinding: !!oRB, itemBinding: !!oIB });
    },

    // =========================
    // ✅ FIX: visible rows = records length (cap 10)
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

      this._log("_onRouteMatched args", oArgs);

      var oDetail = this.getView().getModel("detail");
      oDetail.setData({
        VendorId: this._sVendorId,
        Material: this._sMaterial,
        RecordsAll: [],
        Records: [],
        RecordsCount: 0,
        _mmct: { cat: "", s01: [], s02: [] }
      }, true);

      this._logTable("TABLE STATE @ before _loadDataOnce");
      this._loadDataOnce();
    },

    // =========================
    // CACHE
    // =========================
    _getCacheKeySafe: function () {
      return encodeURIComponent((this._sVendorId || "") + "||" + (this._sMaterial || ""));
    },

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

    _loadDataOnce: function () {
      var oVm = this._ensureVmCache();
      var sKey = this._getCacheKeySafe();

      var aRows = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || null;
      var aRecs = oVm.getProperty("/cache/recordsByKey/" + sKey) || null;

      this._log("_loadDataOnce cacheKey", sKey, {
        cachedRows: aRows ? aRows.length : null,
        cachedRecs: aRecs ? aRecs.length : null
      });

      if (Array.isArray(aRows) && aRows.length && Array.isArray(aRecs) && aRecs.length) {
        this._hydrateMmctFromRows(aRows);
        this._bindRecords(aRecs);
        return;
      }

      this._reloadDataFromBackend(function (aResults) {
        this._log("_reloadDataFromBackend returned", aResults.length);

        this._hydrateMmctFromRows(aResults);

        var aRecordsBuilt = this._buildRecords01(aResults);

        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aResults);
        oVm.setProperty("/cache/recordsByKey/" + sKey, aRecordsBuilt);

        this._bindRecords(aRecordsBuilt);
      }.bind(this));
    },

    // =========================
    // MMCT -> colonne
    // =========================
    _getMmctCfgForCat: function (sCat) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var aUserInfos = (oVm && (oVm.getProperty("/UserInfosMMCT") || oVm.getProperty("/userInfosMMCT"))) || [];
      if (!Array.isArray(aUserInfos)) return [];
      var oCat = aUserInfos.find(function (x) { return String(x && x.CatMateriale) === String(sCat); });
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

      this._log("_hydrateMmctFromRows", { cat: sCat, s01Count: a01.length, s02Count: a02.length });
    },

    // =========================
    // ODATA
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

      this._log("_reloadDataFromBackend READ /DataSet", {
        userId: sUserId,
        vendor: sVendor,
        materialVariants: aMatVariants
      });

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
    // RECORDS
    // =========================
    _toStableString: function (v) {
      if (v === null || v === undefined) return "";
      if (typeof v === "string") return v;
      try { return JSON.stringify(v); } catch (e) { return String(v); }
    },

    _rowGuidKey: function (r) {
      var v = r && (r.Guid || r.GUID);
      return this._toStableString(v);
    },

    _rowFibra: function (r) {
      var v = r && (r.Fibra || r.FIBRA);
      return this._toStableString(v);
    },

    _buildRecords01: function (aAllRows) {
      var oDetail = this.getView().getModel("detail");
      var aCfg01 = oDetail.getProperty("/_mmct/s01") || [];
      var aCols01 = aCfg01.map(function (x) { return x.ui; }).filter(Boolean);

      this._log("_buildRecords01 using columns", aCols01.length, aCols01);

      var m = {};
      var a = [];

      (aAllRows || []).forEach(function (r) {
        var sGuidKey = this._rowGuidKey(r);
        var sFibra = this._rowFibra(r);
        var sKey = sGuidKey + "||" + sFibra;
        if (m[sKey]) return;
        m[sKey] = true;

        var rec = { idx: a.length, guidKey: sGuidKey, Fibra: sFibra };
        aCols01.forEach(function (c) { rec[c] = (r && r[c] !== undefined) ? r[c] : ""; });
        a.push(rec);
      }.bind(this));

      this._log("_buildRecords01 built", a.length, "sample", a[0]);
      return a;
    },

    // =========================
    // NAV BUTTON (prima colonna)
    // =========================
    onGoToScreen4FromRow: function (oEvent) {
      try {
        var oBtn = oEvent.getSource();
        var oCtx = oBtn && oBtn.getBindingContext && (
          oBtn.getBindingContext("detail") || oBtn.getBindingContext()
        );

        if (!oCtx) {
          this._log("onGoToScreen4FromRow NO CONTEXT");
          return;
        }

        var oRow = oCtx.getObject && oCtx.getObject();
        var iIdx = (oRow && oRow.idx != null) ? parseInt(oRow.idx, 10) : NaN;

        // fallback: path "/Records/0"
        if (isNaN(iIdx) && oCtx.getPath) {
          var sPath = String(oCtx.getPath() || "");
          var m = sPath.match(/\/(\d+)\s*$/);
          if (m) iIdx = parseInt(m[1], 10);
        }

        if (isNaN(iIdx) || iIdx < 0) iIdx = 0;

        this._log("BTN NAV -> Screen4", {
          vendorId: this._sVendorId,
          material: this._sMaterial,
          recordKey: String(iIdx),
          mode: this._sMode
        });

        this.getOwnerComponent().getRouter().navTo("Screen4", {
          vendorId: encodeURIComponent(this._sVendorId),
          material: encodeURIComponent(this._sMaterial),
          recordKey: encodeURIComponent(String(iIdx)),
          mode: this._sMode || "A"
        });
      } catch (e) {
        console.error("onGoToScreen4FromRow ERROR", e);
      }
    },

    // ====== FIX: forza p13n a rendere visibili le colonne ======
    _forceP13nAllVisible: async function (oTbl, reason) {
      if (!oTbl || !StateUtil) return;

      try {
        var st = await StateUtil.retrieveExternalState(oTbl);
        this._log("P13N state @ " + reason, st);

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

    _ensureMdcCfgScreen3: function (aCfg01) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var aProps = (aCfg01 || []).map(function (f) {
        return { name: f.ui, label: f.label || f.ui, dataType: "String" };
      });

      oVm.setProperty("/mdcCfg/screen3", {
        modelName: "detail",
        collectionPath: "/Records",
        properties: aProps
      });

      this._log("vm>/mdcCfg/screen3 set", { props: aProps.length });
    },

    _rebuildColumnsHard: async function (oTbl, aCfg01) {
      if (!oTbl) return;
      if (oTbl.initialized) await oTbl.initialized();

      // pulizia
      var aOld = (oTbl.getColumns && oTbl.getColumns()) || [];
      aOld.slice().forEach(function (c) {
        oTbl.removeColumn(c);
        c.destroy();
      });

      // =========================
      // 1) COLONNA UI-ONLY (prima colonna) con Button -> Screen4
      // =========================
      var Button = sap.ui.require("sap/m/Button") || (sap.m && sap.m.Button);
      var sNavColId = oTbl.getId() + "--col-NAV";

      oTbl.addColumn(new MdcColumn({
        id: sNavColId,
        header: "",
        visible: true,
        template: new Button({
          icon: "sap-icon://navigation-right-arrow",
          type: "Transparent",
          tooltip: "Apri dettagli",
          press: this.onGoToScreen4FromRow.bind(this)
        })
      }));

      // tenta di escluderla dalla personalizzazione/variant (in base alla versione)
      var oNavCol = (oTbl.getColumns && oTbl.getColumns()[0]) || null;
      if (oNavCol && oNavCol.setProperty && oNavCol.getMetadata) {
        var oMeta = oNavCol.getMetadata();
        if (oMeta.getProperty && oMeta.getProperty("p13nData")) {
          oNavCol.setProperty("p13nData", { visible: false }, true);
        }
        if (oMeta.getProperty && oMeta.getProperty("personalization")) {
          oNavCol.setProperty("personalization", [], true);
        }
      }

      // =========================
      // 2) COLONNE DINAMICHE (MMCT)
      // =========================
      (aCfg01 || []).forEach(function (f) {
        var sKey = String(f.ui || "").trim();
        if (!sKey) return;

        var sStableId = oTbl.getId() + "--col-" + sKey;

        oTbl.addColumn(new MdcColumn({
          id: sStableId,
          header: f.label || sKey,
          visible: true,
          dataProperty: sKey,
          template: new MdcField({
            value: "{detail>" + sKey + "}",
            editMode: "Display"
          })
        }));
      }.bind(this));

      this._log("HARD rebuild columns done", (oTbl.getColumns && oTbl.getColumns().length) || 0);
    },

    _bindRecords: async function (aRecords) {
      var oDetail = this.getView().getModel("detail");
      var a = aRecords || [];

      oDetail.setProperty("/RecordsAll", a);
      oDetail.setProperty("/Records", a);
      oDetail.setProperty("/RecordsCount", a.length);

      var oTbl = this.byId("mdcTable3");

      this._logTable("TABLE STATE @ before HARD bind");

      var aCfg01 = oDetail.getProperty("/_mmct/s01") || [];
      this._ensureMdcCfgScreen3(aCfg01);

      await this._rebuildColumnsHard(oTbl, aCfg01);

      if (oTbl && oTbl.initialized) await oTbl.initialized();
      if (oTbl) oTbl.setModel(oDetail, "detail");

      if (oTbl && typeof oTbl.bindRows === "function") oTbl.bindRows({ path: "detail>/Records" });
      if (oTbl && typeof oTbl.rebind === "function") oTbl.rebind();

      await this._forceP13nAllVisible(oTbl, "t0");
      setTimeout(function () { this._forceP13nAllVisible(oTbl, "t300"); this._logTable("TABLE STATE @ t300"); }.bind(this), 300);
      setTimeout(function () { this._forceP13nAllVisible(oTbl, "t900"); this._logTable("TABLE STATE @ t900"); }.bind(this), 900);

      this._logTable("TABLE STATE @ after HARD bind");

      // ✅ FIX: adatta il numero righe ai dati
      await this._setTableRowsToData("mdcTable3", a.length);
    },

    onGlobalFilter: function (oEvt) {
      var q = String(oEvt.getParameter("value") || "").trim().toUpperCase();
      var oDetail = this.getView().getModel("detail");
      var aAll = oDetail.getProperty("/RecordsAll") || [];

      if (!q) {
        oDetail.setProperty("/Records", aAll);
        oDetail.setProperty("/RecordsCount", (aAll || []).length);
        this._setTableRowsToData("mdcTable3", (aAll || []).length);
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

      oDetail.setProperty("/Records", aFiltered);
      oDetail.setProperty("/RecordsCount", (aFiltered || []).length);
      this._setTableRowsToData("mdcTable3", (aFiltered || []).length);
    },

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
