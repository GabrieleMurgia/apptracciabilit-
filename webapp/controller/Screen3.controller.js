sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/routing/History",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/core/BusyIndicator",
  "sap/m/MessageToast",
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

  // ===== UTIL =====
  "apptracciabilita/apptracciabilita/util/common",
  "apptracciabilita/apptracciabilita/util/vmCache",
  "apptracciabilita/apptracciabilita/util/domains",
  "apptracciabilita/apptracciabilita/util/statusUtil",
  "apptracciabilita/apptracciabilita/util/mmctUtil",
  "apptracciabilita/apptracciabilita/util/mdcTableUtil",
  "apptracciabilita/apptracciabilita/util/p13nUtil",
  "apptracciabilita/apptracciabilita/util/cellTemplateUtil"
], function (
  Controller,
  History,
  JSONModel,
  Filter,
  FilterOperator,
  BusyIndicator,
  MessageToast,
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

  // ===== UTIL =====
  Common,
  VmCache,
  Domains,
  StatusUtil,
  MmctUtil,
  MdcTableUtil,
  P13nUtil,
  CellTemplateUtil
) {

  "use strict";

  var EdmType = exportLibrary.EdmType;

  var ts = Common.ts;
  var deepClone = Common.deepClone;

  return Controller.extend("apptracciabilita.apptracciabilita.controller.Screen3", {

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
    //  BUTTONS HEADER 
    // =========================
    _setInnerHeaderHeight: function (oMdcTbl) {
      try {
        var oUi = this.getView().getModel("ui");
        var bShowFilters = !!(oUi && oUi.getProperty("/showHeaderFilters"));
        MdcTableUtil.setInnerHeaderHeight(oMdcTbl, bShowFilters);
      } catch (e) { }
    },

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

    _getCodAgg: function (o) {
  // tollerante su naming
  return String(
    o && (o.CodAgg != null ? o.CodAgg : (o.CODAGG != null ? o.CODAGG : ""))
  ).trim().toUpperCase();
},

/* _stashDeleteForPostFromCache: function (oParent, aRowsCache, oDetail) {
  if (!oParent) return;

  var g = this._toStableString(oParent && (oParent.guidKey || oParent.GUID || oParent.Guid));
  var f = this._toStableString(oParent && (oParent.Fibra || oParent.FIBRA));
  if (!g) return;

  // match GUID+Fibra se presente, altrimenti tutte le righe del GUID
  var aMatch = (aRowsCache || []).filter(function (r) {
    var rg = this._rowGuidKey(r);
    var rf = this._rowFibra(r);
    if (f) return (rg === g && rf === f);
    return (rg === g);
  }.bind(this));

  // prendo SOLO le righe RAW con CodAgg = N
  var aToDelete = (aMatch || []).filter(function (r) {
    return this._getCodAgg(r) === "N";
  }.bind(this));

  // fallback: se non ho righe raw ma il parent *davvero* ha CodAgg N, tombalo comunque
  if (!aToDelete.length && this._getCodAgg(oParent) === "N") {
    aToDelete = [oParent];
  }

  // se non ho niente con N -> non devo mandare delete
  if (!aToDelete.length) return;

  var aStash = oDetail.getProperty("/__deletedLinesForPost") || [];

  aToDelete.forEach(function (r) {
    var x = deepClone(r) || {};
    if (x.CODAGG !== undefined) delete x.CODAGG;
    x.CodAgg = "D";
    x.__deletedAt = new Date().toISOString();
    aStash.push(x);
  });

  // dedupe (Guid||Fibra||id riga se esiste)
  var seen = {};
  aStash = aStash.filter(function (r) {
    var kg = String(r.Guid != null ? r.Guid : (r.GUID != null ? r.GUID : (r.guidKey != null ? r.guidKey : "")));
    var kf = String(r.Fibra != null ? r.Fibra : (r.FIBRA != null ? r.FIBRA : ""));
    var kid = String(r.ItmGuid || r.ItemGuid || r.Riga || r.Posizione || "");
    var k = kg + "||" + kf + "||" + kid;
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });

  oDetail.setProperty("/__deletedLinesForPost", aStash);
}, */

_stashDeleteForPostFromCache: function (oParent, aRowsCache, oDetail) {
  if (!oParent) return;

  var g = this._toStableString(oParent && (oParent.guidKey || oParent.GUID || oParent.Guid));
  if (!g) return;

  // match SOLO GUID (tutte le righe del GUID)
  var aMatch = (aRowsCache || []).filter(function (r) {
    return this._rowGuidKey(r) === g;
  }.bind(this));

  // prendo SOLO le righe RAW con CodAgg = N
  var aToDelete = (aMatch || []).filter(function (r) {
    return this._getCodAgg(r) === ""; // N,I,D,''
  }.bind(this));

  // fallback: se non ho righe raw ma il parent ha CodAgg N, tombalo comunque
  if (!aToDelete.length && this._getCodAgg(oParent) === "") { // N,I,D,''
    aToDelete = [oParent];
  }

  // se non ho niente con N -> non devo mandare delete
  if (!aToDelete.length) return;

  var aStash = oDetail.getProperty("/__deletedLinesForPost") || [];

  aToDelete.forEach(function (r) {
    var x = deepClone(r) || {};

    if (x.CODAGG !== undefined) delete x.CODAGG;
    x.CodAgg = "D";
    x.__deletedAt = new Date().toISOString();

    aStash.push(x);
  });

  // dedupe SOLO GUID (+ eventuale id riga se esiste)
/*   var seen = {};
  aStash = aStash.filter(function (r) {
    var kg = String(r.Guid != null ? r.Guid : (r.GUID != null ? r.GUID : (r.guidKey != null ? r.guidKey : "")));
    var kid = String(r.ItmGuid || r.ItemGuid || r.Riga || r.Posizione || "");
    var k = kg + "||" + kid;

    if (seen[k]) return false;
    seen[k] = true;
    return true;
  }); */

  oDetail.setProperty("/__deletedLinesForPost", aStash);
},


    // =========================
    // Utils (delegate su util)
    // =========================
    _toStableString: function (v) { return Common.toStableString(v); },
    _valToText: function (v) { return Common.valToText(v); },

    _getApprovedFlag: function (r) { return StatusUtil.getApprovedFlag(r); },

    _getSettingFlags: function (c) { return MmctUtil.getSettingFlags(c); },
    _isMultipleField: function (c) { return MmctUtil.isMultipleField(c); },
    _isX: function (v) { return MmctUtil.isX(v); },
    _parseOrder: function (c) { return MmctUtil.parseOrder(c); },

    // =========================
    // DOMAINS
    // =========================
    _domainHasValues: function (sDomain) {
      return Domains.domainHasValues(this.getOwnerComponent(), sDomain);
    },

    _createCellTemplate: function (sKey, oMeta) {
      return CellTemplateUtil.createCellTemplate(sKey, oMeta, {
        domainHasValuesFn: this._domainHasValues.bind(this)
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
    // CACHE (delegate su util)
    // =========================
    _getCacheKeySafe: function () {
      return VmCache.getCacheKeySafe(this._sVendorId, this._sMaterial);
    },

    _ensureVmCache: function () {
      return VmCache.ensureVmCache(this.getOwnerComponent());
    },

    _isMockS3Enabled: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      return !!(mock && mock.mockS3);
    },

    _loadDataOnce: function () {
      var oVm = this._ensureVmCache();
      var sBaseKey = this._getCacheKeySafe();

      var bMockS3 = this._isMockS3Enabled();
      var sKey = (bMockS3 ? "MOCK|" : "REAL|") + sBaseKey;

      var aRows = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || null;
      var aRecs = oVm.getProperty("/cache/recordsByKey/" + sKey) || null;

      this._log("_loadDataOnce cacheKey", sKey, {
        mockS3: bMockS3,
        cachedRows: aRows ? aRows.length : null,
        cachedRecs: aRecs ? aRecs.length : null
      });

      if (Array.isArray(aRows) && aRows.length && Array.isArray(aRecs) && aRecs.length) {
        this._hydrateMmctFromRows(aRows);
        this._formatIncomingRowsMultiSeparators(aRows);
        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aRows);
        this._bindRecords(aRecs);
        return;
      }

      this._reloadDataFromBackend(function (aResults) {
        this._log("_reloadDataFromBackend returned", aResults.length);

        this._hydrateMmctFromRows(aResults);

         this._formatIncomingRowsMultiSeparators(aResults);

        var aRecordsBuilt = this._buildRecords01(aResults);

        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aResults);
        oVm.setProperty("/cache/recordsByKey/" + sKey, aRecordsBuilt);

        this._bindRecords(aRecordsBuilt);
      }.bind(this));
    },

    // =========================
    // MMCT -> colonne (delegate su util)
    // =========================
    _getMmctCfgForCat: function (sCat) {
      var oVm = this.getOwnerComponent().getModel("vm");
      return MmctUtil.getMmctCfgForCat(oVm, sCat);
    },

    _cfgForScreen: function (sCat, sScreen) {
      var oVm = this.getOwnerComponent().getModel("vm");
      return MmctUtil.cfgForScreen(oVm, sCat, sScreen);
    },

    _refreshHeader3Fields: function () {
      var oDetail = this.getView().getModel("detail");
      var aHdr = oDetail.getProperty("/_mmct/hdr3") || [];
      var r0 = oDetail.getProperty("/_mmct/raw0") || {}; 

      var a = (aHdr || [])
        .slice()
        .sort(function (a, b) { return (a.order ?? 9999) - (b.order ?? 9999); })
        .map(function (f) {
          var kRaw = String(f.ui || "").trim();
          var k = (kRaw.toUpperCase() === "STATO") ? "Stato" : kRaw;

          return {
            key: k,
            label: f.label || kRaw || k,
            value: this._valToText(r0[k])
          };
        }.bind(this));

      oDetail.setProperty("/Header3Fields", a);
      this._log("_refreshHeader3Fields", { hdr3: aHdr.length, out: a.length, sample: a[0] });
    },

    _hydrateMmctFromRows: function (aRows) {
      var r0 = (Array.isArray(aRows) && aRows.length) ? (aRows[0] || {}) : {};
      var sCat = String(r0.CatMateriale || "").trim();

      var oDetail = this.getView().getModel("detail");

      // 00 = TESTATA
      var a00All = sCat ? this._cfgForScreen(sCat, "00") : [];
      var aHdr3 = (a00All || [])
        .filter(function (f) { return !!(f && f.testata1); })
        .filter(function (f) { return String(f.ui || "").trim().toUpperCase() !== "FORNITORE"; }); 

      // 01 = TABELLA (Screen3)
      var a01All = sCat ? this._cfgForScreen(sCat, "01") : [];
      var a01Table = (a01All || [])
        .filter(function (f) { return !(f && f.testata1); }); 

      // 02 = Screen4
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
            this._log("[MOCK] forceStato =", sForceStato);
          }

          this._log("[MOCK] loadDataSetGeneric OK", { rows: a.length, sample0: a[0] });
          done(a);
        }.bind(this)).catch(function (e) {
          BusyIndicator.hide();
          console.error("[S3] MOCK loadDataSetGeneric ERROR", e);
          MessageToast.show("MOCK DataSet.json NON CARICATO: guarda Console + Network");
          done([]);
        });

        return;
      }

      var sVendor2 = String(this._sVendorId || "").trim();
      if (/^\d+$/.test(sVendor2) && sVendor2.length < 10) sVendor2 = ("0000000000" + sVendor2).slice(-10);

      var sRouteMat = norm(this._sMaterial);

      function buildMaterialVariants(routeMat) {
        var set = {};
        function add(x) { x = norm(x); if (x) set[x] = true; }
        add(routeMat);
        if (routeMat && routeMat.charAt(routeMat.length - 1) !== "S") add(routeMat + "S");
        if (routeMat && routeMat.charAt(routeMat.length - 1) === "S") add(routeMat.slice(0, -1));
        return Object.keys(set);
      }

      var aMatVariants = buildMaterialVariants(sRouteMat);

      var aFilters = [
        new Filter("UserID", FilterOperator.EQ, sUserId),
        new Filter("Fornitore", FilterOperator.EQ, sVendor2)
      ];

      if (aMatVariants.length) {
        var aMatFilters = aMatVariants.map(function (m) { return new Filter("Materiale", FilterOperator.EQ, m); });
        aFilters.push(new Filter({ filters: aMatFilters, and: false }));
      }

      BusyIndicator.show(0);
      oODataModel.read("/DataSet", {
        filters: aFilters,
        urlParameters: { "sap-language": "IT" },
        success: function (oData) {
          BusyIndicator.hide();
          var a = (oData && oData.results) || [];
          if(oData){}

          if (sForceStato === "ST" || sForceStato === "AP" || sForceStato === "RJ" || sForceStato === "CH") {
            a.forEach(function (r) { if (r) r.Stato = sForceStato; });
            console.log("[Screen3] forceStato =", sForceStato);
          }

          done(a);
        },
        error: function (oError) {
          BusyIndicator.hide();
          console.error("Errore lettura DataSet", oError);
          MessageToast.show("Errore nel caricamento dei dati");
          done([]);
        }
      });
    },

    // =========================
    // RECORDS (Screen3)
    // =========================
    _rowGuidKey: function (r) {
      var v = r && (r.Guid || r.GUID);
      return this._toStableString(v);
    },

    _rowFibra: function (r) {
      var v = r && (r.Fibra || r.FIBRA);
      return this._toStableString(v);
    },

    _buildRecords01: function (aAllRows) {
      var oDetail = this.getView().getModel("detail");
      var aCfg01 = oDetail.getProperty("/_mmct/s01") || [];
      var aCols01 = aCfg01.map(function (x) { return x.ui; }).filter(Boolean);

      var mIsMulti = {};
      (aCfg01 || []).forEach(function (f) {
        if (f && f.ui && f.multiple) mIsMulti[f.ui] = true;
      });

      function toArray(v) {
        if (Array.isArray(v)) return v;
        var s = String(v || "").trim();
        if (!s) return [];
        return s.split(/[;,|]+/).map(function (x) { return x.trim(); }).filter(Boolean);
      }

      var oVm = this.getOwnerComponent().getModel("vm");
      var sRole = (oVm && oVm.getProperty("/userType")) || "";
      sRole = String(sRole || "").trim().toUpperCase();

      this._log("_buildRecords01 role", sRole, "cols", aCols01.length);

      var m = {};
      var a = [];

      (aAllRows || []).forEach(function (r) {
        var sGuidKey = this._rowGuidKey(r);
        var sFibra = this._rowFibra(r);
        var sKey = sGuidKey /* + "||" + sFibra; */

        var stRow = StatusUtil.normStatoRow(r, oVm);

        var oRec = m[sKey];

        if (!oRec) {
          oRec = {
            idx: a.length,
            guidKey: sGuidKey,
            Fibra: sFibra,

            Stato: stRow,
            StatoText: this._statusText(stRow),
            __status: stRow,

            __canEdit: StatusUtil.canEdit(sRole, stRow),
            __canApprove: StatusUtil.canApprove(sRole, stRow),
            __canReject: StatusUtil.canReject(sRole, stRow),

            __readOnly: !StatusUtil.canEdit(sRole, stRow)
          };

          aCols01.forEach(function (c) {
            var v = (r && r[c] !== undefined) ? r[c] : "";
            oRec[c] = mIsMulti[c] ? toArray(v) : v;
          });

          m[sKey] = oRec;
          a.push(oRec);

        } else {
          var merged = StatusUtil.mergeStatus(oRec.__status, stRow);
          if (merged !== oRec.__status) {
            oRec.__status = merged;
            oRec.Stato = merged;
            oRec.StatoText = this._statusText(merged);

            oRec.__canEdit = StatusUtil.canEdit(sRole, merged);
            oRec.__canApprove = StatusUtil.canApprove(sRole, merged);
            oRec.__canReject = StatusUtil.canReject(sRole, merged);

            oRec.__readOnly = !oRec.__canEdit;
          }
        }
      }.bind(this));

      this._log("_buildRecords01 built", a.length, "sample", a[0]);
      return a;
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
    // =========================
    // P13N force visible (delegate su util)
    // =========================
    _forceP13nAllVisible: async function (oTbl, reason) {
      return P13nUtil.forceP13nAllVisible(oTbl, StateUtil, this._log.bind(this), reason);
    },

    _ensureMdcCfgScreen3: function (aCfg01) {
      var oVm = this.getOwnerComponent().getModel("vm");

      var aProps = (aCfg01 || []).map(function (f) {
        var name = f.ui;
        if (String(name || "").toUpperCase() === "STATO") name = "Stato";

        return {
          name: name,
          label: f.label || name,
          dataType: "String",
          domain: f.domain || "",
          required: !!f.required
        };
      });

      var hasStato = aProps.some(function (p) {
        return String((p && p.name) || "").toUpperCase() === "STATO";
      });
      if (!hasStato) {
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

      // 1) NAV colonna 
      oTbl.addColumn(new MdcColumn({
        header: "Dettaglio",
        visible: true,
        width: "100px",
        template: new Button({
          icon: "sap-icon://enter-more",
          type: "Transparent",
          tooltip: "Apri dettagli",
          press: this.onGoToScreen4FromRow.bind(this)
        })
      }));

      // 2) STATO 
      this._colStatoS3 = new MdcColumn({
        width: "70px",
        header: "Stato",
        visible: true,
        dataProperty: "Stato",
        propertyKey: "Stato",
        template: this._createStatusCellTemplate("Stato")
      });
      oTbl.addColumn(this._colStatoS3);

      // 3) Colonne dinamiche MMCT
      (aCfg01 || []).forEach(function (f) {
        var sKeyRaw = String(f.ui || "").trim();
        if (!sKeyRaw) return;

        var bIsStato = (sKeyRaw.toUpperCase() === "STATO");
        var sKey = bIsStato ? "Stato" : sKeyRaw;

        var sHeader = (f.label || sKeyRaw) + (f.required ? " *" : "");

        var sK = String(sKey || "").trim().toUpperCase();
        if (sK === "STATO") {
          if (this._colStatoS3) this._colStatoS3.setHeader(sHeader);
          return;
        }

        oTbl.addColumn(new MdcColumn({
          header: sHeader,
          visible: true,
          dataProperty: sKey,
          propertyKey: sKey,
          template: this._createCellTemplate(sKey, f)
        }));

      }.bind(this));

      this._log("HARD rebuild columns done", (oTbl.getColumns && oTbl.getColumns().length) || 0);
    },

    // =========================
    // FILTER STATUS + TEXT + per-colonna + sort 
    // =========================
    _getCustomDataValue: function (oCtrl, sKey) {
      try {
        var a = (oCtrl && oCtrl.getCustomData && oCtrl.getCustomData()) || [];
        var cd = a.find(function (x) { return x && x.getKey && x.getKey() === sKey; });
        return cd ? cd.getValue() : null;
      } catch (e) {
        return null;
      }
    },

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

      // ---- FILTRI PER-COLONNA (header) ----
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

      // ---- SORT PER-COLONNA (header) ----
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

    _getInnerTableFromMdc: function (oMdcTbl) {
      return MdcTableUtil.getInnerTableFromMdc(oMdcTbl);
    },

    _refreshInlineSortIcons: function () {
      var st2 = (this._inlineFS && this._inlineFS.sort) || { key: "", desc: false };
      var mBtns = (this._inlineFS && this._inlineFS.sortBtns) || {};
      Object.keys(mBtns).forEach(function (k) {
        var b = mBtns[k];
        if (!b || !b.setIcon) return;
        if (!st2.key || st2.key !== k) {
          b.setIcon("sap-icon://sort");
        } else {
          b.setIcon(st2.desc ? "sap-icon://sort-descending" : "sap-icon://sort-ascending");
        }
      });
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

    _applyInlineHeaderFilterSort: async function (oMdcTbl) {
      if (!oMdcTbl) return;
      if (oMdcTbl.initialized) await oMdcTbl.initialized();

      var oInner = this._getInnerTableFromMdc(oMdcTbl);
      if (!oInner || typeof oInner.getColumns !== "function") {
        this._log("InlineFS: inner table non trovata o non compatibile");
        return;
      }

      var aMdcCols = (oMdcTbl.getColumns && oMdcTbl.getColumns()) || [];
      var aInnerCols = oInner.getColumns() || [];

      function normInnerKey(col) {
        var k = "";
        try {
          if (col && typeof col.getFilterProperty === "function") k = col.getFilterProperty() || "";
          if (!k && col && typeof col.getSortProperty === "function") k = col.getSortProperty() || "";
        } catch (e) { }

        k = String(k || "").trim();
        if (k.indexOf(">") >= 0) k = k.split(">").pop(); 
        return String(k || "").trim();
      }

      var mInnerByKey = {};
      aInnerCols.forEach(function (c) {
        var k = normInnerKey(c);
        if (!k) return;
        mInnerByKey[k] = c;
        mInnerByKey[k.toUpperCase()] = c;
      });

      if (!this._inlineFS) {
        this._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {}, filterInputs: {}, headerTitles: {}, headerRows: {}, headerBoxes: {} };
      }
      if (!this._inlineFS.sortBtns) this._inlineFS.sortBtns = {};
      if (!this._inlineFS.filterInputs) this._inlineFS.filterInputs = {};
      if (!this._inlineFS.headerTitles) this._inlineFS.headerTitles = {};
      if (!this._inlineFS.headerRows) this._inlineFS.headerRows = {};
      if (!this._inlineFS.headerBoxes) this._inlineFS.headerBoxes = {};

      var oUiModel = this.getView().getModel("ui");

      function fallbackInnerByIndex(iMdc) {
        var col = aInnerCols[iMdc] || null;
        if (col && (typeof col.setLabel === "function" || typeof col.setHeader === "function")) return col;

        col = aInnerCols[iMdc + 1] || null;
        if (col && (typeof col.setLabel === "function" || typeof col.setHeader === "function")) return col;

        return null;
      }

      for (var i = 0; i < aMdcCols.length; i++) {
        var mdcCol = aMdcCols[i];

        var sField =
          (mdcCol && (
            (typeof mdcCol.getPropertyKey === "function" && mdcCol.getPropertyKey()) ||
            (typeof mdcCol.getDataProperty === "function" && mdcCol.getDataProperty())
          )) || "";

        sField = String(sField || "").trim();
        if (!sField) continue; 

        var sHeader = (typeof mdcCol.getHeader === "function" && mdcCol.getHeader()) || sField;

        var innerCol = mInnerByKey[sField] || mInnerByKey[sField.toUpperCase()] || null;
        if (!innerCol) innerCol = fallbackInnerByIndex(i);

        if (!innerCol) continue;

        // --- Sort Button (riuso) ---
        var oSortBtn = this._inlineFS.sortBtns[sField];
        if (!oSortBtn) {
          oSortBtn = new Button({
            type: "Transparent",
            icon: "sap-icon://sort",
            visible: "{ui>/showHeaderSort}",
            press: this._onInlineColSortPress.bind(this)
          });
          oSortBtn.data("field", sField);
          this._inlineFS.sortBtns[sField] = oSortBtn;
        } else {
          if (oSortBtn.bindProperty) oSortBtn.bindProperty("visible", "ui>/showHeaderSort");
        }

        // --- Filter Input ---
        var oInp = this._inlineFS.filterInputs[sField];
        if (!oInp) {
          oInp = new Input({
            width: "100%",
            placeholder: "Filtra...",
            visible: "{ui>/showHeaderFilters}",
            liveChange: this._onInlineColFilterLiveChange.bind(this)
          });
          oInp.data("field", sField);
          this._inlineFS.filterInputs[sField] = oInp;
        } else {
          if (oInp.bindProperty) oInp.bindProperty("visible", "ui>/showHeaderFilters");
        }

        var wantedVal = String((this._inlineFS.filters && this._inlineFS.filters[sField]) || "");
        if (oInp.getValue && oInp.getValue() !== wantedVal) oInp.setValue(wantedVal);

        // --- Title ---
        var oTitle = this._inlineFS.headerTitles[sField];
        if (!oTitle) {
          oTitle = new Text({ text: (typeof sHeader === "string" ? sHeader : sField), wrapping: false });
          this._inlineFS.headerTitles[sField] = oTitle;
        } else if (oTitle.setText) {
          oTitle.setText(typeof sHeader === "string" ? sHeader : sField);
        }

        // --- Header row + box ---
        var oH = this._inlineFS.headerRows[sField];
        if (!oH) {
          oH = new HBox({
            justifyContent: "SpaceBetween",
            alignItems: "Center",
            items: [oTitle, oSortBtn]
          });
          this._inlineFS.headerRows[sField] = oH;
        }

        var oV = this._inlineFS.headerBoxes[sField];
        if (!oV) {
          oV = new VBox({ items: [oH, oInp] });
          this._inlineFS.headerBoxes[sField] = oV;
        }

        // assicuro che veda il model "ui"
        if (oUiModel) oV.setModel(oUiModel, "ui");

        // GridTable (sap.ui.table.Column) -> setLabel
        // ResponsiveTable (sap.m.Column)  -> setHeader
        MdcTableUtil.setInnerColumnHeader(innerCol, oV);

        if (innerCol.data) innerCol.data("__inlineFS", true);
      }

      this._refreshInlineSortIcons();
      this._setInnerHeaderHeight(oMdcTbl);
    },

    _bindRecords: async function (aRecords) {
      var oDetail = this.getView().getModel("detail");
      var a = aRecords || [];

      oDetail.setProperty("/RecordsAll", a);
      oDetail.setProperty("/Records", a);
      oDetail.setProperty("/RecordsCount", a.length);
      
        // >>> calcolo permessi globali Screen3
  var oVm = this.getOwnerComponent().getModel("vm");
  var sRole = String((oVm && oVm.getProperty("/userType")) || "").trim().toUpperCase();

  // “stato complessivo”: AP solo se tutto è AP (se ti basta solo il role, vedi nota sotto)
  var sAgg = "ST";
  a.forEach(function (r) {
    var st = String((r && (r.__status || r.Stato)) || "ST").trim().toUpperCase();
    sAgg = StatusUtil.mergeStatus(sAgg, st);
  });

  oDetail.setProperty("/__role", sRole);
  oDetail.setProperty("/__status", sAgg);
  oDetail.setProperty("/__canAddRow", StatusUtil.canAddRow(sRole, sAgg));


      this._refreshHeader3Fields();
      this._snapshotRecords = deepClone(a);

      var oTbl = this.byId("mdcTable3");
      var aCfg01Table = oDetail.getProperty("/_mmct/s01Table") || [];
      this._ensureMdcCfgScreen3(aCfg01Table);
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
    // BOTTONI EXTRA (stubs safe)
    // =========================
    onPrint: function () { MessageToast.show("Stampa: TODO"); },

    onExportExcel: async function () {
      BusyIndicator.show(0);

      try {
        let so = this.getOwnerComponent().getModel("vm");

        let recordsScreen4 = Object.values(so.getData().cache.dataRowsByKey)[1] || so.getProperty("/cache/dataRowsByKey/" + this._getExportCacheKey()) || [];
        let recordsScreen3 = this.getView().getModel("detail").getData().Records || [];

        recordsScreen4 = Array.isArray(recordsScreen4) ? recordsScreen4.slice() : [];
        recordsScreen3 = Array.isArray(recordsScreen3) ? recordsScreen3.slice() : [];

        if (!recordsScreen4.length) {
          MessageToast.show("Nessun dato Screen4 in cache (recordsScreen4 vuoto)");
          return;
        }

        // ==========================================================
        // 1) FUNZIONI UTILI: GUID + FIBRA
        // ==========================================================
        function norm(v) { return String(v == null ? "" : v).trim(); }

        function guidOf(x) {
          return norm(x && (x.GUID != null ? x.GUID : (x.Guid != null ? x.Guid : (x.guidKey != null ? x.guidKey : ""))));
        }

        function fibraOf(x) {
          return norm(x && (x.Fibra != null ? x.Fibra : (x.FIBRA != null ? x.FIBRA : "")));
        }

        function keyOf(x) {
          return guidOf(x) + "||" + fibraOf(x);
        }

        function isEmpty(v) {
          if (v == null) return true;
          if (Array.isArray(v)) return v.length === 0;
          if (typeof v === "string") return v.trim() === "";
          return false;
        }

        // ==========================================================
        // 2) MAP DEI PARENT (Screen3) PER GUID||FIBRA
        // ==========================================================
        // Se ci sono duplicati di guid||fibra in Screen3, l'ultimo vince (ma non dovrebbe succedere)
        let mParentByKey = {};
        recordsScreen3.forEach(function (p) {
          let k = keyOf(p);
          if (k !== "||") mParentByKey[k] = p;
        });

        // ==========================================================
        // 3) MERGE: per OGNI riga di Screen4 -> aggiungo campi Screen3
        //    Output righe = recordsScreen4.length  
        // ==========================================================
        let mergedRows = recordsScreen4.map(function (r4) {
          let out = Object.assign({}, r4);

          let k = keyOf(out);
          let parent = mParentByKey[k] || null;

          // fallback SOLO su GUID (senza Fibra)
          if (!parent) {
            let g = guidOf(out);
            if (g) {
              parent = mParentByKey[g + "||"] || null;
            }
          }

          if (parent) {
            // Copio dal parent solo se:
            // - campo NON presente in Screen4 (undefined) oppure è vuoto
            Object.keys(parent).forEach(function (prop) {
              if (prop.indexOf("__") === 0) return; // meta no
              if (out[prop] === undefined || isEmpty(out[prop])) {
                out[prop] = parent[prop];
              }
            });

            if (isEmpty(out.Stato)) {
              out.Stato = parent.__status || parent.Stato || out.Stato || "";
            }
            if (isEmpty(out.StatoText) && !isEmpty(out.Stato)) {
              out.StatoText = parent.StatoText || (this._statusText ? this._statusText(out.Stato) : out.Stato);
            }

            // Coerenza GUID/Fibra (se nel raw mancano)
            if (isEmpty(out.GUID) && !isEmpty(parent.GUID)) out.GUID = parent.GUID;
            if (isEmpty(out.Guid) && !isEmpty(parent.Guid)) out.Guid = parent.Guid;
            if (isEmpty(out.guidKey) && !isEmpty(parent.guidKey)) out.guidKey = parent.guidKey;
            if (isEmpty(out.Fibra) && !isEmpty(parent.Fibra)) out.Fibra = parent.Fibra;
          }

          return out;
        }.bind(this));

        // ==========================================================
        // 4) COLONNE + MAPPING EXPORT
        // ==========================================================
        let aColumns = this._buildExportColumnsComplete();

        let aData = mergedRows.map(function (r) {
          return this._mapRawRowToExportObject(r, aColumns);
        }.bind(this));

        aData = this._applyExportClientFiltersAndSort(aData);

        if (!aData.length) {
          MessageToast.show("Nessun dato dopo i filtri attivi");
          return;
        }

        // ==========================================================
        // 5) BUILD EXCEL
        // ==========================================================
        let sDate = new Date().toISOString().slice(0, 10);
        let sFileName =
          "Tracciabilita_" +
          (this._sVendorId || "Vendor") + "_" +
          (this._sMaterial || "Material") + "_" +
          sDate + ".xlsx";

        let oSheet = new Spreadsheet({
          workbook: { columns: aColumns },
          dataSource: aData,
          fileName: sFileName
        });

        await oSheet.build();
        MessageToast.show("Excel esportato");

      } catch (e) {
        console.error("[S3] Export Excel ERROR", e);
        MessageToast.show("Errore export Excel (vedi Console)");
      } finally {
        BusyIndicator.hide();
      }
    },

    _buildExportColumnsComplete: function () {
      var oDetail = this.getView().getModel("detail");
      var a01 = (oDetail && oDetail.getProperty("/_mmct/s01")) || [];
      var a02 = (oDetail && oDetail.getProperty("/_mmct/s02")) || [];

      var aCols = [];
      var mSeen = {};

      var add = function (label, prop) {
        prop = String(prop || "").trim();
        if (!prop || mSeen[prop]) return;
        mSeen[prop] = true;

        aCols.push({
          label: label || prop,
          property: prop,
          type: EdmType.String
        });
      };

      add("Fornitore", "Fornitore");
      add("Materiale", "Materiale");
      add("GUID", "GUID");
      add("Fibra", "Fibra");

      add("Stato", "Stato");
      add("Stato testo", "StatoText");

      var addFromCfg = function (arr) {
        (arr || []).forEach(function (f) {
          if (!f || !f.ui) return;
          var p = String(f.ui).trim();
          if (!p) return;
          if (p.toUpperCase() === "STATO") p = "Stato"; 
          add(f.label || p, p);
        });
      };

      addFromCfg(a01);
      addFromCfg(a02);

      return aCols;
    },

    _mapRawRowToExportObject: function (r, aColumns) {
      r = r || {};

      var sStato = this._deriveRowStatusForExport(r);

      var o = {};
      (aColumns || []).forEach(function (c) {
        var p = c.property;
        var v = "";

        if (p === "Fornitore") {
          v = r.Fornitore != null ? r.Fornitore : (this._sVendorId || "");
        } else if (p === "Materiale") {
          v = r.Materiale != null ? r.Materiale : (this._sMaterial || "");
        } else if (p === "GUID") {
          v = r.GUID != null ? r.GUID : (r.Guid != null ? r.Guid : (r.guidKey != null ? r.guidKey : ""));
        } else if (p === "Fibra") {
          v = r.Fibra != null ? r.Fibra : (r.FIBRA != null ? r.FIBRA : "");
        } else if (p === "Stato") {
          v = sStato;
        } else if (p === "StatoText") {
          v = this._statusText(sStato);
        } else {
          v = (r[p] != null) ? r[p] : "";
        }

        if (Array.isArray(v)) v = v.join(", ");
        if (v === null || v === undefined) v = "";

        o[p] = v;
      }.bind(this));

      return o;
    },

    _deriveRowStatusForExport: function (r) {
      var oVm = this.getOwnerComponent().getModel("vm");
      return StatusUtil.normStatoRow(r, oVm);
    },

    _applyExportClientFiltersAndSort: function (aData) {
      aData = Array.isArray(aData) ? aData.slice() : [];

      var oDetail = this.getView().getModel("detail");
      var q = String((oDetail && oDetail.getProperty("/__q")) || "").trim().toUpperCase();
      var sStatus = String((oDetail && oDetail.getProperty("/__statusFilter")) || "").trim().toUpperCase();

      // status
      if (sStatus) {
        aData = aData.filter(function (r) {
          return String((r && r.Stato) || "").trim().toUpperCase() === sStatus;
        });
      }

      if (q) {
        aData = aData.filter(function (r) {
          return Object.keys(r || {}).some(function (k) {
            var v = r[k];
            if (v === null || v === undefined) return false;
            return String(v).toUpperCase().indexOf(q) >= 0;
          });
        });
      }

      var mCol = (this._inlineFS && this._inlineFS.filters) || {};
      var aKeys = Object.keys(mCol).filter(function (k) {
        return String(mCol[k] || "").trim() !== "";
      });

      if (aKeys.length) {
        aData = aData.filter(function (r) {
          return aKeys.every(function (k) {
            var wanted = String(mCol[k] || "").trim().toUpperCase();
            if (!wanted) return true;
            var v = (r && r[k] != null) ? r[k] : "";
            return String(v).toUpperCase().indexOf(wanted) >= 0;
          });
        });
      }

      // sort
      var st = (this._inlineFS && this._inlineFS.sort) || { key: "", desc: false };
      if (st.key) {
        var key = st.key;
        var desc = !!st.desc;

        aData.sort(function (a, b) {
          var va = (a && a[key] != null) ? a[key] : "";
          var vb = (b && b[key] != null) ? b[key] : "";
          va = String(va);
          vb = String(vb);
          var cmp = va.localeCompare(vb, undefined, { numeric: true, sensitivity: "base" });
          return desc ? -cmp : cmp;
        });
      }

      return aData;
    },

    _getExportCacheKey: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var bMockS3 = !!mock.mockS3;

      var sBaseKey = this._getCacheKeySafe(); // vendor||material encoded
      return (bMockS3 ? "MOCK|" : "REAL|") + sBaseKey;
    },

    

    _statusText: function (sCode) {
      var c = String(sCode || "").trim().toUpperCase();
      var m = {
        ST: "In attesa / Da approvare",
        AP: "Approvato",
        RJ: "Respinto",
        CH: "Modificato"
      };
      return m[c] || c || "";
    },

    // =========================
    // ADD/DELETE ROWS (Screen3) - MDC Table
    // =========================
    PARENT_TABLE_ID: "mdcTable3",

    onAddRow: function () {
      var oDetail = this.getView().getModel("detail");
      if (!oDetail) return MessageToast.show("Model 'detail' non trovato");

      var aAll = oDetail.getProperty("/RecordsAll") || [];

      var iMax = -1;
      (aAll || []).forEach(function (r) {
        var n = parseInt((r && r.idx) != null ? r.idx : -1, 10);
        if (!isNaN(n) && n > iMax) iMax = n;
      });
      var iNewIdx = iMax + 1;

      // GUID + "-new"
      var sGuidNew = this._genGuidNew();

      // record padre (Screen3)
      var oNewRow = {
        idx: iNewIdx,

        GUID: sGuidNew,
        Guid: sGuidNew,
        guidKey: sGuidNew,

        Fibra: "",

        Stato: "ST",
        StatoText: this._statusText("ST"),
        __status: "ST",

        __canEdit: true,
        __canApprove: false,
        __canReject: false,
        __readOnly: false,

        __isNew: true,
        __state: "NEW"
      };

      var aCfg01 = oDetail.getProperty("/_mmct/s01") || [];
      (aCfg01 || []).forEach(function (f) {
        if (!f || !f.ui) return;
        var k = String(f.ui).trim();
        if (!k) return;
        if (k.toUpperCase() === "STATO") k = "Stato";
        if (oNewRow[k] !== undefined) return;
        oNewRow[k] = f.multiple ? [] : "";
      });

      aAll.push(oNewRow);
      oDetail.setProperty("/RecordsAll", aAll);

      // legame con Screen4: salva parent selezionato + crea bucket dettagli vuoto per idx
      this._setSelectedParentForScreen4(oNewRow);
      this._ensureScreen4CacheForParentIdx(iNewIdx, sGuidNew);

      // aggiorna Records + rebind
      this._applyClientFilters();

      // selezione: prova a selezionare la prima riga visibile (best-effort)
      setTimeout(function () {
        this._selectFirstRowMdc();
      }.bind(this), 0);

      MessageToast.show("Riga aggiunta");
    },

    onDeleteRows: function () {
      var oDetail = this.getView().getModel("detail");
      if (!oDetail) return MessageToast.show("Model 'detail' non trovato");

      var aSel = this._getSelectedParentObjectsFromMdc();
      if (!aSel.length) return MessageToast.show("Seleziona almeno una riga da eliminare");

      // idx da rimuovere
      var aIdxToRemove = aSel
        .map(function (r) { return parseInt(r && r.idx, 10); })
        .filter(function (n) { return !isNaN(n) && n >= 0; });

      if (!aIdxToRemove.length) return MessageToast.show("Nessun idx valido nelle righe selezionate");

      // (opzionale) traccia delete backend (solo non-new)
      var aDeletedParents = oDetail.getProperty("/__deletedParents") || [];
      aSel.forEach(function (r) {
        var g = (r && (r.GUID || r.Guid || r.guidKey)) || "";
        if (g && String(g).indexOf("-new") < 0) aDeletedParents.push(r);
      });
      oDetail.setProperty("/__deletedParents", aDeletedParents);

      // rimuovi da RecordsAll
      var aAll = oDetail.getProperty("/RecordsAll") || [];
      var aRemaining = (aAll || []).filter(function (r) {
        var n = parseInt(r && r.idx, 10);
        return aIdxToRemove.indexOf(n) < 0;
      });
      oDetail.setProperty("/RecordsAll", aRemaining);

      // ==== PATCH: elimina anche dalla cache VM (recordsByKey + dataRowsByKey) ====
      var oVm = this._ensureVmCache();
      var sKeyCache = this._getExportCacheKey(); // usa la stessa key con REAL|/MOCK| di Screen3

      // 1) set delle chiavi GUID||FIBRA da eliminare (per pulire dataRowsByKey)
      var mDelPair = {}, mDelGuid = {};
      aSel.forEach(function (p) {
      var g = this._toStableString(p && (p.guidKey || p.GUID || p.Guid));
      var f = this._toStableString(p && p.Fibra);
      if (g && f) mDelPair[g + "||" + f] = true;
      else if (g) mDelGuid[g] = true; // se fibra vuota -> elimina tutte le righe con quel GUID
      }.bind(this));

      // 2) recordsByKey: rimuovi i parent (idx) dalla cache
      var aRecsCache = oVm.getProperty("/cache/recordsByKey/" + sKeyCache) || [];
      oVm.setProperty("/cache/recordsByKey/" + sKeyCache, (aRecsCache || []).filter(function (r) {
      var n = parseInt(r && r.idx, 10);
      return aIdxToRemove.indexOf(n) < 0;
      }));

      var aRowsCacheBefore = oVm.getProperty("/cache/dataRowsByKey/" + sKeyCache) || [];
aSel.forEach(function (p) {
  // se CodAgg == N => metto in pancia righe raw con CodAgg=D
  this._stashDeleteForPostFromCache(p, aRowsCacheBefore, oDetail);
}.bind(this));

      // 3) dataRowsByKey: rimuovi le righe raw collegate (GUID/Fibra) dalla cache
      var aRowsCache = oVm.getProperty("/cache/dataRowsByKey/" + sKeyCache) || [];
      oVm.setProperty("/cache/dataRowsByKey/" + sKeyCache, (aRowsCache || []).filter(function (r) {
      var g = this._rowGuidKey(r);
      var f = this._rowFibra(r);
      return !(mDelPair[g + "||" + f] || mDelGuid[g]);
      }.bind(this)));
      // ==== /PATCH ====


      // pulisci cache Screen4 per quei padri
      this._purgeScreen4CacheByParentIdx(aIdxToRemove);

      // se il selected parent è stato eliminato -> reset
      var oSel = this._getSelectedParentForScreen4();
      var iSelIdx = oSel ? parseInt(oSel.idx, 10) : NaN;
      if (!isNaN(iSelIdx) && aIdxToRemove.indexOf(iSelIdx) >= 0) {
        this._setSelectedParentForScreen4(null);
      }

      // aggiorna Records + rebind
      this._applyClientFilters();

      // clear selection
      this._clearSelectionMdc();

      MessageToast.show("Righe eliminate");
    },

    /* ===========================
     * Helpers selezione MDC
     * =========================== */
    _getSelectedParentObjectsFromMdc: function () {
      var oMdc = this.byId(this.PARENT_TABLE_ID);
      var aObj = [];

      // 1) MDC Table (se disponibile)
      try {
        if (oMdc && typeof oMdc.getSelectedContexts === "function") {
          var aCtx = oMdc.getSelectedContexts() || [];
          aCtx.forEach(function (c) {
            var o = c && c.getObject && c.getObject();
            if (o) aObj.push(o);
          });
          if (aObj.length) return aObj;
        }
      } catch (e) { }

      // 2) Inner table fallback
      var oInner = this._getInnerTableFromMdc(oMdc);

      // sap.ui.table.Table
      try {
        if (oInner && typeof oInner.getSelectedIndices === "function" && typeof oInner.getContextByIndex === "function") {
          var aIdx = oInner.getSelectedIndices() || [];
          aIdx.forEach(function (i) {
            var c = oInner.getContextByIndex(i);
            var o = c && c.getObject && c.getObject();
            if (o) aObj.push(o);
          });
          if (aObj.length) return aObj;
        }
      } catch (e2) { }

      // sap.m.Table / ListBase
      try {
        if (oInner && typeof oInner.getSelectedItems === "function") {
          var aItems = oInner.getSelectedItems() || [];
          aItems.forEach(function (it) {
            var c = it && it.getBindingContext && (it.getBindingContext("detail") || it.getBindingContext());
            var o = c && c.getObject && c.getObject();
            if (o) aObj.push(o);
          });
          if (aObj.length) return aObj;
        }
      } catch (e3) { }

      // single selection fallback
      try {
        if (oInner && typeof oInner.getSelectedItem === "function") {
          var it2 = oInner.getSelectedItem();
          if (it2) {
            var c2 = it2.getBindingContext && (it2.getBindingContext("detail") || it2.getBindingContext());
            var o2 = c2 && c2.getObject && c2.getObject();
            if (o2) aObj.push(o2);
          }
        }
      } catch (e4) { }

      return aObj;
    },

    _clearSelectionMdc: function () {
      var oMdc = this.byId(this.PARENT_TABLE_ID);

      try {
        if (oMdc && typeof oMdc.clearSelection === "function") {
          oMdc.clearSelection();
          return;
        }
      } catch (e) { }

      var oInner = this._getInnerTableFromMdc(oMdc);

      try {
        if (oInner && typeof oInner.clearSelection === "function") {
          oInner.clearSelection();
          return;
        }
      } catch (e2) { }

      try {
        if (oInner && typeof oInner.removeSelections === "function") {
          oInner.removeSelections(true);
          return;
        }
      } catch (e3) { }
    },

    _selectFirstRowMdc: function () {
      var oMdc = this.byId(this.PARENT_TABLE_ID);
      var oInner = this._getInnerTableFromMdc(oMdc);

      // sap.ui.table.Table
      try {
        if (oInner && typeof oInner.setSelectedIndex === "function") {
          oInner.setSelectedIndex(0);
          return;
        }
      } catch (e) { }

      // sap.m.Table / ListBase
      try {
        if (oInner && typeof oInner.getItems === "function" && typeof oInner.setSelectedItem === "function") {
          var it = (oInner.getItems() || [])[0];
          if (it) oInner.setSelectedItem(it, true);
          return;
        }
      } catch (e2) { }
    },

    /* ===========================
     * Legame Screen3 -> Screen4 (cache + selected parent)
     * =========================== */
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
      var sK = this._getCacheKeySafe(); // vendor||material (encoded)

      var mAll = oVm.getProperty("/cache/screen4DetailsByKey") || {};
      if (!mAll[sK]) mAll[sK] = {};
      if (!mAll[sK][String(iIdx)]) mAll[sK][String(iIdx)] = []; // dettagli vuoti

      oVm.setProperty("/cache/screen4DetailsByKey", mAll);

      // (opzionale) mappa parent guid per idx
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

    /* ===========================
     * GUID GENERATION + "-new"
     * =========================== */
    _genGuidNew: function () {
      var base = "";

      if (typeof crypto !== "undefined" && crypto.randomUUID) {
        base = crypto.randomUUID().replace(/-/g, "");
      } else if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        var a = new Uint8Array(16);
        crypto.getRandomValues(a);
        base = Array.prototype.map.call(a, function (b) {
          return b.toString(16).padStart(2, "0");
        }).join("");
      } else {
        base = (Date.now().toString(16) + Math.random().toString(16).slice(2)).replace(/\./g, "");
      }

      return base + "-new";
    },
    _collectLinesForSave: function () {
  var oDetail = this.getView().getModel("detail");
  var aParents = (oDetail && oDetail.getProperty("/RecordsAll")) || [];

  // Screen4 details cache: /cache/screen4DetailsByKey/<vendor||material>/<idx> = []
  var oVm = this._ensureVmCache();
  var sK = this._getCacheKeySafe(); // vendor||material (encoded)
  var mAll = oVm.getProperty("/cache/screen4DetailsByKey") || {};
  var mByIdx = (mAll && mAll[sK]) ? mAll[sK] : {};

  // vendor/material normalize
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
      // nessun dettaglio: mando almeno la riga “parent”
      out.push(this._sanitizeLineForPost(p, sVendor, sMat));
    }
  }.bind(this));

  return out;
},

