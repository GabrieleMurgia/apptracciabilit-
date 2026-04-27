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
  "apptracciabilita/apptracciabilita/util/screen4ControllerFlowUtil",
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
  CellTemplateUtil, S4Filter, S4Export, Screen4ControllerFlowUtil, Screen4DetailUtil, Screen4SaveUtil, Screen4AttachUtil, Screen4RowsUtil, RecordsUtil, ScreenFlowStateUtil, I18n
) {
  "use strict";

  return BaseController.extend("apptracciabilita.apptracciabilita.controller.Screen4", {

    _sLogPrefix: "[S4]",
    onInit: Screen4ControllerFlowUtil.onInit,
    onExit: Screen4ControllerFlowUtil.onExit,

    // _log inherited from BaseController

    // ==================== ROUTE ====================
    _onRouteMatched: Screen4ControllerFlowUtil._onRouteMatched,

    // ==================== CACHE / CONFIG ====================
    // _getOVm, _getCacheKeySafe inherited from BaseController
    _getDataCacheKey: Screen4ControllerFlowUtil._getDataCacheKey,
    _cfgForScreen: Screen4ControllerFlowUtil._cfgForScreen,
    _domainHasValues: Screen4ControllerFlowUtil._domainHasValues,

    _toArrayMulti: N.toArrayMulti,

    // ==================== DIRTY / CODAGG ====================
    _markDirty: Screen4ControllerFlowUtil._markDirty,
    _syncAttachmentCounters: Screen4ControllerFlowUtil._syncAttachmentCounters,
    _startAttachmentSyncPolling: Screen4ControllerFlowUtil._startAttachmentSyncPolling,
    _stopAttachmentSyncPolling: Screen4ControllerFlowUtil._stopAttachmentSyncPolling,
    _hookDirtyOnEdit: Screen4ControllerFlowUtil._hookDirtyOnEdit,
    _checkRowDirtyRevert: Screen4ControllerFlowUtil._checkRowDirtyRevert,

    _createCellTemplate: function (sKey, oMeta) {
    return CellTemplateUtil.createCellTemplate(sKey, oMeta, {
        view: this.getView(),                                    
        domainHasValuesFn: this._domainHasValues.bind(this),
        hookDirtyOnEditFn: this._hookDirtyOnEdit.bind(this)
    });
    },

    // ==================== STATUS ====================
    _updateVmRecordStatus: Screen4ControllerFlowUtil._updateVmRecordStatus,

    // ==================== HEADER ====================
    _buildHeader4FromMmct00: Screen4ControllerFlowUtil._buildHeader4FromMmct00,
    _refreshHeader4Fields: Screen4ControllerFlowUtil._refreshHeader4Fields,

    // ==================== LOAD SELECTED RECORD ROWS ====================
    _loadSelectedRecordRows: Screen4ControllerFlowUtil._loadSelectedRecordRows,
    _applySelectedRecordToDetail: Screen4ControllerFlowUtil._applySelectedRecordToDetail,
    _refreshAfterBackendSaveInPlace: Screen4ControllerFlowUtil._refreshAfterBackendSaveInPlace,
    _resolveOrSynthRowsForGuid: Screen4ControllerFlowUtil._resolveOrSynthRowsForGuid,
    _applyGroupStatusAndPerms: Screen4ControllerFlowUtil._applyGroupStatusAndPerms,
    _resolveCatForSelection: Screen4ControllerFlowUtil._resolveCatForSelection,
    _resolveCfg02ForSelection: Screen4ControllerFlowUtil._resolveCfg02ForSelection,
    _applyCfg02NormalizationToRows: Screen4ControllerFlowUtil._applyCfg02NormalizationToRows,

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
        var oA = this.byId("btnAddRow02");
        var oC = this.byId("btnCopyRow02");
        var oDl = this.byId("btnDeleteRows02");
        if (oA && oA.setEnabled) oA.setEnabled(!!oD.getProperty("/__canAddRow"));
        if (oC && oC.setEnabled) oC.setEnabled(!!oD.getProperty("/__canCopyRow"));
        if (oDl && oDl.setEnabled) oDl.setEnabled(!!oD.getProperty("/__canDeleteRow"));
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
    _getSelectedRowObjects: Screen4ControllerFlowUtil._getSelectedRowObjects,

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
        stopAttachmentPollingFn: this._stopAttachmentSyncPolling.bind(this),
        afterReloadInPlaceFn: this._refreshAfterBackendSaveInPlace.bind(this)
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
