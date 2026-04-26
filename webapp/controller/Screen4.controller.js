sap.ui.define([
  "apptracciabilita/apptracciabilita/controller/BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/ui/mdc/table/Column",
  "sap/ui/mdc/p13n/StateUtil",

  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/vmModelPaths",
  "apptracciabilita/apptracciabilita/util/domains",
  "apptracciabilita/apptracciabilita/util/statusUtil",
  "apptracciabilita/apptracciabilita/util/mmctUtil",
  "apptracciabilita/apptracciabilita/util/mdcTableUtil",
  "apptracciabilita/apptracciabilita/util/p13nUtil",
  "apptracciabilita/apptracciabilita/util/cellTemplateUtil",
  "apptracciabilita/apptracciabilita/util/screen4FilterUtil",
  "apptracciabilita/apptracciabilita/util/screen4ExportUtil",
  "apptracciabilita/apptracciabilita/util/screen4LoaderUtil",
  "apptracciabilita/apptracciabilita/util/screen4SaveUtil",
  "apptracciabilita/apptracciabilita/util/screen4AttachUtil",
  "apptracciabilita/apptracciabilita/util/screen4RowsUtil",
  "apptracciabilita/apptracciabilita/util/recordsUtil",
  "apptracciabilita/apptracciabilita/util/TableColumnAutoSize",
  "apptracciabilita/apptracciabilita/util/screenFlowStateUtil",
  "apptracciabilita/apptracciabilita/util/i18nUtil"
], function (
  BaseController, JSONModel, MessageToast, MdcColumn, StateUtil,
  N, VmPaths, Domains, StatusUtil, MmctUtil, MdcTableUtil, P13nUtil,
  CellTemplateUtil, S4Filter, S4Export, S4Loader, Screen4SaveUtil, Screen4AttachUtil, Screen4RowsUtil, RecordsUtil, TableColumnAutoSize, ScreenFlowStateUtil, I18n
) {
  "use strict";

  return BaseController.extend("apptracciabilita.apptracciabilita.controller.Screen4", {

    _sLogPrefix: "[S4]",
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

      // Periodically sync attachment counters across rows.
      // The attachment dialog updates only ONE row via onCountChange callback.
      // Since JSONModel.attachPropertyChange doesn't fire for nested array changes,
      // we use a lightweight polling approach (500ms) that only runs while Screen4 is active.
      var self = this;
      this._attachSyncInterval = null;

      this._snapshotRows = null;
      this._filterState = { globalQuery: "", colFilters: {}, sortState: null };
      this._hdrFilter = { boxesByKey: {}, seenLast: {} };
    },

    onExit: function () {
      try {
        this._stopAttachmentSyncPolling();
        if (this._dlgSort) { this._dlgSort.destroy(); this._dlgSort = null; }
        S4Filter.resetHeaderCaches(this._hdrFilter, this._hdrSortBtns);
        this._hdrFilter = { boxesByKey: {}, seenLast: {} };
      } catch (e) { }
    },

    // _log inherited from BaseController

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
        self._attachSnapshot = null;

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

        self._startAttachmentSyncPolling();

        self._loadSelectedRecordRows(function () { self._bindRowsAndColumns(); }.bind(self));
      });
    },

    // ==================== CACHE / CONFIG ====================
    // _getOVm, _getCacheKeySafe inherited from BaseController
    _getDataCacheKey: function () {
      return "REAL|" + this._getCacheKeySafe();
    },
    _cfgForScreen: function (sCat, s) { return MmctUtil.cfgForScreen(this.getOwnerComponent().getModel("vm"), sCat, s); },
    _domainHasValues: function (d) { return Domains.domainHasValues(this.getOwnerComponent(), d); },

    _toArrayMulti: N.toArrayMulti,

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

      // Sync attachment counters across all rows (attachments are per-field, not per-row)
      this._syncAttachmentCounters();
    },

    /**
     * In Screen4, all rows share the same Guid → attachments are at field level.
     * When an attachment counter changes on one row, propagate the MAX value to ALL rows
     * for each attachment column. This ensures all rows show the same counter.
     */
    _syncAttachmentCounters: function () {
      return Screen4AttachUtil.syncAttachmentCounters({
        getDetailModel: function () { return this.getView().getModel("detail"); }.bind(this),
        getAttachSnapshot: function () { return this._attachSnapshot; }.bind(this),
        setAttachSnapshot: function (oSnapshot) { this._attachSnapshot = oSnapshot; }.bind(this),
        isSyncing: function () { return !!this._bSyncingAttach; }.bind(this),
        setSyncing: function (bVal) { this._bSyncingAttach = bVal; }.bind(this)
      });
    },

    _startAttachmentSyncPolling: function () {
      return Screen4AttachUtil.startPolling({
        intervalMs: 500,
        syncFn: this._syncAttachmentCounters.bind(this),
        getIntervalId: function () { return this._attachSyncInterval; }.bind(this),
        setIntervalId: function (iInterval) { this._attachSyncInterval = iInterval; }.bind(this),
        setIntervalFn: setInterval,
        clearIntervalFn: clearInterval
      });
    },

    _stopAttachmentSyncPolling: function () {
      return Screen4AttachUtil.stopPolling({
        getIntervalId: function () { return this._attachSyncInterval; }.bind(this),
        setIntervalId: function (iInterval) { this._attachSyncInterval = iInterval; }.bind(this),
        clearIntervalFn: clearInterval
      });
    },
    _hookDirtyOnEdit: function (oCtrl) {
      return Screen4RowsUtil.hookDirtyOnEdit({
        control: oCtrl,
        detailModel: this.getView().getModel("detail"),
        markDirtyFn: this._markDirty.bind(this),
        snapshotRowsFn: function () { return this._snapshotRows; }.bind(this),
        applyUiPermissionsFn: this._applyUiPermissions.bind(this)
      });
    },

    _checkRowDirtyRevert: function (row, ctx) {
      return Screen4RowsUtil.checkRowDirtyRevert({
        row: row,
        context: ctx,
        detailModel: this.getView().getModel("detail"),
        snapshotRows: this._snapshotRows,
        applyUiPermissionsFn: this._applyUiPermissions.bind(this)
      });
    },

    _createCellTemplate: function (sKey, oMeta) {
    return CellTemplateUtil.createCellTemplate(sKey, oMeta, {
        view: this.getView(),                                    
        domainHasValuesFn: this._domainHasValues.bind(this),
        hookDirtyOnEditFn: this._hookDirtyOnEdit.bind(this)
    });
    },

    // ==================== STATUS ====================
    _updateVmRecordStatus: function (sCK, sGuid, sFibra, sRole, sStatus) {
      return Screen4RowsUtil.updateVmRecordStatus({
        vmModel: this._getOVm(),
        cacheKey: sCK,
        guid: sGuid,
        fibra: sFibra,
        role: sRole,
        status: sStatus
      });
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
      var oVm = this._getOVm();
      var sKey = this._getDataCacheKey();
      var self = this;
      var aAllRows = oVm.getProperty(VmPaths.dataRowsByKeyPath(sKey)) || null;
      var aRecords = oVm.getProperty(VmPaths.recordsByKeyPath(sKey)) || null;

      function apply() {
        self._applySelectedRecordToDetail(
          Array.isArray(aAllRows) ? aAllRows : [],
          Array.isArray(aRecords) ? aRecords : [],
          sKey,
          fnDone
        );
      }

      if (Array.isArray(aAllRows) && Array.isArray(aRecords) && (aAllRows.length || aRecords.length)) {
        apply();
        return;
      }

      var oNoMatListCtx = ScreenFlowStateUtil.getNoMatListContext(oVm);
      S4Loader.reloadDataFromBackend({
        oVm: oVm, oDataModel: this.getOwnerComponent().getModel(),
        vendorId: this._sVendorId, material: this._sMaterial,
        catMateriale: oNoMatListCtx.catMateriale,
        season: ScreenFlowStateUtil.getCurrentSeason(oVm),
        logFn: this._log.bind(this)
      }, function (aRes) {
        aAllRows = Array.isArray(aRes) ? aRes : [];
        var sCat = S4Loader.pickCat(aAllRows[0] || {});
        aRecords = S4Loader.buildRecords01ForCache(aAllRows, sCat ? self._cfgForScreen(sCat, "01") : [], oVm);
        oVm.setProperty(VmPaths.dataRowsByKeyPath(sKey), aAllRows);
        oVm.setProperty(VmPaths.recordsByKeyPath(sKey), aRecords);
        apply();
      });
    },

    _applySelectedRecordToDetail: function (aAllRows, aRecords, sKey, fnDone) {
      var oVm = this._getOVm();
      var oD = this.getView().getModel("detail");

      var iIdx = parseInt(this._sRecordKey, 10);
      if (isNaN(iIdx) || iIdx < 0) iIdx = 0;

      var oSel = ScreenFlowStateUtil.getSelectedParentForScreen4(oVm);
      if (oSel) aRecords[iIdx] = oSel;
      oVm.setProperty(VmPaths.recordsByKeyPath(sKey), aRecords);

      var oRec = oSel || aRecords[iIdx] || aRecords[0] || null;
      if (!oRec) {
        oD.setProperty("/RowsAll", []);
        oD.setProperty("/Rows", []);
        oD.setProperty("/RowsCount", 0);
        oD.setProperty("/_mmct/cat", "");
        oD.setProperty("/_mmct/s02", []);
        this._applyUiPermissions();
        if (typeof fnDone === "function") fnDone();
        return;
      }

      var sGuid = N.toStableString(
        oRec.guidKey || oRec.Guid || oRec.GUID || oRec.ItmGuid ||
        oRec.ItemGuid || oRec.GUID_ITM || oRec.GUID_ITM2 || ""
      );
      var aSelected = this._resolveOrSynthRowsForGuid(sGuid, oRec, oSel, aAllRows, sKey);
      aAllRows = oVm.getProperty(VmPaths.dataRowsByKeyPath(sKey)) || aAllRows;

      this._applyGroupStatusAndPerms(aSelected, oVm, oD);

      var sCat = this._resolveCatForSelection(aSelected, oRec, oSel, aAllRows, aRecords);
      var aCfg02 = this._resolveCfg02ForSelection(sCat, aSelected, oRec, oSel, aAllRows, aRecords);

      this._applyCfg02NormalizationToRows(aSelected, aCfg02);

      var oHdr = this._buildHeader4FromMmct00(sCat);
      oD.setProperty("/_mmct/s00", oHdr.s00);
      oD.setProperty("/_mmct/hdr4", oHdr.hdr4);
      oD.setProperty("/_mmct/rec", oRec || oSel || {});
      oD.setProperty("/_mmct/cat", sCat);
      oD.setProperty("/_mmct/s02", aCfg02);
      oD.setProperty("/guidKey", sGuid);
      oD.setProperty("/Fibra", "");
      oD.setProperty("/RowsAll", aSelected);
      oD.setProperty("/Rows", aSelected);
      oD.setProperty("/RowsCount", aSelected.length);
      this._snapshotRows = N.deepClone(aSelected);

      this._refreshHeader4Fields();
      this._applyUiPermissions();
      this._applyFiltersAndSort();
      this._syncAttachmentCounters();

      if (typeof fnDone === "function") fnDone();
    },

    // Resolve the list of rows belonging to the selected parent Guid. If none
    // exist (pure template / new record), synthesize a placeholder row and
    // append it to the rows cache so the table has something to bind.
    _resolveOrSynthRowsForGuid: function (sGuid, oRec, oSel, aAllRows, sKey) {
      var aByGuid = aAllRows.filter(function (r) {
        return N.toStableString(S4Loader.rowGuidKey(r) || (r && r.guidKey)) === N.toStableString(sGuid);
      });
      if (aByGuid.length) return aByGuid;

      var sRecFibra = N.toStableString(oRec.Fibra || oRec.FIBRA || oRec.Fiber || oRec.FIBER || "");
      var oS = N.deepClone(oSel || oRec) || {};
      oS.guidKey = sGuid;
      oS.Guid = sGuid;
      oS.GUID = sGuid;
      oS.Fibra = sRecFibra || N.toStableString((oSel && (oSel.Fibra || oSel.FIBRA)) || "") || "";
      if (oS.Approved == null) oS.Approved = 0;
      if (oS.ToApprove == null) oS.ToApprove = 1;
      if (oS.Rejected == null) oS.Rejected = 0;
      oS.__synthetic = true;
      oS.__localId = oS.__localId || ("SYNTH_" + Date.now());

      var aNext = aAllRows.slice();
      aNext.push(oS);
      this._getOVm().setProperty(VmPaths.dataRowsByKeyPath(sKey), aNext);
      return [oS];
    },

    _applyGroupStatusAndPerms: function (aSelected, oVm, oD) {
      var sRole = String(oVm.getProperty("/userType") || "").trim().toUpperCase();
      var aRowSt = aSelected.map(function (r) { return StatusUtil.normStatoRow(r, oVm); });
      var gSt;
      if (aRowSt.length && aRowSt.every(function (s) { return s === "AP"; })) gSt = "AP";
      else if (aRowSt.some(function (s) { return s === "RJ"; })) gSt = "RJ";
      else if (aRowSt.some(function (s) { return s === "CH"; })) gSt = "CH";
      else gSt = "ST";

      aSelected.forEach(function (r) {
        r.Stato = StatusUtil.normStatoRow(r, oVm);
        r.__readOnly = !StatusUtil.canEdit(sRole, r.Stato);
      });

      oD.setProperty("/__role", sRole);
      oD.setProperty("/__status", gSt);
      oD.setProperty("/__canEdit", StatusUtil.canEdit(sRole, gSt));
      oD.setProperty("/__canAddRow", StatusUtil.canAddRow(sRole, gSt));
      oD.setProperty("/__canApprove", false);
      oD.setProperty("/__canReject", false);
    },

    _resolveCatForSelection: function (aSelected, oRec, oSel, aAllRows, aRecords) {
      var r0 = aSelected[0] || {};
      var sCat = S4Loader.pickCat(r0) || S4Loader.pickCat(oRec) || (oSel ? S4Loader.pickCat(oSel) : "") || "";
      if (!sCat) {
        var f1 = aAllRows.find(function (r) { return !!S4Loader.pickCat(r); });
        if (f1) sCat = S4Loader.pickCat(f1);
      }
      if (!sCat) {
        var f2 = (aRecords || []).find(function (r) { return !!S4Loader.pickCat(r); });
        if (f2) sCat = S4Loader.pickCat(f2);
      }
      if (sCat) {
        [r0, oRec, oSel].forEach(function (o) {
          if (o && !S4Loader.pickCat(o)) o.CatMateriale = sCat;
        });
      }
      return sCat;
    },

    _resolveCfg02ForSelection: function (sCat, aSelected, oRec, oSel, aAllRows, aRecords) {
      var aCfg02 = sCat ? this._cfgForScreen(sCat, "02") : [];
      if (aCfg02.length) return aCfg02;

      var r0 = aSelected[0] || {};
      aCfg02 = S4Loader.buildCfgFallbackFromObject(
        aAllRows[0] || (aRecords || [])[0] || r0 || oRec || {}
      );
      if (aCfg02.length > 1) return aCfg02;

      aCfg02 = S4Loader.buildCfgFallbackFromObject(r0);
      var m2 = {};
      aCfg02.forEach(function (x) { m2[x.ui] = x; });
      S4Loader.buildCfgFallbackFromObject(oRec).forEach(function (x) {
        if (!m2[x.ui]) { m2[x.ui] = x; aCfg02.push(x); }
      });
      return aCfg02;
    },

    _applyCfg02NormalizationToRows: function (aSelected, aCfg02) {
      var self = this;
      aSelected.forEach(function (row) {
        (aCfg02 || []).forEach(function (f) {
          if (!f || !f.ui) return;
          var k = String(f.ui).trim();
          if (f.multiple) row[k] = self._toArrayMulti(row[k]);
          else if (row[k] == null) row[k] = "";
        });
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
      MessageToast.show(I18n.text(this, bNew ? "msg.columnFiltersShown" : "msg.columnFiltersHidden", [], bNew ? "Filtri colonna mostrati" : "Filtri colonna nascosti"));
    },
    onResetFiltersAndSort: function () {
      var self = this;
      S4Filter.resetFiltersAndSort(this._filterState, this._hdrFilter, this._hdrSortBtns, {
        inputFilter: this.byId("inputFilter4"), applyFn: this._applyFiltersAndSort.bind(this),
        table: this.byId("mdcTable4"),
        forceP13nFn: function (t, r) { P13nUtil.forceP13nAllVisible(t, StateUtil, self._log.bind(self), r); }
      });
      MessageToast.show(I18n.text(this, "msg.filtersAndSortReset", [], "Filtri/ordinamento resettati"));
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
        applyFn: this._applyFiltersAndSort.bind(this)
      });
    },

    // ==================== ROW CRUD ====================
    _getSelectedRowObjects: function () {
      return Screen4RowsUtil.getSelectedRowObjects({ table: this.byId("mdcTable4") });
    },

    onDeleteRows: function () {
      return Screen4RowsUtil.onDeleteRows({
        detailModel: this.getView().getModel("detail"),
        vmModel: this._getOVm(),
        cacheKey: this._getDataCacheKey(),
        table: this.byId("mdcTable4"),
        applyUiPermissionsFn: this._applyUiPermissions.bind(this),
        applyFiltersAndSortFn: this._applyFiltersAndSort.bind(this)
      });
    },

    onAddRow: function () {
      return Screen4RowsUtil.onAddRow({
        detailModel: this.getView().getModel("detail"),
        vmModel: this._getOVm(),
        cacheKey: this._getDataCacheKey(),
        table: this.byId("mdcTable4"),
        toArrayMultiFn: this._toArrayMulti.bind(this),
        applyUiPermissionsFn: this._applyUiPermissions.bind(this),
        applyFiltersAndSortFn: this._applyFiltersAndSort.bind(this),
        syncAttachmentCountersFn: this._syncAttachmentCounters.bind(this)
      });
    },

    // ==================== COPY ROW ====================
    onCopyRow: function () {
      return Screen4RowsUtil.onCopyRow({
        detailModel: this.getView().getModel("detail"),
        vmModel: this._getOVm(),
        cacheKey: this._getDataCacheKey(),
        table: this.byId("mdcTable4"),
        toArrayMultiFn: this._toArrayMulti.bind(this),
        applyUiPermissionsFn: this._applyUiPermissions.bind(this),
        applyFiltersAndSortFn: this._applyFiltersAndSort.bind(this),
        syncAttachmentCountersFn: this._syncAttachmentCounters.bind(this)
      });
    },

    // ==================== SAVE ====================
    onSaveLocal: function () {
      return Screen4SaveUtil.onSaveLocal({
        detailModel: this.getView().getModel("detail"),
        vmModel: this._getOVm(),
        cacheKey: this._getDataCacheKey(),
        updateVmRecordStatusFn: this._updateVmRecordStatus.bind(this),
        setSnapshotRowsFn: function (aRows) { this._snapshotRows = aRows; }.bind(this),
        applyUiPermissionsFn: this._applyUiPermissions.bind(this)
      });
    },

    // ==================== SAVE TO BACKEND (PostDataSet) ====================
    onSaveToBackend: function () {
      return Screen4SaveUtil.onSaveToBackend({
        detailModel: this.getView().getModel("detail"),
        vmModel: this._getOVm(),
        cacheKey: this._getDataCacheKey(),
        vendorId: this._sVendorId,
        material: this._sMaterial,
        mode: this._sMode || "A",
        odataModel: this.getOwnerComponent().getModel(),
        router: this.getOwnerComponent().getRouter(),
        cfgForScreenFn: this._cfgForScreen.bind(this),
        getCacheKeySafeFn: this._getCacheKeySafe.bind(this),
        getDataCacheKeyFn: this._getDataCacheKey.bind(this),
        updateVmRecordStatusFn: this._updateVmRecordStatus.bind(this),
        setSnapshotRowsFn: function (aRows) { this._snapshotRows = aRows; }.bind(this),
        applyUiPermissionsFn: this._applyUiPermissions.bind(this),
        logFn: this._log.bind(this),
        stopAttachmentPollingFn: this._stopAttachmentSyncPolling.bind(this)
      });
    },

    // ==================== EXPORT ====================
    onPrint: function () { S4Export.onPrint(this.getView().getModel("detail")); },
    onExportExcel: function () { S4Export.onExportExcel(this.getView().getModel("detail")); },

    // ==================== NAVIGATION ====================
    _markSkipS3BackendOnce: function () { ScreenFlowStateUtil.markReturnFromScreen4(this._getOVm()); },
    _getNavBackFallback: function () {
      return { route: "Screen3", params: { vendorId: encodeURIComponent(this._sVendorId), material: encodeURIComponent(this._sMaterial), mode: this._sMode || "A" } };
    },
    onNavBack: function () {
      this._stopAttachmentSyncPolling();
      this._markSkipS3BackendOnce();
      this._performNavBack();
    }
  });
});