/* _sanitizeLineForPost: function (r, sVendor10, sMaterial) {
  r = r || {};

  // Copia pulita: rimuovo campi UI e normalizzo arrays/null
  var o = {};
  Object.keys(r).forEach(function (k) {
    if (!k) return;
    if (k.indexOf("__") === 0) return;
    if (k === "idx" || k === "guidKey" || k === "StatoText" || k === "__metadata") return;

    var v = r[k];

    // Multi -> stringa (backend tipicamente vuole string)
    if (Array.isArray(v)) v = v.join(";");

    // DateTime noti -> null se vuoti (per evitare type error OData)
    if ((k === "InizioVal" || k === "FineVal" || k === "DataIns" || k === "DataMod") && (v === "" || v === undefined)) {
      v = null;
    }

    o[k] = (v === undefined ? "" : v);
  });

  // Forza campi chiave minimi
  if (!o.Fornitore) o.Fornitore = sVendor10;
  if (!o.Materiale) o.Materiale = sMaterial;

  // GUID: se è un "-new" mando null così backend lo genera
  var g = (o.Guid != null ? o.Guid : (o.GUID != null ? o.GUID : (o.GuidKey != null ? o.GuidKey : "")));
  g = String(g || "");
  if (!g || g.indexOf("-new") >= 0) g = null;

  // backend usa "Guid" (non "GUID")
  o.Guid = g;
  if (o.GUID !== undefined) delete o.GUID;
  if (o.GuidKey !== undefined) delete o.GuidKey;

  // UserID anche sulla linea (come da mail)
  var oVm = this.getOwnerComponent().getModel("vm");
  var sUserId = (oVm && oVm.getProperty("/userId")) || "E_ZEMAF";
  o.UserID = sUserId;

  return o;
}, */

