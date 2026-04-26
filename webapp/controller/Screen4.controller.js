sap.ui.define([
  "apptracciabilita/apptracciabilita/controller/BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/ui/mdc/table/Column",
  "sap/ui/mdc/p13n/StateUtil",

  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/domains",
  "apptracciabilita/apptracciabilita/util/statusUtil",
  "apptracciabilita/apptracciabilita/util/mmctUtil",
  "apptracciabilita/apptracciabilita/util/mdcTableUtil",
  "apptracciabilita/apptracciabilita/util/p13nUtil",
  "apptracciabilita/apptracciabilita/util/cellTemplateUtil",
  "apptracciabilita/apptracciabilita/util/touchCodAggUtil",
  "apptracciabilita/apptracciabilita/util/screen4FilterUtil",
  "apptracciabilita/apptracciabilita/util/screen4ExportUtil",
  "apptracciabilita/apptracciabilita/util/screen4LoaderUtil",
  "apptracciabilita/apptracciabilita/util/recordsUtil",
  "apptracciabilita/apptracciabilita/util/postUtil",
  "apptracciabilita/apptracciabilita/util/saveUtil",
  "apptracciabilita/apptracciabilita/util/TableColumnAutoSize",

  "apptracciabilita/apptracciabilita/util/mockData"
], function (
  BaseController, JSONModel, MessageToast, MessageBox, MdcColumn, StateUtil,
  N, Domains, StatusUtil, MmctUtil, MdcTableUtil, P13nUtil,
  CellTemplateUtil, TouchCodAggUtil, S4Filter, S4Export, S4Loader, RecordsUtil, PostUtil, SaveUtil, TableColumnAutoSize,
  MockData
) {
  "use strict";

  return BaseController.extend("apptracciabilita.apptracciabilita.controller.Screen4", {

    _sLogPrefix: "[S4]",
    _sMockFlag: "mockS4",

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
        if (this._attachSyncInterval) { clearInterval(this._attachSyncInterval); this._attachSyncInterval = null; }
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

        // Start attachment counter sync polling
        if (self._attachSyncInterval) clearInterval(self._attachSyncInterval);
        self._attachSyncInterval = setInterval(function () {
          self._syncAttachmentCounters();
        }, 500);

        self._loadSelectedRecordRows(function () { self._bindRowsAndColumns(); }.bind(self));
      });
    },

    // ==================== CACHE / CONFIG ====================
    // _getOVm, _getCacheKeySafe inherited from BaseController
    _getDataCacheKey: function () {
      var mock = (this.getOwnerComponent().getModel("vm").getProperty("/mock")) || {};
      return (!!(mock.mockS3 || mock.mockS4) ? "MOCK|" : "REAL|") + this._getCacheKeySafe();
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
  if (this._bSyncingAttach) return;
  var oD = this.getView().getModel("detail"); if (!oD) return;
  var aRows = oD.getProperty("/RowsAll") || [];
  if (aRows.length <= 1) return;

  var aAttFields = [];
  (oD.getProperty("/_mmct/s02") || []).forEach(function (f) {
    if (f && f.attachment && f.ui) aAttFields.push(String(f.ui).trim());
  });
  (oD.getProperty("/_mmct/s00") || []).forEach(function (f) {
    if (f && f.attachment && f.ui) {
      var sUi = String(f.ui).trim();
      if (aAttFields.indexOf(sUi) < 0) aAttFields.push(sUi);
    }
  });
  if (!aAttFields.length) return;

  if (!this._attachSnapshot) this._attachSnapshot = {};
  var bChanged = false;
  var snap = this._attachSnapshot;

  aAttFields.forEach(function (sField) {
    var aCurr = aRows.map(function (r) {
      return parseInt(String(r[sField] || "0"), 10) || 0;
    });
    var aPrev = snap[sField] || aCurr.map(function () { return aCurr[0]; });

    // Find the row that changed vs snapshot
    var iChangedIdx = -1;
    var iNewVal = aCurr[0];
    for (var i = 0; i < aCurr.length; i++) {
      if (i < aPrev.length && aCurr[i] !== aPrev[i]) {
        iChangedIdx = i;
        iNewVal = aCurr[i];
        break;
      }
    }

    if (iChangedIdx < 0) {
      var allSame = aCurr.every(function (v) { return v === aCurr[0]; });
      if (allSame) { snap[sField] = aCurr.slice(); return; }
      // Rows out of sync, no snapshot diff → minority value is the updated one
      var counts = {};
      aCurr.forEach(function (v) { counts[v] = (counts[v] || 0) + 1; });
      var minCount = aRows.length + 1;
      Object.keys(counts).forEach(function (k) {
        if (counts[k] < minCount) { minCount = counts[k]; iNewVal = parseInt(k, 10); }
      });
    }

    aRows.forEach(function (r) {
      var vCur = parseInt(String(r[sField] || "0"), 10) || 0;
      if (vCur !== iNewVal) { r[sField] = String(iNewVal); bChanged = true; }
    });
    snap[sField] = aRows.map(function () { return iNewVal; });
  });

  this._attachSnapshot = snap;
  if (bChanged) {
    this._bSyncingAttach = true;
    oD.setProperty("/RowsAll", aRows);
    oD.refresh(true);
    this._bSyncingAttach = false;
  }
},
    _hookDirtyOnEdit: function (oCtrl) {
      if (!oCtrl) return;
      try { if (oCtrl.data && oCtrl.data("dirtyHooked")) return; if (oCtrl.data) oCtrl.data("dirtyHooked", true); } catch (e) {}
      try { if (oCtrl.isA && oCtrl.isA("sap.m.Input") && oCtrl.setValueLiveUpdate) oCtrl.setValueLiveUpdate(true); } catch (e) {}
      var self = this;
      var fn = function (oEvt) {
        self._markDirty();
        var src = (oEvt && oEvt.getSource) ? oEvt.getSource() : oCtrl;
        var ctx = (src.getBindingContext && (src.getBindingContext("detail") || src.getBindingContext())) || null;
        var row = ctx && ctx.getObject && ctx.getObject(); if (!row) return;
        var before = TouchCodAggUtil.getCodAgg(row);
        TouchCodAggUtil.touchCodAggRow(row);
        if (before !== TouchCodAggUtil.getCodAgg(row) && ctx.getPath)
          self.getView().getModel("detail").setProperty(ctx.getPath() + "/CodAgg", row.CodAgg);
        self._checkRowDirtyRevert(row, ctx);
      };
      if (oCtrl.attachLiveChange) oCtrl.attachLiveChange(fn);
      if (oCtrl.attachChange) oCtrl.attachChange(fn);
      if (oCtrl.attachSelectionChange) oCtrl.attachSelectionChange(fn);
      if (oCtrl.attachSelectionFinish) oCtrl.attachSelectionFinish(fn);
      if (oCtrl.attachSubmit) oCtrl.attachSubmit(fn);
    },

    _checkRowDirtyRevert: function (row, ctx) {
      var snap = this._snapshotRows;
      if (!snap || !row || row.__isNew) return;

      var oD = this.getView().getModel("detail");
      var aKeys = (oD.getProperty("/_mmct/s02") || []).map(function (f) { return f && f.ui; }).filter(Boolean);
      if (!aKeys.length) return;

      function vMatch(v1, v2) {
        if (Array.isArray(v1) && Array.isArray(v2)) return JSON.stringify(v1) === JSON.stringify(v2);
        return String(v1 == null ? "" : v1) === String(v2 == null ? "" : v2);
      }

      var sGuid = N.toStableString(row.guidKey || "");
      var sLId = String(row.__localId || "");
      var snapRow = null;
      snap.forEach(function (s) {
        if (snapRow) return;
        if (sGuid && N.toStableString(s.guidKey || "") === sGuid) { snapRow = s; return; }
        if (sLId && String(s.__localId || "") === sLId) snapRow = s;
      });
      if (!snapRow) return;

      if (!aKeys.every(function (k) { return vMatch(row[k], snapRow[k]); })) return;

      row.CodAgg = snapRow.CodAgg || "";
      if (ctx && ctx.getPath) oD.setProperty(ctx.getPath() + "/CodAgg", row.CodAgg);

      var aRows = oD.getProperty("/RowsAll") || [];
      var allClean = aRows.every(function (r) {
        if (!r || r.__isNew) return false;
        var rGuid = N.toStableString(r.guidKey || "");
        var rLId = String(r.__localId || "");
        var sn = null;
        snap.forEach(function (s) {
          if (sn) return;
          if (rGuid && N.toStableString(s.guidKey || "") === rGuid) { sn = s; return; }
          if (rLId && String(s.__localId || "") === rLId) sn = s;
        });
        if (!sn) return false;
        return aKeys.every(function (k) { return vMatch(r[k], sn[k]); });
      });

      if (allClean) {
        oD.setProperty("/__dirty", false);
        this._applyUiPermissions();
      }
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
      var oVm = this._getOVm();
      var aRecs = oVm.getProperty("/cache/recordsByKey/" + sCK) || [];
      if (!Array.isArray(aRecs) || !aRecs.length) return;
      var idx = aRecs.findIndex(function (r) {
        if (String(r && r.guidKey || "") !== String(sGuid || "")) return false;
        return !sFibra || String(r && r.Fibra || "") === String(sFibra || "");
      });
      if (idx < 0) return;
      var rec = aRecs[idx], st = String(sStatus || "ST").trim().toUpperCase();
      rec.__status = st; rec.Stato = st;
      rec.__canEdit = StatusUtil.canEdit(sRole, st); rec.__canApprove = StatusUtil.canApprove(sRole, st);
      rec.__canReject = StatusUtil.canReject(sRole, st); rec.__readOnly = !rec.__canEdit;
      aRecs = aRecs.slice(); aRecs[idx] = rec;
      oVm.setProperty("/cache/recordsByKey/" + sCK, aRecs);
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
      var aAllRows = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || null;
      var aRecords = oVm.getProperty("/cache/recordsByKey/" + sKey) || null;

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

      S4Loader.reloadDataFromBackend({
        oVm: oVm, oDataModel: this.getOwnerComponent().getModel(),
        vendorId: this._sVendorId, material: this._sMaterial,
        catMateriale: (oVm && oVm.getProperty("/__noMatListCat")) || "",
        season: (oVm && oVm.getProperty("/__currentSeason")) || "",
        logFn: this._log.bind(this)
      }, function (aRes) {
        aAllRows = Array.isArray(aRes) ? aRes : [];
        var sCat = S4Loader.pickCat(aAllRows[0] || {});
        aRecords = S4Loader.buildRecords01ForCache(aAllRows, sCat ? self._cfgForScreen(sCat, "01") : [], oVm);
        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aAllRows);
        oVm.setProperty("/cache/recordsByKey/" + sKey, aRecords);
        apply();
      });
    },

    _applySelectedRecordToDetail: function (aAllRows, aRecords, sKey, fnDone) {
      var oVm = this._getOVm();
      var oD = this.getView().getModel("detail");

      var iIdx = parseInt(this._sRecordKey, 10);
      if (isNaN(iIdx) || iIdx < 0) iIdx = 0;

      var oSel = (oVm.getData() || {}).selectedScreen3Record || null;
      if (oSel) aRecords[iIdx] = oSel;
      oVm.setProperty("/cache/recordsByKey/" + sKey, aRecords);

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
      aAllRows = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || aAllRows;

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
      this._getOVm().setProperty("/cache/dataRowsByKey/" + sKey, aNext);
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
      MessageToast.show(bNew ? "Filtri colonna mostrati" : "Filtri colonna nascosti");
    },
    onResetFiltersAndSort: function () {
      var self = this;
      S4Filter.resetFiltersAndSort(this._filterState, this._hdrFilter, this._hdrSortBtns, {
        inputFilter: this.byId("inputFilter4"), applyFn: this._applyFiltersAndSort.bind(this),
        table: this.byId("mdcTable4"),
        forceP13nFn: function (t, r) { P13nUtil.forceP13nAllVisible(t, StateUtil, self._log.bind(self), r); }
      });
      MessageToast.show("Filtri/ordinamento resettati");
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
      var oTbl = this.byId("mdcTable4"); if (!oTbl) return [];
      var aCtx = [];
      try { aCtx = (typeof oTbl.getSelectedContexts === "function") ? (oTbl.getSelectedContexts() || []) : []; } catch (e) { }
      if (!aCtx.length && typeof oTbl.getTable === "function") {
        try {
          var t = oTbl.getTable();
          if (t && t.getSelectedIndices) aCtx = (t.getSelectedIndices() || []).map(function (i) { return t.getContextByIndex(i); }).filter(Boolean);
          else if (t && t.getSelectedItems) aCtx = (t.getSelectedItems() || []).map(function (x) { return (x.getBindingContext && (x.getBindingContext("detail") || x.getBindingContext())) || null; }).filter(Boolean);
        } catch (e) { }
      }
      return aCtx.map(function (c) { return c && c.getObject ? c.getObject() : null; }).filter(Boolean);
    },

    onDeleteRows: function () {
      try {
        var oD = this.getView().getModel("detail"); if (!oD) return;
        if (!oD.getProperty("/__canEdit")) { MessageToast.show("Non hai permessi per eliminare righe"); return; }
        var aSel = this._getSelectedRowObjects(); if (!aSel.length) { MessageToast.show("Seleziona almeno una riga"); return; }
        var aAll = oD.getProperty("/RowsAll") || []; if (!aAll.length) return;
        var mSel = {}; aSel.forEach(function (r) { if (r && r.__localId) mSel[r.__localId] = true; });
        var aRem = aAll.filter(function (r) { if (r && r.__localId && mSel[r.__localId]) return false; return aSel.indexOf(r) < 0; });
        if (!aRem.length) { MessageToast.show("Non puoi eliminare tutte le righe"); return; }

        var sRole = String(oD.getProperty("/__role") || "").trim().toUpperCase();
        if (sRole === "E" && String(oD.getProperty("/__status") || "").toUpperCase() !== "AP") {
          oD.setProperty("/__canEdit", true); oD.setProperty("/__canAddRow", true);
          oD.setProperty("/__canApprove", false); oD.setProperty("/__canReject", false);
        }
        oD.setProperty("/RowsAll", aRem); oD.setProperty("/__dirty", true);
        var oVm = this._getOVm(), sCK = this._getDataCacheKey(), sGuid = N.toStableString(oD.getProperty("/guidKey"));
        var aC = (oVm.getProperty("/cache/dataRowsByKey/" + sCK) || []).filter(function (r) { return S4Loader.rowGuidKey(r) !== sGuid; });
        aRem.forEach(function (l) { if (!l.CodAgg) l.CodAgg = "U"; });
        oVm.setProperty("/cache/dataRowsByKey/" + sCK, aC.concat(aRem));
        this._applyUiPermissions(); this._applyFiltersAndSort();
        var oTbl = this.byId("mdcTable4"); if (oTbl && oTbl.rebind) oTbl.rebind();
        MessageToast.show("Righe eliminate");
      } catch (e) { console.error("[S4] onDeleteRows ERROR", e); MessageToast.show("Errore eliminazione righe"); }
    },

    onAddRow: function () {
      try {
        var oD = this.getView().getModel("detail"); if (!oD) return;
        if (!oD.getProperty("/__canAddRow")) { MessageToast.show("Non hai permessi per aggiungere righe"); return; }
        var aAll = oD.getProperty("/RowsAll") || []; if (!aAll.length) { MessageToast.show("Nessuna riga di base"); return; }

        var oBase = aAll[0] || {};
        var sGuid = N.toStableString(oD.getProperty("/guidKey")) || oBase.Guid || oBase.GUID || "";

        var oFullRow = aAll.reduce(function (best, r) {
          return (Object.keys(r).length > Object.keys(best).length) ? r : best;
        }, oBase);
        var oNew = N.deepClone(oFullRow) || {};

        Object.keys(oNew).forEach(function (k) {
          if (k.indexOf("__") === 0 || k === "__metadata") { delete oNew[k]; return; }
          if (["Guid", "GUID", "guidKey", "Fornitore", "Materiale", "CatMateriale", "Stagione", "Plant"].indexOf(k) >= 0) return;
          oNew[k] = Array.isArray(oNew[k]) ? [] : "";
        });

        oNew.Guid = sGuid;
        oNew.GUID = sGuid;
        oNew.guidKey = sGuid;
        oNew.Fornitore = oBase.Fornitore || "";
        oNew.Materiale = oBase.Materiale || "";
        oNew.CatMateriale = oBase.CatMateriale || oD.getProperty("/_mmct/cat") || "";
        oNew.Stagione = oBase.Stagione || "";
        oNew.Plant = oBase.Plant || "";
        oNew.Fibra = "";
        oNew.Stato = "ST";
        oNew.Note = "";

        var self = this;
        (oD.getProperty("/_mmct/s02") || []).forEach(function (f) {
          if (f && f.ui && f.multiple) oNew[f.ui.trim()] = self._toArrayMulti(oNew[f.ui.trim()]);
        });

        var shouldUpd = false;
        try {
          shouldUpd = Object.values(this.getOwnerComponent().getModel("vm").getData().cache.dataRowsByKey)[0]
            .filter(function (i) { return i.Guid === oNew.Guid; })
            .filter(function (i) { return !(i && i.Guid && i.Guid.toLowerCase().indexOf("new") >= 0); }).length > 0;
        } catch (e) { }

        oNew.CodAgg = shouldUpd ? "U" : "I";
        oNew.__isNew = true;
        oNew.__readOnly = false;
        oNew.__localId = "NEW_" + Date.now() + "_" + Math.floor(Math.random() * 100000);

        aAll = aAll.slice(); aAll.push(oNew);
        oD.setProperty("/RowsAll", aAll);
        oD.setProperty("/__canEdit", true); oD.setProperty("/__canAddRow", true);
        oD.setProperty("/__dirty", true);

        var oVm = this.getOwnerComponent().getModel("vm"), sCK = this._getDataCacheKey();
        var aC = (oVm.getProperty("/cache/dataRowsByKey/" + sCK) || []).slice();
        aC.push(oNew);
        oVm.setProperty("/cache/dataRowsByKey/" + sCK, aC);

        this._applyUiPermissions(); this._applyFiltersAndSort();
        var oTbl = this.byId("mdcTable4"); if (oTbl && oTbl.rebind) oTbl.rebind();

        var aFiltered = oD.getProperty("/Rows") || oD.getProperty("/RowsAll") || [];
        MdcTableUtil.scrollToRow(this.byId("mdcTable4"), aFiltered.length - 1);

        this._syncAttachmentCounters();
        MessageToast.show("Riga aggiunta");
      } catch (e) { console.error("[S4] onAddRow ERROR", e); MessageToast.show("Errore aggiunta riga"); }
    },

    // ==================== COPY ROW ====================
    onCopyRow: function () {
      try {
        var oD = this.getView().getModel("detail"); if (!oD) return;
        if (!oD.getProperty("/__canAddRow")) { MessageToast.show("Non hai permessi per copiare righe"); return; }

        var aSel = this._getSelectedRowObjects();
        if (!aSel.length) { MessageToast.show("Seleziona una riga da copiare"); return; }
        if (aSel.length > 1) { MessageToast.show("Seleziona una sola riga da copiare"); return; }

        var oSource = aSel[0];
        var oNew = N.deepClone(oSource) || {};

        ["/_mmct/s01", "/_mmct/s02"].forEach(function (sPath) {
          (oD.getProperty(sPath) || []).forEach(function (f) {
            if (f && f.ui && f.attachment) oNew[f.ui.trim()] = "0";
          });
        });

        var shouldUpd = false;
        try { shouldUpd = Object.values(this.getOwnerComponent().getModel("vm").getData().cache.dataRowsByKey)[0]
          .filter(function (i) { return i.Guid === oNew.Guid; })
          .filter(function (i) { return !(i && i.Guid && i.Guid.toLowerCase().indexOf("new") >= 0); }).length > 0; } catch (e) { }
        oNew.CodAgg = shouldUpd ? "U" : "I";
        oNew.__isNew = true;
        oNew.__readOnly = false;
        oNew.__localId = "COPY_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
        oNew.Stato = "ST";
        oNew.Note = "";
        delete oNew.__metadata;

        var self = this;
        (oD.getProperty("/_mmct/s02") || []).forEach(function (f) {
          if (f && f.ui && f.multiple) oNew[f.ui.trim()] = self._toArrayMulti(oNew[f.ui.trim()]);
        });

        var aAll = (oD.getProperty("/RowsAll") || []).slice();
        aAll.push(oNew);
        oD.setProperty("/RowsAll", aAll);
        oD.setProperty("/__dirty", true);

        var oVm = this._getOVm(), sCK = this._getDataCacheKey();
        var aC = (oVm.getProperty("/cache/dataRowsByKey/" + sCK) || []).slice();
        aC.push(oNew);
        oVm.setProperty("/cache/dataRowsByKey/" + sCK, aC);

        this._applyUiPermissions();
        this._applyFiltersAndSort();
        var oTbl = this.byId("mdcTable4"); if (oTbl && oTbl.rebind) oTbl.rebind();

        var aFiltered = oD.getProperty("/Rows") || oD.getProperty("/RowsAll") || [];
        MdcTableUtil.scrollToRow(this.byId("mdcTable4"), aFiltered.length - 1);

        this._syncAttachmentCounters();
        MessageToast.show("Riga copiata");
      } catch (e) { console.error("[S4] onCopyRow ERROR", e); MessageToast.show("Errore copia riga"); }
    },

    // ==================== SAVE ====================
    onSaveLocal: function () {
      try {
        var oD = this.getView().getModel("detail"); if (!oD) return;
        if (!oD.getProperty("/__dirty")) { MessageToast.show("Nessuna modifica da salvare"); return; }

        if (!RecordsUtil.validatePercBeforeSave(oD, "/RowsAll")) return;

        var aRows = oD.getProperty("/RowsAll") || [];
        var oVm = this._getOVm(), sCK = this._getDataCacheKey();
        var sGuid = N.toStableString(oD.getProperty("/guidKey")), sFibra = N.toStableString(oD.getProperty("/Fibra"));
        var aC = (oVm.getProperty("/cache/dataRowsByKey/" + sCK) || []).filter(function (r) { return S4Loader.rowGuidKey(r) !== sGuid; });
        oVm.setProperty("/cache/dataRowsByKey/" + sCK, aC.concat(aRows));
        this._updateVmRecordStatus(sCK, sGuid, sFibra,
          String(oD.getProperty("/__role") || "").trim().toUpperCase(),
          String(oD.getProperty("/__status") || "ST").trim().toUpperCase());
        this._snapshotRows = N.deepClone(aRows); oD.setProperty("/__dirty", false);
        this._applyUiPermissions(); MessageToast.show("Salvato (locale/cache)");
      } catch (e) { console.error("[S4] onSaveLocal ERROR", e); MessageToast.show("Errore salvataggio"); }
    },

    // ==================== SAVE TO BACKEND (PostDataSet) ====================
    onSaveToBackend: function () {
      var oD = this.getView().getModel("detail");
      if (!oD) return;

      if (oD.getProperty("/__dirty")) {
        this.onSaveLocal();
      }

      var oVm = this._getOVm();
      var sCK = this._getDataCacheKey();

      if (!RecordsUtil.validatePercBeforeSave(oD, "/RowsAll")) return;

      var aRecordsAll = oVm.getProperty("/cache/recordsByKey/" + sCK) || [];
      if (!aRecordsAll.length) {
        MessageBox.warning("Nessun record trovato. Tornare alla schermata precedente e riprovare.");
        return;
      }

      aRecordsAll = this._assignStableGuidBeforeSave(oD, oVm, sCK);

      var oBuild = this._buildSavePayload(oD, oVm, sCK, aRecordsAll);
      if (!oBuild) return;

      this._log("onSaveToBackend payload", {
        lines: oBuild.payload.PostDataCollection ? oBuild.payload.PostDataCollection.length : 0
      });

      this._executePostAndReload(oD, oVm, sCK, oBuild.proxy, oBuild.payload);
    },

    // Se il record corrente ha ancora un Guid locale (-new, NEW_, SYNTH_) lo
    // sostituisce con un UUID stabile e propaga la sostituzione IN PLACE sulle
    // cache VM. Senza persistere, ogni save rigenererebbe un Guid diverso →
    // backend rejects con "Key exists with other guid".
    _assignStableGuidBeforeSave: function (oD, oVm, sCK) {
      function isLocalGuid(g) {
        var s = String(g || "");
        return !s || s.indexOf("NEW_") >= 0 || s.indexOf("SYNTH_") >= 0 || s.indexOf("-new") >= 0;
      }

      var sOldGuid = N.toStableString(oD.getProperty("/guidKey"));
      var sStableGuid = isLocalGuid(sOldGuid) ? N.uuidv4() : sOldGuid;

      function rewriteGuid(row) {
        if (!row) return;
        var g = N.toStableString(row.guidKey || row.Guid || row.GUID || "");
        if (g !== sOldGuid) return;
        row.Guid = sStableGuid;
        row.GUID = sStableGuid;
        row.guidKey = sStableGuid;
      }

      oD.setProperty("/guidKey", sStableGuid);

      var aRecordsCache = oVm.getProperty("/cache/recordsByKey/" + sCK) || [];
      aRecordsCache.forEach(rewriteGuid);
      oVm.setProperty("/cache/recordsByKey/" + sCK, aRecordsCache);

      var aDetailRowsCache = oVm.getProperty("/cache/dataRowsByKey/" + sCK) || [];
      aDetailRowsCache.forEach(rewriteGuid);
      oVm.setProperty("/cache/dataRowsByKey/" + sCK, aDetailRowsCache);

      var aCurrentRows = oD.getProperty("/RowsAll") || [];
      aCurrentRows.forEach(rewriteGuid);
      oD.setProperty("/RowsAll", aCurrentRows);

      return aRecordsCache;
    },

    // Costruisce proxy detail + payload di save, eseguendo la validazione dei
    // campi obbligatori. Ritorna null se la validazione fallisce (errore già
    // mostrato all'utente).
    _buildSavePayload: function (oD, oVm, sCK, aRecordsAll) {
      var sCat = String(oD.getProperty("/_mmct/cat") || "").trim();
      var aS00 = sCat ? this._cfgForScreen(sCat, "00") : [];
      var aS01 = sCat ? this._cfgForScreen(sCat, "01") : [];
      var aS02 = sCat ? this._cfgForScreen(sCat, "02") : [];

      var oProxyDetail = new JSONModel({
        RecordsAll: aRecordsAll,
        _mmct: { s00: aS00, s01: aS01, s02: aS02 },
        __deletedLinesForPost: oVm.getProperty("/cache/__deletedLinesForPost_" + sCK) || []
      });

      var vr = SaveUtil.validateRequiredBeforePost({
        oDetail: oProxyDetail, oVm: oVm,
        getCacheKeySafe: this._getCacheKeySafe.bind(this),
        getExportCacheKey: this._getDataCacheKey.bind(this),
        toStableString: N.toStableString,
        rowGuidKey: RecordsUtil.rowGuidKey,
        getCodAgg: N.getCodAgg,
        fromScreen: "S4"
      });
      if (!vr.ok) {
        var top = vr.errors.slice(0, 15).map(function (e) {
          return "- [" + e.page + "] " + e.label + " (Riga: " + (e.row || "?") + ")";
        }).join("\n");
        MessageBox.error("Compila tutti i campi obbligatori prima di salvare.\n\n" + top +
          (vr.errors.length > 15 ? "\n\n... altri " + (vr.errors.length - 15) + " errori" : ""));
        oProxyDetail.destroy();
        return null;
      }

      var sUserId = (oVm && oVm.getProperty("/userId")) || "";
      var sVendor10 = N.normalizeVendor10(this._sVendorId);
      var sMaterial = String(this._sMaterial || "").trim();

      var oPayload = SaveUtil.buildSavePayload({
        oDetail: oProxyDetail, oVm: oVm,
        userId: sUserId, vendor10: sVendor10, material: sMaterial,
        getExportCacheKey: this._getDataCacheKey.bind(this),
        toStableString: N.toStableString,
        getCodAgg: N.getCodAgg,
        getMultiFieldsMap: function () { return PostUtil.getMultiFieldsMap(oProxyDetail); },
        normalizeMultiString: N.normalizeMultiString,
        uuidv4: N.uuidv4
      });

      return { proxy: oProxyDetail, payload: oPayload };
    },

    _executePostAndReload: function (oD, oVm, sCK, oProxyDetail, oPayload) {
      var self = this;
      var mock = (oVm && oVm.getProperty("/mock")) || {};

      SaveUtil.executePost({
        oModel: this.getOwnerComponent().getModel(),
        payload: oPayload,
        mock: !!mock.mockS4,
        onSuccess: function () {
          oProxyDetail.destroy();
          oVm.setProperty("/cache/__deletedLinesForPost_" + sCK, []);
          self._reloadAfterSaveAndNavBack(oD, oVm, sCK);
        },
        onPartialError: function (aErr) {
          oProxyDetail.destroy();
          PostUtil.showPostErrorMessagePage(aErr);
        },
        onFullError: function (oError) {
          oProxyDetail.destroy();
          MessageBox.error(N.getBackendErrorMessage(oError));
        }
      });
    },

    // Brute-force cache resync dopo un save: ricarica l'intero dataset dal
    // backend e sostituisce completamente le cache VM. È l'unico modo sicuro
    // di garantire che Screen3/Screen4 vedano i record persistiti con i Guid
    // reali — qualsiasi update in-place è fragile per via dei riferimenti
    // multipli (recordsByKey, dataRowsByKey, selectedScreen3Record, snapshot).
    _reloadAfterSaveAndNavBack: function (oD, oVm, sCK) {
      var self = this;

      S4Loader.reloadDataFromBackend({
        oVm: oVm,
        oDataModel: this.getOwnerComponent().getModel(),
        vendorId: this._sVendorId,
        material: this._sMaterial,
        catMateriale: (oVm && oVm.getProperty("/__noMatListCat")) || "",
        season: (oVm && oVm.getProperty("/__currentSeason")) || "",
        logFn: this._log.bind(this)
      }, function (aFreshRows) {
        aFreshRows = aFreshRows || [];

        var sCat2 = S4Loader.pickCat(aFreshRows[0] || {});
        var aFreshRecords = S4Loader.buildRecords01ForCache(
          aFreshRows,
          sCat2 ? self._cfgForScreen(sCat2, "01") : [],
          oVm
        );

        oVm.setProperty("/cache/dataRowsByKey/" + sCK, aFreshRows);
        oVm.setProperty("/cache/recordsByKey/" + sCK, aFreshRecords);
        oVm.setProperty("/selectedScreen3Record", null);
        oVm.setProperty("/__skipS3BackendOnce", true);
        // __forceS3CacheReload: altrimenti Screen3 ribinda lo snapshot salvato
        // (con il vecchio Guid locale) invece della cache appena ricostruita.
        oVm.setProperty("/__forceS3CacheReload", true);

        if (self._attachSyncInterval) {
          clearInterval(self._attachSyncInterval);
          self._attachSyncInterval = null;
        }

        oD.setProperty("/__dirty", false);
        MessageToast.show("Dati salvati con successo");

        self.getOwnerComponent().getRouter().navTo("Screen3", {
          vendorId: encodeURIComponent(self._sVendorId),
          material: encodeURIComponent(self._sMaterial),
          mode: self._sMode || "A"
        }, true);
      });
    },

    // ==================== EXPORT ====================
    onPrint: function () { S4Export.onPrint(this.getView().getModel("detail")); },
    onExportExcel: function () { S4Export.onExportExcel(this.getView().getModel("detail")); },

    // ==================== NAVIGATION ====================
    _markSkipS3BackendOnce: function () { this._getOVm().setProperty("/__skipS3BackendOnce", true); },
    _getNavBackFallback: function () {
      return { route: "Screen3", params: { vendorId: encodeURIComponent(this._sVendorId), material: encodeURIComponent(this._sMaterial), mode: this._sMode || "A" } };
    },
    onNavBack: function () {
      if (this._attachSyncInterval) { clearInterval(this._attachSyncInterval); this._attachSyncInterval = null; }
      this._markSkipS3BackendOnce();
      this._performNavBack();
    }
  });
});