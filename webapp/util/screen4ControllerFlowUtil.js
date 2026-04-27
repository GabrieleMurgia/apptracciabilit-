sap.ui.define([
  "sap/ui/model/json/JSONModel",
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/domains",
  "apptracciabilita/apptracciabilita/util/mmctUtil",
  "apptracciabilita/apptracciabilita/util/screen4FilterUtil",
  "apptracciabilita/apptracciabilita/util/screen4DetailUtil",
  "apptracciabilita/apptracciabilita/util/screen4AttachUtil",
  "apptracciabilita/apptracciabilita/util/screen4RowsUtil",
  "apptracciabilita/apptracciabilita/util/recordsUtil"
], function (
  JSONModel,
  N,
  Domains,
  MmctUtil,
  S4Filter,
  Screen4DetailUtil,
  Screen4AttachUtil,
  Screen4RowsUtil,
  RecordsUtil
) {
  "use strict";

  function onInit() {
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
      __canEdit: false, __canAddRow: false, __canCopyRow: false, __canDeleteRow: false, __canApprove: false, __canReject: false
    }), "detail");

    this._attachSyncInterval = null;
    this._snapshotRows = null;
    this._filterState = { globalQuery: "", colFilters: {}, sortState: null };
    this._hdrFilter = { boxesByKey: {}, seenLast: {} };
  }

  function onExit() {
    try {
      this._stopAttachmentSyncPolling();
      if (this._dlgSort) {
        this._dlgSort.destroy();
        this._dlgSort = null;
      }
      S4Filter.resetHeaderCaches(this._hdrFilter, this._hdrSortBtns);
      this._hdrFilter = { boxesByKey: {}, seenLast: {} };
    } catch (e) {
      console.debug("[Screen4] suppressed error", e);
    }
  }

  function _onRouteMatched(oEvent) {
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
      if (oInp && oInp.setValue) {
        oInp.setValue("");
      }
      S4Filter.syncHeaderFilterCtrlsFromState(true, {}, self._hdrFilter);

      var oDetail = self.getView().getModel("detail");
      oDetail.setData({
        VendorId: self._sVendorId, Material: self._sMaterial, recordKey: self._sRecordKey,
        guidKey: "", Fibra: "", RowsAll: [], Rows: [], RowsCount: 0, Header4Fields: [],
        _mmct: { cat: "", s00: [], hdr4: [], s02: [] },
        __dirty: false, __role: "", __status: "",
        __canEdit: false, __canAddRow: false, __canCopyRow: false, __canDeleteRow: false, __canApprove: false, __canReject: false
      }, true);

      self._applyUiPermissions();
      S4Filter.resetHeaderCaches(self._hdrFilter, self._hdrSortBtns);
      self._hdrFilter = { boxesByKey: {}, seenLast: {} };
      self._hdrSortBtns = {};

      self._startAttachmentSyncPolling();
      self._loadSelectedRecordRows(function () { self._bindRowsAndColumns(); });
    });
  }

  function _getDataCacheKey() {
    return "REAL|" + this._getCacheKeySafe();
  }

  function _cfgForScreen(sCat, s) {
    return MmctUtil.cfgForScreen(this.getOwnerComponent().getModel("vm"), sCat, s);
  }

  function _domainHasValues(d) {
    return Domains.domainHasValues(this.getOwnerComponent(), d);
  }

  function _markDirty() {
    var oD = this.getView().getModel("detail");
    if (!oD) return;
    oD.setProperty("/__dirty", true);
    var sRole = String(oD.getProperty("/__role") || "").trim().toUpperCase();
    if (sRole === "E" && String(oD.getProperty("/__status") || "").trim().toUpperCase() !== "AP") {
      oD.setProperty("/__canEdit", true);
      oD.setProperty("/__canAddRow", true);
      oD.setProperty("/__canApprove", false);
      oD.setProperty("/__canReject", false);
    }
    this._applyUiPermissions();
    RecordsUtil.checkPercAndApply(this.byId("mdcTable4"), oD, { rowsPath: "/RowsAll" });
    this._syncAttachmentCounters();
  }

  function _syncAttachmentCounters() {
    return Screen4AttachUtil.syncAttachmentCounters({
      getDetailModel: function () { return this.getView().getModel("detail"); }.bind(this),
      getAttachSnapshot: function () { return this._attachSnapshot; }.bind(this),
      setAttachSnapshot: function (oSnapshot) { this._attachSnapshot = oSnapshot; }.bind(this),
      isSyncing: function () { return !!this._bSyncingAttach; }.bind(this),
      setSyncing: function (bVal) { this._bSyncingAttach = bVal; }.bind(this)
    });
  }

  function _startAttachmentSyncPolling() {
    return Screen4AttachUtil.startPolling({
      intervalMs: 500,
      syncFn: this._syncAttachmentCounters.bind(this),
      getIntervalId: function () { return this._attachSyncInterval; }.bind(this),
      setIntervalId: function (iInterval) { this._attachSyncInterval = iInterval; }.bind(this),
      setIntervalFn: window.setInterval.bind(window),
      clearIntervalFn: window.clearInterval.bind(window)
    });
  }

  function _stopAttachmentSyncPolling() {
    return Screen4AttachUtil.stopPolling({
      getIntervalId: function () { return this._attachSyncInterval; }.bind(this),
      setIntervalId: function (iInterval) { this._attachSyncInterval = iInterval; }.bind(this),
      clearIntervalFn: window.clearInterval.bind(window)
    });
  }

  function _hookDirtyOnEdit(oCtrl) {
    return Screen4RowsUtil.hookDirtyOnEdit({
      control: oCtrl,
      detailModel: this.getView().getModel("detail"),
      markDirtyFn: this._markDirty.bind(this),
      snapshotRowsFn: function () { return this._snapshotRows; }.bind(this),
      applyUiPermissionsFn: this._applyUiPermissions.bind(this)
    });
  }

  function _checkRowDirtyRevert(row, ctx) {
    return Screen4RowsUtil.checkRowDirtyRevert({
      row: row,
      context: ctx,
      detailModel: this.getView().getModel("detail"),
      snapshotRows: this._snapshotRows,
      applyUiPermissionsFn: this._applyUiPermissions.bind(this)
    });
  }

  function _updateVmRecordStatus(sCK, sGuid, sFibra, sRole, sStatus) {
    return Screen4RowsUtil.updateVmRecordStatus({
      vmModel: this._getOVm(),
      cacheKey: sCK,
      guid: sGuid,
      fibra: sFibra,
      role: sRole,
      status: sStatus
    });
  }

  function _buildHeader4FromMmct00(sCat) {
    var a00 = sCat ? (this._cfgForScreen(sCat, "00") || []) : [];
    var aRaw = a00.filter(function (f) { return !!(f && f.testata2); })
      .sort(function (a, b) { return ((a && a.order != null) ? a.order : 9999) - ((b && b.order != null) ? b.order : 9999); });
    var seen = {};
    return {
      s00: a00,
      hdr4: aRaw.filter(function (f) {
        var ui = String(f && (f.ui || f.UiFieldname || f.UIFIELDNAME) || "").trim();
        if (!ui) return false;
        var k = ui.toUpperCase();
        if (seen[k]) return false;
        seen[k] = true;
        return true;
      })
    };
  }

  function _refreshHeader4Fields() {
    var oD = this.getView().getModel("detail");
    var aHdr = oD.getProperty("/_mmct/hdr4") || [];
    var oRec = oD.getProperty("/_mmct/rec") || {};
    var r0 = (oD.getProperty("/RowsAll") || [])[0] || {};
    function gv(k) {
      if (oRec[k] != null && oRec[k] !== "") return oRec[k];
      if (r0[k] != null && r0[k] !== "") return r0[k];
      return "";
    }
    oD.setProperty("/Header4Fields", aHdr.slice()
      .sort(function (a, b) { return (a.order ?? 9999) - (b.order ?? 9999); })
      .map(function (f) {
        var k = String(f.ui || "").trim();
        return { key: k, label: f.label || k, value: N.valToText(gv(k)) };
      })
      .filter(function (x) { return x.key.toUpperCase() !== "FORNITORE"; }));
  }

  function _loadSelectedRecordRows(fnDone) {
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
  }

  function _applySelectedRecordToDetail(aAllRows, aRecords, sKey, fnDone) {
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
  }

  function _refreshAfterBackendSaveInPlace() {
    var self = this;
    this._loadSelectedRecordRows(function () {
      self._bindRowsAndColumns();
    });
  }

  function _resolveOrSynthRowsForGuid(sGuid, oRec, oSel, aAllRows, sKey) {
    return Screen4DetailUtil.resolveOrSynthRowsForGuid({
      guid: sGuid,
      record: oRec,
      selectedParent: oSel,
      allRows: aAllRows,
      cacheKey: sKey,
      vmModel: this._getOVm()
    });
  }

  function _applyGroupStatusAndPerms(aSelected, oVm, oD) {
    return Screen4DetailUtil.applyGroupStatusAndPerms({
      selectedRows: aSelected,
      vmModel: oVm,
      detailModel: oD
    });
  }

  function _resolveCatForSelection(aSelected, oRec, oSel, aAllRows, aRecords) {
    return Screen4DetailUtil.resolveCatForSelection({
      selectedRows: aSelected,
      record: oRec,
      selectedParent: oSel,
      allRows: aAllRows,
      records: aRecords
    });
  }

  function _resolveCfg02ForSelection(sCat, aSelected, oRec, oSel, aAllRows, aRecords) {
    return Screen4DetailUtil.resolveCfg02ForSelection({
      cat: sCat,
      selectedRows: aSelected,
      record: oRec,
      allRows: aAllRows,
      records: aRecords,
      cfgForScreenFn: this._cfgForScreen.bind(this)
    });
  }

  function _applyCfg02NormalizationToRows(aSelected, aCfg02) {
    return Screen4DetailUtil.applyCfg02NormalizationToRows({
      selectedRows: aSelected,
      cfg02: aCfg02,
      toArrayMultiFn: this._toArrayMulti.bind(this)
    });
  }

  function _getSelectedRowObjects() {
    return Screen4RowsUtil.getSelectedRowObjects({ table: this.byId("mdcTable4") });
  }

  return {
    onInit: onInit,
    onExit: onExit,
    _onRouteMatched: _onRouteMatched,
    _getDataCacheKey: _getDataCacheKey,
    _cfgForScreen: _cfgForScreen,
    _domainHasValues: _domainHasValues,
    _markDirty: _markDirty,
    _syncAttachmentCounters: _syncAttachmentCounters,
    _startAttachmentSyncPolling: _startAttachmentSyncPolling,
    _stopAttachmentSyncPolling: _stopAttachmentSyncPolling,
    _hookDirtyOnEdit: _hookDirtyOnEdit,
    _checkRowDirtyRevert: _checkRowDirtyRevert,
    _updateVmRecordStatus: _updateVmRecordStatus,
    _buildHeader4FromMmct00: _buildHeader4FromMmct00,
    _refreshHeader4Fields: _refreshHeader4Fields,
    _loadSelectedRecordRows: _loadSelectedRecordRows,
    _applySelectedRecordToDetail: _applySelectedRecordToDetail,
    _refreshAfterBackendSaveInPlace: _refreshAfterBackendSaveInPlace,
    _resolveOrSynthRowsForGuid: _resolveOrSynthRowsForGuid,
    _applyGroupStatusAndPerms: _applyGroupStatusAndPerms,
    _resolveCatForSelection: _resolveCatForSelection,
    _resolveCfg02ForSelection: _resolveCfg02ForSelection,
    _applyCfg02NormalizationToRows: _applyCfg02NormalizationToRows,
    _getSelectedRowObjects: _getSelectedRowObjects
  };
});
