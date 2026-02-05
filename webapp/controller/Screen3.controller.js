sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/routing/History",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/core/BusyIndicator",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/Button",
  "sap/ui/mdc/table/Column",
  "sap/m/HBox",
  "sap/m/Text",
  "sap/m/ObjectStatus",
  "sap/m/Input",
  "sap/m/ComboBox",
  "sap/m/MultiComboBox",
  "sap/ui/core/Item",
  "sap/ui/mdc/p13n/StateUtil",
  "apptracciabilita/apptracciabilita/util/mockData",
  "sap/m/VBox",
  "sap/ui/export/Spreadsheet",
  "sap/ui/export/library",
  "sap/m/Dialog",
  "sap/m/MessagePage",

  // ===== UTIL =====
  "apptracciabilita/apptracciabilita/util/common",
  "apptracciabilita/apptracciabilita/util/vmCache",
  "apptracciabilita/apptracciabilita/util/domains",
  "apptracciabilita/apptracciabilita/util/statusUtil",
  "apptracciabilita/apptracciabilita/util/mmctUtil",
  "apptracciabilita/apptracciabilita/util/mdcTableUtil",
  "apptracciabilita/apptracciabilita/util/p13nUtil",
  "apptracciabilita/apptracciabilita/util/cellTemplateUtil",
  // ===== NEW UTIL =====
  "apptracciabilita/apptracciabilita/util/postUtil",
  "apptracciabilita/apptracciabilita/util/rowErrorUtil",
  "apptracciabilita/apptracciabilita/util/exportUtil",
  "apptracciabilita/apptracciabilita/util/recordsUtil"
], function (
  Controller,
  History,
  JSONModel,
  Filter,
  FilterOperator,
  BusyIndicator,
  MessageToast,
  MessageBox,
  Button,
  MdcColumn,
  HBox,
  Text,
  ObjectStatus,
  Input,
  ComboBox,
  MultiComboBox,
  Item,
  StateUtil,
  MockData,
  VBox,
  Spreadsheet,
  exportLibrary,
  Dialog,
  MessagePage,

  // ===== UTIL =====
  Common,
  VmCache,
  Domains,
  StatusUtil,
  MmctUtil,
  MdcTableUtil,
  P13nUtil,
  CellTemplateUtil,
  // ===== NEW UTIL =====
  PostUtil,
  RowErrorUtil,
  ExportUtil,
  RecordsUtil
) {

  "use strict";

  var EdmType = exportLibrary.EdmType;
  var ts = Common.ts;
  var deepClone = Common.deepClone;

  return Controller.extend("apptracciabilita.apptracciabilita.controller.Screen3", {

    // =========================
    // COSTANTI
    // =========================
    PARENT_TABLE_ID: "mdcTable3",

    // =========================
    // INIT
    // =========================
    onInit: function () {
      this._log("onInit");

      var oRouter = this.getOwnerComponent().getRouter();
      oRouter.getRoute("Screen3").attachPatternMatched(this._onRouteMatched, this);

      this.getView().setModel(new JSONModel({
        showHeaderFilters: false,
        showHeaderSort: true
      }), "ui");

      var oDetail = new JSONModel({
        Header3Fields: [],
        VendorId: "",
        Material: "",
        RecordsAll: [],
        Records: [],
        RecordsCount: 0,
        _mmct: { cat: "", s01: [], s02: [] },
        OpenOda: "",

        __q: "",
        __statusFilter: "",
        __canEdit: false,
        __canAddRow: false,
        __canApprove: false,
        __canReject: false
      });
      this.getView().setModel(oDetail, "detail");

      this._snapshotRecords = null;

      this._inlineFS = {
        filters: {},
        sort: { key: "", desc: false },
        sortBtns: {},
        filterInputs: {},
        headerTitles: {},
        headerRows: {},
        headerBoxes: {}
      };

      setTimeout(function () {
        this._logTable("TABLE STATE @ after onInit");
      }.bind(this), 0);
    },

    // =========================
    // DELEGHE A UTIL - PostUtil
    // =========================
    _normEsito: function (v) { return PostUtil.normEsito(v); },
    _normMsg: function (o) { return PostUtil.normMsg(o); },
    _normalizeVendor10: function (v) { return PostUtil.normalizeVendor10(v); },
    _readODataError: function (oError) { return PostUtil.readODataError(oError); },
    _extractPostResponseLines: function (oData) { return PostUtil.extractPostResponseLines(oData); },
    uuidv4: function () { return PostUtil.uuidv4(); },
    _genGuidNew: function () { return PostUtil.genGuidNew(); },
    _getMultiFieldsMap: function () { return PostUtil.getMultiFieldsMap(this.getView().getModel("detail")); },
    _normalizeMultiString: function (v, sSepOut) { return PostUtil.normalizeMultiString(v, sSepOut); },
    _getCodAgg: function (o) { return PostUtil.getCodAgg(o); },
    _isBaseCodAgg: function (o) { return PostUtil.isBaseCodAgg(o); },
    _isTemplateRow: function (o) { return PostUtil.isTemplateRow(o); },
    _isEmptyRequiredValue: function (v) { return PostUtil.isEmptyRequiredValue(v); },
    _getRequiredMapFromMmct: function () { return PostUtil.getRequiredMapFromMmct(this.getView().getModel("detail")); },
    _showPostErrorMessagePage: function (aErrLines) { PostUtil.showPostErrorMessagePage(aErrLines); },

    _stashDeleteForPostFromCache: function (oParent, aRowsCache, oDetail) {
      PostUtil.stashDeleteForPostFromCache(oParent, aRowsCache, oDetail, {
        toStableString: this._toStableString.bind(this),
        rowGuidKey: this._rowGuidKey.bind(this)
      });
    },

    _formatIncomingRowsMultiSeparators: function (aRows) {
      var mMulti = this._getMultiFieldsMap();
      PostUtil.formatIncomingRowsMultiSeparators(aRows, mMulti);
    },

    // =========================
    // DELEGHE A UTIL - RowErrorUtil
    // =========================
    _syncPropToRecordsAllByIdx: function (oRow, sProp, vVal) {
      RowErrorUtil.syncPropToRecordsAllByIdx(this.getView().getModel("detail"), oRow, sProp, vVal);
    },

    _clearPostErrorByContext: function (oCtx) {
      var self = this;
      RowErrorUtil.clearPostErrorByContext(oCtx, {
        oDetail: this.getView().getModel("detail"),
        updateRowStyles: function () {
          var oTbl = self.byId("mdcTable3");
          var oInner = self._getInnerTableFromMdc(oTbl);
          self._updatePostErrorRowStyles(oInner);
        }
      });
    },

    _updatePostErrorRowStyles: function (oInner) {
      var self = this;
      RowErrorUtil.updatePostErrorRowStyles(oInner, {
        oDetail: this.getView().getModel("detail"),
        updateRowStyles: function () {
          self._updatePostErrorRowStyles(oInner);
        }
      });
    },

    _ensurePostErrorRowHooks: function (oMdcTbl) {
      var self = this;
      RowErrorUtil.ensurePostErrorRowHooks(oMdcTbl, {
        oDetail: this.getView().getModel("detail"),
        getInnerTableFromMdc: this._getInnerTableFromMdc.bind(this),
        updateRowStyles: function () {
          var oInner = self._getInnerTableFromMdc(oMdcTbl);
          self._updatePostErrorRowStyles(oInner);
        }
      });
    },

    _markRowsWithPostErrors: function (aRespLines) {
      var self = this;
      RowErrorUtil.markRowsWithPostErrors(aRespLines, {
        oDetail: this.getView().getModel("detail"),
        toStableString: this._toStableString.bind(this),
        applyClientFilters: this._applyClientFilters.bind(this),
        ensurePostErrorRowHooks: function () {
          var oTbl = self.byId("mdcTable3");
          self._ensurePostErrorRowHooks(oTbl);
          self._updatePostErrorRowStyles(self._getInnerTableFromMdc(oTbl));
        }
      });
    },

    // =========================
    // DELEGHE A UTIL - RecordsUtil
    // =========================
    _rowGuidKey: function (r) { return RecordsUtil.rowGuidKey(r); },
    _rowFibra: function (r) { return RecordsUtil.rowFibra(r); },
    _statusText: function (sCode) { return RecordsUtil.statusText(sCode); },
    _toArrayMulti: function (v) { return RecordsUtil.toArrayMulti(v); },

    _computeOpenOdaFromRows: function (aRows) {
      return RecordsUtil.computeOpenOdaFromRows(aRows);
    },

    _refreshHeader3Fields: function () {
      RecordsUtil.refreshHeader3Fields(this.getView().getModel("detail"));
      this._log("_refreshHeader3Fields done");
    },

    _hasUnsavedChanges: function () {
      return RecordsUtil.hasUnsavedChanges(this.getView().getModel("detail"), this._snapshotRecords);
    },

    _buildRecords01: function (aAllRows) {
      return RecordsUtil.buildRecords01(aAllRows, {
        oDetail: this.getView().getModel("detail"),
        oVm: this.getOwnerComponent().getModel("vm")
      });
    },

    // =========================
    // DELEGHE A UTIL - ExportUtil
    // =========================
    _buildExportColumnsComplete: function () {
      return ExportUtil.buildExportColumnsComplete(this.getView().getModel("detail"));
    },

    _mapRawRowToExportObject: function (r, aColumns) {
      return ExportUtil.mapRawRowToExportObject(r, aColumns, {
        oVm: this.getOwnerComponent().getModel("vm"),
        vendorId: this._sVendorId,
        material: this._sMaterial,
        statusText: this._statusText.bind(this)
      });
    },

    _deriveRowStatusForExport: function (r) {
      return StatusUtil.normStatoRow(r, this.getOwnerComponent().getModel("vm"));
    },

    _applyExportClientFiltersAndSort: function (aData) {
      return ExportUtil.applyExportClientFiltersAndSort(aData, {
        oDetail: this.getView().getModel("detail"),
        inlineFS: this._inlineFS
      });
    },

    onExportExcel: async function () {
      await ExportUtil.exportExcel({
        oVm: this.getOwnerComponent().getModel("vm"),
        oDetail: this.getView().getModel("detail"),
        toStableString: this._toStableString.bind(this),
        statusText: this._statusText.bind(this),
        inlineFS: this._inlineFS,
        vendorId: this._sVendorId,
        material: this._sMaterial,
        cacheKey: this._getExportCacheKey()
      });
    },

    // =========================
    // DELEGHE A UTIL - Common
    // =========================
    _toStableString: function (v) { return Common.toStableString(v); },
    _valToText: function (v) { return Common.valToText(v); },

    // =========================
    // DELEGHE A UTIL - StatusUtil
    // =========================
    _getApprovedFlag: function (r) { return StatusUtil.getApprovedFlag(r); },

    // =========================
    // DELEGHE A UTIL - MmctUtil
    // =========================
    _getSettingFlags: function (c) { return MmctUtil.getSettingFlags(c); },
    _isMultipleField: function (c) { return MmctUtil.isMultipleField(c); },
    _isX: function (v) { return MmctUtil.isX(v); },
    _parseOrder: function (c) { return MmctUtil.parseOrder(c); },

    // =========================
    // DELEGHE A UTIL - Domains
    // =========================
    _domainHasValues: function (sDomain) {
      return Domains.domainHasValues(this.getOwnerComponent(), sDomain);
    },

    // =========================
    // DELEGHE A UTIL - VmCache
    // =========================
    _getCacheKeySafe: function () {
      return VmCache.getCacheKeySafe(this._sVendorId, this._sMaterial);
    },

    _ensureVmCache: function () {
      return VmCache.ensureVmCache(this.getOwnerComponent());
    },

    // =========================
    // DELEGHE A UTIL - MdcTableUtil
    // =========================
    _getInnerTableFromMdc: function (oMdcTbl) {
      return MdcTableUtil.getInnerTableFromMdc(oMdcTbl);
    },

    _getCustomDataValue: function (oCtrl, sKey) {
      return MdcTableUtil.getCustomDataValue(oCtrl, sKey);
    },

    _getSelectedParentObjectsFromMdc: function () {
      var oMdc = this.byId(this.PARENT_TABLE_ID);
      return MdcTableUtil.getSelectedObjectsFromMdc(oMdc, "detail");
    },

    _clearSelectionMdc: function () {
      var oMdc = this.byId(this.PARENT_TABLE_ID);
      MdcTableUtil.clearSelectionMdc(oMdc);
    },

    _selectFirstRowMdc: function () {
      var oMdc = this.byId(this.PARENT_TABLE_ID);
      MdcTableUtil.selectFirstRowMdc(oMdc);
    },

    _refreshInlineSortIcons: function () {
      MdcTableUtil.refreshInlineSortIcons(this._inlineFS);
    },

    _resetInlineHeaderControls: function () {
      this._inlineFS = MdcTableUtil.ensureInlineFS(this._inlineFS);
      MdcTableUtil.resetInlineHeaderControls(this._inlineFS);
    },

    _setInnerHeaderHeight: function (oMdcTbl) {
      try {
        var oUi = this.getView().getModel("ui");
        var bShowFilters = !!(oUi && oUi.getProperty("/showHeaderFilters"));
        MdcTableUtil.setInnerHeaderHeight(oMdcTbl, bShowFilters);
      } catch (e) { }
    },

    _applyInlineHeaderFilterSort: async function (oMdcTbl) {
      this._inlineFS = MdcTableUtil.ensureInlineFS(this._inlineFS);
      return MdcTableUtil.applyInlineHeaderFilterSort(oMdcTbl, {
        view: this.getView(),
        inlineFS: this._inlineFS,
        applyClientFilters: this._applyClientFilters.bind(this),
        log: this._log.bind(this)
      });
    },

    // =========================
    // DELEGHE A UTIL - P13nUtil
    // =========================
    _forceP13nAllVisible: async function (oTbl, reason) {
      return P13nUtil.forceP13nAllVisible(oTbl, StateUtil, this._log.bind(this), reason);
    },

    // =========================
    // DELEGHE A UTIL - CellTemplateUtil
    // =========================
    _createCellTemplate: function (sKey, oMeta) {
      return CellTemplateUtil.createCellTemplate(sKey, oMeta, {
        view: this.getView(),
        domainHasValuesFn: this._domainHasValues.bind(this),
        hookDirtyOnEditFn: this._hookDirtyOnEdit.bind(this)
      });
    },

    _hookDirtyOnEdit: function (oCtrl) {
      return CellTemplateUtil.hookDirtyOnEdit(oCtrl, {
        view: this.getView(),
        modelName: "detail",
        touchCodAggParentFn: this._touchCodAggParent.bind(this),
        clearPostErrorByContextFn: this._clearPostErrorByContext.bind(this)
      });
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
    // Route
    // =========================
    _onRouteMatched: function (oEvent) {
      var oArgs = oEvent.getParameter("arguments") || {};
      this._sMode = oArgs.mode || "A";
      this._sVendorId = decodeURIComponent(oArgs.vendorId || "");
      this._sMaterial = decodeURIComponent(oArgs.material || "");
      this._sSeason = decodeURIComponent(oArgs.season || "");

      this._log("_onRouteMatched args", oArgs);

      this._snapshotRecords = null;

      var oUi = this.getView().getModel("ui");
      if (oUi) {
        oUi.setProperty("/showHeaderFilters", false);
        oUi.setProperty("/showHeaderSort", true);
      }

      var oDetail = this.getView().getModel("detail");
      oDetail.setData({
        Header3Fields: [],
        VendorId: this._sVendorId,
        Material: this._sMaterial,
        RecordsAll: [],
        Records: [],
        RecordsCount: 0,
        _mmct: { cat: "", s01: [], s02: [] },

        __q: "",
        __statusFilter: ""
      }, true);

      var sOpenCache = this._readOpenOdaFromMatInfoCache();
      if (sOpenCache) {
        oDetail.setProperty("/OpenOda", sOpenCache);
      }

      this._inlineFS = {
        filters: {},
        sort: { key: "", desc: false },
        sortBtns: {},
        filterInputs: {},
        headerTitles: {},
        headerRows: {},
        headerBoxes: {},
      };

      var oInp = this.byId("inputFilter3");
      if (oInp && oInp.setValue) oInp.setValue("");

      this._logTable("TABLE STATE @ before _loadDataOnce");
      this._loadDataOnce();
    },

    // =========================
    // HELPERS
    // =========================
    _readOpenOdaFromMatInfoCache: function () {
      try {
        var oVm = this.getOwnerComponent().getModel("vm");
        if (!oVm) return "";

        var sKey = "MATINFO|" + String(this._sVendorId) + "|" + String(this._sMaterial);
        var oInfo = oVm.getProperty("/cache/recordsByKey/" + sKey);

        var v = oInfo && oInfo.open;
        v = String(v == null ? "" : v).trim().toUpperCase();
        return (v === "X") ? "X" : "";
      } catch (e) {
        return "";
      }
    },

    _isMockS3Enabled: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      return !!(mock && mock.mockS3);
    },

    _getExportCacheKey: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var bMockS3 = !!mock.mockS3;

      var sBaseKey = this._getCacheKeySafe();
      return (bMockS3 ? "MOCK|" : "REAL|") + sBaseKey;
    },

    // =========================
    // BUTTONS HEADER
    // =========================
    onToggleHeaderFilters: function () {
      var oUi = this.getView().getModel("ui");
      if (!oUi) return;

      var bNow = !!oUi.getProperty("/showHeaderFilters");
      oUi.setProperty("/showHeaderFilters", !bNow);

      var oTbl = this.byId("mdcTable3");
      this._setInnerHeaderHeight(oTbl);
      this._applyInlineHeaderFilterSort(oTbl);
    },

    onToggleHeaderSort: function () {
      var oUi = this.getView().getModel("ui");
      if (!oUi) return;

      var bNow = !!oUi.getProperty("/showHeaderSort");
      oUi.setProperty("/showHeaderSort", !bNow);

      var oTbl = this.byId("mdcTable3");
      this._applyInlineHeaderFilterSort(oTbl);
    },

    onOpenColumnFilters: function () {
      this.onToggleHeaderFilters();
    },

    onOpenSort: function () {
      this.onToggleHeaderSort();
    },

    // =========================
    // TOUCH CODAGG PARENT
    // =========================
    _touchCodAggParent: function (p, sPath) {
      if (!p) return;

      var ca = this._getCodAgg(p);
      var isNew = !!p.__isNew || String(p.guidKey || p.Guid || p.GUID || "").indexOf("-new") >= 0;

      if (ca === "N") return;

      var newCa = ca;
      if (isNew) {
        newCa = "I";
      } else if (ca === "" || ca === "I") {
        newCa = "U";
      }

      var parentChanged = (newCa !== ca);
      if (parentChanged) {
        p.CodAgg = newCa;
        if (p.CODAGG !== undefined) delete p.CODAGG;

        try {
          var oDetail = this.getView().getModel("detail");
          if (oDetail) {
            if (sPath && typeof sPath === "string") {
              oDetail.setProperty(sPath + "/CodAgg", p.CodAgg);
            }

            var idx = (p.idx != null) ? parseInt(p.idx, 10) : NaN;
            if (!isNaN(idx)) {
              var aAll = oDetail.getProperty("/RecordsAll") || [];
              for (var i = 0; i < aAll.length; i++) {
                if (parseInt(aAll[i] && aAll[i].idx, 10) === idx) {
                  oDetail.setProperty("/RecordsAll/" + i + "/CodAgg", p.CodAgg);
                  break;
                }
              }
            }
          }
        } catch (e) { }
      }

      var g = this._toStableString(p.guidKey || p.Guid || p.GUID);
      if (!g) return;

      var oVm = this._ensureVmCache();
      var sKey = this._getExportCacheKey();
      var aRaw = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || [];
      if (!Array.isArray(aRaw)) aRaw = [];

      var changed = false;

      aRaw.forEach(function (r) {
        if (!r) return;
        if (this._rowGuidKey(r) !== g) return;

        var rc = this._getCodAgg(r);
        var rIsNew = !!r.__isNew || String(r.Guid || r.GUID || r.guidKey || "").indexOf("-new") >= 0;

        if (rc === "N" || rc === "D") return;

        if (rIsNew) {
          if (r.CodAgg !== "I") { r.CodAgg = "I"; changed = true; }
        } else {
          if (rc === "" || rc === "I") {
            if (r.CodAgg !== "U") { r.CodAgg = "U"; changed = true; }
          }
        }

        if (r.CODAGG !== undefined) { delete r.CODAGG; changed = true; }
      }.bind(this));

      if (changed) {
        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aRaw);
      }
    },

    // =========================
    // STATUS CELL TEMPLATE
    // =========================
    _createStatusCellTemplate: function (sKey) {
      var sBindKey = (String(sKey || "").toUpperCase() === "STATO") ? "Stato" : sKey;

      var sStateExpr =
        "{= (${detail>" + sBindKey + "} === '' ? 'Warning' : " +
        "(${detail>" + sBindKey + "} === 'AP' ? 'Success' : " +
        "(${detail>" + sBindKey + "} === 'RJ' ? 'Error' : " +
        "(${detail>" + sBindKey + "} === 'CH' ? 'Information' : " +
        "(${detail>" + sBindKey + "} === 'ST' ? 'Warning' : 'None')))))}";

      return new HBox({
        width: "100%",
        justifyContent: "Center",
        alignItems: "Center",
        items: [
          new ObjectStatus({
            text: "",
            icon: "sap-icon://circle-task",
            state: sStateExpr,
            tooltip: "{= 'Stato: ' + (${detail>" + sBindKey + "} || '') }"
          })
        ]
      });
    },

    // =========================
    // VALIDATE REQUIRED BEFORE POST
    // =========================
    _validateRequiredBeforePost: function () {
      var oDetail = this.getView().getModel("detail");
      var aParents = (oDetail && oDetail.getProperty("/RecordsAll")) || [];
      if (!Array.isArray(aParents)) aParents = [];

      var oVm = this._ensureVmCache();
      var sCacheKey = this._getExportCacheKey();
      var aRawAll = oVm.getProperty("/cache/dataRowsByKey/" + sCacheKey) || [];
      if (!Array.isArray(aRawAll)) aRawAll = [];

      var sKSafe = this._getCacheKeySafe();
      var mAllS4 = oVm.getProperty("/cache/screen4DetailsByKey") || {};
      var mByIdx = (mAllS4 && mAllS4[sKSafe]) ? mAllS4[sKSafe] : {};

      var mGuidByIdxAll = oVm.getProperty("/cache/screen4ParentGuidByIdx") || {};
      var mGuidByIdx = (mGuidByIdxAll && mGuidByIdxAll[sKSafe]) ? mGuidByIdxAll[sKSafe] : {};

      var maps = this._getRequiredMapFromMmct();
      var req01 = maps.req01 || {};
      var req02 = maps.req02 || {};

      var isEmpty = this._isEmptyRequiredValue.bind(this);

      function toStr(v) { return String(v == null ? "" : v).trim(); }

      function uniqNonEmpty(arr) {
        var seen = {};
        var out = [];
        (arr || []).forEach(function (x) {
          x = toStr(x);
          if (!x) return;
          if (seen[x]) return;
          seen[x] = true;
          out.push(x);
        });
        return out;
      }

      function getRowNoFromParent(p, iLoop) {
        var idx = (p && p.idx != null) ? parseInt(p.idx, 10) : NaN;
        if (!isNaN(idx)) return idx + 1;
        return iLoop + 1;
      }

      var mRawByGuid = {};
      (aRawAll || []).forEach(function (r) {
        if (!r) return;

        var ca = this._getCodAgg(r);
        if (ca === "N") return;
        if (ca === "D") return;

        var g = this._rowGuidKey(r);
        g = toStr(g);
        if (!g) return;

        if (!mRawByGuid[g]) mRawByGuid[g] = [];
        mRawByGuid[g].push(r);
      }.bind(this));

      var errors = [];
      var seenErr = {};

      function addErr(pageLabel, rowNo, field, label) {
        var k = pageLabel + "|" + rowNo + "|" + field;
        if (seenErr[k]) return;
        seenErr[k] = true;

        errors.push({
          page: pageLabel,
          scope: pageLabel,
          row: rowNo,
          field: field || "",
          label: label || field || ""
        });
      }

      (aParents || []).forEach(function (p, iLoop) {
        if (!p) return;

        if (this._getCodAgg(p) === "N") return;

        var rowNo = getRowNoFromParent(p, iLoop);

        Object.keys(req01).forEach(function (k) {
          var meta = req01[k] || {};
          var v = p ? p[k] : undefined;
          if (isEmpty(v)) {
            addErr("Pagina corrente", rowNo, k, meta.label || k);
          }
        });

        var iIdx = (p && p.idx != null) ? parseInt(p.idx, 10) : NaN;

        var aDet = [];
        var aDetByIdx = (!isNaN(iIdx) && mByIdx && Array.isArray(mByIdx[String(iIdx)]))
          ? (mByIdx[String(iIdx)] || [])
          : null;

        if (Array.isArray(aDetByIdx) && aDetByIdx.length) {
          aDet = aDetByIdx;
        } else {
          var gParent = this._toStableString(p && (p.guidKey || p.GUID || p.Guid || p.GuidKey));
          var gByIdx = (!isNaN(iIdx) && mGuidByIdx && mGuidByIdx[String(iIdx)])
            ? this._toStableString(mGuidByIdx[String(iIdx)])
            : "";

          var aCandidates = uniqNonEmpty([
            gParent,
            gByIdx,
            p && p.Guid,
            p && p.GUID,
            p && p.guidKey,
            p && p.GuidKey
          ]);

          aCandidates.forEach(function (g) {
            var chunk = mRawByGuid[g];
            if (Array.isArray(chunk) && chunk.length) {
              aDet = aDet.concat(chunk);
            }
          });
        }

        if (!Array.isArray(aDet) || !aDet.length) return;

        aDet.forEach(function (r) {
          Object.keys(req02).forEach(function (k) {
            var meta = req02[k] || {};
            var v = r ? r[k] : undefined;
            if (isEmpty(v)) {
              addErr("Dettaglio", rowNo, k, meta.label || k);
            }
          });
        });

      }.bind(this));

      errors.sort(function (a, b) {
        var ra = a.row || 0;
        var rb = b.row || 0;
        if (ra !== rb) return ra - rb;

        var pa = (a.page === "Pagina corrente") ? 0 : 1;
        var pb = (b.page === "Pagina corrente") ? 0 : 1;
        if (pa !== pb) return pa - pb;

        return String(a.label || "").localeCompare(String(b.label || ""));
      });

      return { ok: errors.length === 0, errors: errors };
    },

    // =========================
    // LOAD DATA
    // =========================
    _loadDataOnce: function () {
      var oVm = this._ensureVmCache();
      var sBaseKey = this._getCacheKeySafe();

      var bMockS3 = this._isMockS3Enabled();
      var sKey = (bMockS3 ? "MOCK|" : "REAL|") + sBaseKey;

      var aRows = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || null;
      var aRecs = oVm.getProperty("/cache/recordsByKey/" + sKey) || null;

      var bSkipBackendOnce = !!oVm.getProperty("/__skipS3BackendOnce");
      if (bSkipBackendOnce) {
        oVm.setProperty("/__skipS3BackendOnce", false);
      }

      var bHasCache = Array.isArray(aRows) && aRows.length && Array.isArray(aRecs) && aRecs.length;

      if (bHasCache) {
        try {
          this._hydrateMmctFromRows(aRows);
          this._formatIncomingRowsMultiSeparators(aRows);
          oVm.setProperty("/cache/dataRowsByKey/" + sKey, aRows);

          var mTplGuid = {};
          (aRows || []).forEach(function (r) {
            if (this._getCodAgg(r) === "N") mTplGuid[this._rowGuidKey(r)] = true;
          }.bind(this));

          aRecs = (aRecs || []).filter(function (rec) {
            var g = this._toStableString(rec && (rec.guidKey || rec.GUID || rec.Guid));
            return !mTplGuid[g];
          }.bind(this));
          oVm.setProperty("/cache/recordsByKey/" + sKey, aRecs);

          var oDetailC = this.getView().getModel("detail");
          var resC = this._computeOpenOdaFromRows(aRows);
          if (resC.hasSignalProp) oDetailC.setProperty("/OpenOda", resC.flag);

          this._bindRecords(aRecs);
        } catch (e) {
          console.warn("[S3] cache bind failed", e);
        }
      }

      if (bSkipBackendOnce && bHasCache) {
        this._log("_loadDataOnce: skip backend reload (back from Screen4)", { cacheKey: sKey });
        return;
      }

      this._loadToken = (this._loadToken || 0) + 1;
      var iToken = this._loadToken;

      this._reloadDataFromBackend(function (aResults) {
        if (iToken !== this._loadToken) return;

        this._hydrateMmctFromRows(aResults);
        this._formatIncomingRowsMultiSeparators(aResults);

        var oDetail = this.getView().getModel("detail");
        var res = this._computeOpenOdaFromRows(aResults);
        if (res.hasSignalProp) oDetail.setProperty("/OpenOda", res.flag);

        var aRecordsBuilt = this._buildRecords01(aResults);

        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aResults);
        oVm.setProperty("/cache/recordsByKey/" + sKey, aRecordsBuilt);

        this._bindRecords(aRecordsBuilt);
      }.bind(this));
    },

    // =========================
    // MMCT
    // =========================
    _getMmctCfgForCat: function (sCat) {
      var oVm = this.getOwnerComponent().getModel("vm");
      return MmctUtil.getMmctCfgForCat(oVm, sCat);
    },

    _cfgForScreen: function (sCat, sScreen) {
      var oVm = this.getOwnerComponent().getModel("vm");
      return MmctUtil.cfgForScreen(oVm, sCat, sScreen);
    },

    _hydrateMmctFromRows: function (aRows) {
      var r0 = (Array.isArray(aRows) && aRows.length)
        ? ((aRows.find(function (r) { return this._getCodAgg(r) !== "N"; }.bind(this))) || (aRows[0] || {}))
        : {};
      var sCat = String(r0.CatMateriale || "").trim();

      var oDetail = this.getView().getModel("detail");

      var a00All = sCat ? this._cfgForScreen(sCat, "00") : [];
      var aHdr3 = (a00All || [])
        .filter(function (f) { return !!(f && f.testata1); })
        .filter(function (f) { return String(f.ui || "").trim().toUpperCase() !== "FORNITORE"; });

      var a01All = sCat ? this._cfgForScreen(sCat, "01") : [];
      var a01Table = (a01All || [])
        .filter(function (f) { return !(f && f.testata1); });

      var a02All = sCat ? this._cfgForScreen(sCat, "02") : [];

      oDetail.setProperty("/_mmct", {
        cat: sCat,
        raw0: r0,

        s00: a00All,
        hdr3: aHdr3,

        s01: a01All,
        s01Table: a01Table,

        s02: a02All
      });

      this._log("_hydrateMmctFromRows", {
        cat: sCat,
        s00All: a00All.length,
        hdr3: aHdr3.length,
        s01All: a01All.length,
        s01Table: a01Table.length,
        s02All: a02All.length
      });
    },

    // =========================
    // ODATA / MOCK
    // =========================
    _buildCommonFilters: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      var sUserId = (oVm && oVm.getProperty("/userId")) || "E_ZEMAF";

      var sVendor10 = String(this._sVendorId || "").trim();
      if (/^\d+$/.test(sVendor10) && sVendor10.length < 10) {
        sVendor10 = ("0000000000" + sVendor10).slice(-10);
      }

      var sSeason = String(this._sSeason || "").trim();

      function norm(v) { return String(v || "").trim().toUpperCase(); }
      var sRouteMat = norm(this._sMaterial);

      var set = {};
      function add(x) { x = norm(x); if (x) set[x] = true; }
      add(sRouteMat);
      if (sRouteMat && sRouteMat.slice(-1) !== "S") add(sRouteMat + "S");
      if (sRouteMat && sRouteMat.slice(-1) === "S") add(sRouteMat.slice(0, -1));
      var aMatVariants = Object.keys(set);

      var aFilters = [
        new Filter("UserID", FilterOperator.EQ, sUserId),
        new Filter("Fornitore", FilterOperator.EQ, sVendor10)
      ];

      if (sSeason) {
        aFilters.push(new Filter("Stagione", FilterOperator.EQ, sSeason));
      }

      if (aMatVariants.length) {
        var aMatFilters = aMatVariants.map(function (m) {
          return new Filter("Materiale", FilterOperator.EQ, m);
        });
        aFilters.push(new Filter(aMatFilters, false));
      }

      return aFilters;
    },

    _reloadDataFromBackend: function (fnDone) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var sForceStato = String(mock.forceStato || "").trim().toUpperCase();
      var bMockS3 = !!mock.mockS3;

      var sUserId = (oVm && oVm.getProperty("/userId")) || "E_ZEMAF";
      var oODataModel = this.getOwnerComponent().getModel();

      function norm(v) { return String(v || "").trim().toUpperCase(); }
      function done(a) { if (typeof fnDone === "function") fnDone(a || []); }

      if (bMockS3) {
        BusyIndicator.show(0);

        MockData.loadDataSetGeneric().then(function (aAll) {
          BusyIndicator.hide();

          var a = Array.isArray(aAll) ? aAll : [];
          if (sForceStato === "ST" || sForceStato === "AP" || sForceStato === "RJ" || sForceStato === "CH") {
            a.forEach(function (r) { if (r) r.Stato = sForceStato; });
            console.log("[MOCK] forceStato =", sForceStato);
          }

          done(a);
        }).catch(function (e) {
          BusyIndicator.hide();
          console.error("[S3] MOCK loadDataSetGeneric ERROR", e);
          MessageToast.show("MOCK DataSet.json NON CARICATO");
          done([]);
        });

        return;
      }

      var sVendor10 = String(this._sVendorId || "").trim();
      if (/^\d+$/.test(sVendor10) && sVendor10.length < 10) {
        sVendor10 = ("0000000000" + sVendor10).slice(-10);
      }

      BusyIndicator.show(0);

      var aCommonFilters = this._buildCommonFilters();

      var pDataSet = new Promise(function (resolve, reject) {
        oODataModel.read("/DataSet", {
          filters: aCommonFilters,
          urlParameters: { "sap-language": "IT" },
          success: function (oData) {
            resolve((oData && oData.results) || []);
          },
          error: reject
        });
      });

      var pVendorBatch = new Promise(function (resolve, reject) {
        oODataModel.read("/VendorBatchSet", {
          filters: aCommonFilters,
          urlParameters: { "$format": "json", "sap-language": "IT" },

          success: function (oData) {
            var results = (oData && oData.results) || [];

            var exclude = ["Fornitore", "Materiale", "Stagione", "__metadata", "UserID"];
            var finalObject = results.reduce(function (acc, item) {
              Object.keys(item).forEach(function (key) {
                if (!exclude.includes(key)) {
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(item[key]);
                }
              });
              return acc;
            }, {});

            function normStr(v) { return String(v == null ? "" : v).trim(); }
            function uniqCaseInsensitive(arr) {
              var seen = {};
              var out = [];
              (arr || []).forEach(function (v) {
                var s = normStr(v);
                if (!s) return;
                var k = s.toUpperCase();
                if (seen[k]) return;
                seen[k] = true;
                out.push(s);
              });
              return out;
            }

            var suggestionsByField = {};
            Object.keys(finalObject || {}).forEach(function (field) {
              var a = uniqCaseInsensitive(finalObject[field]);
              suggestionsByField[field] = a.map(function (v) { return { key: v }; });
            });

            var oVmCache = this._ensureVmCache();
            oVmCache.setProperty("/suggestionsByField", suggestionsByField);
            oVmCache.setProperty("/cache/vendorBatchFinalObjectByVendor/" + sVendor10, finalObject);

            resolve(results);
          }.bind(this),

          error: reject
        });
      }.bind(this));

      Promise.all([pDataSet, pVendorBatch])
        .then(function (res) {
          BusyIndicator.hide();

          var aDataSetRows = res[0];
          var aVendorBatches = res[1];

          if (sForceStato === "ST" || sForceStato === "AP" || sForceStato === "RJ" || sForceStato === "CH") {
            aDataSetRows.forEach(function (r) { if (r) r.Stato = sForceStato; });
          }

          done(aDataSetRows);

          var oVmCache = this._ensureVmCache();
          oVmCache.setProperty(
            "/cache/vendorBatchByVendor/" + sVendor10,
            aVendorBatches
          );

          console.log(
            "[S3] VendorBatchSet cached",
            sVendor10,
            aVendorBatches.length
          );
        }.bind(this))
        .catch(function (oError) {
          BusyIndicator.hide();
          console.error("Errore lettura DataSet o VendorBatchSet", oError);
          MessageToast.show("Errore nel caricamento dei dati");
          done([]);
        });
    },

    // =========================
    // NAV BUTTON (prima colonna)
    // =========================
    onGoToScreen4FromRow: function (oEvent) {
      try {
        var oBtn = oEvent.getSource();
        var oCtx = oBtn && oBtn.getBindingContext && (oBtn.getBindingContext("detail") || oBtn.getBindingContext());
        if (!oCtx) return;

        var oRow = oCtx.getObject && oCtx.getObject();

        var iIdx = (oRow && oRow.idx != null) ? parseInt(oRow.idx, 10) : NaN;
        if (isNaN(iIdx) && oCtx.getPath) {
          var mm = String(oCtx.getPath() || "").match(/\/(\d+)\s*$/);
          if (mm) iIdx = parseInt(mm[1], 10);
        }
        if (isNaN(iIdx) || iIdx < 0) iIdx = 0;

        this._setSelectedParentForScreen4(oRow);
        this._ensureScreen4CacheForParentIdx(iIdx, this._toStableString(oRow.guidKey || oRow.GUID || oRow.Guid));

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

    _readVendorBatchSet: function (sVendor10) {
      var oModel = this.getOwnerComponent().getModel();

      return new Promise(function (resolve, reject) {
        oModel.read("/VendorBatchSet", {
          filters: [
            new Filter("Fornitore", FilterOperator.EQ, sVendor10)
          ],
          urlParameters: {
            "$format": "json",
            "sap-language": "IT"
          },
          success: function (oData) {
            resolve((oData && oData.results) || []);
          },
          error: reject
        });
      }.bind(this));
    },

    // =========================
    // MDC CFG Screen3
    // =========================
    _ensureMdcCfgScreen3: function (aCfg01) {
      var oVm = this.getOwnerComponent().getModel("vm");

      var seen = Object.create(null);
      var aProps = [];

      (aCfg01 || []).forEach(function (f) {
        var name = String(f && f.ui || "").trim();
        if (!name) return;

        if (name.toUpperCase() === "STATO") name = "Stato";

        var k = name.toUpperCase();
        if (seen[k]) return;
        seen[k] = true;

        aProps.push({
          name: name,
          label: f.label || name,
          dataType: "String",
          domain: f.domain || "",
          required: !!f.required
        });
      });

      if (!seen["STATO"]) {
        aProps.unshift({
          name: "Stato",
          label: "Stato",
          dataType: "String",
          domain: "",
          required: false
        });
      }

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

      var seen = Object.create(null);
      var aCfgUnique = (aCfg01 || []).filter(function (f) {
        var ui = String(f && f.ui || "").trim();
        if (!ui) return false;

        if (ui.toUpperCase() === "STATO") return false;

        var k = ui.toUpperCase();
        if (seen[k]) return false;
        seen[k] = true;
        return true;
      });

      oTbl.addColumn(new MdcColumn({
        header: "Dettaglio",
        visible: true,
        width: "100px",
        template: new Button({
          icon: "sap-icon://enter-more",
          type: "Transparent",
          press: this.onGoToScreen4FromRow.bind(this)
        })
      }));

      this._colStatoS3 = new MdcColumn({
        width: "70px",
        header: "Stato",
        visible: true,
        dataProperty: "Stato",
        sortProperty: "Stato",
        filterProperty: "Stato",
        template: this._createStatusCellTemplate("Stato")
      });
      oTbl.addColumn(this._colStatoS3);

      aCfgUnique.forEach(function (f) {
        var sKeyRaw = String(f.ui || "").trim();
        if (!sKeyRaw) return;

        var sKey = sKeyRaw;
        var sHeader = (f.label || sKeyRaw) + (f.required ? " *" : "");

        oTbl.addColumn(new MdcColumn({
          header: sHeader,
          visible: true,
          dataProperty: sKey,
          sortProperty: sKey,
          filterProperty: sKey,
          template: this._createCellTemplate(sKey, f)
        }));
      }.bind(this));
    },

    // =========================
    // FILTER STATUS + TEXT + per-colonna + sort
    // =========================
    _applyClientFilters: function () {
      var oDetail = this.getView().getModel("detail");
      var aAll = oDetail.getProperty("/RecordsAll") || [];

      var q = String(oDetail.getProperty("/__q") || "").trim().toUpperCase();
      var sStatus = String(oDetail.getProperty("/__statusFilter") || "").trim().toUpperCase();

      var aFiltered = (aAll || []).filter(function (r) {
        if (sStatus) {
          var st = String((r && (r.__status || r.Stato)) || "").trim().toUpperCase();
          if (st !== sStatus) return false;
        }

        if (q) {
          var ok = Object.keys(r || {}).some(function (k) {
            if (k === "__metadata" || k === "AllData") return false;
            if (k.indexOf("__") === 0) return false;

            var v = r[k];
            if (v === null || v === undefined) return false;
            if (Array.isArray(v)) v = v.join(", ");
            return String(v).toUpperCase().indexOf(q) >= 0;
          });
          if (!ok) return false;
        }

        return true;
      });

      var mCol = (this._inlineFS && this._inlineFS.filters) || {};
      var aColKeys = Object.keys(mCol).filter(function (k) {
        return String(mCol[k] || "").trim() !== "";
      });

      if (aColKeys.length) {
        aFiltered = aFiltered.filter(function (r) {
          return aColKeys.every(function (k) {
            var wanted = String(mCol[k] || "").trim().toUpperCase();
            if (!wanted) return true;
            var v = (r && r[k] != null) ? r[k] : "";
            if (Array.isArray(v)) v = v.join(", ");
            return String(v).toUpperCase().indexOf(wanted) >= 0;
          });
        });
      }

      var st2 = (this._inlineFS && this._inlineFS.sort) || { key: "", desc: false };
      if (st2.key) {
        var key = st2.key;
        var desc = !!st2.desc;

        aFiltered.sort(function (a, b) {
          var va = (a && a[key] != null) ? a[key] : "";
          var vb = (b && b[key] != null) ? b[key] : "";
          if (Array.isArray(va)) va = va.join(", ");
          if (Array.isArray(vb)) vb = vb.join(", ");
          va = String(va);
          vb = String(vb);

          var cmp = va.localeCompare(vb, undefined, { numeric: true, sensitivity: "base" });
          return desc ? -cmp : cmp;
        });
      }

      oDetail.setProperty("/Records", aFiltered);
      oDetail.setProperty("/RecordsCount", aFiltered.length);

      var oTbl = this.byId("mdcTable3");
      if (oTbl && oTbl.getModel && oTbl.getModel("detail") && typeof oTbl.rebind === "function") {
        oTbl.rebind();
      }
    },

    onStatusFilterPress: function (oEvt) {
      var oSrc = oEvt.getSource();
      var s = this._getCustomDataValue(oSrc, "status");
      s = String(s || "").trim().toUpperCase();

      var oDetail = this.getView().getModel("detail");
      oDetail.setProperty("/__statusFilter", s);

      this._applyClientFilters();
    },

    onGlobalFilter: function (oEvt) {
      var q = String(oEvt.getParameter("value") || "").trim();
      var oDetail = this.getView().getModel("detail");
      oDetail.setProperty("/__q", q);
      this._applyClientFilters();
    },

    _onInlineColFilterLiveChange: function (oEvt) {
      var oInput = oEvt.getSource();
      var sField = oInput && oInput.data && oInput.data("field");
      if (!sField) return;

      var sVal = String(oEvt.getParameter("value") || "");
      if (!this._inlineFS) {
        this._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {}, filterInputs: {}, headerTitles: {}, headerRows: {}, headerBoxes: {} };
      }
      if (!this._inlineFS.filters) this._inlineFS.filters = {};
      this._inlineFS.filters[sField] = sVal;

      this._applyClientFilters();
    },

    _onInlineColSortPress: function (oEvt) {
      var oBtn = oEvt.getSource();
      var sField = oBtn && oBtn.data && oBtn.data("field");
      if (!sField) return;

      if (!this._inlineFS) {
        this._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {}, filterInputs: {}, headerTitles: {}, headerRows: {}, headerBoxes: {} };
      }
      if (!this._inlineFS.sort) this._inlineFS.sort = { key: "", desc: false };

      if (this._inlineFS.sort.key === sField) {
        this._inlineFS.sort.desc = !this._inlineFS.sort.desc;
      } else {
        this._inlineFS.sort.key = sField;
        this._inlineFS.sort.desc = false;
      }

      this._refreshInlineSortIcons();
      this._applyClientFilters();
    },

    // =========================
    // BIND RECORDS
    // =========================
    _bindRecords: async function (aRecords) {
      var oDetail = this.getView().getModel("detail");
      var a = aRecords || [];

      oDetail.setProperty("/RecordsAll", a);
      oDetail.setProperty("/Records", a);
      oDetail.setProperty("/RecordsCount", a.length);

      var oVm = this.getOwnerComponent().getModel("vm");
      var sRole = String((oVm && oVm.getProperty("/userType")) || "").trim().toUpperCase();

      var aSt = a.map(function (r) {
        return String((r && (r.__status || r.Stato)) || "ST").trim().toUpperCase();
      });

      var allAP = aSt.length > 0 && aSt.every(function (s) { return s === "AP"; });
      var anyRJ = aSt.some(function (s) { return s === "RJ"; });
      var anyCH = aSt.some(function (s) { return s === "CH"; });

      var sAgg = allAP ? "AP" : (anyRJ ? "RJ" : (anyCH ? "CH" : "ST"));

      oDetail.setProperty("/__status", sAgg);
      oDetail.setProperty("/__canAddRow", StatusUtil.canAddRow(sRole, sAgg));
      oDetail.setProperty("/__role", sRole);

      this._refreshHeader3Fields();
      this._snapshotRecords = deepClone(a);

      var oTbl = this.byId("mdcTable3");
      var aCfg01Table = oDetail.getProperty("/_mmct/s01Table") || [];
      this._ensureMdcCfgScreen3(aCfg01Table);
      this._resetInlineHeaderControls();
      await this._rebuildColumnsHard(oTbl, aCfg01Table);

      if (oTbl && oTbl.initialized) await oTbl.initialized();
      if (oTbl) oTbl.setModel(oDetail, "detail");

      await this._applyInlineHeaderFilterSort(oTbl);

      this._applyClientFilters();

      if (oTbl && typeof oTbl.rebind === "function") oTbl.rebind();

      await this._forceP13nAllVisible(oTbl, "t0");
      await this._applyInlineHeaderFilterSort(oTbl);

      setTimeout(function () {
        this._forceP13nAllVisible(oTbl, "t300");
        setTimeout(function () { this._applyInlineHeaderFilterSort(oTbl); }.bind(this), 350);
      }.bind(this), 300);

      this._logTable("TABLE STATE @ after _bindRecords");
      this._ensurePostErrorRowHooks(oTbl);
    },

    // =========================
    // TOOLBAR: RESET (header FS)
    // =========================
    onResetFiltersAndSort: function () {
      var oDetail = this.getView().getModel("detail");
      oDetail.setProperty("/__q", "");
      oDetail.setProperty("/__statusFilter", "");

      var oInp = this.byId("inputFilter3");
      if (oInp && oInp.setValue) oInp.setValue("");

      if (!this._inlineFS) {
        this._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {}, filterInputs: {}, headerTitles: {}, headerRows: {}, headerBoxes: {} };
      }
      this._inlineFS.filters = {};
      this._inlineFS.sort = { key: "", desc: false };

      this._refreshInlineSortIcons();
      this._applyClientFilters();

      var oTbl = this.byId("mdcTable3");
      this._applyInlineHeaderFilterSort(oTbl);
      this._setInnerHeaderHeight(oTbl);
    },

    // =========================
    // BOTTONI EXTRA
    // =========================
    onPrint: function () { MessageToast.show("Stampa: TODO"); },

    // =========================
    // ADD/DELETE ROWS (Screen3) - MDC Table
    // =========================
    _pickTemplateGuidForNewParent: function () {
      var aSel = this._getSelectedParentObjectsFromMdc ? this._getSelectedParentObjectsFromMdc() : [];
      if (Array.isArray(aSel) && aSel.length === 1) {
        var gSel = this._toStableString(aSel[0] && (aSel[0].guidKey || aSel[0].GID || aSel[0].GUID || aSel[0].Guid));
        if (gSel) return gSel;
      }

      var oVm = this._ensureVmCache();
      var sKey = this._getExportCacheKey();
      var aRaw = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || [];
      if (!Array.isArray(aRaw)) aRaw = [];

      var rTpl = aRaw.find(function (r) {
        return this._getCodAgg(r) === "N" && this._rowGuidKey(r);
      }.bind(this));

      if (!rTpl) {
        rTpl = aRaw.find(function (r) {
          return this._getCodAgg(r) === "" && this._rowGuidKey(r);
        }.bind(this));
      }

      return rTpl ? this._rowGuidKey(rTpl) : "";
    },

    _getTemplateRowsByGuid: function (guidTpl) {
      var oVm = this._ensureVmCache();
      var sKey = this._getExportCacheKey();
      var aRaw = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || [];
      if (!Array.isArray(aRaw)) aRaw = [];

      var aTpl = aRaw.filter(function (r) {
        return this._rowGuidKey(r) === guidTpl && this._isBaseCodAgg(r);
      }.bind(this));

      if (!aTpl.length) {
        aTpl = aRaw.filter(function (r) {
          return this._rowGuidKey(r) === guidTpl;
        }.bind(this));
      }

      return aTpl;
    },

    _cloneLockedFields: function (src, aCfg, scope) {
      src = src || {};
      var out = {};

      (aCfg || []).forEach(function (f) {
        if (!f || !f.ui) return;
        var k = String(f.ui).trim();
        if (!k) return;
        if (k.toUpperCase() === "STATO") k = "Stato";

        if (f) {
          var v = src[k];
          if (f.multiple) out[k] = this._toArrayMulti(v);
          else out[k] = (v == null ? "" : v);
        } else {
          out[k] = f.multiple ? [] : "";
        }
      }.bind(this));

      return out;
    },

    onAddRow: function () {
      var oDetail = this.getView().getModel("detail");
      if (!oDetail) return MessageToast.show("Model 'detail' non trovato");

      if (!oDetail.getProperty("/__canAddRow")) {
        MessageToast.show("Non hai permessi per aggiungere righe");
        return;
      }

      var aAll = oDetail.getProperty("/RecordsAll") || [];

      var iMax = -1;
      (aAll || []).forEach(function (r) {
        var n = parseInt((r && r.idx) != null ? r.idx : -1, 10);
        if (!isNaN(n) && n > iMax) iMax = n;
      });
      var iNewIdx = iMax + 1;

      var sGuidNew = this._genGuidNew();

      var guidTpl = this._pickTemplateGuidForNewParent();
      var aTplRows = guidTpl ? this._getTemplateRowsByGuid(guidTpl) : [];
      var tpl0 = aTplRows[0] || {};

      var aCfg01 = oDetail.getProperty("/_mmct/s01") || [];
      var aCfg02 = oDetail.getProperty("/_mmct/s02") || [];

      var oLockedParent = this._cloneLockedFields(tpl0, aCfg01, "S01");

      var oNewRow = deepClone(Object.assign({}, oLockedParent, {
        idx: iNewIdx,

        GUID: sGuidNew,
        Guid: sGuidNew,
        guidKey: sGuidNew,

        CatMateriale: tpl0.CatMateriale || oDetail.getProperty("/_mmct/cat") || "",
        Fornitore: tpl0.Fornitore || this._normalizeVendor10(this._sVendorId),
        Materiale: tpl0.Materiale || String(this._sMaterial || "").trim(),

        Fibra: "",

        CodAgg: "I",

        Stato: "ST",
        StatoText: this._statusText("ST"),
        __status: "ST",

        __canEdit: true,
        __canApprove: false,
        __canReject: false,
        __readOnly: false,

        __isNew: true,
        __state: "NEW"
      }));

      (aCfg01 || []).forEach(function (f) {
        if (!f || !f.ui) return;
        var k = String(f.ui).trim();
        if (!k) return;
        if (k.toUpperCase() === "STATO") k = "Stato";
        if (oNewRow[k] === undefined) oNewRow[k] = f.multiple ? [] : "";
        if (f.multiple && !Array.isArray(oNewRow[k])) oNewRow[k] = this._toArrayMulti(oNewRow[k]);
      }.bind(this));

      var aNewDetails = (aTplRows && aTplRows.length ? aTplRows : [tpl0]).map(function (src) {
        var oLockedDet = this._cloneLockedFields(src, aCfg02, "S02");

        var x = deepClone(src);
        Object.assign(x, oLockedDet);

        var fibraSrc = (src.Fibra != null ? src.Fibra : src.FIBRA);
        if (fibraSrc != null && String(fibraSrc).trim() !== "") {
          x.Fibra = fibraSrc;
        }

        x.Guid = sGuidNew;
        x.GUID = sGuidNew;
        x.guidKey = sGuidNew;

        x.Fornitore = x.Fornitore || this._normalizeVendor10(this._sVendorId);
        x.Materiale = x.Materiale || String(this._sMaterial || "").trim();
        x.CatMateriale = x.CatMateriale || tpl0.CatMateriale || oDetail.getProperty("/_mmct/cat") || "";

        x.CodAgg = "I";
        x.__localId = "NEW_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
        x.__isNew = true;

        x.Approved = 0;
        x.Rejected = 0;
        x.ToApprove = 1;

        (aCfg02 || []).forEach(function (f) {
          if (!f || !f.ui || !f.multiple) return;
          var k = String(f.ui).trim();
          if (!k) return;
          x[k] = this._toArrayMulti(x[k]);
        }.bind(this));

        return x;
      }.bind(this));

      aAll = aAll.slice();
      aAll.push(oNewRow);
      oDetail.setProperty("/RecordsAll", aAll);

      var oVm = this._ensureVmCache();
      var sCacheKey = this._getExportCacheKey();

      var aRecsCache = oVm.getProperty("/cache/recordsByKey/" + sCacheKey) || [];
      if (!Array.isArray(aRecsCache)) aRecsCache = [];
      aRecsCache = aRecsCache.slice();
      aRecsCache.push(oNewRow);
      oVm.setProperty("/cache/recordsByKey/" + sCacheKey, aRecsCache);

      var aRowsCache = oVm.getProperty("/cache/dataRowsByKey/" + sCacheKey) || [];
      if (!Array.isArray(aRowsCache)) aRowsCache = [];
      aRowsCache = aRowsCache.slice().concat(aNewDetails);
      oVm.setProperty("/cache/dataRowsByKey/" + sCacheKey, aRowsCache);

      this._setSelectedParentForScreen4(oNewRow);
      this._ensureScreen4CacheForParentIdx(iNewIdx, sGuidNew);

      this._applyClientFilters();

      MessageToast.show("Riga aggiunta");
    },

    onDeleteRows: function () {
      var oDetail = this.getView().getModel("detail");
      if (!oDetail) return MessageToast.show("Model 'detail' non trovato");

      var aSel = this._getSelectedParentObjectsFromMdc();
      if (!aSel.length) {
        return MessageToast.show("Seleziona almeno una riga da eliminare");
      }

      var aForbidden = (aSel || []).filter(function (r) {
        var st = String((r && (r.__status || r.Stato)) || "").trim().toUpperCase();
        return st === "AP" || st === "RJ" || st === "CH";
      });

      if (aForbidden.length) {
        MessageToast.show("non puoi eliminare partita fornitore approvati");
        return;
      }

      var aIdxToRemove = aSel
        .map(function (r) { return parseInt(r && r.idx, 10); })
        .filter(function (n) { return !isNaN(n) && n >= 0; });

      if (!aIdxToRemove.length) return MessageToast.show("Nessun idx valido nelle righe selezionate");

      var aDeletedParents = oDetail.getProperty("/__deletedParents") || [];
      aSel.forEach(function (r) {
        var g = (r && (r.GUID || r.Guid || r.guidKey)) || "";
        if (g && String(g).indexOf("-new") < 0) aDeletedParents.push(r);
      });
      oDetail.setProperty("/__deletedParents", aDeletedParents);

      var aAll = oDetail.getProperty("/RecordsAll") || [];
      var aRemaining = (aAll || []).filter(function (r) {
        var n = parseInt(r && r.idx, 10);
        return aIdxToRemove.indexOf(n) < 0;
      });
      oDetail.setProperty("/RecordsAll", aRemaining);

      var oVm = this._ensureVmCache();
      var sKeyCache = this._getExportCacheKey();

      var mDelPair = {}, mDelGuid = {};
      aSel.forEach(function (p) {
        var g = this._toStableString(p && (p.guidKey || p.GUID || p.Guid));
        var f = this._toStableString(p && p.Fibra);
        if (g && f) mDelPair[g + "||" + f] = true;
        else if (g) mDelGuid[g] = true;
      }.bind(this));

      var aRecsCache = oVm.getProperty("/cache/recordsByKey/" + sKeyCache) || [];
      oVm.setProperty("/cache/recordsByKey/" + sKeyCache, (aRecsCache || []).filter(function (r) {
        var n = parseInt(r && r.idx, 10);
        return aIdxToRemove.indexOf(n) < 0;
      }));

      var aRowsCacheBefore = oVm.getProperty("/cache/dataRowsByKey/" + sKeyCache) || [];
      aSel.forEach(function (p) {
        this._stashDeleteForPostFromCache(p, aRowsCacheBefore, oDetail);
      }.bind(this));

      var aRowsCache = oVm.getProperty("/cache/dataRowsByKey/" + sKeyCache) || [];
      oVm.setProperty("/cache/dataRowsByKey/" + sKeyCache, (aRowsCache || []).filter(function (r) {
        var g = this._rowGuidKey(r);
        var f = this._rowFibra(r);
        return !(mDelPair[g + "||" + f] || mDelGuid[g]);
      }.bind(this)));

      this._purgeScreen4CacheByParentIdx(aIdxToRemove);

      var oSel = this._getSelectedParentForScreen4();
      var iSelIdx = oSel ? parseInt(oSel.idx, 10) : NaN;
      if (!isNaN(iSelIdx) && aIdxToRemove.indexOf(iSelIdx) >= 0) {
        this._setSelectedParentForScreen4(null);
      }

      this._applyClientFilters();

      this._clearSelectionMdc();

      MessageToast.show("Righe eliminate");
    },

    // =========================
    // Legame Screen3 -> Screen4
    // =========================
    _setSelectedParentForScreen4: function (oParentOrNull) {
      var oVm = this._ensureVmCache();
      oVm.setProperty("/selectedScreen3Record", oParentOrNull || null);
      this.getOwnerComponent().setModel(oVm, "vm");
    },

    _getSelectedParentForScreen4: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      return oVm ? oVm.getProperty("/selectedScreen3Record") : null;
    },

    _ensureScreen4CacheForParentIdx: function (iIdx, sGuid) {
      var oVm = this._ensureVmCache();
      var sK = this._getCacheKeySafe();

      var mAll = oVm.getProperty("/cache/screen4DetailsByKey") || {};
      if (!mAll[sK]) mAll[sK] = {};
      if (!mAll[sK][String(iIdx)]) mAll[sK][String(iIdx)] = [];

      oVm.setProperty("/cache/screen4DetailsByKey", mAll);

      var mP = oVm.getProperty("/cache/screen4ParentGuidByIdx") || {};
      if (!mP[sK]) mP[sK] = {};
      mP[sK][String(iIdx)] = sGuid || "";
      oVm.setProperty("/cache/screen4ParentGuidByIdx", mP);
    },

    _purgeScreen4CacheByParentIdx: function (aIdx) {
      var oVm = this._ensureVmCache();
      var sK = this._getCacheKeySafe();

      var mAll = oVm.getProperty("/cache/screen4DetailsByKey") || {};
      if (mAll[sK]) {
        (aIdx || []).forEach(function (n) { delete mAll[sK][String(n)]; });
        oVm.setProperty("/cache/screen4DetailsByKey", mAll);
      }

      var mP = oVm.getProperty("/cache/screen4ParentGuidByIdx") || {};
      if (mP[sK]) {
        (aIdx || []).forEach(function (n) { delete mP[sK][String(n)]; });
        oVm.setProperty("/cache/screen4ParentGuidByIdx", mP);
      }
    },

    // =========================
    // COLLECT LINES FOR SAVE
    // =========================
    _collectLinesForSave: function () {
      var oDetail = this.getView().getModel("detail");
      var aParents = (oDetail && oDetail.getProperty("/RecordsAll")) || [];

      var oVm = this._ensureVmCache();
      var sK = this._getCacheKeySafe();
      var mAll = oVm.getProperty("/cache/screen4DetailsByKey") || {};
      var mByIdx = (mAll && mAll[sK]) ? mAll[sK] : {};

      var sVendor = this._normalizeVendor10(this._sVendorId);
      var sMat = String(this._sMaterial || "").trim();

      var out = [];

      function isEmpty(v) {
        if (v == null) return true;
        if (Array.isArray(v)) return v.length === 0;
        if (typeof v === "string") return v.trim() === "";
        return false;
      }

      function mergeParentIntoChild(child, parent) {
        var o = Object.assign({}, child || {});
        Object.keys(parent || {}).forEach(function (k) {
          if (!k) return;
          if (k.indexOf("__") === 0) return;
          if (k === "idx" || k === "guidKey" || k === "StatoText") return;

          if (o[k] === undefined || isEmpty(o[k])) {
            o[k] = parent[k];
          }
        });
        return o;
      }

      aParents.forEach(function (p) {
        var iIdx = (p && p.idx != null) ? parseInt(p.idx, 10) : NaN;
        var aDet = (!isNaN(iIdx) && mByIdx && mByIdx[String(iIdx)]) ? (mByIdx[String(iIdx)] || []) : [];

        if (Array.isArray(aDet) && aDet.length) {
          aDet.forEach(function (d) {
            var merged = mergeParentIntoChild(d, p);
            out.push(this._sanitizeLineForPost(merged, sVendor, sMat));
          }.bind(this));
        } else {
          out.push(this._sanitizeLineForPost(p, sVendor, sMat));
        }
      }.bind(this));

      return out;
    },

    _invalidateScreen3Cache: function () {
      var oVm = this._ensureVmCache();
      var sKey = this._getExportCacheKey();

      oVm.setProperty("/cache/dataRowsByKey/" + sKey, []);
      oVm.setProperty("/cache/recordsByKey/" + sKey, []);
    },

    // =========================
    // ON SAVE
    // =========================
    onSave: function () {
      var vr = this._validateRequiredBeforePost();
      if (!vr.ok) {
        var top = vr.errors.slice(0, 15).map(function (e) {
          return "- [" + e.page + "] " + e.label + " (Riga: " + (e.row || "?") + ")";
        }).join("\n");

        MessageBox.error(
          "Compila tutti i campi obbligatori prima di salvare.\n\n" +
          top +
          (vr.errors.length > 15 ? ("\n\n... altri " + (vr.errors.length - 15) + " errori") : "")
        );
        return;
      }

      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var bMock = !!(mock && mock.mockS3);

      var sUserId = (oVm && oVm.getProperty("/userId")) || "E_ZEMAF";
      var oModel = this.getOwnerComponent().getModel();

      var oDetail = this.getView().getModel("detail");
      var aParents = (oDetail && oDetail.getProperty("/RecordsAll")) || [];

      aParents = (aParents || []).filter(function (p) {
        return this._getCodAgg(p) !== "N";
      }.bind(this));

      var sVendor10 = this._normalizeVendor10(this._sVendorId);
      var sMaterial = String(this._sMaterial || "").trim();

      var oVmCache = this._ensureVmCache();
      var sCacheKey = this._getExportCacheKey();
      var aRawAll = oVmCache.getProperty("/cache/dataRowsByKey/" + sCacheKey) || [];
      if (!Array.isArray(aRawAll)) aRawAll = [];

      var aS01 = (oDetail && oDetail.getProperty("/_mmct/s01")) || [];
      var aParentKeys = (aS01 || [])
        .map(function (f) {
          var k = f && f.ui ? String(f.ui).trim() : "";
          if (!k) return "";
          if (k.toUpperCase() === "STATO") k = "Stato";
          return k;
        })
        .filter(Boolean);

      if (aParentKeys.indexOf("Stato") < 0) aParentKeys.push("Stato");
      aParentKeys = aParentKeys.filter(function (k) { return k !== "Fibra"; });
      if (aParentKeys.indexOf("Stato") < 0) aParentKeys.push("Stato");

      function norm(v) { return String(v == null ? "" : v).trim(); }

      function isEmpty(v) {
        if (v == null) return true;
        if (Array.isArray(v)) return v.length === 0;
        if (typeof v === "string") return v.trim() === "";
        return false;
      }

      function guidOf(x) {
        return norm(x && (
          x.Guid != null ? x.Guid :
            (x.GUID != null ? x.GUID :
              (x.guidKey != null ? x.guidKey :
                (x.GuidKey != null ? x.GuidKey :
                  (x.ItmGuid != null ? x.ItmGuid :
                    (x.ItemGuid != null ? x.ItemGuid : ""))))))
        );
      }

      function fibraOf(x) {
        return norm(x && (x.Fibra != null ? x.Fibra : (x.FIBRA != null ? x.FIBRA : "")));
      }

      var mGroupGuidByParent = {};

      function parentKeyOf(p) {
        return String(p && (p.guidKey || p.GUID || p.Guid || p.idx) || "").trim();
      }

      var self = this;
      function getGroupGuid(p) {
        var g = guidOf(p);
        if (g && g.indexOf("-new") < 0) return g;

        var pk = parentKeyOf(p);
        if (!mGroupGuidByParent[pk]) mGroupGuidByParent[pk] = self.uuidv4();
        return mGroupGuidByParent[pk];
      }

      var mRawByGuid = {};
      aRawAll.forEach(function (r) {
        var g = guidOf(r);
        if (!g) return;
        if (!mRawByGuid[g]) mRawByGuid[g] = [];
        mRawByGuid[g].push(r);
      });

      var mMulti = this._getMultiFieldsMap();

      var sanitizeForPost = function (rAny) {
        var r = rAny || {};
        var o = {};
        var normalizeMulti = this._normalizeMultiString.bind(this);

        Object.keys(r).forEach(function (k) {
          if (!k) return;
          if (k.indexOf("__") === 0) return;
          if (k === "__metadata" || k === "AllData") return;
          if (k === "idx" || k === "guidKey" || k === "StatoText") return;

          var v = r[k];

          if (mMulti[k]) {
            v = normalizeMulti(v, "|");
          } else if (Array.isArray(v)) {
            v = v.join(";");
          }

          if ((k === "InizioVal" || k === "FineVal" || k === "DataIns" || k === "DataMod") && (v === "" || v === undefined)) {
            v = null;
          }

          o[k] = (v === undefined ? "" : v);
        });

        if (!o.Fornitore) o.Fornitore = sVendor10;
        if (!o.Materiale) o.Materiale = sMaterial;

        var g = guidOf(r) || guidOf(o);
        if (!g || g.indexOf("-new") >= 0) g = null;

        o.Guid = g;

        if (o.GUID !== undefined) delete o.GUID;
        if (o.GuidKey !== undefined) delete o.GuidKey;
        if (o.guidKey !== undefined) delete o.guidKey;

        o.UserID = sUserId;

        return o;
      }.bind(this);

      var aLines = [];
      (aParents || []).forEach(function (p) {
        var gP = guidOf(p);
        var fP = fibraOf(p);

        var gGroup = getGroupGuid(p);

        var aRows = (gP && mRawByGuid[gP]) ? mRawByGuid[gP] : [];

        if (!aRows.length) aRows = [deepClone(p) || {}];

        aRows.forEach(function (r0) {
          var r = deepClone(r0) || {};

          r.Guid = gGroup;

          aParentKeys.forEach(function (k) {
            if (p && p[k] !== undefined) r[k] = p[k];
          });

          Object.keys(p || {}).forEach(function (k) {
            if (!k) return;
            if (k.indexOf("__") === 0) return;
            if (k === "idx" || k === "guidKey" || k === "StatoText") return;
            if (r[k] === undefined || isEmpty(r[k])) r[k] = p[k];
          });

          if (!isEmpty(p.Fibra)) {
            if (r.Guid.includes("new")) {
              r.Fibra = p.Fibra;
            } else {
              r.Fibra = r.Fibra;
            }
          } else if (isEmpty(r.Fibra) && !isEmpty(fP)) {
            r.Fibra = fP;
          }

          var stP = norm(p && (p.__status || p.Stato));
          if (isEmpty(r.Stato) && stP) r.Stato = stP;

          if (!guidOf(r) && gGroup) {
            r.Guid = gGroup;
          }

          if (isEmpty(r.Fibra) && fP) r.Fibra = fP;

          if (!r.Fornitore) r.Fornitore = sVendor10;
          if (!r.Materiale) r.Materiale = sMaterial;
          r.UserID = sUserId;

          aLines.push(sanitizeForPost(r));
        }.bind(this));
      }.bind(this));

      var aDeleted = (oDetail && oDetail.getProperty("/__deletedLinesForPost")) || [];
      if (Array.isArray(aDeleted) && aDeleted.length) {
        aDeleted.forEach(function (rDel) {
          var x = deepClone(rDel) || {};
          if (x.CODAGG !== undefined) delete x.CODAGG;
          x.CodAgg = "D";
          aLines.push(sanitizeForPost(x));
        });
      }

      if (!aLines.length) {
        MessageToast.show("Nessuna riga da salvare");
        return;
      }

      var mGuidHasU = Object.create(null);

      (aLines || []).forEach(function (line) {
        var g = this._toStableString(line && line.Guid);
        if (!g) return;

        var ca = this._getCodAgg(line);
        if(ca === "U") mGuidHasU[g] = true;
}.bind(this));
(aLines || []).forEach(function (line) {
    var g = this._toStableString(line && line.Guid);
    if (!g || !mGuidHasU[g]) return;

    var ca = this._getCodAgg(line);

    if (ca === "") {
      line.CodAgg = "U";
      if (line.CODAGG !== undefined) delete line.CODAGG;
    }

  }.bind(this));

  var oPayload = {
    UserID: sUserId,
    PostDataCollection: aLines
      .filter(function (i) {
        var ca = this._getCodAgg(i);
        return !(ca === "N" || ca === "");
      }.bind(this))
      .map(function (l) {
        var x = Object.assign({}, l);
        delete x.ToApprove;
        delete x.Rejected;
        delete x.Approved;
        return x;
      })
  };

  console.log("[S3] Payload /PostDataSet (UNIFIED)", JSON.parse(JSON.stringify(oPayload)));

  if (bMock) {
    MessageToast.show("MOCK attivo: POST non eseguita (payload in Console)");
    return;
  }

  BusyIndicator.show(0);

  oModel.create("/PostDataSet", oPayload, {
    urlParameters: { "sap-language": "IT" },

    success: function (oData, oResponse) {
      BusyIndicator.hide();

      console.log("[S3] POST success - oResponse:", oResponse);
      console.log("[S3] POST success - oData:", JSON.parse(JSON.stringify(oData || {})));

      var aResp = this._extractPostResponseLines(oData);
      console.log("[S3] POST response lines:", aResp);

      var aErr = (aResp || []).filter(function (r) {
        var es = String(r && r.Esito || "").trim().toUpperCase();
        return es && es !== "OK";
      });

      if (aErr.length) {
        this._markRowsWithPostErrors(aErr);
        this._showPostErrorMessagePage(aErr);
        return;
      }

      MessageToast.show("Salvataggio completato");

      oDetail.setProperty("/__deletedLinesForPost", []);

      this._invalidateScreen3Cache();
      this._refreshAfterPost(oData);

    }.bind(this),

    error: function (oError) {
      BusyIndicator.hide();
      var msg = this._readODataError(oError) || "Errore in salvataggio (vedi Console)";
      console.error("[S3] POST ERROR", oError);
      MessageToast.show(msg);
    }.bind(this)
  });
},