_getMultiFieldsMap: function () {
  var oDetail = this.getView().getModel("detail");
  var a01 = (oDetail && oDetail.getProperty("/_mmct/s01")) || [];
  var a02 = (oDetail && oDetail.getProperty("/_mmct/s02")) || [];

  var m = {};
  [a01, a02].forEach(function (arr) {
    (arr || []).forEach(function (f) {
      if (!f || !f.ui || !f.multiple) return;
      var k = String(f.ui).trim();
      if (k.toUpperCase() === "STATO") k = "Stato";
      m[k] = true;
    });
  });

  return m;
},

_normalizeMultiString: function (v, sSepOut) {
  if (v == null) return v;

  // se arriva già come array (MultiComboBox), unifico
  if (Array.isArray(v)) {
    return v
      .map(function (x) { return String(x || "").trim(); })
      .filter(Boolean)
      .join(sSepOut);
  }

  var s = String(v || "").trim();
  if (!s) return "";

  // se non contiene separatori, lascio com’è
  if (s.indexOf(";") < 0 && s.indexOf("|") < 0) return s;

  // split robusto su ; e |
  return s
    .split(/[;|]+/)
    .map(function (x) { return String(x || "").trim(); })
    .filter(Boolean)
    .join(sSepOut);
},

_formatIncomingRowsMultiSeparators: function (aRows) {
  var mMulti = this._getMultiFieldsMap();
  var aKeys = Object.keys(mMulti);
  if (!aKeys.length) return;

  (aRows || []).forEach(function (r) {
    if (!r) return;

    aKeys.forEach(function (k) {
      var v = r[k];
      // INGRESSO: backend/mock usa "|" -> UI deve vedere ";"
      if (typeof v === "string" && v.indexOf("|") >= 0) {
        r[k] = this._normalizeMultiString(v, ";");
      }
    }.bind(this));
  }.bind(this));
},


