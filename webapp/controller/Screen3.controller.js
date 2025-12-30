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
  function deepClone(x) { try { return JSON.parse(JSON.stringify(x)); } catch (e) { return x; } }

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

      // UI state (edit)
      if (!this.getView().getModel("ui")) {
        this.getView().setModel(new JSONModel({ edit: false }), "ui");
      }

      this._editSnapshot = null;

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
    // Helpers table inner + selection
    // =========================
    _getInnerTable: async function (sMdcId) {
      var oMdc = this.byId(sMdcId);
      if (!oMdc) return null;
      if (oMdc.initialized) await oMdc.initialized();
      return (oMdc.getInnerTable && oMdc.getInnerTable()) || oMdc._oTable || null;
    },

    _getInnerBindingLength: function (oInner) {
      if (!oInner) return 0;
      var b = (oInner.getBinding && (oInner.getBinding("rows") || oInner.getBinding("items"))) || null;
      if (b && typeof b.getLength === "function") return b.getLength();
      if (b && typeof b.getCurrentContexts === "function") return (b.getCurrentContexts() || []).length;
      return 0;
    },

    _toggleSelectAllInner: function (oInner) {
      if (!oInner) return;

      // sap.ui.table.Table
      if (typeof oInner.setSelectionInterval === "function") {
        var len = this._getInnerBindingLength(oInner);
        if (len <= 0) return;

        var sel = (typeof oInner.getSelectedIndices === "function") ? (oInner.getSelectedIndices() || []) : [];
        var allSelected = sel.length >= len;

        if (allSelected && typeof oInner.clearSelection === "function") {
          oInner.clearSelection();
        } else {
          oInner.setSelectionInterval(0, len - 1);
        }
        return;
      }

      // sap.m.Table / ResponsiveTable
      if (typeof oInner.selectAll === "function" && typeof oInner.removeSelections === "function") {
        var items = (oInner.getItems && oInner.getItems()) || [];
        var selectedItems = (oInner.getSelectedItems && oInner.getSelectedItems()) || [];
        var allSelected2 = selectedItems.length >= items.length && items.length > 0;

        if (allSelected2) oInner.removeSelections(true);
        else oInner.selectAll();
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

      // reset edit
      this.getView().getModel("ui").setProperty("/edit", false);
      this._editSnapshot = null;

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
        if (this.getView().getModel("ui").getProperty("/edit")) {
          MessageToast.show("Esci da Modifica e salva prima di navigare");
          return;
        }

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

    // =========================
    // P13N force visible
    // =========================
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

      var aOld = (oTbl.getColumns && oTbl.getColumns()) || [];
      aOld.slice().forEach(function (c) {
        oTbl.removeColumn(c);
        c.destroy();
      });

      // 1) NAV colonna
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
          enabled: "{= !${ui>/edit} }",
          press: this.onGoToScreen4FromRow.bind(this)
        })
      }));

      // 2) Colonne dinamiche MMCT con editMode binding
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
            editMode: "{= ${ui>/edit} ? 'Editable' : 'Display' }"
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
      await this._setTableRowsToData("mdcTable3", a.length);
    },

    // =========================
    // ✅ rows = data length (cap 10)
    // =========================
    _setTableRowsToData: async function (sTableId, iLen) {
      try {
        var oMdc = this.byId(sTableId);
        if (!oMdc) return;

        if (oMdc.initialized) await oMdc.initialized();

        var oInner = (oMdc.getInnerTable && oMdc.getInnerTable()) || oMdc._oTable;
        if (!oInner) return;

        var n = Math.max(1, Math.min(10, parseInt(iLen, 10) || 0));

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
    // Global filter (Records)
    // =========================
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

    // =========================
    // Toolbar actions
    // =========================
    onSelectAll: async function () {
      if (this.getView().getModel("ui").getProperty("/edit")) return;
      var oInner = await this._getInnerTable("mdcTable3");
      this._toggleSelectAllInner(oInner);
    },

    onEdit: function () {
      var oUi = this.getView().getModel("ui");
      if (oUi.getProperty("/edit")) return;

      var oDetail = this.getView().getModel("detail");
      var aCur = oDetail.getProperty("/Records") || [];
      this._editSnapshot = deepClone(aCur);

      oUi.setProperty("/edit", true);
      MessageToast.show("Modalità modifica attiva");
    },

    _diffByCfg: function (aBefore, aAfter, aKeys) {
      var changed = [];
      var len = Math.max(aBefore ? aBefore.length : 0, aAfter ? aAfter.length : 0);

      for (var i = 0; i < len; i++) {
        var b = (aBefore && aBefore[i]) || {};
        var a = (aAfter && aAfter[i]) || {};
        var patch = {};
        var has = false;

        (aKeys || []).forEach(function (k) {
          var vb = b[k];
          var va = a[k];
          if (String(vb ?? "") !== String(va ?? "")) {
            patch[k] = va;
            has = true;
          }
        });

        if (has) changed.push({ idx: i, before: b, after: a, patch: patch });
      }

      return changed;
    },

    _toODataPathFromUri: function (oModel, sUri) {
      if (!oModel || !sUri) return null;
      var base = (oModel.sServiceUrl || "").replace(/\/$/, "");
      var uri = String(sUri || "");
      if (base && uri.indexOf(base) === 0) uri = uri.slice(base.length);
      if (uri[0] !== "/") uri = "/" + uri;
      return uri;
    },

    _updateOData: function (oModel, sPath, oPatch) {
      return new Promise(function (resolve, reject) {
        try {
          oModel.update(sPath, oPatch, {
            merge: true,
            success: function () { resolve(true); },
            error: function (e) { reject(e); }
          });
        } catch (e) {
          reject(e);
        }
      });
    },

    onSave: async function () {
      var oUi = this.getView().getModel("ui");
      if (!oUi.getProperty("/edit")) return;

      var oDetail = this.getView().getModel("detail");
      var aNow = oDetail.getProperty("/Records") || [];
      var aCfg01 = (oDetail.getProperty("/_mmct/s01") || []).map(function (x) { return x.ui; }).filter(Boolean);

      var diffs = this._diffByCfg(this._editSnapshot || [], aNow, aCfg01);
      if (!diffs.length) {
        oUi.setProperty("/edit", false);
        this._editSnapshot = null;
        MessageToast.show("Nessuna modifica");
        return;
      }

      BusyIndicator.show(0);

      try {
        // 1) aggiorna cache records
        var oVm = this._ensureVmCache();
        var sKey = this._getCacheKeySafe();

        oVm.setProperty("/cache/recordsByKey/" + sKey, deepClone(oDetail.getProperty("/RecordsAll") || []));

        // 2) Propaga anche sulle righe raw (dataRowsByKey) per coerenza Screen4
        var aAllRows = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || [];
        diffs.forEach(function (d) {
          var g = String((d.after && d.after.guidKey) || "");
          var f = String((d.after && d.after.Fibra) || "");

          aAllRows.forEach(function (row) {
            if (this._rowGuidKey(row) === g && this._rowFibra(row) === f) {
              Object.keys(d.patch || {}).forEach(function (k) { row[k] = d.patch[k]; });
            }
          }.bind(this));
        }.bind(this));

        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aAllRows);

        // 3) tenta update OData (solo se troviamo __metadata.uri sulle rows)
        var oOData = this.getOwnerComponent().getModel();
        var anyUri = false;

        for (var i = 0; i < aAllRows.length; i++) {
          var r = aAllRows[i];
          if (r && r.__metadata && r.__metadata.uri) { anyUri = true; break; }
        }

        if (oOData && anyUri) {
          // aggiorniamo SOLO le rows che hanno ricevuto patch (per guid+fibra)
          var touchedKeys = {};
          diffs.forEach(function (d) {
            var g = String((d.after && d.after.guidKey) || "");
            var f = String((d.after && d.after.Fibra) || "");
            touchedKeys[g + "||" + f] = d.patch;
          });

          for (var j = 0; j < aAllRows.length; j++) {
            var rr = aAllRows[j];
            if (!rr || !rr.__metadata || !rr.__metadata.uri) continue;

            var kk = this._rowGuidKey(rr) + "||" + this._rowFibra(rr);
            var p = touchedKeys[kk];
            if (!p) continue;

            var path = this._toODataPathFromUri(oOData, rr.__metadata.uri);
            if (!path) continue;

            try {
              await this._updateOData(oOData, path, p);
            } catch (e) {
              // non bloccare tutto: log e avanti
              console.error("[S3] OData update failed", e);
            }
          }
        }

        oUi.setProperty("/edit", false);
        this._editSnapshot = null;
        MessageToast.show("Salvato");
      } finally {
        BusyIndicator.hide();
      }
    },

    onPrint: function () {
      var oDetail = this.getView().getModel("detail");
      var aRows = oDetail.getProperty("/Records") || [];
      var aCols = oDetail.getProperty("/_mmct/s01") || [];

      var html = [];
      html.push("<html><head><meta charset='utf-8'/>");
      html.push("<title>Stampa - Schermata 01</title>");
      html.push("<style>body{font-family:Arial} table{border-collapse:collapse;width:100%} th,td{border:1px solid #ccc;padding:6px;font-size:12px} th{background:#f3f3f3}</style>");
      html.push("</head><body>");
      html.push("<h3>Tracciabilità - Schermata 01</h3>");
      html.push("<div><b>Fornitore:</b> " + String(oDetail.getProperty("/VendorId") || "") + " &nbsp; <b>Materiale:</b> " + String(oDetail.getProperty("/Material") || "") + "</div>");
      html.push("<br/>");
      html.push("<table><thead><tr>");
      aCols.forEach(function (c) { html.push("<th>" + String(c.label || c.ui) + "</th>"); });
      html.push("</tr></thead><tbody>");

      aRows.forEach(function (r) {
        html.push("<tr>");
        aCols.forEach(function (c) {
          var k = c.ui;
          html.push("<td>" + String((r && r[k]) != null ? r[k] : "") + "</td>");
        });
        html.push("</tr>");
      });

      html.push("</tbody></table>");
      html.push("</body></html>");

      var w = window.open("", "_blank");
      if (!w) return;
      w.document.open();
      w.document.write(html.join(""));
      w.document.close();
      w.focus();
      w.print();
    },

    onExportExcel: function () {
      var oDetail = this.getView().getModel("detail");
      var aData = oDetail.getProperty("/Records") || [];
      var aCols = oDetail.getProperty("/_mmct/s01") || [];

      sap.ui.require(["sap/ui/export/Spreadsheet", "sap/ui/export/library"], function (Spreadsheet, exportLibrary) {
        var EdmType = exportLibrary.EdmType;

        var aColumnCfg = (aCols || []).map(function (c) {
          return {
            label: c.label || c.ui,
            property: c.ui,
            type: EdmType.String
          };
        });

        var oSettings = {
          workbook: { columns: aColumnCfg },
          dataSource: aData,
          fileName: "Screen3_Schermata01.xlsx"
        };

        var sheet = new Spreadsheet(oSettings);
        sheet.build().finally(function () { sheet.destroy(); });
      });
    },

    // alias (se in futuro vuoi richiamare onExport)
    onExport: function () { this.onExportExcel(); },

    // =========================
    // NAV BACK
    // =========================
    onNavBack: function () {
      if (this.getView().getModel("ui").getProperty("/edit")) {
        MessageToast.show("Salva o esci da Modifica prima di tornare indietro");
        return;
      }

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
