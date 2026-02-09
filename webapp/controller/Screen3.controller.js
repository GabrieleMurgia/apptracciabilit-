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
  "apptracciabilita/apptracciabilita/util/postUtil",
  "apptracciabilita/apptracciabilita/util/rowErrorUtil",
  "apptracciabilita/apptracciabilita/util/exportUtil",
  "apptracciabilita/apptracciabilita/util/recordsUtil",
  "apptracciabilita/apptracciabilita/util/saveUtil",
  "apptracciabilita/apptracciabilita/util/dataLoaderUtil",
  "apptracciabilita/apptracciabilita/util/rowManagementUtil"
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
  PostUtil,
  RowErrorUtil,
  ExportUtil,
  RecordsUtil,
  SaveUtil,
  DataLoaderUtil,
  RowManagementUtil
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
    },

    // =========================
    // HELPER GETTER
    // =========================
    _getOVm: function () {
      return VmCache.ensureVmCache(this.getOwnerComponent());
    },

    _getODetail: function () {
      return this.getView().getModel("detail");
    },

    _getCacheKeySafe: function () {
      return VmCache.getCacheKeySafe(this._sVendorId, this._sMaterial);
    },

    _getExportCacheKey: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var bMockS3 = !!mock.mockS3;
      var sBaseKey = this._getCacheKeySafe();
      return (bMockS3 ? "MOCK|" : "REAL|") + sBaseKey;
    },

    _isMockS3Enabled: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      return !!(mock && mock.mockS3);
    },

    // =========================
    // DELEGATE SEMPLICI A UTIL
    // =========================
    _toStableString: function (v) { return Common.toStableString(v); },
    _valToText: function (v) { return Common.valToText(v); },
    _getApprovedFlag: function (r) { return StatusUtil.getApprovedFlag(r); },
    _getSettingFlags: function (c) { return MmctUtil.getSettingFlags(c); },
    _isMultipleField: function (c) { return MmctUtil.isMultipleField(c); },
    _isX: function (v) { return MmctUtil.isX(v); },
    _parseOrder: function (c) { return MmctUtil.parseOrder(c); },
    _domainHasValues: function (sDomain) { return Domains.domainHasValues(this.getOwnerComponent(), sDomain); },
    _getInnerTableFromMdc: function (oMdcTbl) { return MdcTableUtil.getInnerTableFromMdc(oMdcTbl); },
    _getCustomDataValue: function (oCtrl, sKey) { return MdcTableUtil.getCustomDataValue(oCtrl, sKey); },
    _refreshInlineSortIcons: function () { MdcTableUtil.refreshInlineSortIcons(this._inlineFS); },

    // PostUtil delegates
    _getCodAgg: function (o) { return PostUtil.getCodAgg(o); },
    _isBaseCodAgg: function (o) { return PostUtil.isBaseCodAgg(o); },
    _isTemplateRow: function (o) { return PostUtil.isTemplateRow(o); },
    _normalizeVendor10: function (v) { return PostUtil.normalizeVendor10(v); },
    _genGuidNew: function () { return PostUtil.genGuidNew(); },
    _getMultiFieldsMap: function () { return PostUtil.getMultiFieldsMap(this._getODetail()); },
    _normalizeMultiString: function (v, sSepOut) { return PostUtil.normalizeMultiString(v, sSepOut); },
    uuidv4: function () { return PostUtil.uuidv4(); },

    // RecordsUtil delegates
    _rowGuidKey: function (r) { return RecordsUtil.rowGuidKey(r); },
    _rowFibra: function (r) { return RecordsUtil.rowFibra(r); },
    _statusText: function (sCode) { return RecordsUtil.statusText(sCode); },
    _toArrayMulti: function (v) { return RecordsUtil.toArrayMulti(v); },
    _computeOpenOdaFromRows: function (aRows) { return RecordsUtil.computeOpenOdaFromRows(aRows); },

    _hasUnsavedChanges: function () {
      return RecordsUtil.hasUnsavedChanges(this._getODetail(), this._snapshotRecords);
    },

    _refreshHeader3Fields: function () {
      RecordsUtil.refreshHeader3Fields(this._getODetail());
      this._log("_refreshHeader3Fields done");
    },

    _buildRecords01: function (aAllRows) {
      return RecordsUtil.buildRecords01(aAllRows, {
        oDetail: this._getODetail(),
        oVm: this.getOwnerComponent().getModel("vm")
      });
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

      var oDetail = this._getODetail();
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

    // =========================
    // LOAD DATA
    // =========================
    _loadDataOnce: function () {
      var oVm = this._getOVm();
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

          var oDetailC = this._getODetail();
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

        var oDetail = this._getODetail();
        var res = this._computeOpenOdaFromRows(aResults);
        if (res.hasSignalProp) oDetail.setProperty("/OpenOda", res.flag);

        var aRecordsBuilt = this._buildRecords01(aResults);

        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aResults);
        oVm.setProperty("/cache/recordsByKey/" + sKey, aRecordsBuilt);

        this._bindRecords(aRecordsBuilt);
      }.bind(this));
    },

    _reloadDataFromBackend: function (fnDone) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var sForceStato = String(mock.forceStato || "").trim().toUpperCase();
      var bMockS3 = !!mock.mockS3;

      var sUserId = (oVm && oVm.getProperty("/userId")) || "E_ZEMAF";

      var sVendor10 = String(this._sVendorId || "").trim();
      if (/^\d+$/.test(sVendor10) && sVendor10.length < 10) {
        sVendor10 = ("0000000000" + sVendor10).slice(-10);
      }

      var aFilters = DataLoaderUtil.buildCommonFilters({
        userId: sUserId,
        vendorId: this._sVendorId,
        material: this._sMaterial,
        season: this._sSeason
      });

      DataLoaderUtil.reloadDataFromBackend({
        oModel: this.getOwnerComponent().getModel(),
        filters: aFilters,
        vendor10: sVendor10,
        oVmCache: this._getOVm(),
        mockS3: bMockS3,
        forceStato: sForceStato,
        onDone: fnDone
      });
    },

    _hydrateMmctFromRows: function (aRows) {
      var oDetail = this._getODetail();
      var oVm = this.getOwnerComponent().getModel("vm");

      var result = DataLoaderUtil.hydrateMmctFromRows(aRows, oDetail, oVm, this._getCodAgg.bind(this));
      this._log("_hydrateMmctFromRows", result);
    },

    _formatIncomingRowsMultiSeparators: function (aRows) {
      var mMulti = this._getMultiFieldsMap();
      PostUtil.formatIncomingRowsMultiSeparators(aRows, mMulti);
    },

    // =========================
    // MDC TABLE CONFIG
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
    // BIND RECORDS
    // =========================
    _bindRecords: async function (aRecords) {
      var oDetail = this._getODetail();
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

    _forceP13nAllVisible: async function (oTbl, reason) {
      return P13nUtil.forceP13nAllVisible(oTbl, StateUtil, this._log.bind(this), reason);
    },

    // =========================
    // FILTERS
    // =========================
    _applyClientFilters: function () {
      var oDetail = this._getODetail();
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

      var oDetail = this._getODetail();
      oDetail.setProperty("/__statusFilter", s);

      this._applyClientFilters();
    },

    onGlobalFilter: function (oEvt) {
      var q = String(oEvt.getParameter("value") || "").trim();
      var oDetail = this._getODetail();
      oDetail.setProperty("/__q", q);
      this._applyClientFilters();
    },

    _onInlineColFilterLiveChange: function (oEvt) {
      var oInput = oEvt.getSource();
      var sField = oInput && oInput.data && oInput.data("field");
      if (!sField) return;

      var sVal = String(oEvt.getParameter("value") || "");
      if (!this._inlineFS.filters) this._inlineFS.filters = {};
      this._inlineFS.filters[sField] = sVal;

      this._applyClientFilters();
    },

    _onInlineColSortPress: function (oEvt) {
      var oBtn = oEvt.getSource();
      var sField = oBtn && oBtn.data && oBtn.data("field");
      if (!sField) return;

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

    onResetFiltersAndSort: function () {
      var oDetail = this._getODetail();
      oDetail.setProperty("/__q", "");
      oDetail.setProperty("/__statusFilter", "");

      var oInp = this.byId("inputFilter3");
      if (oInp && oInp.setValue) oInp.setValue("");

      this._inlineFS.filters = {};
      this._inlineFS.sort = { key: "", desc: false };

      this._refreshInlineSortIcons();
      this._applyClientFilters();

      var oTbl = this.byId("mdcTable3");
      this._applyInlineHeaderFilterSort(oTbl);
      this._setInnerHeaderHeight(oTbl);
    },

    // =========================
    // HEADER BUTTONS
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

    onOpenColumnFilters: function () { this.onToggleHeaderFilters(); },
    onOpenSort: function () { this.onToggleHeaderSort(); },

    // =========================
    // ROW ERROR HANDLING
    // =========================
    _clearPostErrorByContext: function (oCtx) {
      var self = this;
      RowErrorUtil.clearPostErrorByContext(oCtx, {
        oDetail: this._getODetail(),
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
        oDetail: this._getODetail(),
        updateRowStyles: function () {
          self._updatePostErrorRowStyles(oInner);
        }
      });
    },

    _ensurePostErrorRowHooks: function (oMdcTbl) {
      var self = this;
      RowErrorUtil.ensurePostErrorRowHooks(oMdcTbl, {
        oDetail: this._getODetail(),
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
        oDetail: this._getODetail(),
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
          var oDetail = this._getODetail();
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

      var oVm = this._getOVm();
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
    // NAV TO SCREEN4
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

    // =========================
    // SCREEN4 CACHE
    // =========================
    _setSelectedParentForScreen4: function (oParentOrNull) {
      var oVm = this._getOVm();
      oVm.setProperty("/selectedScreen3Record", oParentOrNull || null);
      this.getOwnerComponent().setModel(oVm, "vm");
    },

    _getSelectedParentForScreen4: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      return oVm ? oVm.getProperty("/selectedScreen3Record") : null;
    },

    _ensureScreen4CacheForParentIdx: function (iIdx, sGuid) {
      var oVm = this._getOVm();
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
      var oVm = this._getOVm();
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
    // MDC SELECTION
    // =========================
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

    // =========================
    // ADD ROW
    // =========================
    onAddRow: function () {
      var oDetail = this._getODetail();
      if (!oDetail) return MessageToast.show("Model 'detail' non trovato");

      if (!oDetail.getProperty("/__canAddRow")) {
        MessageToast.show("Non hai permessi per aggiungere righe");
        return;
      }

      var oVm = this._getOVm();
      var sCacheKey = this._getExportCacheKey();

      var guidTpl = RowManagementUtil.pickTemplateGuidForNewParent({
        selectedObjects: this._getSelectedParentObjectsFromMdc(),
        oVm: oVm,
        cacheKey: sCacheKey,
        toStableString: this._toStableString.bind(this),
        rowGuidKey: this._rowGuidKey.bind(this),
        getCodAgg: this._getCodAgg.bind(this)
      });

      var aTplRows = RowManagementUtil.getTemplateRowsByGuid(guidTpl, {
        oVm: oVm,
        cacheKey: sCacheKey,
        rowGuidKey: this._rowGuidKey.bind(this),
        isBaseCodAgg: this._isBaseCodAgg.bind(this)
      });

      var tpl0 = aTplRows[0] || {};
      var aCfg01 = oDetail.getProperty("/_mmct/s01") || [];
      var aCfg02 = oDetail.getProperty("/_mmct/s02") || [];

      var result = RowManagementUtil.createNewParentRow({
        oDetail: oDetail,
        template: tpl0,
        cfg01: aCfg01,
        vendorId: this._sVendorId,
        material: this._sMaterial,
        normalizeVendor10: this._normalizeVendor10.bind(this),
        toArrayMulti: this._toArrayMulti.bind(this),
        statusText: this._statusText.bind(this),
        genGuidNew: this._genGuidNew.bind(this)
      });

      var oNewRow = result.row;
      var iNewIdx = result.idx;
      var sGuidNew = result.guid;

      var aNewDetails = RowManagementUtil.createNewDetailRows(aTplRows, {
        template: tpl0,
        cfg02: aCfg02,
        guid: sGuidNew,
        vendorId: this._sVendorId,
        material: this._sMaterial,
        cat: oDetail.getProperty("/_mmct/cat") || "",
        normalizeVendor10: this._normalizeVendor10.bind(this),
        toArrayMulti: this._toArrayMulti.bind(this)
      });

      // Update RecordsAll
      var aAll = (oDetail.getProperty("/RecordsAll") || []).slice();
      aAll.push(oNewRow);
      oDetail.setProperty("/RecordsAll", aAll);

      // Update cache
      var aRecsCache = (oVm.getProperty("/cache/recordsByKey/" + sCacheKey) || []).slice();
      aRecsCache.push(oNewRow);
      oVm.setProperty("/cache/recordsByKey/" + sCacheKey, aRecsCache);

      var aRowsCache = (oVm.getProperty("/cache/dataRowsByKey/" + sCacheKey) || []).slice();
      aRowsCache = aRowsCache.concat(aNewDetails);
      oVm.setProperty("/cache/dataRowsByKey/" + sCacheKey, aRowsCache);

      this._setSelectedParentForScreen4(oNewRow);
      this._ensureScreen4CacheForParentIdx(iNewIdx, sGuidNew);

      this._applyClientFilters();

      MessageToast.show("Riga aggiunta");
    },

    // =========================
    // DELETE ROWS
    // =========================
    onDeleteRows: function () {
      var oDetail = this._getODetail();
      if (!oDetail) return MessageToast.show("Model 'detail' non trovato");

      var aSel = this._getSelectedParentObjectsFromMdc();
      if (!aSel.length) {
        return MessageToast.show("Seleziona almeno una riga da eliminare");
      }

      var checkResult = RowManagementUtil.canDeleteSelectedRows(aSel);
      if (!checkResult.canDelete) {
        MessageToast.show("Non puoi eliminare partita fornitore approvati");
        return;
      }

      var aIdxToRemove = RowManagementUtil.getIdxToRemove(aSel);
      if (!aIdxToRemove.length) return MessageToast.show("Nessun idx valido nelle righe selezionate");

      // Track deleted parents
      var aDeletedParents = oDetail.getProperty("/__deletedParents") || [];
      aSel.forEach(function (r) {
        var g = (r && (r.GUID || r.Guid || r.guidKey)) || "";
        if (g && String(g).indexOf("-new") < 0) aDeletedParents.push(r);
      });
      oDetail.setProperty("/__deletedParents", aDeletedParents);

      // Remove from RecordsAll
      var aAll = oDetail.getProperty("/RecordsAll") || [];
      var aRemaining = (aAll || []).filter(function (r) {
        var n = parseInt(r && r.idx, 10);
        return aIdxToRemove.indexOf(n) < 0;
      });
      oDetail.setProperty("/RecordsAll", aRemaining);

      // Update cache
      var oVm = this._getOVm();
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

    _stashDeleteForPostFromCache: function (oParent, aRowsCache, oDetail) {
      PostUtil.stashDeleteForPostFromCache(oParent, aRowsCache, oDetail, {
        toStableString: this._toStableString.bind(this),
        rowGuidKey: this._rowGuidKey.bind(this)
      });
    },

    // =========================
    // VALIDATE REQUIRED
    // =========================
    _validateRequiredBeforePost: function () {
      return SaveUtil.validateRequiredBeforePost({
        oDetail: this._getODetail(),
        oVm: this._getOVm(),
        getCacheKeySafe: this._getCacheKeySafe.bind(this),
        getExportCacheKey: this._getExportCacheKey.bind(this),
        toStableString: this._toStableString.bind(this),
        rowGuidKey: this._rowGuidKey.bind(this),
        getCodAgg: this._getCodAgg.bind(this)
      });
    },

    // =========================
    // SAVE
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

      var oDetail = this._getODetail();
      var sVendor10 = this._normalizeVendor10(this._sVendorId);
      var sMaterial = String(this._sMaterial || "").trim();

      var oPayload = SaveUtil.buildSavePayload({
        oDetail: oDetail,
        oVm: this._getOVm(),
        userId: sUserId,
        vendor10: sVendor10,
        material: sMaterial,
        getExportCacheKey: this._getExportCacheKey.bind(this),
        toStableString: this._toStableString.bind(this),
        getCodAgg: this._getCodAgg.bind(this),
        getMultiFieldsMap: this._getMultiFieldsMap.bind(this),
        normalizeMultiString: this._normalizeMultiString.bind(this),
        uuidv4: this.uuidv4.bind(this)
      });

      SaveUtil.executePost({
        oModel: oModel,
        payload: oPayload,
        mock: bMock,
        onSuccess: function (oData) {
          oDetail.setProperty("/__deletedLinesForPost", []);
          this._invalidateScreen3Cache();
          this._refreshAfterPost(oData);
        }.bind(this),
        onPartialError: function (aErr, oData) {
          this._markRowsWithPostErrors(aErr);
          PostUtil.showPostErrorMessagePage(aErr);
        }.bind(this),
        onFullError: function (oError) {
          // già gestito in SaveUtil
        }.bind(this)
      });
    },

    _invalidateScreen3Cache: function () {
      var oVm = this._getOVm();
      var sKey = this._getExportCacheKey();

      oVm.setProperty("/cache/dataRowsByKey/" + sKey, []);
      oVm.setProperty("/cache/recordsByKey/" + sKey, []);
    },

    _refreshAfterPost: function (oPostData) {
      console.log("[S3] POST RESULT (oData):", JSON.parse(JSON.stringify(oPostData || {})));

      return new Promise(function (resolve) {
        this._reloadDataFromBackend(function (aResults) {
          this._hydrateMmctFromRows(aResults);
          this._formatIncomingRowsMultiSeparators(aResults);

          var oDetail = this._getODetail();
          var res = this._computeOpenOdaFromRows(aResults);
          if (res.hasSignalProp) oDetail.setProperty("/OpenOda", res.flag);

          var aRecordsBuilt = this._buildRecords01(aResults);

          var oVm = this._getOVm();
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
    // EXPORT
    // =========================
    onExportExcel: async function () {
      await ExportUtil.exportExcel({
        oVm: this.getOwnerComponent().getModel("vm"),
        oDetail: this._getODetail(),
        toStableString: this._toStableString.bind(this),
        statusText: this._statusText.bind(this),
        inlineFS: this._inlineFS,
        vendorId: this._sVendorId,
        material: this._sMaterial,
        cacheKey: this._getExportCacheKey()
      });
    },

    onPrint: function () { MessageToast.show("Stampa: TODO"); },

    // =========================
    // NAV BACK
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