_extractPostResponseLines: function (oData) {
  // Deep insert response tipica: PostDataCollection.results
  if (!oData) return [];
  if (oData.PostDataCollection && Array.isArray(oData.PostDataCollection.results)) return oData.PostDataCollection.results;
  if (Array.isArray(oData.PostDataCollection)) return oData.PostDataCollection;
  return [];
},

_invalidateScreen3Cache: function () {
  var oVm = this._ensureVmCache();
  var sKey = this._getExportCacheKey(); // REAL|... / MOCK|...

  // svuoto cache così _loadDataOnce forza reload backend
  oVm.setProperty("/cache/dataRowsByKey/" + sKey, []);
  oVm.setProperty("/cache/recordsByKey/" + sKey, []);
},

_normalizeVendor10: function (v) {
  var s = String(v || "").trim();
  if (/^\d+$/.test(s) && s.length < 10) s = ("0000000000" + s).slice(-10);
  return s;
},

_readODataError: function (oError) {
  try {
    // oError.responseText spesso ha JSON: { error: { message: { value: "..." } } }
    var s = oError && (oError.responseText || oError.response && oError.response.body);
    if (!s) return "";
    var j = JSON.parse(s);
    return j && j.error && j.error.message && (j.error.message.value || j.error.message) || "";
  } catch (e) {
    return "";
  }
},
onSave: function () {
  var oVm = this.getOwnerComponent().getModel("vm");
  var mock = (oVm && oVm.getProperty("/mock")) || {};
  var bMock = !!(mock && mock.mockS3);

  var sUserId = (oVm && oVm.getProperty("/userId")) || "E_ZEMAF";
  var oModel = this.getOwnerComponent().getModel();

  var oDetail = this.getView().getModel("detail");
  var aParents = (oDetail && oDetail.getProperty("/RecordsAll")) || [];

  // === chiavi vendor/material normalizzate ===
  var sVendor10 = this._normalizeVendor10(this._sVendorId);
  var sMaterial = String(this._sMaterial || "").trim();

  // === canonical dataset completo (lo aggiorna Screen4) ===
  var oVmCache = this._ensureVmCache();
  var sCacheKey = this._getExportCacheKey(); // "REAL|..." / "MOCK|..."
  var aRawAll = oVmCache.getProperty("/cache/dataRowsByKey/" + sCacheKey) || [];
  if (!Array.isArray(aRawAll)) aRawAll = [];

  // === keys Screen3 (campi parent da propagare su tutte le righe raw) ===
  var aS01 = (oDetail && oDetail.getProperty("/_mmct/s01")) || [];
  var aParentKeys = (aS01 || [])
    .map(function (f) {
      var k = f && f.ui ? String(f.ui).trim() : "";
      if (!k) return "";
      if (k.toUpperCase() === "STATO") k = "Stato";
      return k;
    })
    .filter(Boolean);

  // sempre utili
  if (aParentKeys.indexOf("Fibra") < 0) aParentKeys.push("Fibra");
  if (aParentKeys.indexOf("Stato") < 0) aParentKeys.push("Stato");

  function norm(v) { return String(v == null ? "" : v).trim(); }

  function isEmpty(v) {
    if (v == null) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === "string") return v.trim() === "";
    return false;
  }

  function guidOf(x) {
    // IMPORTANT: include guidKey (lowercase) + altri alias
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

  // indicizzo raw per GUID (così prendo tutte le righe Screen4/linee)
  var mRawByGuid = {};
  aRawAll.forEach(function (r) {
    var g = guidOf(r);
    if (!g) return;
    if (!mRawByGuid[g]) mRawByGuid[g] = [];
    mRawByGuid[g].push(r);
  });

  var mMulti = this._getMultiFieldsMap();

  // sanitizzazione finale: tengo TUTTI i campi business, tolgo roba UI/meta
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

      // Multi -> stringa (backend tipicamente vuole string)
      if (mMulti[k]) {
    v = normalizeMulti(v, "|");
  } else if (Array.isArray(v)) {
    v = v.join(";");
  }

      // DateTime noti -> null se vuoti
      if ((k === "InizioVal" || k === "FineVal" || k === "DataIns" || k === "DataMod") && (v === "" || v === undefined)) {
        v = null;
      }

      o[k] = (v === undefined ? "" : v);
    });

    // forza chiavi minime
    if (!o.Fornitore) o.Fornitore = sVendor10;
    if (!o.Materiale) o.Materiale = sMaterial;

    // Guid: se "-new" -> null (backend genera)
    var g = guidOf(r) || guidOf(o);
    if (!g || g.indexOf("-new") >= 0) g = null;

    // backend usa "Guid"
    o.Guid = g;

    // pulizia alias (evito proprietà non previste)
    if (o.GUID !== undefined) delete o.GUID;
    if (o.GuidKey !== undefined) delete o.GuidKey;
    if (o.guidKey !== undefined) delete o.guidKey;

    // UserID anche sulla linea
    o.UserID = sUserId;

    return o;
  }.bind(this);

  // === BUILD lines: per ogni parent prendo tutte le righe raw del GUID e ci applico sopra i campi Screen3 ===
  var aLines = [];
  (aParents || []).forEach(function (p) {
    var gP = guidOf(p);
    var fP = fibraOf(p);

    // se ho raw per quel guid => prendo quelle (completo Screen4)
    var aRows = (gP && mRawByGuid[gP]) ? mRawByGuid[gP] : [];

    // se non ho raw (nuovo parent appena creato e non passato da S4) => creo riga synthetic dal parent
    if (!aRows.length) aRows = [deepClone(p) || {}];

    aRows.forEach(function (r0) {
      var r = deepClone(r0) || {};

      // 1) Propaga SEMPRE i campi Screen3 su tutte le righe (anche se il raw aveva valore)
      aParentKeys.forEach(function (k) {
        if (p && p[k] !== undefined) r[k] = p[k];
      });

      // 2) Per gli altri campi del parent: fill se nel raw mancano/sono vuoti
      Object.keys(p || {}).forEach(function (k) {
        if (!k) return;
        if (k.indexOf("__") === 0) return;
        if (k === "idx" || k === "guidKey" || k === "StatoText") return;
        if (r[k] === undefined || isEmpty(r[k])) r[k] = p[k];
      });

      // 3) Stato coerente
      var stP = norm(p && (p.__status || p.Stato));
      if (isEmpty(r.Stato) && stP) r.Stato = stP;

      // 4) GUID coerente (se il raw non lo aveva)
      if (!guidOf(r) && gP) {
        // non forzo formato, copio solo se c’è
        r.Guid = gP;
      }

      // 5) Fibra coerente
      if (isEmpty(r.Fibra) && fP) r.Fibra = fP;

      // 6) chiavi minime
      if (!r.Fornitore) r.Fornitore = sVendor10;
      if (!r.Materiale) r.Materiale = sMaterial;
      r.UserID = sUserId;

      aLines.push(sanitizeForPost(r));
    });
  });

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

  var oPayload = {
    UserID: sUserId,
    PostDataCollection: aLines.filter(i => i.CodAgg != 'N')
  };

  // LOG payload completo
  console.log("[S3] Payload /PostDataSet (UNIFIED)", JSON.parse(JSON.stringify(oPayload)));

  if (bMock) {
    MessageToast.show("MOCK attivo: POST non eseguita (payload in Console)");
    return;
  }

  BusyIndicator.show(0);
  BusyIndicator.hide(0);
  debugger



  return
  oModel.create("/PostDataSet", oPayload, {
    urlParameters: { "sap-language": "IT" },
    success: function (oData) {
      BusyIndicator.hide();

      var aResp = this._extractPostResponseLines(oData);
      var aErr = (aResp || []).filter(function (r) {
        var es = String(r && r.Esito || "").trim().toUpperCase();
        return es && es !== "OK";
      });

      if (aErr.length) {
        MessageToast.show("Errore salvataggio: " + ((aErr[0] && aErr[0].Message) || "verifica i dati"));
      } else {
        MessageToast.show("Salvataggio completato");
      }

      this._invalidateScreen3Cache();
      this._loadDataOnce();
      oDetail.setProperty("/__deletedLinesForPost", []);
    }.bind(this),

    error: function (oError) {
      BusyIndicator.hide();
      var msg = this._readODataError(oError) || "Errore in salvataggio (vedi Console)";
      console.error("[S3] POST ERROR", oError);
      MessageToast.show(msg);
    }.bind(this)
  });
},




    // =========================
    // NavBack
    // =========================
    onNavBack: function () {
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
