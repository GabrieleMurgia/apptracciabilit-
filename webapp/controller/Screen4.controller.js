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
  "sap/m/Input",
  "sap/m/ComboBox",
  "sap/m/MultiComboBox",
  "sap/ui/core/Item",
  "sap/ui/mdc/p13n/StateUtil",
  "sap/m/VBox",
  "apptracciabilita/apptracciabilita/util/common",
  "apptracciabilita/apptracciabilita/util/vmCache",
  "apptracciabilita/apptracciabilita/util/domains",
  "apptracciabilita/apptracciabilita/util/statusUtil",
  "apptracciabilita/apptracciabilita/util/mmctUtil",
  "apptracciabilita/apptracciabilita/util/mdcTableUtil",
  "apptracciabilita/apptracciabilita/util/p13nUtil",
  "apptracciabilita/apptracciabilita/util/cellTemplateUtil",

  "apptracciabilita/apptracciabilita/util/mockData"
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
  Input,
  ComboBox,
  MultiComboBox,
  Item,
  StateUtil,
  VBox,
  Common,
  VmCache,
  Domains,
  StatusUtil,
  MmctUtil,
  MdcTableUtil,
  P13nUtil,
  CellTemplateUtil,
  MockData
) {
  "use strict";

  return Controller.extend("apptracciabilita.apptracciabilita.controller.Screen4", {

    onInit: function () {
      this._log("onInit");

      var oRouter = this.getOwnerComponent().getRouter();
      oRouter.getRoute("Screen4").attachPatternMatched(this._onRouteMatched, this);

 
      this.getView().setModel(new JSONModel({
      showHeaderFilters: false,
      showHeaderSort: true
      }), "ui");
      this._hdrSortBtns = {};   


      var oDetail = new JSONModel({
        VendorId: "",
        Header4Fields: [],
        Material: "",
        recordKey: "0",
        guidKey: "",
        Fibra: "",
        RowsAll: [],
        Rows: [],
        RowsCount: 0,
        _mmct: { cat: "", s00: [], hdr4: [], s02: [] },

        __dirty: false,
        __role: "",
        __status: "",
        __canEdit: false,
        __canAddRow: false,
        __canApprove: false,
        __canReject: false,
      });

      this.getView().setModel(oDetail, "detail");
      this._snapshotRows = null;

      // UI state (filters/sort)
      this._globalQuery = "";
      this._colFilters = {};   
      this._sortState = null;  
      this._sortCtrls = {};

      this._hdrFilter = {
        boxesByKey: {},   
        seenLast: {}      // per cleanup
      };

      this._setupDebugMdcHooks();
    },

    onOpenSort: function () {
      this.onToggleHeaderSort();
    },
/*     onToggleHeaderSort: function () {
      var oUi = this.getView().getModel("ui");
      if (!oUi) return;

      var bNow = !!oUi.getProperty("/showHeaderSort");
      oUi.setProperty("/showHeaderSort", !bNow);

      
      var oTbl = this.byId("mdcTable4");
      this._applyInlineHeaderFilterSort(oTbl);
    }, */

    onToggleHeaderSort: function () {
  var oUi = this.getView().getModel("ui");
  if (!oUi) return;

  oUi.setProperty("/showHeaderSort", !oUi.getProperty("/showHeaderSort"));

  this._injectHeaderFilters("toggleSort");
},

    onExit: function () {
      try {
        if (this._dlgSort) { this._dlgSort.destroy(); this._dlgSort = null; }

        if (this._hdrFilter && this._hdrFilter.boxesByKey) {
          Object.keys(this._hdrFilter.boxesByKey).forEach(function (k) {
            var p = this._hdrFilter.boxesByKey[k];
            try { if (p && p.box) p.box.destroy(); } catch (e) {  }
          }.bind(this));
        }
        this._hdrFilter = { boxesByKey: {}, seenLast: {} };
      } catch (e) {  }
    },

    
_log: function () {
  var a = Array.prototype.slice.call(arguments);
  a.unshift("[S4] " + Common.ts());
  console.log.apply(console, a);
},

_dbg: function () {
  if (this._DBG === false) return;
  var a = Array.prototype.slice.call(arguments);
  a.unshift("[S4DBG] " + Common.ts());
  console.log.apply(console, a);
},
    _setupDebugMdcHooks: function () {
      try {
        var oMdc = this.byId("mdcTable4");
        if (!oMdc) {
          this._dbg("mdcTable4 NOT FOUND in view (byId)");
          return;
        }

        this._dbg("mdcTable4 found", {
          id: oMdc.getId && oMdc.getId(),
          hasGetTable: typeof oMdc.getTable === "function",
          hasInitialized: typeof oMdc.initialized === "function",
          delegate: oMdc.getDelegate ? oMdc.getDelegate() : "(no getDelegate)"
        });

        // logga ogni rebind (utile per capire timing)
        if (typeof oMdc.attachBeforeRebindTable === "function" && !oMdc.__dbgBeforeRebindAttached) {
          oMdc.__dbgBeforeRebindAttached = true;
          oMdc.attachBeforeRebindTable(function (e) {
            var bp = e.getParameter("bindingParams");
            this._dbg("beforeRebindTable", {
              path: bp && bp.path,
              filters: bp && bp.filters ? bp.filters.length : 0,
              sorters: bp && bp.sorter ? bp.sorter.length : 0
            });
          }.bind(this));
        } else {
          this._dbg("attachBeforeRebindTable not available (ok if UI5 version differs)");
        }

        if (typeof oMdc.initialized === "function") {
          oMdc.initialized().then(function () {
            this._dbg("mdcTable4 initialized()");
            var oInner = this._getInnerTable(true);
            if (oInner) {
              this._dbg("inner table READY", {
                meta: oInner.getMetadata && oInner.getMetadata().getName(),
                cols: oInner.getColumns ? oInner.getColumns().length : "(no getColumns)",
                hasRowsUpdated: typeof oInner.attachRowsUpdated === "function"
              });

              if (typeof oInner.attachRowsUpdated === "function" && !oInner.__dbgRowsAttached) {
                oInner.__dbgRowsAttached = true;
                oInner.attachRowsUpdated(function () {
                  this._dbg("inner rowsUpdated()", {
                    cols: oInner.getColumns ? oInner.getColumns().length : "(no getColumns)"
                  });
                }.bind(this));
              }
            } else {
              this._dbg("inner table STILL NULL after initialized()");
            }
          }.bind(this));
        }
      } catch (e) {
        console.error("[S4DBG] _setupDebugMdcHooks ERROR", e);
      }
    },

    _logTable: function (label) {
      var oTbl = this.byId("mdcTable4");
      if (!oTbl) return this._log(label, "NO TABLE");

      var aCols = (oTbl.getColumns && oTbl.getColumns()) || [];
      var vis = aCols.filter(function (c) { return c.getVisible && c.getVisible(); }).length;

      var oRB = oTbl.getRowBinding && oTbl.getRowBinding();
      var oIB = oTbl.getItemBinding && oTbl.getItemBinding();

      this._log(label, {
        id: oTbl.getId && oTbl.getId(),
        colsCount: aCols.length,
        visibleCols: vis,
        delegate: oTbl.getDelegate && oTbl.getDelegate(),
        hasRowBinding: !!oRB,
        hasItemBinding: !!oIB
      });
    },


    _toStableString: Common.toStableString,
    _getApprovedFlag: StatusUtil.getApprovedFlag,

    // =========================
    // IMPOSTAZIONE / MULTIPLE
    // =========================
    _getSettingFlags: MmctUtil.getSettingFlags,
    _isMultipleField: MmctUtil.isMultipleField,

    // =========================
    // DOMAINS
    // =========================
    _domainHasValues: function (sDomain) {
    return Domains.domainHasValues(this.getOwnerComponent(), sDomain);
    },
    _rankStato: StatusUtil.rankStato,
    _mergeStatus: StatusUtil.mergeStatus,
    _canEdit: StatusUtil.canEdit,
    _canApprove: StatusUtil.canApprove,
    _canReject: StatusUtil.canReject,
    _normStatoRow: function (r) {
    var oVm = this.getOwnerComponent().getModel("vm");
    return StatusUtil.normStatoRow(r, oVm);
    },

    _updateVmRecordStatus: function (sCacheKey, sGuidKeySel, sFibraSel, sRole, sStatus) {
      var oVm = this._ensureVmCache();
      var aRecs = oVm.getProperty("/cache/recordsByKey/" + sCacheKey) || [];
      if (!Array.isArray(aRecs) || !aRecs.length) return;

      var idx = aRecs.findIndex(function (r) {
  var gOk = String(r && r.guidKey || "") === String(sGuidKeySel || "");
  if (!gOk) return false;


  if (!sFibraSel) return true;

  return String(r && r.Fibra || "") === String(sFibraSel || "");
});

      if (idx < 0) return;

      var rec = aRecs[idx];
      var st = String(sStatus || "ST").trim().toUpperCase();

      rec.__status = st;
      rec.Stato = st;

      rec.__canEdit = this._canEdit(sRole, st);
      rec.__canApprove = this._canApprove(sRole, st);
      rec.__canReject = this._canReject(sRole, st);
      rec.__readOnly = !rec.__canEdit;

      aRecs = aRecs.slice();
      aRecs[idx] = rec;
      oVm.setProperty("/cache/recordsByKey/" + sCacheKey, aRecs);
    },

    // =========================
    // DIRTY
    // =========================
    _markDirty: function () {
      var oDetail = this.getView().getModel("detail");
      if (!oDetail) return;

      oDetail.setProperty("/__dirty", true);

      // se FORNITORE e non AP -> ogni modifica porta a CH
      var sRole = String(oDetail.getProperty("/__role") || "").trim().toUpperCase();
      var sStatus = String(oDetail.getProperty("/__status") || "").trim().toUpperCase();

      if (sRole === "E" && sStatus !== "AP") {
        var aRowsAll = oDetail.getProperty("/RowsAll") || [];
        oDetail.setProperty("/__canEdit", true);
        oDetail.setProperty("/__canAddRow", true);
        oDetail.setProperty("/__canApprove", false);
        oDetail.setProperty("/__canReject", false);

    
        var sKey = this._getDataCacheKey();
        var sGuid = this._toStableString(oDetail.getProperty("/guidKey"));
        var sFibra = this._toStableString(oDetail.getProperty("/Fibra"));
      }

      this._applyUiPermissions();
    },

    _hookDirtyOnEdit: function (oCtrl) {
      if (!oCtrl) return;

      try {
        if (oCtrl.data && oCtrl.data("dirtyHooked")) return;
        if (oCtrl.data) oCtrl.data("dirtyHooked", true);
      } catch (e) {  }

      var fn = this._markDirty.bind(this);

      if (typeof oCtrl.attachChange === "function") oCtrl.attachChange(fn);
      if (typeof oCtrl.attachSelectionChange === "function") oCtrl.attachSelectionChange(fn);
      if (typeof oCtrl.attachSelectionFinish === "function") oCtrl.attachSelectionFinish(fn);
    },

    _createCellTemplate: function (sKey, oMeta) {
    return CellTemplateUtil.createCellTemplate(sKey, oMeta, {
    domainHasValuesFn: function (sDomain) {
      return Domains.domainHasValues(this.getOwnerComponent(), sDomain);
    }.bind(this),
    hookDirtyOnEditFn: this._hookDirtyOnEdit.bind(this)
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
      this._sRecordKey = decodeURIComponent(oArgs.recordKey || "0");

      this._log("_onRouteMatched args", oArgs);

      this._snapshotRows = null;

      // reset UI filter state
      this._globalQuery = "";
      this._colFilters = {};
      this._sortState = null;

      var oInp = this.byId("inputFilter4");
      if (oInp && oInp.setValue) oInp.setValue("");

      // reset header filters UI
      this._syncHeaderFilterCtrlsFromState(true);

      var oDetail = this.getView().getModel("detail");
      oDetail.setData({
        VendorId: this._sVendorId,
        Material: this._sMaterial,
        recordKey: this._sRecordKey,
        guidKey: "",
        Fibra: "",
        RowsAll: [],
        Rows: [],
        RowsCount: 0,
        _mmct: { cat: "", s02: [] },
        Header4Fields: [],
_mmct: { cat: "", s00: [], hdr4: [], s02: [] },

        __dirty: false,
        __role: "",
        __status: "",
        __canEdit: false,
        __canAddRow: false,
        __canApprove: false,
        __canReject: false
      }, true);

      this._applyUiPermissions();
      this._logTable("TABLE STATE @ before _loadSelectedRecordRows");
      this._resetHeaderCaches(); 

      this._loadSelectedRecordRows(function () {
        this._bindRowsAndColumns();
      }.bind(this));
    },

    // =========================
    // CACHE VM
    // =========================
    _ensureVmCache: function () {
    return VmCache.ensureVmCache(this.getOwnerComponent());
    },
    _getCacheKeySafe: function () {
    return VmCache.getCacheKeySafe(this._sVendorId, this._sMaterial);
    },

    _getMmctCfgForCat: function (sCat) {
    var oVm = this.getOwnerComponent().getModel("vm");
    return MmctUtil.getMmctCfgForCat(oVm, sCat);
    },
    _isX: MmctUtil.isX,
    _parseOrder: MmctUtil.parseOrder,
    _cfgForScreen: function (sCat, sScreen) {
    var oVm = this.getOwnerComponent().getModel("vm");
    return MmctUtil.cfgForScreen(oVm, sCat, sScreen);
    },



    _cfgForScreen02: function (sCat) {
      var a = this._getMmctCfgForCat(sCat) || [];
      return (a || [])
        .filter(function (c) { return String(c.LivelloSchermata || "").padStart(2, "0") === "02"; })
        .map(function (c) {
          var ui = String(c.UiFieldname || c.UIFIELDNAME || "").trim();
          if (!ui) return null;

          var label = (c.Descrizione || c.DESCRIZIONE || ui);
          var domain = String(c.Dominio ?? c.DOMINIO ?? c.Domain ?? c.DOMAIN ?? "").trim();

          var flags = this._getSettingFlags(c);
          if (flags.hidden) return null;

          var required = !!flags.required;
          var locked = !!flags.locked;
          var multiple = this._isMultipleField(c);

          return { ui: ui, label: label, domain: domain, required: required, locked: locked, multiple: multiple };
        }.bind(this))
        .filter(Boolean);
    },

    _cfgForScreen01: function (sCat) {
      var a = this._getMmctCfgForCat(sCat) || [];
      return (a || [])
        .filter(function (c) { return String(c.LivelloSchermata || "").padStart(2, "0") === "01"; })
        .map(function (c) {
          var ui = String(c.UiFieldname || c.UIFIELDNAME || "").trim();
          if (!ui) return null;

          var label = (c.Descrizione || c.DESCRIZIONE || ui);
          var domain = String(c.Dominio ?? c.DOMINIO ?? c.Domain ?? c.DOMAIN ?? "").trim();

          var flags = this._getSettingFlags(c);
          if (flags.hidden) return null;

          var required = !!flags.required;
          var locked = !!flags.locked;
          var multiple = this._isMultipleField(c);

          return { ui: ui, label: label, domain: domain, required: required, locked: locked, multiple: multiple };
        }.bind(this))
        .filter(Boolean);
    },

    // =========================
    // ODATA / MOCK (se cache non c'è)
    // =========================
    _reloadDataFromBackend: function (fnDone) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var bMockS4 = !!mock.mockS4;
      var sForceStato = String(mock.forceStato || "").trim().toUpperCase();

      var sUserId = (oVm && oVm.getProperty("/userId")) || "E_ZEMAF";
      var oODataModel = this.getOwnerComponent().getModel();

      function done(a) { if (typeof fnDone === "function") fnDone(a || []); }
      function norm(v) { return String(v || "").trim().toUpperCase(); }

      if (bMockS4) {
        var sUrl = sap.ui.require.toUrl("apptracciabilita/apptracciabilita/mock/DataSet.json");

        var oJ = new sap.ui.model.json.JSONModel(sUrl);
        try { oJ.loadData(sUrl, null, false); } catch (eSync) { this._log("[MOCK S4] loadData sync FAIL", eSync && eSync.message); }

        var d = oJ.getData();
        var aMock = (d && d.results) || (d && d.d && d.d.results) || d;

        if (!Array.isArray(aMock)) {
          if (aMock && Array.isArray(aMock.results)) aMock = aMock.results;
          else if (aMock && aMock.d && Array.isArray(aMock.d.results)) aMock = aMock.d.results;
          else aMock = [];
        }

        if (sForceStato === "ST" || sForceStato === "AP" || sForceStato === "RJ" || sForceStato === "CH") {
          aMock.forEach(function (r) { r.Stato = sForceStato; });
        }

        this._log("[MOCK S4] DataSet.json RAW OK", { url: sUrl, rows: aMock.length, forceStato: sForceStato || "(none)" });
        done(aMock);
        return;
      }

      var sVendor = String(this._sVendorId || "").trim();
      if (/^\d+$/.test(sVendor) && sVendor.length < 10) sVendor = sVendor.padStart(10, "0");

      var sRouteMat = norm(this._sMaterial);

      function buildMaterialVariants(routeMat) {
        var set = {};
        function add(x) { x = norm(x); if (x) set[x] = true; }
        add(routeMat);
        if (routeMat && !routeMat.endsWith("S")) add(routeMat + "S");
        if (routeMat && routeMat.endsWith("S")) add(routeMat.slice(0, -1));
        return Object.keys(set);
      }

      var aMatVariants = buildMaterialVariants(sRouteMat);

      var aFilters = [
        new Filter("UserID", FilterOperator.EQ, sUserId),
        new Filter("Fornitore", FilterOperator.EQ, sVendor)
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

          if (sForceStato === "ST" || sForceStato === "AP" || sForceStato === "RJ" || sForceStato === "CH") {
            a.forEach(function (r) { r.Stato = sForceStato; });
            this._log("[S4] forceStato =", sForceStato);
          }

          done(a);
        }.bind(this),
        error: function (oError) {
          BusyIndicator.hide();
          console.error("Errore lettura DataSet", oError);
          MessageToast.show("Errore nel caricamento dei dettagli");
          done([]);
        }
      });
    },

    // =========================
    // Record select helpers
    // =========================
    _rowGuidKey: function (r) {
      var v = r && (r.Guid || r.GUID || r.ItmGuid || r.ItemGuid || r.GUID_ITM || r.GUID_ITM2);
      return this._toStableString(v);
    },

    _rowFibra: function (r) {
      var v = r && (r.Fibra || r.FIBRA || r.Fiber || r.FIBER);
      return this._toStableString(v);
    },

    _buildRecords01ForCache: function (aAllRows, aCfg01) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var sRole = (oVm && oVm.getProperty("/userType")) || "";
      sRole = String(sRole || "").trim().toUpperCase();

      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var sForce = String(mock.forceStato || "").trim().toUpperCase();

      var aCols01 = (aCfg01 || []).map(function (x) { return x && x.ui; }).filter(Boolean);

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

      var m = {};
      var a = [];

      (aAllRows || []).forEach(function (r) {
        var sGuidKey = this._rowGuidKey(r);
        var sFibra = this._rowFibra(r);
       var sKey = sGuidKey; 


        var stRow = (sForce === "ST" || sForce === "AP" || sForce === "RJ" || sForce === "CH")
          ? sForce
          : this._normStatoRow(r);

        var oRec = m[sKey];

        if (!oRec) {
          oRec = {
            idx: a.length,
            guidKey: sGuidKey,
            Fibra: sFibra,
            Stato: stRow,
            __status: stRow,
            __canEdit: this._canEdit(sRole, stRow),
            __canApprove: this._canApprove(sRole, stRow),
            __canReject: this._canReject(sRole, stRow),
            __readOnly: !this._canEdit(sRole, stRow)
          };

          aCols01.forEach(function (c) {
            var v = (r && r[c] !== undefined) ? r[c] : "";
            oRec[c] = mIsMulti[c] ? toArray(v) : v;
          });

          m[sKey] = oRec;
          a.push(oRec);
        } else {
          var merged = this._mergeStatus(oRec.__status, stRow);
          if (merged !== oRec.__status) {
            oRec.__status = merged;
            oRec.Stato = merged;
            oRec.__canEdit = this._canEdit(sRole, merged);
            oRec.__canApprove = this._canApprove(sRole, merged);
            oRec.__canReject = this._canReject(sRole, merged);
            oRec.__readOnly = !oRec.__canEdit;
          }
        }
      }.bind(this));

      return a;
    },

_loadSelectedRecordRows: function (fnDone) {
  var oVm = this._ensureVmCache();
  var sKey = this._getDataCacheKey();


  var aAllRows = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || null;
  var aRecords = oVm.getProperty("/cache/recordsByKey/" + sKey) || null;

  var pickGuid = function (o) {
    if (!o) return "";
    return this._toStableString(
      o.guidKey || o.Guid || o.GUID || o.ItmGuid || o.ItemGuid || o.GUID_ITM || o.GUID_ITM2 || ""
    );
  }.bind(this);

  var pickFibra = function (o) {
    if (!o) return "";
    return this._toStableString(o.Fibra || o.FIBRA || o.Fiber || o.FIBER || "");
  }.bind(this);

  var pickCat = function (o) {
    if (!o) return "";
    return String(
      o.CatMateriale || o.CATMATERIALE || o.CAT_MATERIALE || o.CATMAT || o.Cat_Materiale || ""
    ).trim();
  };

  var buildCfgFallbackFromObject = function (oAny) {
    var o = oAny || {};
    var aKeys = Object.keys(o)
      .filter(function (k) {
        if (!k) return false;
        if (k === "__metadata" || k === "AllData") return false;
        if (k.indexOf("__") === 0) return false;
        return true;
      })
      .sort();

    // se ancora vuoto, forza almeno UNA colonna
    if (!aKeys.length) aKeys = ["guidKey"];

    return aKeys.map(function (k) {
      return {
        ui: k,
        label: k,
        domain: "",
        required: false,
        locked: false,
        multiple: Array.isArray(o[k])
      };
    });
  };

  var ensureArray = function (v) { return Array.isArray(v) ? v : []; };

  var after = function (from) {
    var oDetail = this.getView().getModel("detail");

    // --- record index ---
    var iIdx = parseInt(this._sRecordKey, 10);
    if (isNaN(iIdx) || iIdx < 0) iIdx = 0;

    // --- selected record from Screen3 ---
    var data = (oVm.getData && oVm.getData()) || {};
    var oSel = data.selectedScreen3Record || null;

    // --- ensure arrays in cache ---
    aAllRows = ensureArray(aAllRows);
    if (!Array.isArray(aRecords)) {
      aRecords = [];
      oVm.setProperty("/cache/recordsByKey/" + sKey, aRecords);
      this._log("[S4][_loadSelectedRecordRows] aRecords init []", { cacheKey: sKey });
    }

    // --- patch selected record into aRecords if missing ---
   if (oSel) {
  aRecords[iIdx] = oSel;
  oVm.setProperty("/cache/recordsByKey/" + sKey, aRecords);
}

    var oRec = oSel || aRecords[iIdx] || aRecords[0] || null;
    if (!oRec) {
      this._log("[S4][_loadSelectedRecordRows] NO oRec -> EMPTY", { cacheKey: sKey, from: from });
      oDetail.setProperty("/RowsAll", []);
      oDetail.setProperty("/Rows", []);
      oDetail.setProperty("/RowsCount", 0);
      oDetail.setProperty("/_mmct/cat", "");
      oDetail.setProperty("/_mmct/s02", []);
      this._applyUiPermissions();
      if (typeof fnDone === "function") fnDone();
      return;
    }

    var sGuidKey = pickGuid(oRec);
    var sRecFibra = pickFibra(oRec);

    this._log("[S4][_loadSelectedRecordRows] base", {
      from: from,
      cacheKey: sKey,
      recIdx: iIdx,
      guidKey: sGuidKey,
      recFibra: sRecFibra,
      allRowsLen: aAllRows.length,
      hasSel: !!oSel
    });

    var aByGuid = aAllRows.filter(function (r) {
      var g = this._toStableString(this._rowGuidKey(r)) || this._toStableString(r && r.guidKey);
      return this._toStableString(g) === this._toStableString(sGuidKey);
    }.bind(this));

    this._log("[S4][_loadSelectedRecordRows] byGuid", {
      cacheKey: sKey,
      guidKey: sGuidKey,
      byGuidLen: aByGuid.length
    });

    // --- 2) SE NON CI SONO RIGHE -> CREA RIGA SYNTHETIC E SALVA IN CACHE ---
    if (!aByGuid.length) {
      var oSynth = Common.deepClone(oSel || oRec) || {};

      oSynth.guidKey = sGuidKey;
      oSynth.Guid = sGuidKey;
      oSynth.GUID = sGuidKey;

      // fibra
      var sF = sRecFibra || pickFibra(oSel) || "";
      oSynth.Fibra = sF;

      
      if (!oSynth.Stato){}
      if (oSynth.Approved == null) oSynth.Approved = 0;
      if (oSynth.ToApprove == null) oSynth.ToApprove = 1;
      if (oSynth.Rejected == null) oSynth.Rejected = 0;

      oSynth.__synthetic = true;
      oSynth.__localId = oSynth.__localId || ("SYNTH_" + Date.now());

      // salva in cache dataRowsByKey
      aAllRows = aAllRows.slice();
      aAllRows.push(oSynth);
      oVm.setProperty("/cache/dataRowsByKey/" + sKey, aAllRows);

      aByGuid = [oSynth];

      this._log("[S4][_loadSelectedRecordRows] SYNTH ROW CREATED (no rows for guidKey)", {
        cacheKey: sKey,
        guidKey: sGuidKey,
        fibra: sF,
        allRowsLenNow: aAllRows.length,
        synthKeys: Object.keys(oSynth).slice(0, 40)
      });
    }

    // --- 3) fibra: se manca deduci dalla prima riga ---
    var sFibra = sRecFibra;
    if (!sFibra) {
      sFibra = this._toStableString(this._rowFibra(aByGuid[0])) || pickFibra(aByGuid[0]) || "";
      this._log("[S4][_loadSelectedRecordRows] Fibra deduced", { fibra: sFibra });
    }

    // --- 4) filter by fibra (solo se valorizzata) ---

   var aSelected = aByGuid; // <- patch solo per GUID

    // --- ROLE/STATUS ---
    var sRole = String(oVm.getProperty("/userType") || "").trim().toUpperCase();

    var groupStatus = "ST";
    aSelected.forEach(function (r) {
      groupStatus = this._mergeStatus(groupStatus, this._normStatoRow(r));
    }.bind(this));

    var bCanEdit = this._canEdit(sRole, groupStatus);
    aSelected.forEach(function (r) {
      r.Stato = this._normStatoRow(r);
      r.__readOnly = !bCanEdit;
    }.bind(this));

    oDetail.setProperty("/__role", sRole);
    oDetail.setProperty("/__status", groupStatus);
    oDetail.setProperty("/__canEdit", bCanEdit);
    oDetail.setProperty("/__canAddRow", StatusUtil.canAddRow(sRole, groupStatus));
    oDetail.setProperty("/__canApprove", this._canApprove(sRole, groupStatus));
    oDetail.setProperty("/__canReject", this._canReject(sRole, groupStatus));

    // --- CAT + CFG02 ---
// --- CAT + CFG02 (USA SEMPRE LE COLONNE DEL PRIMO RECORD DI SCREEN3) ---
var r0 = aSelected[0] || {};

var sCat = pickCat(r0) || pickCat(oRec) || (oSel ? pickCat(oSel) : "") || "";

if (!sCat) {
  var oFirstRowWithCat = (aAllRows || []).find(function (r) { return !!pickCat(r); });
  if (oFirstRowWithCat) sCat = pickCat(oFirstRowWithCat);

  if (!sCat) {
    var oFirstRecWithCat = (aRecords || []).find(function (r) { return !!pickCat(r); });
    if (oFirstRecWithCat) sCat = pickCat(oFirstRecWithCat);
  }
}

var aCfg02 = sCat ? this._cfgForScreen(sCat, "02") : [];

// ===== HEADER DINAMICA SCREEN4 (Livello 00 + Testata2) =====
var a00All = sCat ? this._cfgForScreen(sCat, "00") : [];
var aHdr4 = (a00All || []).filter(function (f) { return !!(f && f.testata2); });

// salvo in detail
oDetail.setProperty("/_mmct/s00", a00All);
oDetail.setProperty("/_mmct/hdr4", aHdr4);


oDetail.setProperty("/_mmct/rec", oRec || oSel || {});


if (sCat && !aCfg02.length) {
  this._log("[S4][_loadSelectedRecordRows] WARN cfg02 EMPTY even with CatMateriale", {
    cacheKey: sKey, cat: sCat, firstRecCat: (aRecords && aRecords[0]) ? pickCat(aRecords[0]) : ""
  });
}

if (!aCfg02.length) {
  var oBase = (aAllRows || [])[0] || (aRecords || [])[0] || r0 || oRec || {};
  aCfg02 = buildCfgFallbackFromObject(oBase);
  this._log("[S4][_loadSelectedRecordRows] CFG02 FALLBACK (base = first cache row/rec)", {
    cacheKey: sKey, cfg02Len: aCfg02.length
  });
}

// 5) IMPORTANTISSIMO: se ho dedotto sCat, “inietto” CatMateriale nel record/righe new
if (sCat) {
  if (r0 && !pickCat(r0)) r0.CatMateriale = sCat;
  if (oRec && !pickCat(oRec)) oRec.CatMateriale = sCat;
  if (oSel && !pickCat(oSel)) oSel.CatMateriale = sCat;
}

// 6) assicura campi presenti nella riga synthetic per evitare binding strani (multi = array)
(aSelected || []).forEach(function (row) {
  (aCfg02 || []).forEach(function (f) {
    if (!f || !f.ui) return;
    var k = f.ui;
    if (row[k] === undefined || row[k] === null) row[k] = f.multiple ? [] : "";
    if (f.multiple && !Array.isArray(row[k])) row[k] = [];
  });
});


    // se MMCT non c’è -> fallback colonne da chiavi riga/record
    if (!aCfg02.length) {
      
      aCfg02 = buildCfgFallbackFromObject(r0);

      if (aCfg02.length <= 1) {
        var a2 = buildCfgFallbackFromObject(oRec);
        var m = {};
        aCfg02.forEach(function (x) { m[x.ui] = x; });
        a2.forEach(function (x) { if (!m[x.ui]) { m[x.ui] = x; aCfg02.push(x); } });
      }

      this._log("[S4][_loadSelectedRecordRows] CFG02 FALLBACK (no CatMateriale/MMCT)", {
        cacheKey: sKey,
        guidKey: sGuidKey,
        cat: sCat || "(empty)",
        cfg02Len: aCfg02.length,
        keysSample: aCfg02.map(function (x) { return x.ui; }).slice(0, 20)
      });
    } else {
      this._log("[S4][_loadSelectedRecordRows] CFG02 MMCT OK", {
        cacheKey: sKey,
        guidKey: sGuidKey,
        cat: sCat,
        cfg02Len: aCfg02.length
      });
    }

    oDetail.setProperty("/_mmct/cat", sCat);
    oDetail.setProperty("/_mmct/s02", aCfg02);

    // righe
    oDetail.setProperty("/guidKey", sGuidKey);
    oDetail.setProperty("/Fibra", ""); // patch solo GUID
    oDetail.setProperty("/RowsAll", aSelected);
    oDetail.setProperty("/Rows", aSelected);
    oDetail.setProperty("/RowsCount", aSelected.length);

    this._refreshHeader4Fields();

    this._log("[S4][_loadSelectedRecordRows] DONE", {
      cacheKey: sKey,
      from: from,
      guidKey: sGuidKey,
      fibra: sFibra,
      rows: aSelected.length,
      cols: aCfg02.length
    });

    this._applyUiPermissions();
    this._applyFiltersAndSort();

    if (typeof fnDone === "function") fnDone();
  }.bind(this);

  // cache ok -> vai diretto
  if (Array.isArray(aAllRows) && Array.isArray(aRecords) && (aAllRows.length || aRecords.length)) {
    this._log("[S4][_loadSelectedRecordRows] cache PATH", {
      cacheKey: sKey,
      allRowsLen: Array.isArray(aAllRows) ? aAllRows.length : null,
      recsLen: Array.isArray(aRecords) ? aRecords.length : null
    });
    after("cache");
    return;
  }

  // reload backend -> poi after
  this._log("[S4][_loadSelectedRecordRows] reload backend", { cacheKey: sKey });

  this._reloadDataFromBackend(function (aResults) {
    aAllRows = ensureArray(aResults);

    // rebuild record list if possible
    var r0 = aAllRows[0] || {};
    var sCat = String(r0.CatMateriale || "").trim();
    var aCfg01 = sCat ? this._cfgForScreen(sCat, "01") : [];
    aRecords = this._buildRecords01ForCache(aAllRows, aCfg01);

    oVm.setProperty("/cache/dataRowsByKey/" + sKey, aAllRows);
    oVm.setProperty("/cache/recordsByKey/" + sKey, aRecords);

    this._log("[S4][_loadSelectedRecordRows] backend cached", {
      cacheKey: sKey,
      allRowsLen: aAllRows.length,
      recsLen: Array.isArray(aRecords) ? aRecords.length : null
    });

    after("backend");
  }.bind(this));
},
/*     _applyInlineHeaderFilterSort: async function (oMdcTbl) {
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
  (mdcCol.getDataProperty && mdcCol.getDataProperty()) ||
  (mdcCol.getSortProperty && mdcCol.getSortProperty()) ||
  (mdcCol.getFilterProperty && mdcCol.getFilterProperty()) ||
  "";

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
    }, */
        _getInnerTableFromMdc: function (oMdcTbl) {
      return MdcTableUtil.getInnerTableFromMdc(oMdcTbl);
    },
_getDataCacheKey: function () {
  var oVm = this.getOwnerComponent().getModel("vm");
  var mock = (oVm && oVm.getProperty("/mock")) || {};
  var bMock = !!(mock.mockS3 || mock.mockS4); // dataset comune
  return (bMock ? "MOCK|" : "REAL|") + this._getCacheKeySafe();
},



    // =========================
    // MDC cfg + columns + rebind
    // =========================
    _ensureMdcCfgScreen4: function (aCfg02) {
      var oVm = this._ensureVmCache();

      var aProps = (aCfg02 || []).map(function (f) {
        return {
          name: f.ui,
          label: f.label || f.ui,
          dataType: "String",
          domain: f.domain || "",
          required: !!f.required
        };
      });

      oVm.setProperty("/mdcCfg/screen4", {
        modelName: "detail",
        collectionPath: "/Rows",
        properties: aProps
      });

      this._log("vm>/mdcCfg/screen4 set", { props: aProps.length });
    },

    _rebuildColumnsHard: async function (oTbl, aCfg02) {
      if (!oTbl) return;
      if (oTbl.initialized) await oTbl.initialized();

      var aOld = (oTbl.getColumns && oTbl.getColumns()) || [];
      aOld.slice().forEach(function (c) {
        oTbl.removeColumn(c);
        c.destroy();
      });

      (aCfg02 || []).forEach(function (f) {
        var sKey = String(f.ui || "").trim();
        if (!sKey) return;

        var sHeader = (f.label || sKey) + (f.required ? " *" : "");

        var mProps = MdcColumn.getMetadata().getAllProperties(); // utile se vuoi compatibilità versioni

var oSettings = {
  header: sHeader,
  visible: true,
  dataProperty: sKey,
  sortProperty: sKey,
  filterProperty: sKey,
  template: this._createCellTemplate(sKey, f)
};

// SOLO se esiste nella tua versione (nel tuo caso: NON esiste, quindi non verrà settata)
if (mProps.propertyKey) oSettings.propertyKey = sKey;

oTbl.addColumn(new MdcColumn(oSettings));


      }.bind(this));

      this._log("HARD rebuild columns done", (oTbl.getColumns && oTbl.getColumns().length) || 0);
    },

    _forceP13nAllVisible: function (oTbl, reason) {
    return P13nUtil.forceP13nAllVisible(oTbl, StateUtil, this._log.bind(this), reason);
    },


    _bindRowsAndColumns: async function () {
      var oDetail = this.getView().getModel("detail");
      var oTbl = this.byId("mdcTable4");
      if (!oTbl) return;

      var aCfg02 = oDetail.getProperty("/_mmct/s02") || [];
      this._ensureMdcCfgScreen4(aCfg02);

      await this._rebuildColumnsHard(oTbl, aCfg02);

      if (oTbl.initialized) await oTbl.initialized();
      oTbl.setModel(oDetail, "detail");

      this._snapshotRows = Common.deepClone(oDetail.getProperty("/RowsAll") || []);

      if (typeof oTbl.rebind === "function") oTbl.rebind();

      await this._forceP13nAllVisible(oTbl, "t0");
      setTimeout(function () { this._forceP13nAllVisible(oTbl, "t300"); }.bind(this), 300);

      var oMdc = this.byId("mdcTable4");
var that = this;

if (oMdc && typeof oMdc.initialized === "function") {
  oMdc.initialized().then(function () {
    that._injectHeaderFilters("bind");
  });
} else {
  that._injectHeaderFilters("bind");
}


      this._applyUiPermissions();
      this._logTable("TABLE STATE @ after _bindRowsAndColumns");
    },

    _applyUiPermissions: function () {
      try {
        var oDetail = this.getView().getModel("detail");
        if (!oDetail) return;

        var bAdd = !!oDetail.getProperty("/__canAddRow");
        var bEdit = !!oDetail.getProperty("/__canEdit");

        var oAdd = this.byId("btnAddRow");
        var oDel = this.byId("btnDeleteRows");

        if (oAdd && oAdd.setEnabled) oAdd.setEnabled(bAdd);
        if (oDel && oDel.setEnabled) oDel.setEnabled(bEdit);
      } catch (e) {  }
    },

    // =========================
    // FILTER + SORT (global + column)
    // =========================
    _valToText: Common.valToText,

    _applyFiltersAndSort: function () {
      var oDetail = this.getView().getModel("detail");
      if (!oDetail) return;

      var aAll = oDetail.getProperty("/RowsAll") || [];
      var a = Array.isArray(aAll) ? aAll.slice() : [];

      // GLOBAL
      var q = String(this._globalQuery || "").trim().toUpperCase();
      if (q) {
        a = a.filter(function (r) {
          return Object.keys(r || {}).some(function (k) {
            if (k === "__metadata" || k === "AllData") return false;
            var v = r[k];
            if (v === null || v === undefined) return false;
            return this._valToText(v).toUpperCase().indexOf(q) >= 0;
          }.bind(this));
        }.bind(this));
      }

      // COLUMN FILTERS
      var m = this._colFilters || {};
      var keys = Object.keys(m);
      if (keys.length) {
        a = a.filter(function (r) {
          return keys.every(function (k) {
            var f = m[k];
            if (!f) return true;

            var rv = r ? r[k] : undefined;

            if (f.type === "text") {
              var sNeed = String(f.value || "").trim().toUpperCase();
              if (!sNeed) return true;
              return this._valToText(rv).toUpperCase().indexOf(sNeed) >= 0;
            }

            if (f.type === "key") {
              var sKey = String(f.value || "").trim();
              if (!sKey) return true;
              if (Array.isArray(rv)) return rv.indexOf(sKey) >= 0;
              return String(rv || "").trim() === sKey;
            }

            if (f.type === "keys") {
              var aNeed = Array.isArray(f.value) ? f.value : [];
              if (!aNeed.length) return true;

              if (Array.isArray(rv)) {
                return aNeed.some(function (x) { return rv.indexOf(x) >= 0; });
              }
              var s = String(rv || "").trim();
              return aNeed.indexOf(s) >= 0;
            }

            return true;
          }.bind(this));
        }.bind(this));
      }

      // SORT
if (this._sortState && this._sortState.key) {
  var key = this._sortState.key;
  var desc = !!this._sortState.desc;

  a.sort(function (x, y) {
    var vx = (x && x[key] != null) ? x[key] : "";
    var vy = (y && y[key] != null) ? y[key] : "";
    if (Array.isArray(vx)) vx = vx.join(", ");
    if (Array.isArray(vy)) vy = vy.join(", ");
    vx = String(vx);
    vy = String(vy);

    var cmp = vx.localeCompare(vy, undefined, { numeric: true, sensitivity: "base" });
    return desc ? -cmp : cmp;
  });
}

      oDetail.setProperty("/Rows", a);
      oDetail.setProperty("/RowsCount", a.length);
    },

    onGlobalFilter: function (oEvt) {
      this._globalQuery = String(oEvt.getParameter("value") || "");
      this._applyFiltersAndSort();
    },

    // =========================
    // HEADER FILTERS (dentro intestazione colonna)
    // =========================

    _getInnerTable: function (bDebug) {
    return MdcTableUtil.getInnerTableFromMdc(this.byId("mdcTable4"));
    },
    _setInnerHeaderHeight: function (oInnerOrMdc, bShow) {
    MdcTableUtil.setInnerHeaderHeight(oInnerOrMdc, bShow);
    },
    _getCfg02Map: function () {
      var oDetail = this.getView().getModel("detail");
      var aCfg02 = (oDetail && oDetail.getProperty("/_mmct/s02")) || [];
      var m = {};
      (aCfg02 || []).forEach(function (f) {
        if (f && f.ui) m[String(f.ui).trim()] = f;
      });
      return m;
    },

    _normKeyFromInnerCol: function (oInnerCol) {
      var k = "";
      try {
        if (oInnerCol && typeof oInnerCol.getFilterProperty === "function") k = oInnerCol.getFilterProperty() || "";
        if (!k && oInnerCol && typeof oInnerCol.getSortProperty === "function") k = oInnerCol.getSortProperty() || "";
      } catch (e) {  }

      k = String(k || "").trim();
      if (k.indexOf(">") >= 0) k = k.split(">").pop();
      return String(k || "").trim();
    },

    _createHeaderFilterCtrl: function (sKey, fMeta) {
      var sDomain = String((fMeta && fMeta.domain) || "").trim();
      var bHasDomain = !!sDomain && this._domainHasValues(sDomain);
      var bMultiple = !!(fMeta && fMeta.multiple);

      var oCtrl;
      var sVisibleBind = "{ui>/showHeaderFilters}";

      if (bHasDomain) {
        if (bMultiple) {
          oCtrl = new MultiComboBox({
            width: "100%",
            visible: sVisibleBind,
            allowCustomValues: false,
            placeholder: "filtra..."
          });
          oCtrl.bindAggregation("items", {
            path: "vm>/domainsByName/" + sDomain,
            template: new Item({ key: "{vm>key}", text: "{vm>text}" })
          });

          oCtrl.attachSelectionFinish(function () {
            var a = oCtrl.getSelectedKeys ? oCtrl.getSelectedKeys() : [];
            this._dbg("HDR selectionFinish", { key: sKey, selected: a });
            if (Array.isArray(a) && a.length) this._colFilters[sKey] = { type: "keys", value: a.slice() };
            else delete this._colFilters[sKey];
            this._applyFiltersAndSort();
          }.bind(this));
        } else {
          oCtrl = new ComboBox({
            width: "100%",
            visible: sVisibleBind,
            allowCustomValues: false,
            placeholder: "filtra..."
          });
          oCtrl.bindAggregation("items", {
            path: "vm>/domainsByName/" + sDomain,
            template: new Item({ key: "{vm>key}", text: "{vm>text}" })
          });

          oCtrl.attachChange(function () {
            var sk = String(oCtrl.getSelectedKey() || "").trim();
            this._dbg("HDR change", { key: sKey, selectedKey: sk });
            if (sk) this._colFilters[sKey] = { type: "key", value: sk };
            else delete this._colFilters[sKey];
            this._applyFiltersAndSort();
          }.bind(this));
        }
      } else {
        oCtrl = new Input({
          width: "100%",
          visible: sVisibleBind,
          placeholder: "contiene..."
        });

        oCtrl.attachLiveChange(function (evt) {
          var v = String(evt.getParameter("value") || "").trim();
          this._dbg("HDR liveChange", { key: sKey, value: v });
          if (v) this._colFilters[sKey] = { type: "text", value: v };
          else delete this._colFilters[sKey];
          this._applyFiltersAndSort();
        }.bind(this));
      }

      // comodo per sync/reset
      try { oCtrl.data("hdrFilterKey", sKey); } catch (e) {  }
      return oCtrl;
    },
    _ensureHeaderBoxForKey: function (sKey, fMeta) {
  if (!this._hdrFilter) this._hdrFilter = { boxesByKey: {}, seenLast: {} };

  var p = this._hdrFilter.boxesByKey[sKey];
  var sHeader = (fMeta && (fMeta.label || fMeta.ui)) ? String(fMeta.label || fMeta.ui) : String(sKey);
  if (fMeta && fMeta.required) sHeader += " *";

  if (!p || !p.box || p.box.bIsDestroyed) {
    var oLbl = new Text({ text: sHeader, wrapping: true });

    // --- SORT BUTTON (nuovo) ---
    var oSortBtn = this._hdrSortBtns[sKey];
    if (oSortBtn && (oSortBtn.bIsDestroyed || (oSortBtn.isDestroyed && oSortBtn.isDestroyed()))) {
  delete this._hdrSortBtns[sKey];
  oSortBtn = null;
}
    if (!oSortBtn) {
      oSortBtn = new sap.m.Button({
        type: "Transparent",
        icon: "sap-icon://sort",
        visible: "{ui>/showHeaderSort}",
        press: this._onHeaderSortPress.bind(this)
      });
      oSortBtn.data("field", sKey);
      this._hdrSortBtns[sKey] = oSortBtn;
    } else {
      // rebind visibility se serve
      if (oSortBtn.bindProperty) oSortBtn.bindProperty("visible", "ui>/showHeaderSort");
    }

    var oTop = new sap.m.HBox({
      justifyContent: "SpaceBetween",
      alignItems: "Center",
      items: [oLbl, oSortBtn]
    });

    var oCtrl = this._createHeaderFilterCtrl(sKey, fMeta); // già esistente

    var oBox = new VBox({
      width: "100%",
      renderType: "Bare",
      items: [oTop, oCtrl]
    });

    this._hdrFilter.boxesByKey[sKey] = { box: oBox, lbl: oLbl, ctrl: oCtrl, sortBtn: oSortBtn };
  } else {
    p.lbl.setText(sHeader);
  }

  return this._hdrFilter.boxesByKey[sKey];
},
_resetHeaderCaches: function () {
  try {
    // distruggi ciò che c’è in cache (se ancora vivo)
    if (this._hdrFilter && this._hdrFilter.boxesByKey) {
      Object.keys(this._hdrFilter.boxesByKey).forEach(function (k) {
        var p = this._hdrFilter.boxesByKey[k];
        try { if (p && p.box && !p.box.bIsDestroyed) p.box.destroy(); } catch (e) {}
      }.bind(this));
    }
  } catch (e) {}

  this._hdrFilter = { boxesByKey: {}, seenLast: {} };
  this._hdrSortBtns = {};

  // se non vuoi usare l’altro sistema "inlineFS", azzera anche quello
  this._inlineFS = null;
},
_onHeaderSortPress: function (oEvt) {
  var oBtn = oEvt.getSource();
  var sField = oBtn && oBtn.data && oBtn.data("field");
  if (!sField) return;

  if (this._sortState && this._sortState.key === sField) {
    this._sortState.desc = !this._sortState.desc;
  } else {
    this._sortState = { key: sField, desc: false };
  }

  this._refreshHeaderSortIcons();
  this._applyFiltersAndSort();
},_refreshHeaderSortIcons: function () {
  var st = this._sortState || { key: "", desc: false };
  var m = this._hdrSortBtns || {};
  Object.keys(m).forEach(function (k) {
    var b = m[k];
    if (!b || !b.setIcon) return;

    if (!st.key || st.key !== k) {
      b.setIcon("sap-icon://sort");
    } else {
      b.setIcon(st.desc ? "sap-icon://sort-descending" : "sap-icon://sort-ascending");
    }
  });
},

    _syncHeaderFilterCtrlsFromState: function (bClear) {
      var m = bClear ? {} : (this._colFilters || {});
      var boxes = (this._hdrFilter && this._hdrFilter.boxesByKey) || {};

      Object.keys(boxes).forEach(function (k) {
        var p = boxes[k];
        if (!p || !p.ctrl) return;

        var st = m[k];

        if (p.ctrl instanceof Input) {
          p.ctrl.setValue(st && st.type === "text" ? String(st.value || "") : "");
          return;
        }

        if (p.ctrl instanceof ComboBox) {
          p.ctrl.setSelectedKey(st && st.type === "key" ? String(st.value || "") : "");
          return;
        }

        if (p.ctrl instanceof MultiComboBox) {
          p.ctrl.setSelectedKeys(st && st.type === "keys" && Array.isArray(st.value) ? st.value : []);
          return;
        }
      });
    },

    _injectHeaderFilters: function (reason) {
      var oMdc = this.byId("mdcTable4");
      if (!oMdc) {
        this._dbg("_injectHeaderFilters: mdcTable4 missing", { reason: reason });
        return;
      }

      this._dbg("_injectHeaderFilters START", { reason: reason });

      var tryDo = function (attempt) {
        var oInner = this._getInnerTable(true);
        

        if (!oInner || typeof oInner.getColumns !== "function") {
          this._dbg("inject attempt FAIL: inner table missing or no getColumns()", {
            reason: reason,
            attempt: attempt,
            hasInner: !!oInner,
            hasGetColumns: oInner && typeof oInner.getColumns
          });
          return false;
        }

        var aInnerCols = oInner.getColumns() || [];
        if (!aInnerCols.length) {
          this._dbg("inject attempt FAIL: inner columns EMPTY", {
            reason: reason,
            attempt: attempt,
            meta: oInner.getMetadata && oInner.getMetadata().getName()
          });
          return false;
        }

        var mCfg = this._getCfg02Map();
        var seen = {};
        var okKeys = 0;

var aMdcCols = (oMdc.getColumns && oMdc.getColumns()) || [];
var bCanUseIndexMap = Array.isArray(aMdcCols) && aMdcCols.length === aInnerCols.length;

aInnerCols.forEach(function (c, i) {
  if (!c) return;

  var sKey = this._normKeyFromInnerCol(c);

  if (!sKey && bCanUseIndexMap && aMdcCols[i]) {
    var mdcCol = aMdcCols[i];
    sKey =
      (mdcCol.getDataProperty && mdcCol.getDataProperty()) ||
      (mdcCol.getPropertyKey && mdcCol.getPropertyKey()) ||
      "";
    sKey = String(sKey || "").trim();
  }

  if (!sKey) {
    this._dbg("inject WARN: cannot resolve column key", { idx: i });
    return;
  }

  okKeys++;
  seen[sKey] = true;

  var fMeta = mCfg[sKey] || { ui: sKey, label: sKey, domain: "", required: false, multiple: false };
  var pack = this._ensureHeaderBoxForKey(sKey, fMeta);

  try {
    if (typeof c.setLabel === "function") c.setLabel(pack.box);
    else if (typeof c.setHeader === "function") c.setHeader(pack.box);
    else this._dbg("inject WARN: inner column has no setLabel/setHeader", { key: sKey });
  } catch (e) {
    this._dbg("inject ERROR setLabel/setHeader", { key: sKey, msg: e && e.message });
  }
  this._refreshHeaderSortIcons();

}.bind(this));

if (!okKeys) {
  this._dbg("inject attempt FAIL: 0 keys resolved", { reason: reason, attempt: attempt });
  return false;
}


        var boxes = (this._hdrFilter && this._hdrFilter.boxesByKey) || {};
        Object.keys(boxes).forEach(function (k) {
          if (!seen[k]) {
            try { if (boxes[k] && boxes[k].box) boxes[k].box.destroy(); } catch (e) {  }
            delete boxes[k];
          }
        });

        var oUi = this.getView().getModel("ui");
        var bShow = !!(oUi && oUi.getProperty("/showHeaderFilters"));
        this._setInnerHeaderHeight(oInner, bShow);

        this._syncHeaderFilterCtrlsFromState(false);

        this._dbg("inject SUCCESS", {
          reason: reason,
          attempt: attempt || 0,
          innerCols: aInnerCols.length,
          okKeys: okKeys,
          cfgKeys: Object.keys(mCfg).length,
          show: bShow
        });

        this._log("[S4] Header filters injected", { reason: reason, cols: aInnerCols.length, attempt: attempt || 0 });
        return true;
      }.bind(this);

      var doLater = function (attempt) {
        var ok = tryDo(attempt);
        if (!ok && attempt < 6) {
          setTimeout(function () { doLater(attempt + 1); }, 150);
        } else if (!ok) {
          this._dbg("_injectHeaderFilters GAVE UP", { reason: reason, attempt: attempt });
        }
      }.bind(this);

      if (oMdc.initialized) {
        oMdc.initialized().then(function () { doLater(0); });
      } else {
        doLater(0);
      }
    },

    onOpenColumnFilters: function () {
      this._dbg("CLICK onOpenColumnFilters()");
      var oUi = this.getView().getModel("ui");
      var bNow = !!(oUi && oUi.getProperty("/showHeaderFilters"));
      var bNew = !bNow;

      this._dbg("toggle showHeaderFilters", { bNow: bNow, bNew: bNew });
      this._getInnerTable(true);

      if (oUi) oUi.setProperty("/showHeaderFilters", bNew);

      
      var oMdc = this.byId("mdcTable4");
var that = this;

if (oMdc && typeof oMdc.initialized === "function") {
  oMdc.initialized().then(function () {
    that._injectHeaderFilters("toggle");
  });
} else {
  that._injectHeaderFilters("toggle");
}

      this._setInnerHeaderHeight(this._getInnerTable(), bNew);

      MessageToast.show(bNew ? "Filtri colonna mostrati" : "Filtri colonna nascosti");
    },


    _syncSortDialogFromState: function (bClear) {
      var s = bClear ? null : this._sortState;
      var c = this._sortCtrls || {};
      if (!c.field || !c.dir) return;

      if (!s) {
        c.field.setSelectedKey("");
        c.dir.setSelectedKey("ASC");
        return;
      }

      c.field.setSelectedKey(String(s.key || ""));
      c.dir.setSelectedKey(s.desc ? "DESC" : "ASC");
    },

    _readSortDialogToState: function () {
      var c = this._sortCtrls || {};
      if (!c.field || !c.dir) { this._sortState = null; return; }

      var k = String(c.field.getSelectedKey() || "").trim();
      var d = String(c.dir.getSelectedKey() || "ASC").trim().toUpperCase();
      if (!k) { this._sortState = null; return; }

      this._sortState = { key: k, desc: (d === "DESC") };
    },

    // =========================
    // Reset filters/sort
    // =========================
    onResetFiltersAndSort: function () {
      this._globalQuery = "";
      this._colFilters = {};
      this._sortState = null;
      this._refreshHeaderSortIcons();


      var oInp = this.byId("inputFilter4");
      if (oInp && oInp.setValue) oInp.setValue("");

      this._syncHeaderFilterCtrlsFromState(true);
      this._syncSortDialogFromState(true);

      this._applyFiltersAndSort();

      // best effort: forza tutte colonne visibili
      var oTbl = this.byId("mdcTable4");
      if (oTbl) {
        this._forceP13nAllVisible(oTbl, "reset");
      }

      MessageToast.show("Filtri/ordinamento resettati");
    },

    // =========================
    // DELETE ROWS
    // =========================
    _getSelectedRowObjects: function () {
      var oTbl = this.byId("mdcTable4");
      if (!oTbl) return [];

      var aCtx = [];
      try {
        if (typeof oTbl.getSelectedContexts === "function") {
          aCtx = oTbl.getSelectedContexts() || [];
        }
      } catch (e1) {  }

      if ((!aCtx || !aCtx.length) && typeof oTbl.getTable === "function") {
        try {
          var t = oTbl.getTable();
          if (t && typeof t.getSelectedIndices === "function" && typeof t.getContextByIndex === "function") {
            var idx = t.getSelectedIndices() || [];
            aCtx = idx.map(function (i) { return t.getContextByIndex(i); }).filter(Boolean);
          } else if (t && typeof t.getSelectedItems === "function") {
            var it = t.getSelectedItems() || [];
            aCtx = it.map(function (x) {
              return (x.getBindingContext && (x.getBindingContext("detail") || x.getBindingContext())) || null;
            }).filter(Boolean);
          }
        } catch (e2) {  }
      }

      return (aCtx || []).map(function (c) { return c && c.getObject ? c.getObject() : null; }).filter(Boolean);
    },

    onDeleteRows: function () {
      try {
        var oDetail = this.getView().getModel("detail");
        if (!oDetail) return;

        if (!oDetail.getProperty("/__canEdit")) {
          MessageToast.show("Non hai permessi per eliminare righe su questo record");
          return;
        }

        var aSel = this._getSelectedRowObjects();
        if (!aSel.length) {
          MessageToast.show("Seleziona almeno una riga");
          return;
        }

        var aAll = oDetail.getProperty("/RowsAll") || [];
        if (!Array.isArray(aAll) || !aAll.length) return;

        var mSel = {};
        aSel.forEach(function (r) {
          var id = (r && r.__localId) ? String(r.__localId) : null;
          if (id) mSel["ID:" + id] = true;
        });

        function isSelected(r) {
          if (!r) return false;
          if (r.__localId && mSel["ID:" + String(r.__localId)]) return true;
          return aSel.indexOf(r) >= 0;
        }

        var aRemain = aAll.filter(function (r) { return !isSelected(r); });

        if (!aRemain.length) {
          MessageToast.show("Non puoi eliminare tutte le righe");
          return;
        }

        var sRole = String(oDetail.getProperty("/__role") || "").trim().toUpperCase();
        var sStatus = String(oDetail.getProperty("/__status") || "").trim().toUpperCase();
        if (sRole === "E" && sStatus !== "AP") {
          oDetail.setProperty("/__canEdit", true);
          oDetail.setProperty("/__canAddRow", true);
          oDetail.setProperty("/__canApprove", false);
          oDetail.setProperty("/__canReject", false);
        }

        oDetail.setProperty("/RowsAll", aRemain);
        oDetail.setProperty("/__dirty", true);

        var oVm = this._ensureVmCache();
        var sKey = this._getDataCacheKey();

        var sGuidKeySel = this._toStableString(oDetail.getProperty("/guidKey"));
        var sFibraSel = this._toStableString(oDetail.getProperty("/Fibra"));

        var aCacheAll = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || [];
        if (!Array.isArray(aCacheAll)) aCacheAll = [];

                aCacheAll = aCacheAll.filter(function (r) {
  return this._rowGuidKey(r) !== sGuidKeySel;
}.bind(this));

        aCacheAll = aCacheAll.concat(aRemain);
        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aCacheAll);

        this._applyUiPermissions();
        this._applyFiltersAndSort();

        var oTbl = this.byId("mdcTable4");
        if (oTbl && typeof oTbl.rebind === "function") oTbl.rebind();

        MessageToast.show("Righe eliminate");
      } catch (e) {
        console.error("[S4] onDeleteRows ERROR", e);
        MessageToast.show("Errore eliminazione righe");
      }
    },

    // =========================
    // PRINT
    // =========================
    onPrint: function () {
      try {
        var oDetail = this.getView().getModel("detail");
        var aRows = (oDetail && oDetail.getProperty("/Rows")) || [];
        var aCfg02 = (oDetail && oDetail.getProperty("/_mmct/s02")) || [];

        if (!Array.isArray(aRows) || !aRows.length) {
          MessageToast.show("Nessun dato da stampare");
          return;
        }

        var cols = (aCfg02 || []).map(function (f) { return { key: String(f.ui), label: String(f.label || f.ui) }; });
        if (!cols.length) cols = Object.keys(aRows[0] || {}).map(function (k) { return { key: k, label: k }; });

        var html = [];
        html.push("<html><head><meta charset='utf-8'>");
        html.push("<title>Stampa - Tracciabilità</title>");
        html.push("<style>body{font-family:Arial,sans-serif;font-size:12px} table{border-collapse:collapse;width:100%} th,td{border:1px solid #999;padding:6px;vertical-align:top} th{background:#eee}</style>");
        html.push("</head><body>");
        html.push("<h3>Tracciabilità</h3>");
        html.push("<table><thead><tr>");
        cols.forEach(function (c) { html.push("<th>" + (c.label || c.key) + "</th>"); });
        html.push("</tr></thead><tbody>");

        aRows.forEach(function (r) {
          html.push("<tr>");
          cols.forEach(function (c) {
            var v = r ? r[c.key] : "";
            if (Array.isArray(v)) v = v.join(", ");
            html.push("<td>" + String(v === undefined || v === null ? "" : v) + "</td>");
          });
          html.push("</tr>");
        });

        html.push("</tbody></table>");
        html.push("</body></html>");

        var w = window.open("", "_blank");
        if (!w) { MessageToast.show("Popup bloccato dal browser"); return; }
        w.document.open();
        w.document.write(html.join(""));
        w.document.close();
        w.focus();
        w.print();
      } catch (e) {
        console.error("[S4] onPrint ERROR", e);
        MessageToast.show("Errore stampa");
      }
    },

    // =========================
    // EXCEL
    // =========================
    onExportExcel: function () {
      var oDetail = this.getView().getModel("detail");
      var aRows = (oDetail && oDetail.getProperty("/Rows")) || [];
      var aCfg02 = (oDetail && oDetail.getProperty("/_mmct/s02")) || [];

      if (!Array.isArray(aRows) || !aRows.length) {
        MessageToast.show("Nessun dato da esportare");
        return;
      }

      var sVendor = String((oDetail && oDetail.getProperty("/VendorId")) || "");
      var sMat = String((oDetail && oDetail.getProperty("/Material")) || "");
      var sFile = "Tracciabilita_" + sVendor + "_" + sMat + ".xlsx";

      sap.ui.require(["sap/ui/export/Spreadsheet"], function (Spreadsheet) {
        try {
          var aCols = (aCfg02 || []).map(function (f) {
            return { label: String(f.label || f.ui), property: String(f.ui), type: "string" };
          });

          if (!aCols.length) {
            aCols = Object.keys(aRows[0] || {}).map(function (k) {
              return { label: k, property: k, type: "string" };
            });
          }

          var oSheet = new Spreadsheet({
            workbook: { columns: aCols },
            dataSource: aRows,
            fileName: sFile
          });

          oSheet.build().finally(function () { oSheet.destroy(); });
        } catch (e) {
          console.error("[S4] Excel export ERROR", e);
          MessageToast.show("Errore export Excel");
        }
      }, function () {
        MessageToast.show("Libreria export non disponibile");
      });
    },

    // =========================
    // SAVE LOCAL
    // =========================
    onSaveLocal: function () {
      try {
        var oDetail = this.getView().getModel("detail");
        if (!oDetail) return;

        if (!oDetail.getProperty("/__dirty")) {
          MessageToast.show("Nessuna modifica da salvare");
          return;
        }

        var aRowsAll = oDetail.getProperty("/RowsAll") || [];
        if (!Array.isArray(aRowsAll)) aRowsAll = [];

        var oVm = this._ensureVmCache();
        var sKey = this._getDataCacheKey();


        var sGuidKeySel = this._toStableString(oDetail.getProperty("/guidKey"));
        var sFibraSel = this._toStableString(oDetail.getProperty("/Fibra"));

        var aCacheAll = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || [];
        if (!Array.isArray(aCacheAll)) aCacheAll = [];

        aCacheAll = aCacheAll.filter(function (r) {
  return this._rowGuidKey(r) !== sGuidKeySel;
}.bind(this));

        aCacheAll = aCacheAll.concat(aRowsAll);
        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aCacheAll);

        var sRole = String(oDetail.getProperty("/__role") || "").trim().toUpperCase();
        var sStatus = String(oDetail.getProperty("/__status") || "ST").trim().toUpperCase();
        this._updateVmRecordStatus(sKey, sGuidKeySel, sFibraSel, sRole, sStatus);

        this._snapshotRows = Common.deepClone(aRowsAll);
        oDetail.setProperty("/__dirty", false);

        this._applyUiPermissions();
        MessageToast.show("Salvato (locale/cache)");
      } catch (e) {
        console.error("[S4] onSaveLocal ERROR", e);
        MessageToast.show("Errore salvataggio");
      }
    },

    // =========================
    // ADD ROW
    // =========================
    onAddRow: function () {
      try {
        var oDetail = this.getView().getModel("detail");
        if (!oDetail) return;

        var bCanAdd = !!oDetail.getProperty("/__canAddRow");
        if (!bCanAdd) {
          MessageToast.show("Non hai permessi per aggiungere righe su questo record");
          return;
        }

        var aRowsAll = oDetail.getProperty("/RowsAll") || [];
        var aRows = oDetail.getProperty("/Rows") || [];

        if (!Array.isArray(aRowsAll) || aRowsAll.length === 0) {
          MessageToast.show("Nessuna riga di base da copiare");
          return;
        }

        var aCfg02 = oDetail.getProperty("/_mmct/s02") || [];
        var oBase = aRowsAll[0];

        var oNew = Common.deepClone(oBase) || {};
        delete oNew.__metadata;
        oNew.__readOnly = false;
        oNew.Approved = 0;
        oNew.Rejected = 0;
        oNew.ToApprove = 1;

        oNew.__localId = "NEW_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
        oNew.__isNew = true; // bypass "blocco campi=B" solo per righe nuove


        (aCfg02 || []).forEach(function (f) {
          if (!f || !f.ui || !f.multiple) return;
          var k = String(f.ui).trim();
          if (!k) return;

          if (Array.isArray(oNew[k])) {
            oNew[k] = oNew[k].slice();
          } else {
            var s = String(oNew[k] || "").trim();
            oNew[k] = s ? s.split(/[;,|]+/).map(function (x) { return x.trim(); }).filter(Boolean) : [];
          }
        });

        var aRowsAll2 = aRowsAll.slice();
        var aRows2 = Array.isArray(aRows) ? aRows.slice() : [];

        aRowsAll2.push(oNew);
        aRows2.push(oNew);

        oDetail.setProperty("/RowsAll", aRowsAll2);
        oDetail.setProperty("/__canEdit", true);
        oDetail.setProperty("/__canAddRow", true);
        oDetail.setProperty("/__canApprove", false);
        oDetail.setProperty("/__canReject", false);
        oDetail.setProperty("/__dirty", true);

        var oVm = this._ensureVmCache();
        var sKey = this._getDataCacheKey();


        var aCacheAll = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || [];
        if (!Array.isArray(aCacheAll)) aCacheAll = [];

        var sGuidKeySel = this._toStableString(oDetail.getProperty("/guidKey"));
        var sFibraSel = this._toStableString(oDetail.getProperty("/Fibra"));

        aCacheAll.forEach(function (r) {
          if (this._rowGuidKey(r) === sGuidKeySel && this._rowFibra(r) === sFibraSel) {
            r.Approved = 0;
            r.Rejected = 0;
            r.ToApprove = 1;
          }
        }.bind(this));

        aCacheAll = aCacheAll.slice();
        aCacheAll.push(oNew);

        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aCacheAll);

        var sRole = String(oDetail.getProperty("/__role") || "").trim().toUpperCase();

        this._applyUiPermissions();
        this._applyFiltersAndSort();

        var oTbl = this.byId("mdcTable4");
        if (oTbl && typeof oTbl.rebind === "function") oTbl.rebind();

        this._log("onAddRow OK", {
          cacheKey: sKey,
          rowsAll: aRowsAll2.length,
          guidKey: oDetail.getProperty("/guidKey"),
          fibra: oDetail.getProperty("/Fibra"),
          status: oDetail.getProperty("/__status")
        });

        MessageToast.show("Riga aggiunta");

      } catch (e) {
        console.error("[S4] onAddRow ERROR", e);
        MessageToast.show("Errore aggiunta riga");
      }
    },
    _refreshHeader4Fields: function () {
  var oDetail = this.getView().getModel("detail");
  var aHdr = oDetail.getProperty("/_mmct/hdr4") || [];

  // sorgente valori: record selezionato (Screen3) + fallback prima riga dettaglio
  var oRec = oDetail.getProperty("/_mmct/rec") || {};
  var r0 = (oDetail.getProperty("/RowsAll") || [])[0] || {};

  function getVal(k){
    if (oRec && oRec[k] != null && oRec[k] !== "") return oRec[k];
    if (r0 && r0[k] != null && r0[k] !== "") return r0[k];
    return "";
  }

  var a = (aHdr || [])
    .slice()
    .sort(function (a, b) { return (a.order ?? 9999) - (b.order ?? 9999); })
    .map(function (f) {
      var k = String(f.ui || "").trim();
      return {
        key: k,
        label: f.label || k,
        value: this._valToText(getVal(k))
      };
    }.bind(this));

  a = a.filter(function(x){ return String(x.key).toUpperCase() !== "FORNITORE"; });

  oDetail.setProperty("/Header4Fields", a);
  this._log("_refreshHeader4Fields", { hdr4: aHdr.length, out: a.length });
},

    onNavBack: function () {
      var oHistory = History.getInstance();
      var sPreviousHash = oHistory.getPreviousHash();

      if (sPreviousHash !== undefined) window.history.go(-1);
      else {
        this.getOwnerComponent().getRouter().navTo("Screen3", {
          vendorId: encodeURIComponent(this._sVendorId),
          material: encodeURIComponent(this._sMaterial),
          mode: this._sMode || "A"
        }, true);
      }
    }

  });
});
 

