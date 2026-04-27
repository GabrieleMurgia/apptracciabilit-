sap.ui.define([
  "apptracciabilita/apptracciabilita/controller/BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/ui/mdc/p13n/StateUtil",

  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/domains",
  "apptracciabilita/apptracciabilita/util/mmctUtil",
  "apptracciabilita/apptracciabilita/util/mdcTableUtil",
  "apptracciabilita/apptracciabilita/util/p13nUtil",
  "apptracciabilita/apptracciabilita/util/cellTemplateUtil",
  "apptracciabilita/apptracciabilita/util/screen4FilterUtil",
  "apptracciabilita/apptracciabilita/util/screen4ExportUtil",
  "apptracciabilita/apptracciabilita/util/screen4DetailUtil",
  "apptracciabilita/apptracciabilita/util/screen4SaveUtil",
  "apptracciabilita/apptracciabilita/util/screen4AttachUtil",
  "apptracciabilita/apptracciabilita/util/screen4RowsUtil",
  "apptracciabilita/apptracciabilita/util/recordsUtil",
  "apptracciabilita/apptracciabilita/util/screenFlowStateUtil",
  "apptracciabilita/apptracciabilita/util/i18nUtil"
], function (
  BaseController, JSONModel, MessageToast, StateUtil,
  N, Domains, MmctUtil, MdcTableUtil, P13nUtil,
  CellTemplateUtil, S4Filter, S4Export, Screen4DetailUtil, Screen4SaveUtil, Screen4AttachUtil, Screen4RowsUtil, RecordsUtil, ScreenFlowStateUtil, I18n
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
      } catch (e) { console.debug("[Screen4] suppressed error", e); }
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
      return Screen4DetailUtil.loadSelectedRecordRows({
        vmModel: this._getOVm(),
        odataModel: this.getOwnerComponent().getModel(),
        cacheKey: this._getDataCacheKey(),
        vendorId: this._sVendorId,
        material: this._sMaterial,
        logFn: this._log.bind(this),
        cfgForScreenFn: this._cfgForScreen.bind(this),
        applySelectedRecordToDetailFn: this._applySelectedRecordToDetail.bind(this),
        doneFn: fnDone
      });
    },

    _applySelectedRecordToDetail: function (aAllRows, aRecords, sKey, fnDone) {
      return Screen4DetailUtil.applySelectedRecordToDetail({
        allRows: aAllRows,
        records: aRecords,
        cacheKey: sKey,
        recordKey: this._sRecordKey,
        vmModel: this._getOVm(),
        detailModel: this.getView().getModel("detail"),
        cfgForScreenFn: this._cfgForScreen.bind(this),
        toArrayMultiFn: this._toArrayMulti.bind(this),
        buildHeader4FromMmct00Fn: this._buildHeader4FromMmct00.bind(this),
        refreshHeader4FieldsFn: this._refreshHeader4Fields.bind(this),
        applyUiPermissionsFn: this._applyUiPermissions.bind(this),
        applyFiltersAndSortFn: this._applyFiltersAndSort.bind(this),
        syncAttachmentCountersFn: this._syncAttachmentCounters.bind(this),
        setSnapshotRowsFn: function (aRows) { this._snapshotRows = aRows; }.bind(this),
        doneFn: fnDone
      });
    },

    // Resolve the list of rows belonging to the selected parent Guid. If none
    // exist (pure template / new record), synthesize a placeholder row and
    // append it to the rows cache so the table has something to bind.
    _resolveOrSynthRowsForGuid: function (sGuid, oRec, oSel, aAllRows, sKey) {
      return Screen4DetailUtil.resolveOrSynthRowsForGuid({
        guid: sGuid,
        record: oRec,
        selectedParent: oSel,
        allRows: aAllRows,
        cacheKey: sKey,
        vmModel: this._getOVm()
      });
    },

    _applyGroupStatusAndPerms: function (aSelected, oVm, oD) {
      return Screen4DetailUtil.applyGroupStatusAndPerms({
        selectedRows: aSelected,
        vmModel: oVm,
        detailModel: oD
      });
    },

    _resolveCatForSelection: function (aSelected, oRec, oSel, aAllRows, aRecords) {
      return Screen4DetailUtil.resolveCatForSelection({
        selectedRows: aSelected,
        record: oRec,
        selectedParent: oSel,
        allRows: aAllRows,
        records: aRecords
      });
    },

    _resolveCfg02ForSelection: function (sCat, aSelected, oRec, oSel, aAllRows, aRecords) {
      return Screen4DetailUtil.resolveCfg02ForSelection({
        cat: sCat,
        selectedRows: aSelected,
        record: oRec,
        allRows: aAllRows,
        records: aRecords,
        cfgForScreenFn: this._cfgForScreen.bind(this)
      });
    },

    _applyCfg02NormalizationToRows: function (aSelected, aCfg02) {
      return Screen4DetailUtil.applyCfg02NormalizationToRows({
        selectedRows: aSelected,
        cfg02: aCfg02,
        toArrayMultiFn: this._toArrayMulti.bind(this)
      });
    },

    // ==================== MDC TABLE ====================
    _ensureMdcCfgScreen4: function (aCfg02) {
      return Screen4DetailUtil.ensureMdcCfgScreen4({
        cfg02: aCfg02,
        vmModel: this._getOVm(),
        dedupeCfgByUiFn: S4Filter.dedupeCfgByUi
      });
    },

    _rebuildColumnsHard: async function (oTbl, aCfg02) {
      return Screen4DetailUtil.rebuildColumnsHard({
        table: oTbl,
        cfg02: aCfg02,
        dedupeCfgByUiFn: S4Filter.dedupeCfgByUi,
        createCellTemplateFn: this._createCellTemplate.bind(this)
      });
    },

    _bindRowsAndColumns: async function () {
      return Screen4DetailUtil.bindRowsAndColumns({
        detailModel: this.getView().getModel("detail"),
        table: this.byId("mdcTable4"),
        vmModel: this.getOwnerComponent().getModel("vm"),
        dedupeCfgByUiFn: S4Filter.dedupeCfgByUi,
        createCellTemplateFn: this._createCellTemplate.bind(this),
        injectHeaderFiltersFn: this._injectHeaderFilters.bind(this),
        applyUiPermissionsFn: this._applyUiPermissions.bind(this),
        logFn: this._log.bind(this),
        setSnapshotRowsFn: function (aRows) { this._snapshotRows = aRows; }.bind(this)
      });
    },

    _applyUiPermissions: function () {
      try {
        var oD = this.getView().getModel("detail"); if (!oD) return;
        var oA = this.byId("btnAddRow"), oDl = this.byId("btnDeleteRows");
        if (oA && oA.setEnabled) oA.setEnabled(!!oD.getProperty("/__canAddRow"));
        if (oDl && oDl.setEnabled) oDl.setEnabled(!!oD.getProperty("/__canEdit"));
      } catch (e) { console.debug("[Screen4] suppressed error", e); }
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