_refreshAfterPost: function (oPostData) {
  console.log("[S3] POST RESULT (oData):", JSON.parse(JSON.stringify(oPostData || {})));

  return new Promise(function (resolve) {
    this._reloadDataFromBackend(function (aResults) {
      this._hydrateMmctFromRows(aResults);
      this._formatIncomingRowsMultiSeparators(aResults);

      var oDetail = this.getView().getModel("detail");
      var res = this._computeOpenOdaFromRows(aResults);
      if (res.hasSignalProp) oDetail.setProperty("/OpenOda", res.flag);

      var aRecordsBuilt = this._buildRecords01(aResults);

      var oVm = this._ensureVmCache();
      var sKey = this._getExportCacheKey();
      oVm.setProperty("/cache/dataRowsByKey/" + sKey, aResults);
      oVm.setProperty("/cache/recordsByKey/" + sKey, aRecordsBuilt);

      Promise.resolve(this._bindRecords(aRecordsBuilt)).then(function () {
        this._snapshotRecords = deepClone(aRecordsBuilt);

        console.log("[S3] REFRESH DONE (rows from backend):", aResults.length);
        resolve(aResults);
      }.bind(this));
    }.bind(this));
  }.bind(this));
},

// =========================
// NavBack
// =========================
onNavBack: function () {
  if (this._hasUnsavedChanges()) {
    MessageBox.warning(
      "Hai modificato i dati. Sei sicuro di voler uscire senza salvare?",
      {
        title: "Modifiche non salvate",
        actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
        emphasizedAction: MessageBox.Action.CANCEL,
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            this._performNavBack();
          }
        }.bind(this)
      }
    );
  } else {
    this._performNavBack();
  }
},

_performNavBack: function () {
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