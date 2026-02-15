sap.ui.define([
  "apptracciabilita/apptracciabilita/controller/BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/ui/mdc/table/Column",
  "sap/ui/mdc/p13n/StateUtil",

  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/domains",
  "apptracciabilita/apptracciabilita/util/statusUtil",
  "apptracciabilita/apptracciabilita/util/mmctUtil",
  "apptracciabilita/apptracciabilita/util/mdcTableUtil",
  "apptracciabilita/apptracciabilita/util/p13nUtil",
  "apptracciabilita/apptracciabilita/util/cellTemplateUtil",
  "apptracciabilita/apptracciabilita/util/touchCodAggUtil",
  "apptracciabilita/apptracciabilita/util/screen4FilterUtil",
  "apptracciabilita/apptracciabilita/util/screen4ExportUtil",
  "apptracciabilita/apptracciabilita/util/screen4LoaderUtil",
  "apptracciabilita/apptracciabilita/util/recordsUtil",
  "apptracciabilita/apptracciabilita/util/TableColumnAutoSize",


  "apptracciabilita/apptracciabilita/util/mockData"
], function (
  BaseController, JSONModel, MessageToast, MdcColumn, StateUtil,
  N, Domains, StatusUtil, MmctUtil, MdcTableUtil, P13nUtil,
  CellTemplateUtil, TouchCodAggUtil, S4Filter, S4Export, S4Loader, RecordsUtil, TableColumnAutoSize,
  PercUtil,
  MockData
) {
  "use strict";

  return BaseController.extend("apptracciabilita.apptracciabilita.controller.Screen4", {

    _sLogPrefix: "[S4]",
    _sMockFlag: "mockS4",

    // ==================== INIT ====================
    onInit: function () {

      var oVm = this._getOVm();
      oVm.setProperty("/mdcCfg/screen4", { modelName: "detail", collectionPath: "/Rows", properties: [] });

      this._log("onInit");
      this.getOwnerComponent().getRouter().getRoute("Screen4").attachPatternMatched(this._onRouteMatched, this);
      this.getView().setModel(new JSONModel({ showHeaderFilters: false, showHeaderSort: true }), "ui");
      this._hdrSortBtns = {};

      this.getView().setModel(new JSONModel({
        VendorId: "", Header4Fields: [], Material: "", recordKey: "0", guidKey: "", Fibra: "",
        RowsAll: [], Rows: [], RowsCount: 0,
        _mmct: { cat: "", s00: [], hdr4: [], s02: [] },
        __dirty: false, __role: "", __status: "",
        __canEdit: false, __canAddRow: false, __canApprove: false, __canReject: false
      }), "detail");

      this._snapshotRows = null;
      this._filterState = { globalQuery: "", colFilters: {}, sortState: null };
      this._hdrFilter = { boxesByKey: {}, seenLast: {} };
    },

    onExit: function () {
      try {
        if (this._dlgSort) { this._dlgSort.destroy(); this._dlgSort = null; }
        S4Filter.resetHeaderCaches(this._hdrFilter, this._hdrSortBtns);
        this._hdrFilter = { boxesByKey: {}, seenLast: {} };
      } catch (e) { }
    },

    // _log and _dbg inherited from BaseController

    // ==================== ROUTE ====================
    _onRouteMatched: function (oEvent) {
      var oArgs = oEvent.getParameter("arguments") || {};
      this._sMode = oArgs.mode || "A";
      this._sVendorId = decodeURIComponent(oArgs.vendorId || "");
      this._sMaterial = decodeURIComponent(oArgs.material || "");
      this._sRecordKey = decodeURIComponent(oArgs.recordKey || "0");

      var self = this;
      this._ensureUserInfosLoaded().then(function () {
        self._log("_onRouteMatched args", oArgs);

        self._snapshotRows = null;
        self._filterState = { globalQuery: "", colFilters: {}, sortState: null };
        var oInp = self.byId("inputFilter4");
        if (oInp && oInp.setValue) oInp.setValue("");
        S4Filter.syncHeaderFilterCtrlsFromState(true, {}, self._hdrFilter);

        var oDetail = self.getView().getModel("detail");
        oDetail.setData({
          VendorId: self._sVendorId, Material: self._sMaterial, recordKey: self._sRecordKey,
          guidKey: "", Fibra: "", RowsAll: [], Rows: [], RowsCount: 0, Header4Fields: [],
          _mmct: { cat: "", s00: [], hdr4: [], s02: [] },
          __dirty: false, __role: "", __status: "",
          __canEdit: false, __canAddRow: false, __canApprove: false, __canReject: false
        }, true);

        self._applyUiPermissions();
        S4Filter.resetHeaderCaches(self._hdrFilter, self._hdrSortBtns);
        self._hdrFilter = { boxesByKey: {}, seenLast: {} };
        self._hdrSortBtns = {};
        self._loadSelectedRecordRows(function () { self._bindRowsAndColumns(); }.bind(self));
      });
    },

    // ==================== CACHE / CONFIG ====================
    // _getOVm (= _ensureVmCache), _getCacheKeySafe inherited from BaseController
    _getDataCacheKey: function () {
      var mock = (this.getOwnerComponent().getModel("vm").getProperty("/mock")) || {};
      return (!!(mock.mockS3 || mock.mockS4) ? "MOCK|" : "REAL|") + this._getCacheKeySafe();
    },
    _cfgForScreen: function (sCat, s) { return MmctUtil.cfgForScreen(this.getOwnerComponent().getModel("vm"), sCat, s); },
    _domainHasValues: function (d) { return Domains.domainHasValues(this.getOwnerComponent(), d); },

    _toArrayMulti: function (v) {
      if (Array.isArray(v)) { var s1 = {}; return v.map(function (x) { return String(x || "").trim(); }).filter(function (x) { return !!x; }).filter(function (x) { if (s1[x]) return false; s1[x] = true; return true; }); }
      var str = String(v || "").trim(); if (!str) return [];
      var s2 = {}; return str.split(/[;|,]+/).map(function (x) { return String(x || "").trim(); }).filter(function (x) { return !!x; }).filter(function (x) { if (s2[x]) return false; s2[x] = true; return true; });
    },

    // ==================== DIRTY / CODAGG ====================

    _markDirty: function () {
      var oD = this.getView().getModel("detail"); if (!oD) return;
      oD.setProperty("/__dirty", true);
      var sRole = String(oD.getProperty("/__role") || "").trim().toUpperCase();
      if (sRole === "E" && String(oD.getProperty("/__status") || "").trim().toUpperCase() !== "AP") {
        oD.setProperty("/__canEdit", true); oD.setProperty("/__canAddRow", true);
        oD.setProperty("/__canApprove", false); oD.setProperty("/__canReject", false);
      }
      this._applyUiPermissions();

      // Live check percentage sum after each edit — with cell coloring
      RecordsUtil.checkPercAndApply(this.byId("mdcTable4"), oD, { rowsPath: "/RowsAll" });
    },

    _hookDirtyOnEdit: function (oCtrl) {
      if (!oCtrl) return;
      try { if (oCtrl.data && oCtrl.data("dirtyHooked")) return; if (oCtrl.data) oCtrl.data("dirtyHooked", true); } catch (e) {}
      try { if (oCtrl.isA && oCtrl.isA("sap.m.Input") && oCtrl.setValueLiveUpdate) oCtrl.setValueLiveUpdate(true); } catch (e) {}
      var self = this;
      var fn = function (oEvt) {
        self._markDirty();
        var src = (oEvt && oEvt.getSource) ? oEvt.getSource() : oCtrl;
        var ctx = (src.getBindingContext && (src.getBindingContext("detail") || src.getBindingContext())) || null;
        var row = ctx && ctx.getObject && ctx.getObject(); if (!row) return;
        var before = TouchCodAggUtil.getCodAgg(row);
        TouchCodAggUtil.touchCodAggRow(row);
        if (before !== TouchCodAggUtil.getCodAgg(row) && ctx.getPath)
          self.getView().getModel("detail").setProperty(ctx.getPath() + "/CodAgg", row.CodAgg);
      };
      if (oCtrl.attachLiveChange) oCtrl.attachLiveChange(fn);
      if (oCtrl.attachChange) oCtrl.attachChange(fn);
      if (oCtrl.attachSelectionChange) oCtrl.attachSelectionChange(fn);
      if (oCtrl.attachSelectionFinish) oCtrl.attachSelectionFinish(fn);
      if (oCtrl.attachSubmit) oCtrl.attachSubmit(fn);
    },

    _createCellTemplate: function (sKey, oMeta) {
      return CellTemplateUtil.createCellTemplate(sKey, oMeta, {
        domainHasValuesFn: this._domainHasValues.bind(this),
        hookDirtyOnEditFn: this._hookDirtyOnEdit.bind(this)
      });
    },

    // ==================== STATUS ====================
    _updateVmRecordStatus: function (sCK, sGuid, sFibra, sRole, sStatus) {
      var oVm = this._getOVm();
      var aRecs = oVm.getProperty("/cache/recordsByKey/" + sCK) || [];
      if (!Array.isArray(aRecs) || !aRecs.length) return;
      var idx = aRecs.findIndex(function (r) {
        if (String(r && r.guidKey || "") !== String(sGuid || "")) return false;
        return !sFibra || String(r && r.Fibra || "") === String(sFibra || "");
      });
      if (idx < 0) return;
      var rec = aRecs[idx], st = String(sStatus || "ST").trim().toUpperCase();
      rec.__status = st; rec.Stato = st;
      rec.__canEdit = StatusUtil.canEdit(sRole, st); rec.__canApprove = StatusUtil.canApprove(sRole, st);
      rec.__canReject = StatusUtil.canReject(sRole, st); rec.__readOnly = !rec.__canEdit;
      aRecs = aRecs.slice(); aRecs[idx] = rec;
      oVm.setProperty("/cache/recordsByKey/" + sCK, aRecs);
    },

    // ==================== HEADER ====================
    _buildHeader4FromMmct00: function (sCat) {
      var a00 = sCat ? (this._cfgForScreen(sCat, "00") || []) : [];
      var aRaw = a00.filter(function (f) { return !!(f && f.testata2); })
        .sort(function (a, b) { return ((a && a.order != null) ? a.order : 9999) - ((b && b.order != null) ? b.order : 9999); });
      var seen = {};
      return { s00: a00, hdr4: aRaw.filter(function (f) {
        var ui = String(f && (f.ui || f.UiFieldname || f.UIFIELDNAME) || "").trim();
        if (!ui) return false; var k = ui.toUpperCase(); if (seen[k]) return false; seen[k] = true; return true;
      }) };
    },

    _refreshHeader4Fields: function () {
      var oD = this.getView().getModel("detail");
      var aHdr = oD.getProperty("/_mmct/hdr4") || [], oRec = oD.getProperty("/_mmct/rec") || {};
      var r0 = (oD.getProperty("/RowsAll") || [])[0] || {};
      function gv(k) { if (oRec[k] != null && oRec[k] !== "") return oRec[k]; if (r0[k] != null && r0[k] !== "") return r0[k]; return ""; }
      oD.setProperty("/Header4Fields", aHdr.slice()
        .sort(function (a, b) { return (a.order ?? 9999) - (b.order ?? 9999); })
        .map(function (f) { var k = String(f.ui || "").trim(); return { key: k, label: f.label || k, value: N.valToText(gv(k)) }; })
        .filter(function (x) { return x.key.toUpperCase() !== "FORNITORE"; }));
    },

    // ==================== LOAD SELECTED RECORD ROWS ====================
    _loadSelectedRecordRows: function (fnDone) {
      var oVm = this._getOVm(), sKey = this._getDataCacheKey(), self = this;
      var aAllRows = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || null;
      var aRecords = oVm.getProperty("/cache/recordsByKey/" + sKey) || null;

      var after = function () {
        var oD = self.getView().getModel("detail");
        var iIdx = parseInt(self._sRecordKey, 10); if (isNaN(iIdx) || iIdx < 0) iIdx = 0;
        var oSel = (oVm.getData() || {}).selectedScreen3Record || null;
        aAllRows = Array.isArray(aAllRows) ? aAllRows : [];
        if (!Array.isArray(aRecords)) { aRecords = []; oVm.setProperty("/cache/recordsByKey/" + sKey, aRecords); }
        if (oSel) { aRecords[iIdx] = oSel; oVm.setProperty("/cache/recordsByKey/" + sKey, aRecords); }

        var oRec = oSel || aRecords[iIdx] || aRecords[0] || null;
        if (!oRec) {
          oD.setProperty("/RowsAll", []); oD.setProperty("/Rows", []); oD.setProperty("/RowsCount", 0);
          oD.setProperty("/_mmct/cat", ""); oD.setProperty("/_mmct/s02", []);
          self._applyUiPermissions(); if (typeof fnDone === "function") fnDone(); return;
        }

        var sGuid = N.toStableString(oRec.guidKey || oRec.Guid || oRec.GUID || oRec.ItmGuid || oRec.ItemGuid || oRec.GUID_ITM || oRec.GUID_ITM2 || "");
        var sRecFibra = N.toStableString(oRec.Fibra || oRec.FIBRA || oRec.Fiber || oRec.FIBER || "");
        var aByGuid = aAllRows.filter(function (r) { return N.toStableString(S4Loader.rowGuidKey(r) || (r && r.guidKey)) === N.toStableString(sGuid); });

        if (!aByGuid.length) {
          var oS = N.deepClone(oSel || oRec) || {};
          oS.guidKey = sGuid; oS.Guid = sGuid; oS.GUID = sGuid;
          oS.Fibra = sRecFibra || N.toStableString((oSel && (oSel.Fibra || oSel.FIBRA)) || "") || "";
          if (oS.Approved == null) oS.Approved = 0; if (oS.ToApprove == null) oS.ToApprove = 1; if (oS.Rejected == null) oS.Rejected = 0;
          oS.__synthetic = true; oS.__localId = oS.__localId || ("SYNTH_" + Date.now());
          aAllRows = aAllRows.slice(); aAllRows.push(oS);
          oVm.setProperty("/cache/dataRowsByKey/" + sKey, aAllRows);
          aByGuid = [oS];
        }

        var aSelected = aByGuid;
        var sRole = String(oVm.getProperty("/userType") || "").trim().toUpperCase();
        // Conservative aggregate: all AP→AP, any RJ→RJ, any CH→CH, else ST
        var aRowSt = aSelected.map(function (r) { return StatusUtil.normStatoRow(r, oVm); });
        var gSt;
        if (aRowSt.length && aRowSt.every(function (s) { return s === "AP"; })) { gSt = "AP"; }
        else if (aRowSt.some(function (s) { return s === "RJ"; })) { gSt = "RJ"; }
        else if (aRowSt.some(function (s) { return s === "CH"; })) { gSt = "CH"; }
        else { gSt = "ST"; }

        var bEdit = StatusUtil.canEdit(sRole, gSt);
        aSelected.forEach(function (r) { r.Stato = StatusUtil.normStatoRow(r, oVm); r.__readOnly = !StatusUtil.canEdit(sRole, r.Stato); });
        oD.setProperty("/__role", sRole); oD.setProperty("/__status", gSt); oD.setProperty("/__canEdit", bEdit);
        oD.setProperty("/__canAddRow", StatusUtil.canAddRow(sRole, gSt));
        // Show approve/reject buttons if any row is still approvable (ST or CH)
        var bHasApprovable = aRowSt.some(function (s) { return s === "ST" || s === "CH"; });
        oD.setProperty("/__canApprove", sRole === "I" && bHasApprovable);
        oD.setProperty("/__canReject", sRole === "I" && bHasApprovable);

        var r0 = aSelected[0] || {};
        var sCat = S4Loader.pickCat(r0) || S4Loader.pickCat(oRec) || (oSel ? S4Loader.pickCat(oSel) : "") || "";
        if (!sCat) { var f1 = aAllRows.find(function (r) { return !!S4Loader.pickCat(r); }); if (f1) sCat = S4Loader.pickCat(f1); }
        if (!sCat) { var f2 = (aRecords || []).find(function (r) { return !!S4Loader.pickCat(r); }); if (f2) sCat = S4Loader.pickCat(f2); }

        var aCfg02 = sCat ? self._cfgForScreen(sCat, "02") : [];
        var oHdr = self._buildHeader4FromMmct00(sCat);
        oD.setProperty("/_mmct/s00", oHdr.s00); oD.setProperty("/_mmct/hdr4", oHdr.hdr4);
        oD.setProperty("/_mmct/rec", oRec || oSel || {});
        if (!aCfg02.length) aCfg02 = S4Loader.buildCfgFallbackFromObject(aAllRows[0] || (aRecords || [])[0] || r0 || oRec || {});
        if (sCat) { [r0, oRec, oSel].forEach(function (o) { if (o && !S4Loader.pickCat(o)) o.CatMateriale = sCat; }); }

        aSelected.forEach(function (row) {
          (aCfg02 || []).forEach(function (f) {
            if (!f || !f.ui) return; var k = String(f.ui).trim();
            if (f.multiple) row[k] = self._toArrayMulti(row[k]);
            else if (row[k] == null) row[k] = "";
          });
        });

        if (!aCfg02.length) {
          aCfg02 = S4Loader.buildCfgFallbackFromObject(r0);
          if (aCfg02.length <= 1) {
            var m2 = {}; aCfg02.forEach(function (x) { m2[x.ui] = x; });
            S4Loader.buildCfgFallbackFromObject(oRec).forEach(function (x) { if (!m2[x.ui]) { m2[x.ui] = x; aCfg02.push(x); } });
          }
        }

        oD.setProperty("/_mmct/cat", sCat); oD.setProperty("/_mmct/s02", aCfg02);
        oD.setProperty("/guidKey", sGuid); oD.setProperty("/Fibra", "");
        oD.setProperty("/RowsAll", aSelected); oD.setProperty("/Rows", aSelected); oD.setProperty("/RowsCount", aSelected.length);
        self._refreshHeader4Fields(); self._applyUiPermissions(); self._applyFiltersAndSort();
        if (typeof fnDone === "function") fnDone();
      };

      if (Array.isArray(aAllRows) && Array.isArray(aRecords) && (aAllRows.length || aRecords.length)) { after(); return; }

      S4Loader.reloadDataFromBackend({
        oVm: oVm, oDataModel: this.getOwnerComponent().getModel(),
        vendorId: this._sVendorId, material: this._sMaterial, logFn: this._log.bind(this)
      }, function (aRes) {
        aAllRows = Array.isArray(aRes) ? aRes : [];
        var sCat = S4Loader.pickCat(aAllRows[0] || {});
        aRecords = S4Loader.buildRecords01ForCache(aAllRows, sCat ? self._cfgForScreen(sCat, "01") : [], oVm);
        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aAllRows);
        oVm.setProperty("/cache/recordsByKey/" + sKey, aRecords);
        after();
      });
    },

    // ==================== MDC TABLE ====================
    _ensureMdcCfgScreen4: function (aCfg02) {
      var oVm = this._getOVm();
      oVm.setProperty("/mdcCfg/screen4", { modelName: "detail", collectionPath: "/Rows",
        properties: S4Filter.dedupeCfgByUi(aCfg02).map(function (f) {
          return { name: f.ui, label: f.label || f.ui, dataType: "String", domain: f.domain || "", required: !!f.required };
        })
      });
    },

    _rebuildColumnsHard: async function (oTbl, aCfg02) {
      if (!oTbl) return;
      if (oTbl.initialized) await oTbl.initialized();
      (oTbl.getColumns && oTbl.getColumns() || []).slice().forEach(function (c) { oTbl.removeColumn(c); c.destroy(); });
      S4Filter.dedupeCfgByUi(aCfg02).forEach(function (f) {
        var sKey = String(f.ui || "").trim(); if (!sKey) return;
        var mP = MdcColumn.getMetadata().getAllProperties();
        var o = { header: (f.label || sKey) + (f.required ? " *" : ""), visible: true, dataProperty: sKey,
          template: this._createCellTemplate(sKey, f) };
        if (mP.propertyKey) o.propertyKey = sKey;
        oTbl.addColumn(new MdcColumn(o));
      }.bind(this));
    },

    _bindRowsAndColumns: async function () {
      var oD = this.getView().getModel("detail"), oTbl = this.byId("mdcTable4"); if (!oTbl) return;
      this._ensureMdcCfgScreen4(oD.getProperty("/_mmct/s02") || []);
      await this._rebuildColumnsHard(oTbl, oD.getProperty("/_mmct/s02") || []);
      /* COLONNE DINAMICHE */
      TableColumnAutoSize.autoSize(this.byId("mdcTable4"), 60);
      if (oTbl.initialized) await oTbl.initialized();
      oTbl.setModel(oD, "detail");
      this._snapshotRows = N.deepClone(oD.getProperty("/RowsAll") || []);
      if (typeof oTbl.rebind === "function") oTbl.rebind();
      await P13nUtil.forceP13nAllVisible(oTbl, StateUtil, this._log.bind(this), "t0");
      var self = this;
      setTimeout(function () { P13nUtil.forceP13nAllVisible(oTbl, StateUtil, self._log.bind(self), "t300"); }, 300);
      if (oTbl.initialized) oTbl.initialized().then(function () { self._injectHeaderFilters("bind"); });
      else self._injectHeaderFilters("bind");
      this._applyUiPermissions();
    },

    _applyUiPermissions: function () {
      try {
        var oD = this.getView().getModel("detail"); if (!oD) return;
        var oA = this.byId("btnAddRow"), oDl = this.byId("btnDeleteRows");
        if (oA && oA.setEnabled) oA.setEnabled(!!oD.getProperty("/__canAddRow"));
        if (oDl && oDl.setEnabled) oDl.setEnabled(!!oD.getProperty("/__canEdit"));
      } catch (e) { }
    },

    // ==================== FILTER / SORT ====================
    _applyFiltersAndSort: function () { S4Filter.applyFiltersAndSort(this.getView().getModel("detail"), this._filterState); },
    onGlobalFilter: function (oEvt) { this._filterState.globalQuery = String(oEvt.getParameter("value") || ""); this._applyFiltersAndSort(); },
    onOpenSort: function () { this.onToggleHeaderSort(); },
    onToggleHeaderSort: function () {
      var oUi = this.getView().getModel("ui"); if (!oUi) return;
      oUi.setProperty("/showHeaderSort", !oUi.getProperty("/showHeaderSort"));
      this._injectHeaderFilters("toggleSort");
    },
    onOpenColumnFilters: function () {
      var oUi = this.getView().getModel("ui"), bNew = !(oUi && oUi.getProperty("/showHeaderFilters"));
      if (oUi) oUi.setProperty("/showHeaderFilters", bNew);
      var self = this, oMdc = this.byId("mdcTable4");
      if (oMdc && oMdc.initialized) oMdc.initialized().then(function () { self._injectHeaderFilters("toggle"); });
      else self._injectHeaderFilters("toggle");
      MdcTableUtil.setInnerHeaderHeight(MdcTableUtil.getInnerTableFromMdc(oMdc), bNew);
      MessageToast.show(bNew ? "Filtri colonna mostrati" : "Filtri colonna nascosti");
    },
    onResetFiltersAndSort: function () {
      var self = this;
      S4Filter.resetFiltersAndSort(this._filterState, this._hdrFilter, this._hdrSortBtns, {
        inputFilter: this.byId("inputFilter4"), applyFn: this._applyFiltersAndSort.bind(this),
        table: this.byId("mdcTable4"),
        forceP13nFn: function (t, r) { P13nUtil.forceP13nAllVisible(t, StateUtil, self._log.bind(self), r); }
      });
      MessageToast.show("Filtri/ordinamento resettati");
    },
    _getCfg02Map: function () {
      var m = {}; (this.getView().getModel("detail").getProperty("/_mmct/s02") || []).forEach(function (f) { if (f && f.ui) m[f.ui.trim()] = f; }); return m;
    },
    _injectHeaderFilters: function (reason) {
      var self = this;
      S4Filter.injectHeaderFilters(reason, {
        mdcTable: this.byId("mdcTable4"), hdrFilter: this._hdrFilter, hdrSortBtns: this._hdrSortBtns,
        state: this._filterState, uiModel: this.getView().getModel("ui"),
        getCfg02MapFn: this._getCfg02Map.bind(this), domainHasValuesFn: this._domainHasValues.bind(this),
        onSortPressFn: function (oEvt) { S4Filter.onHeaderSortPress(oEvt, self._filterState, self._hdrSortBtns, self._applyFiltersAndSort.bind(self)); },
        applyFn: this._applyFiltersAndSort.bind(this), dbgFn: this._dbg.bind(this)
      });
    },

    // ==================== ROW CRUD ====================
    _getSelectedRowObjects: function () {
      var oTbl = this.byId("mdcTable4"); if (!oTbl) return [];
      var aCtx = [];
      try { aCtx = (typeof oTbl.getSelectedContexts === "function") ? (oTbl.getSelectedContexts() || []) : []; } catch (e) { }
      if (!aCtx.length && typeof oTbl.getTable === "function") {
        try {
          var t = oTbl.getTable();
          if (t && t.getSelectedIndices) aCtx = (t.getSelectedIndices() || []).map(function (i) { return t.getContextByIndex(i); }).filter(Boolean);
          else if (t && t.getSelectedItems) aCtx = (t.getSelectedItems() || []).map(function (x) { return (x.getBindingContext && (x.getBindingContext("detail") || x.getBindingContext())) || null; }).filter(Boolean);
        } catch (e) { }
      }
      return aCtx.map(function (c) { return c && c.getObject ? c.getObject() : null; }).filter(Boolean);
    },

    onDeleteRows: function () {
      try {
        var oD = this.getView().getModel("detail"); if (!oD) return;
        if (!oD.getProperty("/__canEdit")) { MessageToast.show("Non hai permessi per eliminare righe"); return; }
        var aSel = this._getSelectedRowObjects(); if (!aSel.length) { MessageToast.show("Seleziona almeno una riga"); return; }
        var aAll = oD.getProperty("/RowsAll") || []; if (!aAll.length) return;
        var mSel = {}; aSel.forEach(function (r) { if (r && r.__localId) mSel[r.__localId] = true; });
        var aRem = aAll.filter(function (r) { if (r && r.__localId && mSel[r.__localId]) return false; return aSel.indexOf(r) < 0; });
        if (!aRem.length) { MessageToast.show("Non puoi eliminare tutte le righe"); return; }

        var sRole = String(oD.getProperty("/__role") || "").trim().toUpperCase();
        if (sRole === "E" && String(oD.getProperty("/__status") || "").toUpperCase() !== "AP") {
          oD.setProperty("/__canEdit", true); oD.setProperty("/__canAddRow", true);
          oD.setProperty("/__canApprove", false); oD.setProperty("/__canReject", false);
        }
        oD.setProperty("/RowsAll", aRem); oD.setProperty("/__dirty", true);
        var oVm = this._getOVm(), sCK = this._getDataCacheKey(), sGuid = N.toStableString(oD.getProperty("/guidKey"));
        var aC = (oVm.getProperty("/cache/dataRowsByKey/" + sCK) || []).filter(function (r) { return S4Loader.rowGuidKey(r) !== sGuid; });
        aRem.forEach(function (l) { if (!l.CodAgg) l.CodAgg = "U"; });
        oVm.setProperty("/cache/dataRowsByKey/" + sCK, aC.concat(aRem));
        this._applyUiPermissions(); this._applyFiltersAndSort();
        var oTbl = this.byId("mdcTable4"); if (oTbl && oTbl.rebind) oTbl.rebind();
        MessageToast.show("Righe eliminate");
      } catch (e) { console.error("[S4] onDeleteRows ERROR", e); MessageToast.show("Errore eliminazione righe"); }
    },

    onAddRow: function () {
      try {
        var oD = this.getView().getModel("detail"); if (!oD) return;
        if (!oD.getProperty("/__canAddRow")) { MessageToast.show("Non hai permessi per aggiungere righe"); return; }
        var aAll = oD.getProperty("/RowsAll") || []; if (!aAll.length) { MessageToast.show("Nessuna riga di base"); return; }
        var oBase = aAll.find(function (r) { var ca = TouchCodAggUtil.getCodAgg(r); return ca === "N" || ca === ""; }) || aAll[0];
        var oNew = N.deepClone(oBase) || {};
        var shouldUpd = false;
        try { shouldUpd = Object.values(this.getOwnerComponent().getModel("vm").getData().cache.dataRowsByKey)[0]
          .filter(function (i) { return i.Guid === oNew.Guid; })
          .filter(function (i) { return !(i && i.Guid && i.Guid.toLowerCase().indexOf("new") >= 0); }).length > 0; } catch (e) { }
        oNew.CodAgg = shouldUpd ? "U" : "I"; oNew.__isNew = true; delete oNew.__metadata;
        oNew.__readOnly = false; oNew.Approved = 0; oNew.Rejected = 0; oNew.ToApprove = 1;
        oNew.__localId = "NEW_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
        var self = this;
        (oD.getProperty("/_mmct/s02") || []).forEach(function (f) { if (f && f.ui && f.multiple) oNew[f.ui.trim()] = self._toArrayMulti(oNew[f.ui.trim()]); });
        aAll = aAll.slice(); aAll.push(oNew);
        oD.setProperty("/RowsAll", aAll); oD.setProperty("/__canEdit", true); oD.setProperty("/__canAddRow", true);
        oD.setProperty("/__canApprove", false); oD.setProperty("/__canReject", false); oD.setProperty("/__dirty", true);
        var oVm = this._getOVm(), sCK = this._getDataCacheKey();
        var sGuid = N.toStableString(oD.getProperty("/guidKey")), sFibra = N.toStableString(oD.getProperty("/Fibra"));
        var aC = oVm.getProperty("/cache/dataRowsByKey/" + sCK) || [];
        aC.forEach(function (r) { if (S4Loader.rowGuidKey(r) === sGuid && S4Loader.rowFibra(r) === sFibra) { r.Approved = 0; r.Rejected = 0; r.ToApprove = 1; } });
        aC = aC.slice(); aC.push(oNew); oVm.setProperty("/cache/dataRowsByKey/" + sCK, aC);
        this._applyUiPermissions(); this._applyFiltersAndSort();
        var oTbl = this.byId("mdcTable4"); if (oTbl && oTbl.rebind) oTbl.rebind();

        // Scroll to the newly added row
        var aFiltered = oD.getProperty("/Rows") || oD.getProperty("/RowsAll") || [];
        MdcTableUtil.scrollToRow(this.byId("mdcTable4"), aFiltered.length - 1);

        MessageToast.show("Riga aggiunta");
      } catch (e) { console.error("[S4] onAddRow ERROR", e); MessageToast.show("Errore aggiunta riga"); }
    },

    // ==================== SAVE ====================
    onSaveLocal: function () {
      try {
        var oD = this.getView().getModel("detail"); if (!oD) return;
        if (!oD.getProperty("/__dirty")) { MessageToast.show("Nessuna modifica da salvare"); return; }

        // Validate percentage sum
        if (!RecordsUtil.validatePercBeforeSave(oD, "/RowsAll")) return;

        var aRows = oD.getProperty("/RowsAll") || [];
        var oVm = this._getOVm(), sCK = this._getDataCacheKey();
        var sGuid = N.toStableString(oD.getProperty("/guidKey")), sFibra = N.toStableString(oD.getProperty("/Fibra"));
        var aC = (oVm.getProperty("/cache/dataRowsByKey/" + sCK) || []).filter(function (r) { return S4Loader.rowGuidKey(r) !== sGuid; });
        oVm.setProperty("/cache/dataRowsByKey/" + sCK, aC.concat(aRows));
        this._updateVmRecordStatus(sCK, sGuid, sFibra,
          String(oD.getProperty("/__role") || "").trim().toUpperCase(),
          String(oD.getProperty("/__status") || "ST").trim().toUpperCase());
        this._snapshotRows = N.deepClone(aRows); oD.setProperty("/__dirty", false);
        this._applyUiPermissions(); MessageToast.show("Salvato (locale/cache)");
      } catch (e) { console.error("[S4] onSaveLocal ERROR", e); MessageToast.show("Errore salvataggio"); }
    },

    // ==================== EXPORT ====================
    onPrint: function () { S4Export.onPrint(this.getView().getModel("detail")); },
    onExportExcel: function () { S4Export.onExportExcel(this.getView().getModel("detail")); },

    // ==================== APPROVE / REJECT (Screen4-specific) ====================
    _getApproveTableId: function () { return "mdcTable4"; },

    _onStatusChangeApplied: function (sNewStatus, aSelected) {
      var oD = this.getView().getModel("detail");
      var oVm = this.getOwnerComponent().getModel("vm");
      var sRole = String((oVm && oVm.getProperty("/userType")) || "").trim().toUpperCase();
      var aAll = oD.getProperty("/RowsAll") || [];

      // Check if there are still rows that can be approved/rejected (status ST or CH)
      var bHasApprovable = aAll.some(function (r) {
        var st = String((r && (r.Stato || r.__status)) || "ST").trim().toUpperCase();
        return st === "ST" || st === "CH";
      });

      oD.setProperty("/__canApprove", sRole === "I" && bHasApprovable);
      oD.setProperty("/__canReject", sRole === "I" && bHasApprovable);

      this._applyFiltersAndSort();
    },

    // ==================== NAVIGATION ====================
    _markSkipS3BackendOnce: function () { this._getOVm().setProperty("/__skipS3BackendOnce", true); },
    _getNavBackFallback: function () {
      return { route: "Screen3", params: { vendorId: encodeURIComponent(this._sVendorId), material: encodeURIComponent(this._sMaterial), mode: this._sMode || "A" } };
    },
    onNavBack: function () {
      this._markSkipS3BackendOnce();
      this._performNavBack();
    }
  });
});