sap.ui.define([
  "apptracciabilita/apptracciabilita/controller/BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/Button",
  "sap/ui/mdc/table/Column",
  "sap/m/HBox",
  "sap/m/ObjectStatus",
  "sap/ui/mdc/p13n/StateUtil",

  // ===== UTIL =====
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/domains",
  "apptracciabilita/apptracciabilita/util/statusUtil",
  "apptracciabilita/apptracciabilita/util/mdcTableUtil",
  "apptracciabilita/apptracciabilita/util/p13nUtil",
  "apptracciabilita/apptracciabilita/util/cellTemplateUtil",
  "apptracciabilita/apptracciabilita/util/postUtil",
  "apptracciabilita/apptracciabilita/util/rowErrorUtil",
  "apptracciabilita/apptracciabilita/util/exportUtil",
  "apptracciabilita/apptracciabilita/util/recordsUtil",
  "apptracciabilita/apptracciabilita/util/saveUtil",
  "apptracciabilita/apptracciabilita/util/dataLoaderUtil",
  "apptracciabilita/apptracciabilita/util/rowManagementUtil",
  "apptracciabilita/apptracciabilita/util/filterSortUtil",
  "apptracciabilita/apptracciabilita/util/screen4CacheUtil",
  "apptracciabilita/apptracciabilita/util/touchCodAggUtil",
  "apptracciabilita/apptracciabilita/util/TableColumnAutoSize",

], function (
  BaseController, JSONModel, MessageToast, MessageBox,
  Button, MdcColumn, HBox, ObjectStatus, StateUtil,
  N, Domains, StatusUtil, MdcTableUtil, P13nUtil,
  CellTemplateUtil, PostUtil, RowErrorUtil, ExportUtil, RecordsUtil,
  SaveUtil, DataLoaderUtil, RowManagementUtil, FilterSortUtil,
  Screen4CacheUtil, TouchCodAggUtil, TableColumnAutoSize,
  PercUtil
) {
  "use strict";

  var deepClone = N.deepClone;

  return BaseController.extend("apptracciabilita.apptracciabilita.controller.Screen3", {

    _sLogPrefix: "[S3]",
    _sMockFlag: "mockS3",
    PARENT_TABLE_ID: "mdcTable3",

    // ==================== INIT ====================
    onInit: function () {

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
        __canEdit: false, __canAddRow: false, __canApprove: false, __canReject: false
      }), "detail");

      this._snapshotRecords = null;
      this._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {}, filterInputs: {}, headerTitles: {}, headerRows: {}, headerBoxes: {} };

      setTimeout(function () { this._logTable("TABLE STATE @ after onInit"); }.bind(this), 0);
    },

    // _log inherited from BaseController

    // _getOVm, _getODetail, _getCacheKeySafe, _getExportCacheKey inherited from BaseController

    // ==================== ROUTE ====================
    _onRouteMatched: function (oEvent) {
      var oArgs = oEvent.getParameter("arguments") || {};
      this._sMode = oArgs.mode || "A";
      this._sVendorId = decodeURIComponent(oArgs.vendorId || "");
      this._sMaterial = decodeURIComponent(oArgs.material || "");
      this._sSeason = decodeURIComponent(oArgs.season || "");
      this._log("_onRouteMatched args", oArgs);

      // Preserve snapshot when returning from Screen4 (will be restored after _bindRecords)
      var oVm = this.getOwnerComponent().getModel("vm");
      var bReturningFromS4 = !!oVm.getProperty("/__skipS3BackendOnce");
      var aSavedSnapshot = (bReturningFromS4 && this._snapshotRecords) ? this._snapshotRecords : null;

      this._snapshotRecords = null;

      var oUi = this.getView().getModel("ui");
      if (oUi) { oUi.setProperty("/showHeaderFilters", false); oUi.setProperty("/showHeaderSort", true); }

      var oDetail = this._getODetail();
      oDetail.setData({ Header3Fields: [], VendorId: this._sVendorId, Material: this._sMaterial, RecordsAll: [], Records: [], RecordsCount: 0, _mmct: { cat: "", s01: [], s02: [] }, __q: "", __statusFilter: "" }, true);

      var sOpenCache = this._readOpenOdaFromMatInfoCache();
      if (sOpenCache) oDetail.setProperty("/OpenOda", sOpenCache);

      this._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {}, filterInputs: {}, headerTitles: {}, headerRows: {}, headerBoxes: {} };
      var oInp = this.byId("inputFilter3");
      if (oInp && oInp.setValue) oInp.setValue("");

      this._logTable("TABLE STATE @ before _loadDataOnce");
      this._loadDataOnce(aSavedSnapshot);
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
      } catch (e) { return ""; }
    },

    // ==================== LOAD DATA ====================
    _loadDataOnce: function (aSavedSnapshot) {
      var oVm = this._getOVm();
      var sKey = this._getExportCacheKey();
      var aRows = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || null;
      var aRecs = oVm.getProperty("/cache/recordsByKey/" + sKey) || null;
      var bSkip = !!oVm.getProperty("/__skipS3BackendOnce");
      if (bSkip) oVm.setProperty("/__skipS3BackendOnce", false);
      var bHasCache = Array.isArray(aRows) && aRows.length && Array.isArray(aRecs) && aRecs.length;

      if (bHasCache) {
        try {
          this._hydrateAndFormat(aRows);
          oVm.setProperty("/cache/dataRowsByKey/" + sKey, aRows);
          var mTplGuid = {};
          (aRows || []).forEach(function (r) { if (N.getCodAgg(r) === "N") mTplGuid[RecordsUtil.rowGuidKey(r)] = true; });
          aRecs = (aRecs || []).filter(function (rec) { return !mTplGuid[N.toStableString(rec && (rec.guidKey || rec.GUID || rec.Guid))]; });
          oVm.setProperty("/cache/recordsByKey/" + sKey, aRecs);
          var resC = RecordsUtil.computeOpenOdaFromRows(aRows);
          if (resC.hasSignalProp) this._getODetail().setProperty("/OpenOda", resC.flag);
          this._bindRecords(aRecs);
          // Restore previous snapshot when returning from Screen4
          if (aSavedSnapshot) {
            this._snapshotRecords = aSavedSnapshot;
          }
        } catch (e) { console.warn("[S3] cache bind failed", e); }
      }

      if (bSkip && bHasCache) { this._log("_loadDataOnce: skip backend reload (back from Screen4)", { cacheKey: sKey }); return; }

      this._loadToken = (this._loadToken || 0) + 1;
      var iToken = this._loadToken;
      this._reloadDataFromBackend(function (aResults) {
        if (iToken !== this._loadToken) return;
        this._hydrateAndFormat(aResults);
        var oDetail = this._getODetail();
        var res = RecordsUtil.computeOpenOdaFromRows(aResults);
        if (res.hasSignalProp) oDetail.setProperty("/OpenOda", res.flag);
        var aRecordsBuilt = RecordsUtil.buildRecords01(aResults, { oDetail: oDetail, oVm: this.getOwnerComponent().getModel("vm") });
        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aResults);
        oVm.setProperty("/cache/recordsByKey/" + sKey, aRecordsBuilt);
        this._bindRecords(aRecordsBuilt);
      }.bind(this));
    },

    _reloadDataFromBackend: function (fnDone) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var sUserId = (oVm && oVm.getProperty("/userId")) || "E_ZEMAF";
      var sVendor10 = String(this._sVendorId || "").trim();
      if (/^\d+$/.test(sVendor10) && sVendor10.length < 10) sVendor10 = ("0000000000" + sVendor10).slice(-10);

      DataLoaderUtil.reloadDataFromBackend({
        oModel: this.getOwnerComponent().getModel(),
        filters: DataLoaderUtil.buildCommonFilters({ userId: sUserId, vendorId: this._sVendorId, material: this._sMaterial, season: this._sSeason }),
        vendor10: sVendor10, oVmCache: this._getOVm(),
        mockS3: !!mock.mockS3, forceStato: String(mock.forceStato || "").trim().toUpperCase(),
        onDone: fnDone
      });
    },

    _hydrateAndFormat: function (aRows) {
      var oDetail = this._getODetail();
      var oVm = this.getOwnerComponent().getModel("vm");
      var result = DataLoaderUtil.hydrateMmctFromRows(aRows, oDetail, oVm, N.getCodAgg);
      this._log("_hydrateMmctFromRows", result);
      var mMulti = PostUtil.getMultiFieldsMap(oDetail);
      PostUtil.formatIncomingRowsMultiSeparators(aRows, mMulti);
    },

    // ==================== MDC TABLE CONFIG ====================
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
        aProps.push({ name: name, label: f.label || name, dataType: "String", domain: f.domain || "", required: !!f.required });
      });

      if (!seen["STATO"]) {
        aProps.unshift({ name: "Stato", label: "Stato", dataType: "String", domain: "", required: false });
      }

      oVm.setProperty("/mdcCfg/screen3", { modelName: "detail", collectionPath: "/Records", properties: aProps });
      this._log("vm>/mdcCfg/screen3 set", { props: aProps.length });
    },

    _rebuildColumnsHard: async function (oTbl, aCfg01) {
      if (!oTbl) return;
      if (oTbl.initialized) await oTbl.initialized();

      var aOld = (oTbl.getColumns && oTbl.getColumns()) || [];
      aOld.slice().forEach(function (c) { oTbl.removeColumn(c); c.destroy(); });

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

      oTbl.addColumn(new MdcColumn({ header: "Dettaglio", visible: true, width: "100px",
        template: new Button({ icon: "sap-icon://enter-more", type: "Transparent", press: this.onGoToScreen4FromRow.bind(this) })
      }));

      var mP = MdcColumn.getMetadata().getAllProperties();
      var oStatoProps = { width: "70px", header: "Stato", visible: true, dataProperty: "Stato",
        template: this._createStatusCellTemplate("Stato") };
      if (mP.propertyKey) oStatoProps.propertyKey = "Stato";
      this._colStatoS3 = new MdcColumn(oStatoProps);
      oTbl.addColumn(this._colStatoS3);

      aCfgUnique.forEach(function (f) {
        var sKey = String(f.ui || "").trim();
        if (!sKey) return;
        var sHeader = (f.label || sKey) + (f.required ? " *" : "");
        var oColProps = { header: sHeader, visible: true, dataProperty: sKey,
          template: this._createCellTemplate(sKey, f) };
        if (mP.propertyKey) oColProps.propertyKey = sKey;
        oTbl.addColumn(new MdcColumn(oColProps));
      }.bind(this));
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
          new ObjectStatus({ text: "", icon: "sap-icon://circle-task", state: sStateExpr,
            tooltip: "{= 'Stato: ' + (${detail>" + sBindKey + "} || '') }"
          })
        ]
      });
    },

    // ==================== BIND RECORDS ====================
    _bindRecords: async function (aRecords) {
      var oDetail = this._getODetail();
      var a = aRecords || [];
      oDetail.setProperty("/RecordsAll", a);
      oDetail.setProperty("/Records", a);
      oDetail.setProperty("/RecordsCount", a.length);

      var oVm = this.getOwnerComponent().getModel("vm");
      var sRole = String((oVm && oVm.getProperty("/userType")) || "").trim().toUpperCase();
      var aSt = a.map(function (r) { return String((r && (r.__status || r.Stato)) || "ST").trim().toUpperCase(); });
      var allAP = aSt.length > 0 && aSt.every(function (s) { return s === "AP"; });
      var anyRJ = aSt.some(function (s) { return s === "RJ"; });
      var anyCH = aSt.some(function (s) { return s === "CH"; });
      var sAgg = allAP ? "AP" : (anyRJ ? "RJ" : (anyCH ? "CH" : "ST"));

      oDetail.setProperty("/__status", sAgg);
      oDetail.setProperty("/__canAddRow", StatusUtil.canAddRow(sRole, sAgg));
      oDetail.setProperty("/__role", sRole);

      RecordsUtil.refreshHeader3Fields(oDetail);
      this._log("_refreshHeader3Fields done");
      this._snapshotRecords = deepClone(a);

      var oTbl = this.byId("mdcTable3");
      var aCfg01Table = oDetail.getProperty("/_mmct/s01Table") || [];
      this._ensureMdcCfgScreen3(aCfg01Table);
      this._inlineFS = MdcTableUtil.ensureInlineFS(this._inlineFS);
      MdcTableUtil.resetInlineHeaderControls(this._inlineFS);
      await this._rebuildColumnsHard(oTbl, aCfg01Table);
      /* COLONNE DINAMICHE */
      TableColumnAutoSize.autoSize(this.byId("mdcTable3"), 60);
      if (oTbl && oTbl.initialized) await oTbl.initialized();
      if (oTbl) oTbl.setModel(oDetail, "detail");

      await this._applyInlineHeaderFilterSort(oTbl);
      this._applyClientFilters();
      if (oTbl && typeof oTbl.rebind === "function") oTbl.rebind();

      await P13nUtil.forceP13nAllVisible(oTbl, StateUtil, this._log.bind(this), "t0");
      await this._applyInlineHeaderFilterSort(oTbl);

      setTimeout(function () {
        P13nUtil.forceP13nAllVisible(oTbl, StateUtil, this._log.bind(this), "t300");
        setTimeout(function () { this._applyInlineHeaderFilterSort(oTbl); }.bind(this), 350);
      }.bind(this), 300);

      this._logTable("TABLE STATE @ after _bindRecords");
      this._ensurePostErrorRowHooks(oTbl);
    },

    _setInnerHeaderHeight: function (oMdcTbl) {
      try { MdcTableUtil.setInnerHeaderHeight(oMdcTbl, !!this.getView().getModel("ui").getProperty("/showHeaderFilters")); } catch (e) { }
    },

    _applyInlineHeaderFilterSort: async function (oMdcTbl) {
      this._inlineFS = MdcTableUtil.ensureInlineFS(this._inlineFS);
      return MdcTableUtil.applyInlineHeaderFilterSort(oMdcTbl, {
        view: this.getView(), inlineFS: this._inlineFS,
        applyClientFilters: this._applyClientFilters.bind(this), log: this._log.bind(this)
      });
    },

    // ==================== FILTERS (delegati a FilterSortUtil) ====================
    _applyClientFilters: function () {
      FilterSortUtil.applyClientFilters(this._getODetail(), this._inlineFS, this.byId("mdcTable3"));
      // Apply percentage validation visual states
      RecordsUtil.checkPercAndApply(this.byId("mdcTable3"), this._getODetail(), { rowsPath: "/RecordsAll", showToast: false });
    },
    onStatusFilterPress: function (oEvt) { FilterSortUtil.onStatusFilterPress(oEvt, this._getODetail(), this._applyClientFilters.bind(this)); },
    onGlobalFilter: function (oEvt) { FilterSortUtil.onGlobalFilter(oEvt, this._getODetail(), this._applyClientFilters.bind(this)); },
    _onInlineColFilterLiveChange: function (oEvt) { FilterSortUtil.onInlineColFilterLiveChange(oEvt, this._inlineFS, this._applyClientFilters.bind(this)); },
    _onInlineColSortPress: function (oEvt) { FilterSortUtil.onInlineColSortPress(oEvt, this._inlineFS, this._applyClientFilters.bind(this)); },
    onResetFiltersAndSort: function () {
      FilterSortUtil.resetFiltersAndSort({
        oDetail: this._getODetail(), inlineFS: this._inlineFS, inputFilter: this.byId("inputFilter3"),
        table: this.byId("mdcTable3"), applyClientFiltersFn: this._applyClientFilters.bind(this),
        applyInlineHeaderFilterSortFn: this._applyInlineHeaderFilterSort.bind(this),
        setInnerHeaderHeightFn: this._setInnerHeaderHeight.bind(this)
      });
    },

    // ==================== HEADER BUTTONS ====================
    onToggleHeaderFilters: function () { FilterSortUtil.toggleHeaderFilters(this.getView().getModel("ui"), this.byId("mdcTable3"), this._setInnerHeaderHeight.bind(this), this._applyInlineHeaderFilterSort.bind(this)); },
    onToggleHeaderSort: function () { FilterSortUtil.toggleHeaderSort(this.getView().getModel("ui"), this.byId("mdcTable3"), this._applyInlineHeaderFilterSort.bind(this)); },
    onOpenColumnFilters: function () { this.onToggleHeaderFilters(); },
    onOpenSort: function () { this.onToggleHeaderSort(); },

    // ==================== ROW ERRORS ====================
    _clearPostErrorByContext: function (oCtx) {
      var self = this;
      RowErrorUtil.clearPostErrorByContext(oCtx, { oDetail: this._getODetail(), updateRowStyles: function () { var oTbl = self.byId("mdcTable3"); self._updatePostErrorRowStyles(MdcTableUtil.getInnerTableFromMdc(oTbl)); } });
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
      RowErrorUtil.markRowsWithPostErrors(aRespLines, { oDetail: this._getODetail(), toStableString: N.toStableString, applyClientFilters: this._applyClientFilters.bind(this), ensurePostErrorRowHooks: function () { var oTbl = self.byId("mdcTable3"); self._ensurePostErrorRowHooks(oTbl); self._updatePostErrorRowStyles(MdcTableUtil.getInnerTableFromMdc(oTbl)); } });
    },

    // ==================== TOUCH CODAGG (delegato) ====================
    _touchCodAggParent: function (p, sPath) {
      TouchCodAggUtil.touchCodAggParent(p, sPath, { oDetail: this._getODetail(), oVm: this._getOVm(), cacheKey: this._getExportCacheKey() });
      // Live percentage check on edit
      RecordsUtil.checkPercAndApply(this.byId("mdcTable3"), this._getODetail(), { rowsPath: "/RecordsAll" });
    },

    // ==================== NAV SCREEN4 ====================
    onGoToScreen4FromRow: function (oEvent) {
      try {
        var oBtn = oEvent.getSource();
        var oCtx = oBtn && oBtn.getBindingContext && (oBtn.getBindingContext("detail") || oBtn.getBindingContext());
        if (!oCtx) return;
        var oRow = oCtx.getObject && oCtx.getObject();
        var iIdx = (oRow && oRow.idx != null) ? parseInt(oRow.idx, 10) : NaN;
        if (isNaN(iIdx) && oCtx.getPath) { var mm = String(oCtx.getPath() || "").match(/\/(\d+)\s*$/); if (mm) iIdx = parseInt(mm[1], 10); }
        if (isNaN(iIdx) || iIdx < 0) iIdx = 0;

        Screen4CacheUtil.setSelectedParentForScreen4(oRow, this._getOVm(), this.getOwnerComponent());
        Screen4CacheUtil.ensureScreen4CacheForParentIdx(iIdx, N.toStableString(oRow.guidKey || oRow.GUID || oRow.Guid), this._getOVm(), this._getCacheKeySafe());

        this.getOwnerComponent().getRouter().navTo("Screen4", { vendorId: encodeURIComponent(this._sVendorId), material: encodeURIComponent(this._sMaterial), recordKey: encodeURIComponent(String(iIdx)), mode: this._sMode || "A" });
      } catch (e) { console.error("onGoToScreen4FromRow ERROR", e); }
    },

    // ==================== MDC SELECTION ====================
    _getSelectedParentObjectsFromMdc: function () { return MdcTableUtil.getSelectedObjectsFromMdc(this.byId(this.PARENT_TABLE_ID), "detail"); },
    _clearSelectionMdc: function () { MdcTableUtil.clearSelectionMdc(this.byId(this.PARENT_TABLE_ID)); },
    _selectFirstRowMdc: function () { MdcTableUtil.selectFirstRowMdc(this.byId(this.PARENT_TABLE_ID)); },

    // ==================== ADD ROW ====================
    onAddRow: function () {
      var oDetail = this._getODetail();
      if (!oDetail) return MessageToast.show("Model 'detail' non trovato");
      if (!oDetail.getProperty("/__canAddRow")) return MessageToast.show("Non hai permessi per aggiungere righe");

      var oVm = this._getOVm(), sCacheKey = this._getExportCacheKey();
      var guidTpl = RowManagementUtil.pickTemplateGuidForNewParent({ selectedObjects: this._getSelectedParentObjectsFromMdc(), oVm: oVm, cacheKey: sCacheKey, toStableString: N.toStableString, rowGuidKey: RecordsUtil.rowGuidKey, getCodAgg: N.getCodAgg });
      var aTplRows = RowManagementUtil.getTemplateRowsByGuid(guidTpl, { oVm: oVm, cacheKey: sCacheKey, rowGuidKey: RecordsUtil.rowGuidKey, isBaseCodAgg: N.isBaseCodAgg });

      if (!aTplRows || !aTplRows.length) {
        MessageToast.show("Template mancante: non esiste una riga con CodAgg = \"N\" da usare come modello");
        return;
      }

      var result = RowManagementUtil.createNewParentRow({ oDetail: oDetail, template: aTplRows[0] || {}, cfg01: oDetail.getProperty("/_mmct/s01") || [], vendorId: this._sVendorId, material: this._sMaterial, normalizeVendor10: N.normalizeVendor10, toArrayMulti: RecordsUtil.toArrayMulti, statusText: RecordsUtil.statusText, genGuidNew: N.genGuidNew });
      var aNewDetails = RowManagementUtil.createNewDetailRows(aTplRows, { template: aTplRows[0] || {}, cfg02: oDetail.getProperty("/_mmct/s02") || [], guid: result.guid, vendorId: this._sVendorId, material: this._sMaterial, cat: oDetail.getProperty("/_mmct/cat") || "", normalizeVendor10: N.normalizeVendor10, toArrayMulti: RecordsUtil.toArrayMulti });

      var aAll = (oDetail.getProperty("/RecordsAll") || []).slice(); aAll.push(result.row); oDetail.setProperty("/RecordsAll", aAll);
      var aRC = (oVm.getProperty("/cache/recordsByKey/" + sCacheKey) || []).slice(); aRC.push(result.row); oVm.setProperty("/cache/recordsByKey/" + sCacheKey, aRC);
      var aRW = (oVm.getProperty("/cache/dataRowsByKey/" + sCacheKey) || []).slice(); oVm.setProperty("/cache/dataRowsByKey/" + sCacheKey, aRW.concat(aNewDetails));

      Screen4CacheUtil.setSelectedParentForScreen4(result.row, oVm, this.getOwnerComponent());
      Screen4CacheUtil.ensureScreen4CacheForParentIdx(result.idx, result.guid, oVm, this._getCacheKeySafe());
      this._applyClientFilters();

      // Scroll to the newly added row
      var oTbl = this.byId("mdcTable3");
      var aFiltered = oDetail.getProperty("/Records") || [];
      var iNewRowIndex = aFiltered.length - 1;
      if (iNewRowIndex >= 0) {
        MdcTableUtil.scrollToRow(oTbl, iNewRowIndex);
      }

      MessageToast.show("Riga aggiunta");
    },

    // ==================== DELETE ROWS ====================
    onDeleteRows: function () {
      var oDetail = this._getODetail();
      if (!oDetail) return MessageToast.show("Model 'detail' non trovato");
      var aSel = this._getSelectedParentObjectsFromMdc();
      if (!aSel.length) return MessageToast.show("Seleziona almeno una riga da eliminare");
      if (!RowManagementUtil.canDeleteSelectedRows(aSel).canDelete) return MessageToast.show("Non puoi eliminare partita fornitore approvati");
      var aIdxToRemove = RowManagementUtil.getIdxToRemove(aSel);
      if (!aIdxToRemove.length) return MessageToast.show("Nessun idx valido nelle righe selezionate");

      var aDeletedParents = oDetail.getProperty("/__deletedParents") || [];
      aSel.forEach(function (r) { var g = (r && (r.GUID || r.Guid || r.guidKey)) || ""; if (g && String(g).indexOf("-new") < 0) aDeletedParents.push(r); });
      oDetail.setProperty("/__deletedParents", aDeletedParents);
      oDetail.setProperty("/RecordsAll", (oDetail.getProperty("/RecordsAll") || []).filter(function (r) { return aIdxToRemove.indexOf(parseInt(r && r.idx, 10)) < 0; }));

      var oVm = this._getOVm(), sKeyCache = this._getExportCacheKey();
      var mDelPair = {}, mDelGuid = {};
      aSel.forEach(function (p) { var g = N.toStableString(p && (p.guidKey || p.GUID || p.Guid)), f = N.toStableString(p && p.Fibra); if (g && f) mDelPair[g + "||" + f] = true; else if (g) mDelGuid[g] = true; });
      oVm.setProperty("/cache/recordsByKey/" + sKeyCache, (oVm.getProperty("/cache/recordsByKey/" + sKeyCache) || []).filter(function (r) { return aIdxToRemove.indexOf(parseInt(r && r.idx, 10)) < 0; }));

      var aRowsCacheBefore = oVm.getProperty("/cache/dataRowsByKey/" + sKeyCache) || [];
      aSel.forEach(function (p) { PostUtil.stashDeleteForPostFromCache(p, aRowsCacheBefore, oDetail, { toStableString: N.toStableString, rowGuidKey: RecordsUtil.rowGuidKey }); }.bind(this));
      oVm.setProperty("/cache/dataRowsByKey/" + sKeyCache, (oVm.getProperty("/cache/dataRowsByKey/" + sKeyCache) || []).filter(function (r) { var g = RecordsUtil.rowGuidKey(r), f = RecordsUtil.rowFibra(r); return !(mDelPair[g + "||" + f] || mDelGuid[g]); }));

      Screen4CacheUtil.purgeScreen4CacheByParentIdx(aIdxToRemove, oVm, this._getCacheKeySafe());
      var oSel = Screen4CacheUtil.getSelectedParentForScreen4(this.getOwnerComponent().getModel("vm"));
      if (oSel && aIdxToRemove.indexOf(parseInt(oSel.idx, 10)) >= 0) Screen4CacheUtil.setSelectedParentForScreen4(null, oVm, this.getOwnerComponent());

      this._applyClientFilters();
      this._clearSelectionMdc();
      MessageToast.show("Righe eliminate");
    },

    // ==================== SAVE ====================
    onSave: function () {
      // Validate percentage fields (e.g. QtaFibra sum <= 100%)
      if (!RecordsUtil.validatePercBeforeSave(this._getODetail(), "/RecordsAll")) return;

      var vr = SaveUtil.validateRequiredBeforePost({ oDetail: this._getODetail(), oVm: this._getOVm(), getCacheKeySafe: this._getCacheKeySafe.bind(this), getExportCacheKey: this._getExportCacheKey.bind(this), toStableString: N.toStableString, rowGuidKey: RecordsUtil.rowGuidKey, getCodAgg: N.getCodAgg });
      if (!vr.ok) {
        var top = vr.errors.slice(0, 15).map(function (e) { return "- [" + e.page + "] " + e.label + " (Riga: " + (e.row || "?") + ")"; }).join("\n");
        return MessageBox.error("Compila tutti i campi obbligatori prima di salvare.\n\n" + top + (vr.errors.length > 15 ? "\n\n... altri " + (vr.errors.length - 15) + " errori" : ""));
      }

      var oVm = this.getOwnerComponent().getModel("vm"), mock = (oVm && oVm.getProperty("/mock")) || {};
      var oDetail = this._getODetail();
      var oPayload = SaveUtil.buildSavePayload({ oDetail: oDetail, oVm: this._getOVm(), userId: (oVm && oVm.getProperty("/userId")) || "E_ZEMAF", vendor10: N.normalizeVendor10(this._sVendorId), material: String(this._sMaterial || "").trim(), getExportCacheKey: this._getExportCacheKey.bind(this), toStableString: N.toStableString, getCodAgg: N.getCodAgg, getMultiFieldsMap: function () { return PostUtil.getMultiFieldsMap(oDetail); }, normalizeMultiString: N.normalizeMultiString, uuidv4: N.uuidv4 });

      var self = this;
      SaveUtil.executePost({ oModel: this.getOwnerComponent().getModel(), payload: oPayload, mock: !!mock.mockS3,
        onSuccess: function (oData) { oDetail.setProperty("/__deletedLinesForPost", []); self._invalidateScreen3Cache(); self._refreshAfterPost(oData); },
        onPartialError: function (aErr) { self._markRowsWithPostErrors(aErr); PostUtil.showPostErrorMessagePage(aErr); },
        onFullError: function () { }
      });
    },

    _invalidateScreen3Cache: function () { var k = this._getExportCacheKey(), v = this._getOVm(); v.setProperty("/cache/dataRowsByKey/" + k, []); v.setProperty("/cache/recordsByKey/" + k, []); },

    _refreshAfterPost: function (oPostData) {
      console.log("[S3] POST RESULT (oData):", JSON.parse(JSON.stringify(oPostData || {})));
      var self = this;
      return new Promise(function (resolve) {
        self._reloadDataFromBackend(function (aResults) {
          self._hydrateAndFormat(aResults);
          var oDetail = self._getODetail();
          var res = RecordsUtil.computeOpenOdaFromRows(aResults);
          if (res.hasSignalProp) oDetail.setProperty("/OpenOda", res.flag);
          var aRecordsBuilt = RecordsUtil.buildRecords01(aResults, { oDetail: oDetail, oVm: self.getOwnerComponent().getModel("vm") });
          var oVm = self._getOVm(), sKey = self._getExportCacheKey();
          oVm.setProperty("/cache/dataRowsByKey/" + sKey, aResults);
          oVm.setProperty("/cache/recordsByKey/" + sKey, aRecordsBuilt);
          Promise.resolve(self._bindRecords(aRecordsBuilt)).then(function () { self._snapshotRecords = deepClone(aRecordsBuilt); console.log("[S3] REFRESH DONE (rows from backend):", aResults.length); resolve(aResults); });
        });
      });
    },

    // ==================== EXPORT ====================
    onExportExcel: async function () {
      await ExportUtil.exportExcel({ oVm: this.getOwnerComponent().getModel("vm"), oDetail: this._getODetail(), toStableString: N.toStableString, statusText: RecordsUtil.statusText, inlineFS: this._inlineFS, vendorId: this._sVendorId, material: this._sMaterial, cacheKey: this._getExportCacheKey() });
    },
    onPrint: function () { MessageToast.show("Stampa: TODO"); },

    // ==================== NAV BACK ====================
    _hasUnsavedChanges: function () {
      return RecordsUtil.hasUnsavedChanges(this._getODetail(), this._snapshotRecords);
    },
    _getNavBackFallback: function () {
      return { route: "Screen2", params: { vendorId: encodeURIComponent(this._sVendorId), mode: this._sMode || "A" } };
    }
  });
});