sap.ui.define([
  "apptracciabilita/apptracciabilita/controller/BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/m/HBox",
  "sap/m/ObjectStatus",

  // ===== UTIL =====
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/vmModelPaths",
  "apptracciabilita/apptracciabilita/util/domains",
  "apptracciabilita/apptracciabilita/util/mdcTableUtil",
  "apptracciabilita/apptracciabilita/util/cellTemplateUtil",
  "apptracciabilita/apptracciabilita/util/rowErrorUtil",
  "apptracciabilita/apptracciabilita/util/exportUtil",
  "apptracciabilita/apptracciabilita/util/recordsUtil",
  "apptracciabilita/apptracciabilita/util/screen3SaveUtil",
  "apptracciabilita/apptracciabilita/util/screen3CrudUtil",
  "apptracciabilita/apptracciabilita/util/screen3BindingUtil",
  "apptracciabilita/apptracciabilita/util/screen3ControllerFlowUtil",
  "apptracciabilita/apptracciabilita/util/filterSortUtil",
  "apptracciabilita/apptracciabilita/util/screenFlowStateUtil",
  "apptracciabilita/apptracciabilita/util/i18nUtil"

], function (
  BaseController, JSONModel,
  HBox, ObjectStatus,
  N, VmPaths, Domains, MdcTableUtil,
  CellTemplateUtil, RowErrorUtil, ExportUtil, RecordsUtil,
  Screen3SaveUtil, Screen3CrudUtil, Screen3BindingUtil, Screen3ControllerFlowUtil, FilterSortUtil,
  ScreenFlowStateUtil, I18n
) {
  "use strict";

  return BaseController.extend("apptracciabilita.apptracciabilita.controller.Screen3", {

    _sLogPrefix: "[S3]",
    PARENT_TABLE_ID: "mdcTable3",
    MAIN_TABLE_ID: "mdcTable3",
    MAIN_INPUT_FILTER_ID: "inputFilter3",

    onInit: Screen3ControllerFlowUtil.onInit,
    _onRouteMatched: Screen3ControllerFlowUtil._onRouteMatched,
    _readOpenOdaFromMatInfoCache: Screen3ControllerFlowUtil._readOpenOdaFromMatInfoCache,
    _loadDataOnce: Screen3ControllerFlowUtil._loadDataOnce,
    _bindFromCache: Screen3ControllerFlowUtil._bindFromCache,
    _bindFromBackend: Screen3ControllerFlowUtil._bindFromBackend,
    _applySnapshotStatusAndNotes: Screen3ControllerFlowUtil._applySnapshotStatusAndNotes,
    _excludeTemplatesByRawRows: Screen3ControllerFlowUtil._excludeTemplatesByRawRows,
    _reloadDataFromBackend: Screen3ControllerFlowUtil._reloadDataFromBackend,

    _hydrateAndFormat: function (aRows) {
      return Screen3BindingUtil.hydrateAndFormat({
        rows: aRows,
        detailModel: this._getODetail(),
        vmModel: this.getOwnerComponent().getModel("vm"),
        logFn: this._log.bind(this)
      });
    },

    // ==================== MDC TABLE CONFIG ====================
    _ensureMdcCfgScreen3: function (aCfg01) {
      return Screen3BindingUtil.ensureMdcCfgScreen3({
        cfg01: aCfg01,
        vmModel: this.getOwnerComponent().getModel("vm"),
        logFn: this._log.bind(this)
      });
    },

    _rebuildColumnsHard: async function (oTbl, aCfg01) {
      return Screen3BindingUtil.rebuildColumnsHard({
        table: oTbl,
        cfg01: aCfg01,
        hasDetail: !!this.getView().getModel("detail").getProperty("/_mmct/hasDetail"),
        onGoToScreen4FromRowFn: this.onGoToScreen4FromRow.bind(this),
        createStatusCellTemplateFn: this._createStatusCellTemplate.bind(this),
        createCellTemplateFn: this._createCellTemplate.bind(this),
        setStatusColumnFn: function (oCol) { this._colStatoS3 = oCol; }.bind(this),
        getStatusColumnFn: function () { return this._colStatoS3; }.bind(this)
      });
    },

    _createCellTemplate: function (sKey, oMeta) {
      return CellTemplateUtil.createCellTemplate(sKey, oMeta, {
        view: this.getView(),
        domainHasValuesFn: function (d) { return Domains.domainHasValues(this.getOwnerComponent(), d); }.bind(this),
        hookDirtyOnEditFn: this._hookDirtyOnEdit.bind(this)
      });
    },

    _hookDirtyOnEdit: function (oCtrl) {
      return CellTemplateUtil.hookDirtyOnEdit(oCtrl, {
        view: this.getView(), modelName: "detail",
        touchCodAggParentFn: this._touchCodAggParent.bind(this),
        clearPostErrorByContextFn: this._clearPostErrorByContext.bind(this)
      });
    },

    _createStatusCellTemplate: function (sKey) {
      var sBindKey = (String(sKey || "").toUpperCase() === "STATO") ? "Stato" : sKey;
      var sStateExpr =
        "{= (${detail>" + sBindKey + "} === '' ? 'Warning' : " +
        "(${detail>" + sBindKey + "} === 'AP' ? 'Success' : " +
        "(${detail>" + sBindKey + "} === 'RJ' ? 'Error' : " +
        "(${detail>" + sBindKey + "} === 'CH' ? 'Information' : " +
        "(${detail>" + sBindKey + "} === 'ST' ? 'Warning' : 'None')))))}";

      return new HBox({ width: "100%", justifyContent: "Center", alignItems: "Center",
        items: [
                    new ObjectStatus({ text: "",
            icon: "{= ${detail>" + sBindKey + "} === 'RJ' ? 'sap-icon://alert' : 'sap-icon://circle-task' }",
            state: sStateExpr,
            tooltip: "{= 'Stato: ' + (${detail>" + sBindKey + "} || '') }"
          })
        ]
      });
    },

    // ==================== BIND RECORDS ====================
    _bindRecords: async function (aRecords) {
      return Screen3BindingUtil.bindRecords({
        records: aRecords,
        detailModel: this._getODetail(),
        vmModel: this.getOwnerComponent().getModel("vm"),
        noMatListMode: !!this._bNoMatListMode,
        keepOriginalSnapshot: !!this._bKeepOriginalSnapshot,
        setSnapshotRecordsFn: function (aSnapshot) { this._snapshotRecords = aSnapshot; }.bind(this),
        setOriginalSnapshotFn: function (aSnapshot) { this._originalSnapshot = aSnapshot; }.bind(this),
        table: this.byId("mdcTable3"),
        inlineFs: this._inlineFS,
        setInlineFsFn: function (oInlineFs) { this._inlineFS = oInlineFs; }.bind(this),
        onGoToScreen4FromRowFn: this.onGoToScreen4FromRow.bind(this),
        createStatusCellTemplateFn: this._createStatusCellTemplate.bind(this),
        createCellTemplateFn: this._createCellTemplate.bind(this),
        setStatusColumnFn: function (oCol) { this._colStatoS3 = oCol; }.bind(this),
        getStatusColumnFn: function () { return this._colStatoS3; }.bind(this),
        applyInlineHeaderFilterSortFn: this._applyInlineHeaderFilterSort.bind(this),
        applyClientFiltersFn: this._applyClientFilters.bind(this),
        clearSelectionFn: this._clearSelectionMdc.bind(this),
        scheduleHeaderFilterSortFn: this._scheduleHeaderFilterSort.bind(this),
        ensurePostErrorRowHooksFn: this._ensurePostErrorRowHooks.bind(this),
        logFn: this._log.bind(this),
        logTableFn: this._logTable.bind(this)
      });
    },

    // ==================== FILTERS ====================
    _applyClientFilters: function () {
      FilterSortUtil.applyClientFilters(this._getODetail(), this._inlineFS, this.byId("mdcTable3"));
      /* RecordsUtil.checkPercAndApply(this.byId("mdcTable3"), this._getODetail(), { rowsPath: "/RecordsAll", showToast: false }); */
    },
    onStatusFilterPress: function (oEvt) { FilterSortUtil.onStatusFilterPress(oEvt, this._getODetail(), this._applyClientFilters.bind(this)); },
    onGlobalFilter: function (oEvt) { FilterSortUtil.onGlobalFilter(oEvt, this._getODetail(), this._applyClientFilters.bind(this)); },

    // ==================== ROW ERRORS ====================
    _clearPostErrorByContext: function (oCtx) {
      var self = this;
      Screen3SaveUtil.clearPostErrorByContext({
        context: oCtx,
        detailModel: this._getODetail(),
        updateRowStylesFn: function () {
          var oTbl = self.byId("mdcTable3");
          self._updatePostErrorRowStyles(MdcTableUtil.getInnerTableFromMdc(oTbl));
        }
      });
    },
    _updatePostErrorRowStyles: function (oInner) {
      var self = this;
      RowErrorUtil.updatePostErrorRowStyles(oInner, { oDetail: this._getODetail(), updateRowStyles: function () { self._updatePostErrorRowStyles(oInner); } });
    },
    _ensurePostErrorRowHooks: function (oMdcTbl) {
      var self = this;
      RowErrorUtil.ensurePostErrorRowHooks(oMdcTbl, { oDetail: this._getODetail(), getInnerTableFromMdc: MdcTableUtil.getInnerTableFromMdc, updateRowStyles: function () { self._updatePostErrorRowStyles(MdcTableUtil.getInnerTableFromMdc(oMdcTbl)); } });
    },
    _markRowsWithPostErrors: function (aRespLines) {
      var self = this;
      Screen3SaveUtil.markRowsWithPostErrors({
        responseLines: aRespLines,
        detailModel: this._getODetail(),
        applyClientFiltersFn: this._applyClientFilters.bind(this),
        ensurePostErrorRowHooksFn: function () {
          var oTbl = self.byId("mdcTable3");
          self._ensurePostErrorRowHooks(oTbl);
          self._updatePostErrorRowStyles(MdcTableUtil.getInnerTableFromMdc(oTbl));
        }
      });
    },

    // ==================== TOUCH CODAGG ====================
    _touchCodAggParent: function (p, sPath) {
      return Screen3CrudUtil.touchCodAggParent({
        parent: p,
        path: sPath,
        detailModel: this._getODetail(),
        vmModel: this._getOVm(),
        cacheKey: this._getExportCacheKey(),
        snapshotRecords: this._snapshotRecords,
        originalSnapshot: this._originalSnapshot
      });
    },

    _checkParentDirtyRevert: function (p, sPath) {
      return Screen3CrudUtil.checkParentDirtyRevert({
        parent: p,
        path: sPath,
        detailModel: this._getODetail(),
        vmModel: this._getOVm(),
        cacheKey: this._getExportCacheKey(),
        snapshotRecords: this._snapshotRecords,
        originalSnapshot: this._originalSnapshot
      });
    },

    // ==================== NAV SCREEN4 ====================
    onGoToScreen4FromRow: function (oEvent) {
      return Screen3CrudUtil.onGoToScreen4FromRow({
        event: oEvent,
        detailModel: this._getODetail(),
        vmModel: this._getOVm(),
        component: this.getOwnerComponent(),
        router: this.getOwnerComponent().getRouter(),
        vendorId: this._sVendorId,
        material: this._sMaterial,
        mode: this._sMode || "A",
        cacheKeySafe: this._getCacheKeySafe(),
        setSnapshotRecordsFn: function (aSnapshot) { this._snapshotRecords = aSnapshot; }.bind(this)
      });
    },

    // ==================== MDC SELECTION ====================
    _getSelectedParentObjectsFromMdc: Screen3ControllerFlowUtil._getSelectedParentObjectsFromMdc,
    _clearSelectionMdc: Screen3ControllerFlowUtil._clearSelectionMdc,
    _selectFirstRowMdc: Screen3ControllerFlowUtil._selectFirstRowMdc,

    // ==================== ADD ROW ====================
    onAddRow: function () {
      return Screen3CrudUtil.onAddRow({
        detailModel: this._getODetail(),
        vmModel: this._getOVm(),
        cacheKey: this._getExportCacheKey(),
        cacheKeySafe: this._getCacheKeySafe(),
        vendorId: this._sVendorId,
        material: this._sMaterial,
        component: this.getOwnerComponent(),
        table: this.byId("mdcTable3"),
        applyClientFiltersFn: this._applyClientFilters.bind(this)
      });
    },

    // ==================== COPY ROW ====================
    onCopyRow: function () {
      return Screen3CrudUtil.onCopyRow({
        detailModel: this._getODetail(),
        vmModel: this._getOVm(),
        cacheKey: this._getExportCacheKey(),
        cacheKeySafe: this._getCacheKeySafe(),
        component: this.getOwnerComponent(),
        table: this.byId("mdcTable3"),
        getSelectedParentObjectsFn: this._getSelectedParentObjectsFromMdc.bind(this),
        applyClientFiltersFn: this._applyClientFilters.bind(this)
      });
    },

    // ==================== DELETE ROWS ====================
    onDeleteRows: function () {
      return Screen3CrudUtil.onDeleteRows({
        detailModel: this._getODetail(),
        vmModel: this._getOVm(),
        cacheKey: this._getExportCacheKey(),
        cacheKeySafe: this._getCacheKeySafe(),
        component: this.getOwnerComponent(),
        getSelectedParentObjectsFn: this._getSelectedParentObjectsFromMdc.bind(this),
        applyClientFiltersFn: this._applyClientFilters.bind(this),
        clearSelectionFn: this._clearSelectionMdc.bind(this)
      });
    },

    // ==================== SAVE ====================
    onSave: function () {
      return Screen3SaveUtil.onSave({
        detailModel: this._getODetail(),
        vmModel: this._getOVm(),
        cacheKey: this._getExportCacheKey(),
        vendorId: this._sVendorId,
        material: this._sMaterial,
        odataModel: this.getOwnerComponent().getModel(),
        getCacheKeySafeFn: this._getCacheKeySafe.bind(this),
        getExportCacheKeyFn: this._getExportCacheKey.bind(this),
        reloadDataFromBackendFn: this._reloadDataFromBackend.bind(this),
        hydrateAndFormatFn: this._hydrateAndFormat.bind(this),
        bindRecordsFn: this._bindRecords.bind(this),
        setSnapshotRecordsFn: function (aRecords) { this._snapshotRecords = aRecords; }.bind(this),
        clearSelectionFn: this._clearSelectionMdc.bind(this),
        applyClientFiltersFn: this._applyClientFilters.bind(this),
        ensurePostErrorRowHooksFn: function () {
          var oTbl = this.byId("mdcTable3");
          this._ensurePostErrorRowHooks(oTbl);
          this._updatePostErrorRowStyles(MdcTableUtil.getInnerTableFromMdc(oTbl));
        }.bind(this),
        noMatListMode: !!this._bNoMatListMode
      });
    },

    // ==================== EXPORT ====================
    onExportExcel: async function () {
      await ExportUtil.exportExcel({ oVm: this.getOwnerComponent().getModel("vm"), oDetail: this._getODetail(), toStableString: N.toStableString, statusText: RecordsUtil.statusText, inlineFS: this._inlineFS, vendorId: this._sVendorId, material: this._sMaterial, cacheKey: this._getExportCacheKey(), includeTemplatesInExport: !!this._bNoMatListMode });
    },
    // ==================== APPROVE / REJECT ====================
    _getApproveTableId: function () { return "mdcTable3"; },

    _onStatusChangeApplied: function (sNewStatus, aSelected) {
      var oDetail = this._getODetail();
      var oVm = this.getOwnerComponent().getModel("vm");
      var sRole = String((oVm && oVm.getProperty("/userType")) || "").trim().toUpperCase();
      var aAll = oDetail.getProperty("/RecordsAll") || [];

      var bHasApprovable = aAll.some(function (r) {
    var st = String((r && (r.__status || r.Stato)) || "ST").trim().toUpperCase();
    return st === "ST" || st === "CH" || st === "AP";
});

      var bCanApproveReject = (sRole === "I" || sRole === "S");
      oDetail.setProperty("/__canApprove", bCanApproveReject);
      oDetail.setProperty("/__canReject", bCanApproveReject);

      this._clearSelectionMdc();
      this._applyClientFilters();
    },

    // ==================== NAV BACK ====================
    _hasUnsavedChanges: function () {
      return RecordsUtil.hasUnsavedChanges(this._getODetail(), this._originalSnapshot);
    },
    _getNavBackFallback: function () {
      return { route: "Screen2", params: { vendorId: encodeURIComponent(this._sVendorId), mode: this._sMode || "A" } };
    }
  });
});
