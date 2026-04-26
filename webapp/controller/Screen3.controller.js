sap.ui.define([
  "apptracciabilita/apptracciabilita/controller/BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
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
  "apptracciabilita/apptracciabilita/util/screen3SaveUtil",
  "apptracciabilita/apptracciabilita/util/dataLoaderUtil",
  "apptracciabilita/apptracciabilita/util/rowManagementUtil",
  "apptracciabilita/apptracciabilita/util/filterSortUtil",
  "apptracciabilita/apptracciabilita/util/screen4CacheUtil",
  "apptracciabilita/apptracciabilita/util/touchCodAggUtil",
  "apptracciabilita/apptracciabilita/util/TableColumnAutoSize",

], function (
  BaseController, JSONModel, MessageToast,
  Button, MdcColumn, HBox, ObjectStatus, StateUtil,
  N, Domains, StatusUtil, MdcTableUtil, P13nUtil,
  CellTemplateUtil, PostUtil, RowErrorUtil, ExportUtil, RecordsUtil,
  Screen3SaveUtil, DataLoaderUtil, RowManagementUtil, FilterSortUtil,
  Screen4CacheUtil, TouchCodAggUtil, TableColumnAutoSize,
  PercUtil
) {
  "use strict";

  var deepClone = N.deepClone;

  return BaseController.extend("apptracciabilita.apptracciabilita.controller.Screen3", {

    _sLogPrefix: "[S3]",
    _sMockFlag: "mockS3",
    PARENT_TABLE_ID: "mdcTable3",
    MAIN_TABLE_ID: "mdcTable3",
    MAIN_INPUT_FILTER_ID: "inputFilter3",

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
        __canEdit: false, __canAddRow: false, __canCopyRow: false, __canDeleteRow: false, __canApprove: false, __canReject: false,
__noMatListMode: false 
      }), "detail");

      this._snapshotRecords = null;
      this._originalSnapshot = null;
      this._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {}, filterInputs: {}, headerTitles: {}, headerRows: {}, headerBoxes: {} };

      setTimeout(function () { this._logTable("TABLE STATE @ after onInit"); }.bind(this), 0);
    },

    // ==================== ROUTE ====================
    _onRouteMatched: function (oEvent) {
      var oArgs = oEvent.getParameter("arguments") || {};
      this._sMode = oArgs.mode || "A";
      this._sVendorId = decodeURIComponent(oArgs.vendorId || "");
      this._sMaterial = decodeURIComponent(oArgs.material || "");
      this._sSeason = decodeURIComponent(oArgs.season || "");

      debugger

      // ── NoMatList: rileva flag impostato da Screen2 ──
      var oVmNM = this.getOwnerComponent().getModel("vm");
      this._bNoMatListMode = !!(oVmNM && oVmNM.getProperty("/__noMatListMode"));
      this._sNoMatListCat = (oVmNM && oVmNM.getProperty("/__noMatListCat")) || "";
      if (oVmNM) oVmNM.setProperty("/__currentSeason", this._sSeason || "");
      if (this._bNoMatListMode) {
        this._log("NoMatList MODE attivo -> mostro anche template, add/copy/delete disabilitati, filtro per categoria:", this._sNoMatListCat);
      }

      var self = this;
      this._ensureUserInfosLoaded().then(function () {
        self._log("_onRouteMatched args", oArgs);

var oVm = self.getOwnerComponent().getModel("vm");
        var bReturningFromS4 = !!oVm.getProperty("/__skipS3BackendOnce");
        var bForceCacheReload = !!oVm.getProperty("/__forceS3CacheReload");

        // If Screen4 just saved, the snapshot contains stale data with old
        // local Guids. Ignore it and use the fresh VM cache instead.
        var aSavedSnapshot = (bReturningFromS4 && self._snapshotRecords && !bForceCacheReload)
          ? self._snapshotRecords
          : null;

        if (bForceCacheReload) {
          self._snapshotRecords = null;
          self._originalSnapshot = null;
          oVm.setProperty("/__forceS3CacheReload", false);
        } else {
          self._snapshotRecords = null;
          if (!bReturningFromS4) {
            self._originalSnapshot = null;
          }
        }

        var oUi = self.getView().getModel("ui");
        if (oUi) { oUi.setProperty("/showHeaderFilters", false); oUi.setProperty("/showHeaderSort", true); }

        var oDetail = self._getODetail();
        oDetail.setData({
          Header3Fields: [], VendorId: self._sVendorId, Material: self._sMaterial,
          RecordsAll: [], Records: [], RecordsCount: 0,
          _mmct: { cat: "", s01: [], s02: [] }, __q: "", __statusFilter: "",
          __noMatListMode: !!self._bNoMatListMode  // ← NoMatList: propaga al model
        }, true);

        var sOpenCache = self._readOpenOdaFromMatInfoCache();
        if (sOpenCache) oDetail.setProperty("/OpenOda", sOpenCache);

        self._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {}, filterInputs: {}, headerTitles: {}, headerRows: {}, headerBoxes: {} };
        var oInp = self.byId("inputFilter3");
        if (oInp && oInp.setValue) oInp.setValue("");

        self._logTable("TABLE STATE @ before _loadDataOnce");
        self._loadDataOnce(aSavedSnapshot);
      });
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
        this._bindFromCache(aRows, sKey, bSkip, aSavedSnapshot);
      }

      if (bSkip && bHasCache) {
        this._log("_loadDataOnce: skip backend reload (back from Screen4)", { cacheKey: sKey });
        return;
      }

      this._loadToken = (this._loadToken || 0) + 1;
      var iToken = this._loadToken;
      this._reloadDataFromBackend(function (aResults) {
        if (iToken !== this._loadToken) return;
        this._bindFromBackend(aResults, sKey);
      }.bind(this));
    },

    _bindFromCache: function (aRows, sKey, bSkip, aSavedSnapshot) {
      var oVm = this._getOVm();
      try {
        this._hydrateAndFormat(aRows);
        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aRows);

        var oDetail = this._getODetail();
        var aRecs;

        if (bSkip && aSavedSnapshot && aSavedSnapshot.length) {
          this._applySnapshotStatusAndNotes(aSavedSnapshot, aRows);
          aRecs = this._bNoMatListMode
            ? aSavedSnapshot
            : this._excludeTemplatesByRawRows(aSavedSnapshot, aRows);
        } else {
          aRecs = RecordsUtil.buildRecords01(aRows, {
            oDetail: oDetail,
            oVm: this.getOwnerComponent().getModel("vm"),
            includeTemplates: !!this._bNoMatListMode
          });
          if (!this._bNoMatListMode) {
            aRecs = this._excludeTemplatesByRawRows(aRecs, aRows);
          }
        }

        oVm.setProperty("/cache/recordsByKey/" + sKey, aRecs);
        var resC = RecordsUtil.computeOpenOdaFromRows(aRows);
        if (resC.hasSignalProp) oDetail.setProperty("/OpenOda", resC.flag);

        if (bSkip && aSavedSnapshot) this._bKeepOriginalSnapshot = true;
        this._bindRecords(aRecs);
        this._bKeepOriginalSnapshot = false;

        if (aSavedSnapshot) this._snapshotRecords = aSavedSnapshot;
      } catch (e) {
        console.warn("[S3] cache bind failed", e);
      }
    },

    _bindFromBackend: function (aResults, sKey) {
      var oVm = this._getOVm();
      this._hydrateAndFormat(aResults);

      var oDetail = this._getODetail();
      var res = RecordsUtil.computeOpenOdaFromRows(aResults);
      if (res.hasSignalProp) oDetail.setProperty("/OpenOda", res.flag);

      var aRecordsBuilt = RecordsUtil.buildRecords01(aResults, {
        oDetail: oDetail,
        oVm: this.getOwnerComponent().getModel("vm"),
        includeTemplates: !!this._bNoMatListMode
      });
      if (!this._bNoMatListMode) {
        aRecordsBuilt = this._excludeTemplatesByRawRows(aRecordsBuilt, aResults);
      }

      oVm.setProperty("/cache/dataRowsByKey/" + sKey, aResults);
      oVm.setProperty("/cache/recordsByKey/" + sKey, aRecordsBuilt);
      this._bindRecords(aRecordsBuilt);
    },

    // Snapshot salvato uscendo da Screen4 → contiene record con possibile
    // stato "stale". Lo risincronizza leggendo Stato/Note dalle righe grezze
    // appena rehidratate, calcolando lo stato di gruppo (AP/RJ/CH/ST).
    _applySnapshotStatusAndNotes: function (aSavedSnapshot, aRows) {
      var mRawByGuid = {};
      (aRows || []).forEach(function (r) {
        var g = RecordsUtil.rowGuidKey(r);
        if (!g) return;
        if (!mRawByGuid[g]) mRawByGuid[g] = [];
        mRawByGuid[g].push(r);
      });

      aSavedSnapshot.forEach(function (rec) {
        if (!rec) return;
        var g = N.toStableString(rec.guidKey || rec.GUID || rec.Guid || "");
        var aRaw = mRawByGuid[g] || [];
        if (!aRaw.length) return;

        var aRawSt = aRaw.map(function (r) { return String(r.Stato || "ST").trim().toUpperCase(); });
        var st;
        if (aRawSt.every(function (s) { return s === "AP"; })) st = "AP";
        else if (aRawSt.some(function (s) { return s === "RJ"; })) st = "RJ";
        else if (aRawSt.some(function (s) { return s === "CH"; })) st = "CH";
        else st = "ST";
        rec.__status = st;
        rec.Stato = st;

        var rNote = aRaw.find(function (r) { return r.Note && String(r.Note).trim(); });
        if (rNote) rec.Note = rNote.Note;
      });
    },

    _excludeTemplatesByRawRows: function (aRecs, aRows) {
      var mTpl = {};
      (aRows || []).forEach(function (r) {
        if (N.getCodAgg(r) === "N") mTpl[RecordsUtil.rowGuidKey(r)] = true;
      });
      return (aRecs || []).filter(function (rec) {
        return !mTpl[N.toStableString(rec && (rec.guidKey || rec.GUID || rec.Guid))];
      });
    },

    _reloadDataFromBackend: function (fnDone) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var sUserId = (oVm && oVm.getProperty("/userId")) || "";
      var sVendor10 = String(this._sVendorId || "").trim();
      if (/^\d+$/.test(sVendor10) && sVendor10.length < 10) sVendor10 = ("0000000000" + sVendor10).slice(-10);

      // ── NoMatList: usa filtro per CatMateriale invece di Materiale/Stagione ──
      var oFilterOpts = {
        userId: sUserId,
        vendorId: this._sVendorId,
        material: this._sMaterial,
        season: this._sSeason
      };
      // Filtri base (senza CatMateriale) per VendorBatchSet
      var oFilterOptsVB = {
        userId: sUserId,
        vendorId: this._sVendorId,
        material: this._sMaterial,
        season: this._sSeason
      };
      if (this._bNoMatListMode && this._sNoMatListCat) {
        oFilterOpts.catMateriale = this._sNoMatListCat;
        // VendorBatchSet non ha CatMateriale → usa filtri normali senza categoria
      }

      DataLoaderUtil.reloadDataFromBackend({
        oModel: this.getOwnerComponent().getModel(),
        filters: DataLoaderUtil.buildCommonFilters(oFilterOpts),
        filtersVendorBatch: DataLoaderUtil.buildCommonFilters(oFilterOptsVB),
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

      // Only show Dettaglio column if the category has detail level (S02 fields)
      var oDetail = this.getView().getModel("detail");
      var bHasDetail = !!(oDetail && oDetail.getProperty("/_mmct/hasDetail"));
      if (bHasDetail) {
        oTbl.addColumn(new MdcColumn({ header: "Dettaglio", visible: true, width: "100px",
          template: new Button({ icon: "sap-icon://enter-more", type: "Transparent", press: this.onGoToScreen4FromRow.bind(this) })
        }));
      }

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

      // ── NoMatList: disabilita add/copy/delete ──
      if (this._bNoMatListMode) {
        oDetail.setProperty("/__canAddRow", false);
        oDetail.setProperty("/__noMatListMode", true);
        oDetail.setProperty("/__canCopyRow", sRole === "E" && StatusUtil.canEdit(sRole, sAgg));
        oDetail.setProperty("/__canDeleteRow", sRole === "E" && StatusUtil.canEdit(sRole, sAgg));
      } else {
        oDetail.setProperty("/__canCopyRow", oDetail.getProperty("/__canAddRow"));
        oDetail.setProperty("/__canDeleteRow", oDetail.getProperty("/__canAddRow"));
      }

      var bCanApproveReject = (sRole === "I" || sRole === "S");
      oDetail.setProperty("/__canApprove", bCanApproveReject);
      oDetail.setProperty("/__canReject", bCanApproveReject);

      RecordsUtil.refreshHeader3Fields(oDetail);
      this._log("_refreshHeader3Fields done");
      this._snapshotRecords = deepClone(a);
      if (!this._bKeepOriginalSnapshot) {
        this._originalSnapshot = deepClone(a);
      }

      var oTbl = this.byId("mdcTable3");
      var aCfg01Table = oDetail.getProperty("/_mmct/s01Table") || [];
      this._ensureMdcCfgScreen3(aCfg01Table);
      this._inlineFS = MdcTableUtil.ensureInlineFS(this._inlineFS);
      MdcTableUtil.resetInlineHeaderControls(this._inlineFS);
      await this._rebuildColumnsHard(oTbl, aCfg01Table);
      TableColumnAutoSize.autoSize(this.byId("mdcTable3"), 60);
      if (oTbl && oTbl.initialized) await oTbl.initialized();
      if (oTbl) oTbl.setModel(oDetail, "detail");

      await this._applyInlineHeaderFilterSort(oTbl);
      this._applyClientFilters();
      if (oTbl && typeof oTbl.rebind === "function") oTbl.rebind();

      this._clearSelectionMdc();

      await P13nUtil.forceP13nAllVisible(oTbl, StateUtil, this._log.bind(this), "t0");
      await this._applyInlineHeaderFilterSort(oTbl);

      this._scheduleHeaderFilterSort(oTbl);

      this._logTable("TABLE STATE @ after _bindRecords");
      this._ensurePostErrorRowHooks(oTbl);
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
      TouchCodAggUtil.touchCodAggParent(p, sPath, { oDetail: this._getODetail(), oVm: this._getOVm(), cacheKey: this._getExportCacheKey() });
      this._checkParentDirtyRevert(p, sPath);
      /* RecordsUtil.checkPercAndApply(this.byId("mdcTable3"), this._getODetail(), { rowsPath: "/RecordsAll" }); */
    },

    _checkParentDirtyRevert: function (p, sPath) {
      var snap = this._snapshotRecords;
      if (!snap || !p || p.__isNew) return;

      var oDetail = this._getODetail();
      var aKeys = (oDetail.getProperty("/_mmct/s01") || []).map(function (f) { return f && f.ui; }).filter(Boolean);
      if (!aKeys.length) return;

      var iIdx = (p.idx != null) ? parseInt(p.idx, 10) : NaN;
      if (isNaN(iIdx)) return;
      var snapRow = null;
      snap.forEach(function (s) { if (!snapRow && parseInt(s.idx, 10) === iIdx) snapRow = s; });
      if (!snapRow) return;

      function vMatch(v1, v2) {
        if (Array.isArray(v1) && Array.isArray(v2)) return JSON.stringify(v1) === JSON.stringify(v2);
        return String(v1 == null ? "" : v1) === String(v2 == null ? "" : v2);
      }

      if (!aKeys.every(function (k) { return vMatch(p[k], snapRow[k]); })) return;

      var sOrigCa = snapRow.CodAgg || "";
      p.CodAgg = sOrigCa;
      if (sPath) oDetail.setProperty(sPath + "/CodAgg", sOrigCa);

      var idx = iIdx;
      var aAll = oDetail.getProperty("/RecordsAll") || [];
      for (var i = 0; i < aAll.length; i++) {
        if (parseInt(aAll[i] && aAll[i].idx, 10) === idx) {
          oDetail.setProperty("/RecordsAll/" + i + "/CodAgg", sOrigCa);
          break;
        }
      }

      var g = N.toStableString(N.getGuid(p));
      if (g) {
        var oVm = this._getOVm();
        var sKey = this._getExportCacheKey();
        var aRaw = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || [];
        aRaw.forEach(function (r) { if (N.rowGuidKey(r) === g) r.CodAgg = sOrigCa; });
        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aRaw);
      }

      if (Array.isArray(this._originalSnapshot)) {
        for (var j = 0; j < this._originalSnapshot.length; j++) {
          if (parseInt(this._originalSnapshot[j] && this._originalSnapshot[j].idx, 10) === idx) {
            this._originalSnapshot[j] = N.deepClone(p);
            break;
          }
        }
      }
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

        var oDetail = this._getODetail();
        var aCurrent = oDetail.getProperty("/RecordsAll") || [];
        if (aCurrent.length) {
          this._snapshotRecords = deepClone(aCurrent);
        }

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
     
var guidTpl = RowManagementUtil.pickTemplateGuidForNewParent({ selectedObjects: [], oVm: oVm, cacheKey: sCacheKey, toStableString: N.toStableString, rowGuidKey: RecordsUtil.rowGuidKey, getCodAgg: N.getCodAgg });
var aTplRows = RowManagementUtil.getTemplateRowsByGuid(guidTpl, { oVm: oVm, cacheKey: sCacheKey, rowGuidKey: RecordsUtil.rowGuidKey, isBaseCodAgg: N.isBaseCodAgg });

      if (!aTplRows || !aTplRows.length) {
        MessageToast.show("Template mancante: non esiste una riga con CodAgg = \"N\" da usare come modello");
        return;
      }

      var result = RowManagementUtil.createNewParentRow({ oDetail: oDetail, template: aTplRows[0] || {}, cfg01: oDetail.getProperty("/_mmct/s01") || [], vendorId: this._sVendorId, material: this._sMaterial, normalizeVendor10: N.normalizeVendor10, toArrayMulti: RecordsUtil.toArrayMulti, statusText: RecordsUtil.statusText, genGuidNew: N.genGuidNew });

var aNewDetails = RowManagementUtil.createNewDetailRows(aTplRows, {
  template: aTplRows[0] || {},
  cfg02: oDetail.getProperty("/_mmct/s02") || [],
  cfgStruct: oDetail.getProperty("/_mmct/s00") || [],  // ← Prendiamo gli strutturali dinamicamente
  guid: result.guid,
  vendorId: this._sVendorId,
  material: this._sMaterial,
  cat: oDetail.getProperty("/_mmct/cat") || "",
  normalizeVendor10: N.normalizeVendor10,
  toArrayMulti: RecordsUtil.toArrayMulti
});


      var aAll = (oDetail.getProperty("/RecordsAll") || []).slice(); aAll.push(result.row); oDetail.setProperty("/RecordsAll", aAll);
      var aRC = (oVm.getProperty("/cache/recordsByKey/" + sCacheKey) || []).slice(); aRC.push(result.row); oVm.setProperty("/cache/recordsByKey/" + sCacheKey, aRC);
      var aRW = (oVm.getProperty("/cache/dataRowsByKey/" + sCacheKey) || []).slice(); oVm.setProperty("/cache/dataRowsByKey/" + sCacheKey, aRW.concat(aNewDetails));

      Screen4CacheUtil.setSelectedParentForScreen4(result.row, oVm, this.getOwnerComponent());
      Screen4CacheUtil.ensureScreen4CacheForParentIdx(result.idx, result.guid, oVm, this._getCacheKeySafe());
      this._applyClientFilters();

      var oTbl = this.byId("mdcTable3");
      var aFiltered = oDetail.getProperty("/Records") || [];
      var iNewRowIndex = aFiltered.length - 1;
      if (iNewRowIndex >= 0) {
        MdcTableUtil.scrollToRow(oTbl, iNewRowIndex);
      }

      MessageToast.show("Riga aggiunta");
    },

    // ==================== COPY ROW ====================
    onCopyRow: function () {
      var oDetail = this._getODetail();
      if (!oDetail) return MessageToast.show("Model 'detail' non trovato");
      if (!oDetail.getProperty("/__canCopyRow")) return MessageToast.show("Non hai permessi per copiare righe");

      var aSel = this._getSelectedParentObjectsFromMdc();
      if (!aSel.length) return MessageToast.show("Seleziona un record da copiare");
      if (aSel.length > 1) return MessageToast.show("Seleziona un solo record da copiare");

      var oSource = aSel[0];
      var sSourceGuid = N.toStableString(oSource.guidKey || oSource.Guid || oSource.GUID || "");
      if (!sSourceGuid) return MessageToast.show("Record senza Guid, impossibile copiare");

      var oVm = this._getOVm();
      var sCacheKey = this._getExportCacheKey();

      var aRawAll = oVm.getProperty("/cache/dataRowsByKey/" + sCacheKey) || [];
      var aSourceRaws = aRawAll.filter(function (r) {
        return N.toStableString(RecordsUtil.rowGuidKey(r)) === sSourceGuid;
      });
      if (!aSourceRaws.length) return MessageToast.show("Nessuna riga dettaglio trovata per questo record");

      var aAll = oDetail.getProperty("/RecordsAll") || [];
      var iMax = -1;
      aAll.forEach(function (r) {
        var n = parseInt(r && r.idx, 10);
        if (!isNaN(n) && n > iMax) iMax = n;
      });

      var oClone = RowManagementUtil.cloneRecordForCopy({
        source: oSource,
        sourceRaws: aSourceRaws,
        newIdx: iMax + 1,
        newGuid: N.genGuidNew(),
        attachmentUiKeys: RowManagementUtil.collectAttachmentUiKeys(oDetail),
        statusText: RecordsUtil.statusText
      });

      oDetail.setProperty("/RecordsAll", aAll.concat([oClone.parent]));
      oVm.setProperty(
        "/cache/recordsByKey/" + sCacheKey,
        (oVm.getProperty("/cache/recordsByKey/" + sCacheKey) || []).concat([oClone.parent])
      );
      oVm.setProperty(
        "/cache/dataRowsByKey/" + sCacheKey,
        (oVm.getProperty("/cache/dataRowsByKey/" + sCacheKey) || []).concat(oClone.raws)
      );

      Screen4CacheUtil.setSelectedParentForScreen4(oClone.parent, oVm, this.getOwnerComponent());
      Screen4CacheUtil.ensureScreen4CacheForParentIdx(oClone.idx, oClone.guid, oVm, this._getCacheKeySafe());
      this._applyClientFilters();

      var oTbl = this.byId("mdcTable3");
      var aFiltered = oDetail.getProperty("/Records") || [];
      var iNewRowIndex = aFiltered.length - 1;
      if (iNewRowIndex >= 0) MdcTableUtil.scrollToRow(oTbl, iNewRowIndex);

      MessageToast.show("Record copiato (" + oClone.raws.length + " righe dettaglio)");
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
    onPrint: function () { MessageToast.show("Stampa: TODO"); },

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
