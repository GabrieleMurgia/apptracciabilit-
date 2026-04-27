sap.ui.define([
  "sap/ui/model/json/JSONModel",
  "apptracciabilita/apptracciabilita/util/vmModelPaths",
  "apptracciabilita/apptracciabilita/util/mdcTableUtil",
  "apptracciabilita/apptracciabilita/util/dataLoaderUtil",
  "apptracciabilita/apptracciabilita/util/screen3BindingUtil",
  "apptracciabilita/apptracciabilita/util/screenFlowStateUtil"
], function (
  JSONModel,
  VmPaths,
  MdcTableUtil,
  DataLoaderUtil,
  Screen3BindingUtil,
  ScreenFlowStateUtil
) {
  "use strict";

  function onInit() {
    var oVm = this._getOVm();
    oVm.setProperty("/mdcCfg/screen3", { modelName: "detail", collectionPath: "/Records", properties: [] });

    this._log("onInit");
    this.getOwnerComponent().getRouter().getRoute("Screen3").attachPatternMatched(this._onRouteMatched, this);

    this.getView().setModel(new JSONModel({ showHeaderFilters: false, showHeaderSort: true }), "ui");
    this.getView().setModel(new JSONModel({
      Header3Fields: [], VendorId: "", Material: "",
      RecordsAll: [], Records: [], RecordsCount: 0,
      _mmct: { cat: "", s01: [], s02: [] }, OpenOda: "",
      __q: "", __statusFilter: "",
      __canEdit: false, __canAddRow: false, __canCopyRow: false, __canDeleteRow: false, __canApprove: false, __canReject: false,
      __noMatListMode: false
    }), "detail");

    this._snapshotRecords = null;
    this._originalSnapshot = null;
    this._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {}, filterInputs: {}, headerTitles: {}, headerRows: {}, headerBoxes: {} };

    setTimeout(function () { this._logTable("TABLE STATE @ after onInit"); }.bind(this), 0);
  }

  function _onRouteMatched(oEvent) {
    var oArgs = oEvent.getParameter("arguments") || {};
    this._sMode = oArgs.mode || "A";
    this._sVendorId = decodeURIComponent(oArgs.vendorId || "");
    this._sMaterial = decodeURIComponent(oArgs.material || "");
    this._sSeason = decodeURIComponent(oArgs.season || "");

    var oVmNM = this.getOwnerComponent().getModel("vm");
    var oNoMatListCtx = ScreenFlowStateUtil.getNoMatListContext(oVmNM);
    this._bNoMatListMode = oNoMatListCtx.enabled;
    this._sNoMatListCat = oNoMatListCtx.catMateriale;
    ScreenFlowStateUtil.setCurrentSeason(oVmNM, this._sSeason || "");
    if (this._bNoMatListMode) {
      this._log("NoMatList MODE attivo -> mostro anche template, add/copy/delete disabilitati, filtro per categoria:", this._sNoMatListCat);
    }

    var self = this;
    this._ensureUserInfosLoaded().then(function () {
      self._log("_onRouteMatched args", oArgs);

      var oVm = self.getOwnerComponent().getModel("vm");
      var bReturningFromS4 = ScreenFlowStateUtil.shouldSkipScreen3BackendOnce(oVm);
      var bForceCacheReload = ScreenFlowStateUtil.shouldForceScreen3CacheReload(oVm);

      var aSavedSnapshot = (bReturningFromS4 && self._snapshotRecords && !bForceCacheReload)
        ? self._snapshotRecords
        : null;

      if (bForceCacheReload) {
        self._snapshotRecords = null;
        self._originalSnapshot = null;
        ScreenFlowStateUtil.consumeForceScreen3CacheReload(oVm);
      } else {
        self._snapshotRecords = null;
        if (!bReturningFromS4) {
          self._originalSnapshot = null;
        }
      }

      var oUi = self.getView().getModel("ui");
      if (oUi) {
        oUi.setProperty("/showHeaderFilters", false);
        oUi.setProperty("/showHeaderSort", true);
      }

      var oDetail = self._getODetail();
      oDetail.setData({
        Header3Fields: [], VendorId: self._sVendorId, Material: self._sMaterial,
        RecordsAll: [], Records: [], RecordsCount: 0,
        _mmct: { cat: "", s01: [], s02: [] }, __q: "", __statusFilter: "",
        __noMatListMode: !!self._bNoMatListMode
      }, true);

      var sOpenCache = self._readOpenOdaFromMatInfoCache();
      if (sOpenCache) {
        oDetail.setProperty("/OpenOda", sOpenCache);
      }

      self._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {}, filterInputs: {}, headerTitles: {}, headerRows: {}, headerBoxes: {} };
      var oInp = self.byId("inputFilter3");
      if (oInp && oInp.setValue) {
        oInp.setValue("");
      }

      self._logTable("TABLE STATE @ before _loadDataOnce");
      self._loadDataOnce(aSavedSnapshot);
    });
  }

  function _readOpenOdaFromMatInfoCache() {
    try {
      var oVm = this.getOwnerComponent().getModel("vm");
      if (!oVm) return "";
      var sKey = "MATINFO|" + String(this._sVendorId) + "|" + String(this._sMaterial);
      var oInfo = oVm.getProperty(VmPaths.recordsByKeyPath(sKey));
      var v = oInfo && oInfo.open;
      v = String(v == null ? "" : v).trim().toUpperCase();
      return (v === "X") ? "X" : "";
    } catch (e) {
      console.debug("[Screen3] suppressed error", e);
      return "";
    }
  }

  function _loadDataOnce(aSavedSnapshot) {
    return Screen3BindingUtil.loadDataOnce({
      vmModel: this._getOVm(),
      cacheKey: this._getExportCacheKey(),
      savedSnapshot: aSavedSnapshot,
      consumeSkipBackendFn: ScreenFlowStateUtil.consumeSkipScreen3BackendOnce,
      bindFromCacheFn: this._bindFromCache.bind(this),
      reloadDataFromBackendFn: this._reloadDataFromBackend.bind(this),
      bindFromBackendFn: this._bindFromBackend.bind(this),
      logFn: this._log.bind(this),
      nextLoadTokenFn: function () {
        this._loadToken = (this._loadToken || 0) + 1;
        return this._loadToken;
      }.bind(this),
      getLoadTokenFn: function () { return this._loadToken; }.bind(this)
    });
  }

  function _bindFromCache(aRows, sKey, bSkip, aSavedSnapshot) {
    return Screen3BindingUtil.bindFromCache({
      rows: aRows,
      cacheKey: sKey,
      skip: bSkip,
      savedSnapshot: aSavedSnapshot,
      noMatListMode: !!this._bNoMatListMode,
      detailModel: this._getODetail(),
      vmModel: this._getOVm(),
      logFn: this._log.bind(this),
      bindRecordsFn: this._bindRecords.bind(this),
      setKeepOriginalSnapshotFn: function (bKeep) { this._bKeepOriginalSnapshot = bKeep; }.bind(this),
      setSnapshotRecordsFn: function (aSnapshot) { this._snapshotRecords = aSnapshot; }.bind(this)
    });
  }

  function _bindFromBackend(aResults, sKey) {
    return Screen3BindingUtil.bindFromBackend({
      rows: aResults,
      cacheKey: sKey,
      noMatListMode: !!this._bNoMatListMode,
      detailModel: this._getODetail(),
      vmModel: this._getOVm(),
      logFn: this._log.bind(this),
      bindRecordsFn: this._bindRecords.bind(this)
    });
  }

  function _applySnapshotStatusAndNotes(aSavedSnapshot, aRows) {
    return Screen3BindingUtil.applySnapshotStatusAndNotes({
      snapshot: aSavedSnapshot,
      rows: aRows
    });
  }

  function _excludeTemplatesByRawRows(aRecs, aRows) {
    return Screen3BindingUtil.excludeTemplatesByRawRows({
      records: aRecs,
      rows: aRows
    });
  }

  function _reloadDataFromBackend(fnDone) {
    var oVm = this.getOwnerComponent().getModel("vm");
    var sUserId = (oVm && oVm.getProperty("/userId")) || "";
    var sVendor10 = String(this._sVendorId || "").trim();
    if (/^\d+$/.test(sVendor10) && sVendor10.length < 10) {
      sVendor10 = ("0000000000" + sVendor10).slice(-10);
    }

    var oFilterOpts = {
      userId: sUserId,
      vendorId: this._sVendorId,
      material: this._sMaterial,
      season: this._sSeason
    };
    var oFilterOptsVB = {
      userId: sUserId,
      vendorId: this._sVendorId,
      material: this._sMaterial,
      season: this._sSeason
    };
    if (this._bNoMatListMode && this._sNoMatListCat) {
      oFilterOpts.catMateriale = this._sNoMatListCat;
    }

    DataLoaderUtil.reloadDataFromBackend({
      oModel: this.getOwnerComponent().getModel(),
      filters: DataLoaderUtil.buildCommonFilters(oFilterOpts),
      filtersVendorBatch: DataLoaderUtil.buildCommonFilters(oFilterOptsVB),
      vendor10: sVendor10,
      oVmCache: this._getOVm(),
      onDone: fnDone
    });
  }

  function _getSelectedParentObjectsFromMdc() {
    return MdcTableUtil.getSelectedObjectsFromMdc(this.byId(this.PARENT_TABLE_ID), "detail");
  }

  function _clearSelectionMdc() {
    MdcTableUtil.clearSelectionMdc(this.byId(this.PARENT_TABLE_ID));
  }

  function _selectFirstRowMdc() {
    MdcTableUtil.selectFirstRowMdc(this.byId(this.PARENT_TABLE_ID));
  }

  return {
    onInit: onInit,
    _onRouteMatched: _onRouteMatched,
    _readOpenOdaFromMatInfoCache: _readOpenOdaFromMatInfoCache,
    _loadDataOnce: _loadDataOnce,
    _bindFromCache: _bindFromCache,
    _bindFromBackend: _bindFromBackend,
    _applySnapshotStatusAndNotes: _applySnapshotStatusAndNotes,
    _excludeTemplatesByRawRows: _excludeTemplatesByRawRows,
    _reloadDataFromBackend: _reloadDataFromBackend,
    _getSelectedParentObjectsFromMdc: _getSelectedParentObjectsFromMdc,
    _clearSelectionMdc: _clearSelectionMdc,
    _selectFirstRowMdc: _selectFirstRowMdc
  };
});
