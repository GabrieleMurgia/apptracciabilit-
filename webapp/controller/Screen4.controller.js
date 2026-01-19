/* sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/routing/History",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/core/BusyIndicator",
  "sap/m/MessageToast",
  "sap/ui/mdc/table/Column",
  "sap/m/HBox",
  "sap/m/Text",
  "sap/m/Input",
  "sap/m/ComboBox",
  "sap/m/MultiComboBox",
  "sap/ui/core/Item",
  "sap/ui/mdc/p13n/StateUtil",
  "apptracciabilita/apptracciabilita/util/mockData"
], function (
  Controller,
  History,
  JSONModel,
  Filter,
  FilterOperator,
  BusyIndicator,
  MessageToast,
  MdcColumn,
  HBox,
  Text,
  Input,
  ComboBox,
  MultiComboBox,
  Item,
  StateUtil,
  MockData
) {
  "use strict";

  function ts() { return new Date().toISOString(); }
  function deepClone(x) { try { return JSON.parse(JSON.stringify(x)); } catch (e) { return x; } }

  return Controller.extend("apptracciabilita.apptracciabilita.controller.Screen4", {

    onInit: function () {
      this._log("onInit");

      var oRouter = this.getOwnerComponent().getRouter();
      oRouter.getRoute("Screen4").attachPatternMatched(this._onRouteMatched, this);

      var oDetail = new JSONModel({
        VendorId: "",
        Material: "",
        recordKey: "0",
        guidKey: "",
        Fibra: "",
        RowsAll: [],
        Rows: [],
        RowsCount: 0,
        _mmct: { cat: "", s02: [] },

        __dirty: false,
        __role: "",
        __status: "",
        __canEdit: false,
        __canAddRow: false,
        __canApprove: false,
        __canReject: false
      });

      this.getView().setModel(oDetail, "detail");
      this._snapshotRows = null;
    },

    // =========================
    // LOG
    // =========================
    _log: function () {
      var a = Array.prototype.slice.call(arguments);
      a.unshift("[S4] " + ts());
      console.log.apply(console, a);
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

    // =========================
    // Approved flag -> readOnly
    // =========================
    _toStableString: function (v) {
      if (v === null || v === undefined) return "";
      if (typeof v === "string") return v;
      if (typeof v === "number" || typeof v === "boolean") return String(v);
      try { return JSON.stringify(v); } catch (e) { return String(v); }
    },

    _getApprovedFlag: function (r) {
      if (!r) return 0;
      var v = r.Approved ?? r.APPROVED ?? r.approved ?? r.FLAG_APPROVED ?? r.FlagApproved;
      if (v === true) return 1;
      if (v === false) return 0;
      var n = parseInt(String(v || "0"), 10);
      return isNaN(n) ? 0 : n;
    },

    // =========================
    // IMPOSTAZIONE / MULTIPLE
    // =========================
    _getSettingFlags: function (c) {
      var s = String((c && (c.Impostazione ?? c.IMPOSTAZIONE)) || "").trim().toUpperCase();
      return {
        required: s === "O",
        locked: s === "B"
      };
    },

    _isMultipleField: function (c) {
      var s = String((c && (c.MultipleVal ?? c.MULTIPLEVAL)) || "").trim().toUpperCase();
      return s === "X";
    },

    // =========================
    // DOMAINS
    // =========================
    _domainHasValues: function (sDomain) {
      if (!sDomain) return false;
      var oVm = this.getOwnerComponent().getModel("vm");
      var a = (oVm && oVm.getProperty("/domainsByName/" + sDomain)) || [];
      return Array.isArray(a) && a.length > 0;
    },

    // =========================
    // PERMESSI / STATO
    // =========================
    _rankStato: function (st) {
      st = String(st || "").trim().toUpperCase();
      if (st === "AP") return 4;
      if (st === "CH") return 3;
      if (st === "RJ") return 2;
      return 1; // ST default
    },

    _mergeStatus: function (a, b) {
      return (this._rankStato(b) > this._rankStato(a)) ? b : a;
    },

    _canEdit: function (role, status) {
      role = String(role || "").trim().toUpperCase();
      status = String(status || "").trim().toUpperCase();
      if (role === "S") return false;
      if (role === "I") return false;
      if (role === "E") return status !== "AP";
      return false;
    },

    _canApprove: function (role, status) {
      role = String(role || "").trim().toUpperCase();
      status = String(status || "").trim().toUpperCase();
      return role === "I" && (status === "ST" || status === "CH");
    },

    _canReject: function (role, status) {
      role = String(role || "").trim().toUpperCase();
      status = String(status || "").trim().toUpperCase();
      return role === "I" && (status === "ST" || status === "CH");
    },

    _normStatoRow: function (r) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var sForceStato = String(mock.forceStato || "").trim().toUpperCase();

      if (sForceStato === "ST" || sForceStato === "AP" || sForceStato === "RJ" || sForceStato === "CH") {
        return sForceStato;
      }

      var s = String((r && (r.Stato || r.STATO)) || "").trim().toUpperCase();
      if (s === "ST" || s === "AP" || s === "RJ" || s === "CH") return s;

      var ap = this._getApprovedFlag(r);
      if (ap === 1) return "AP";

      var rej = parseInt(String(r.Rejected || r.REJECTED || "0"), 10) || 0;
      if (rej > 0) return "RJ";

      var pend = parseInt(String(r.ToApprove || r.TOAPPROVE || "0"), 10) || 0;
      if (pend > 0) return "ST";

      return "ST";
    },

    _applyGroupStatusToRows: function (aRows, status, bReadOnly) {
      var st = String(status || "ST").trim().toUpperCase();
      (aRows || []).forEach(function (r) {
        if (!r) return;
        r.Stato = st;
        if (st === "AP") { r.Approved = 1; r.ToApprove = 0; r.Rejected = 0; }
        if (st === "RJ") { r.Approved = 0; r.ToApprove = 0; r.Rejected = 1; }
        if (st === "ST") { r.Approved = 0; r.ToApprove = 1; r.Rejected = 0; }
        if (st === "CH") { r.Approved = 0; r.ToApprove = 1; r.Rejected = 0; }
        r.__readOnly = !!bReadOnly;
      });
    },

    _updateVmRecordStatus: function (sCacheKey, sGuidKeySel, sFibraSel, sRole, sStatus) {
      var oVm = this._ensureVmCache();
      var aRecs = oVm.getProperty("/cache/recordsByKey/" + sCacheKey) || [];
      if (!Array.isArray(aRecs) || !aRecs.length) return;

      var idx = aRecs.findIndex(function (r) {
        return String(r && r.guidKey || "") === String(sGuidKeySel || "") &&
               String(r && r.Fibra || "") === String(sFibraSel || "");
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

      // se FORNITORE e non AP -> ogni modifica porta a CH (coerente con Screen3/flag CH)
      var sRole = String(oDetail.getProperty("/__role") || "").trim().toUpperCase();
      var sStatus = String(oDetail.getProperty("/__status") || "").trim().toUpperCase();

      if (sRole === "E" && sStatus !== "AP") {
        // aggiorno status gruppo e cache record
        var aRowsAll = oDetail.getProperty("/RowsAll") || [];
        this._applyGroupStatusToRows(aRowsAll, "CH", false);

        oDetail.setProperty("/__status", "CH");
        oDetail.setProperty("/__canEdit", true);
        oDetail.setProperty("/__canAddRow", true);
        oDetail.setProperty("/__canApprove", false);
        oDetail.setProperty("/__canReject", false);

        // update record list in vm cache (per Screen3 quando torni indietro)
        var sKey = this._getCacheKeySafe();
        var sGuid = this._toStableString(oDetail.getProperty("/guidKey"));
        var sFibra = this._toStableString(oDetail.getProperty("/Fibra"));
        this._updateVmRecordStatus(sKey, sGuid, sFibra, sRole, "CH");
      }
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
      var bRequired = !!(oMeta && oMeta.required);
      var bLocked = !!(oMeta && oMeta.locked);
      var bMultiple = !!(oMeta && oMeta.multiple);

      var sDomain = String((oMeta && oMeta.domain) || "").trim();
      var bUseCombo = !!sDomain && this._domainHasValues(sDomain);

      var sValueBind = "{detail>" + sKey + "}";
      var sReadOnlyExpr = "${detail>__readOnly}";
      var sIsEmptyExpr =
        "(${detail>" + sKey + "} === null || ${detail>" + sKey + "} === undefined || ${detail>" + sKey + "} === '' || ${detail>" + sKey + "}.length === 0)";

      var sValueState = (bRequired && !bLocked)
        ? "{= (!" + sReadOnlyExpr + " && " + sIsEmptyExpr + ") ? 'Error' : 'None' }"
        : "None";

      var sValueStateText = (bRequired && !bLocked) ? "Campo obbligatorio" : "";

      var oText = new Text({
        text: sValueBind,
        visible: "{= " + sReadOnlyExpr + " }"
      });

      var oEditCtrl;

      if (bUseCombo) {
        if (bMultiple) {
          oEditCtrl = new MultiComboBox({
            visible: "{= !" + sReadOnlyExpr + " }",
            enabled: !bLocked,
            allowCustomValues: false,
            selectedKeys: sValueBind,
            valueState: sValueState,
            valueStateText: sValueStateText,
            items: {
              path: "vm>/domainsByName/" + sDomain,
              template: new Item({ key: "{vm>key}", text: "{vm>text}" })
            }
          });
        } else {
          oEditCtrl = new ComboBox({
            visible: "{= !" + sReadOnlyExpr + " }",
            enabled: !bLocked,
            allowCustomValues: false,
            selectedKey: sValueBind,
            valueState: sValueState,
            valueStateText: sValueStateText,
            items: {
              path: "vm>/domainsByName/" + sDomain,
              template: new Item({ key: "{vm>key}", text: "{vm>text}" })
            }
          });
        }
      } else {
        oEditCtrl = new Input({
          visible: "{= !" + sReadOnlyExpr + " }",
          editable: !bLocked,
          value: sValueBind,
          valueState: sValueState,
          valueStateText: sValueStateText
        });
      }

      this._hookDirtyOnEdit(oEditCtrl);
      return new HBox({ items: [oText, oEditCtrl] });
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

        __dirty: false,
        __role: "",
        __status: "",
        __canEdit: false,
        __canAddRow: false,
        __canApprove: false,
        __canReject: false
      }, true);

      this._logTable("TABLE STATE @ before _loadSelectedRecordRows");

      this._loadSelectedRecordRows(function () {
        this._bindRowsAndColumns();
      }.bind(this));
    },

    // =========================
    // CACHE VM
    // =========================
    _ensureVmCache: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      if (!oVm) oVm = new JSONModel({});

      if (!oVm.getProperty("/cache")) oVm.setProperty("/cache", {});
      if (!oVm.getProperty("/cache/dataRowsByKey")) oVm.setProperty("/cache/dataRowsByKey", {});
      if (!oVm.getProperty("/cache/recordsByKey")) oVm.setProperty("/cache/recordsByKey", {});
      if (!oVm.getProperty("/mdcCfg")) oVm.setProperty("/mdcCfg", {});

      this.getOwnerComponent().setModel(oVm, "vm");
      return oVm;
    },

    _getCacheKeySafe: function () {
      return encodeURIComponent((this._sVendorId || "") + "||" + (this._sMaterial || ""));
    },

    // =========================
    // MMCT
    // =========================
    _getMmctCfgForCat: function (sCat) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var aUserInfos = (oVm && (oVm.getProperty("/UserInfosMMCT") || oVm.getProperty("/userInfosMMCT"))) || [];
      if (!Array.isArray(aUserInfos)) return [];

      var oCat = aUserInfos.find(function (x) { return String(x && x.CatMateriale) === String(sCat); });
      var aFields = (oCat && oCat.UserMMCTFields && oCat.UserMMCTFields.results) ? oCat.UserMMCTFields.results : [];
      return Array.isArray(aFields) ? aFields : [];
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
          var required = !!flags.required;
          var locked = !!flags.locked;
          var multiple = this._isMultipleField(c);

          return { ui: ui, label: label, domain: domain, required: required, locked: locked, multiple: multiple };
        }.bind(this))
        .filter(Boolean);
    },

    // (solo per resilienza: se refreshi su S4 e poi torni indietro a S3)
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

      // =========================
      // MOCK Screen4 (come Screen3)
      // =========================

      debugger
      if (bMockS4) {
        var sVendorName = "CITY MODELES";
        try {
          var aVend = (oVm && (oVm.getProperty("/userVendors") || oVm.getProperty("/UserInfosVend"))) || [];
          var vId = String(this._sVendorId || "").trim();
          var oV = aVend.find(function (x) { return String(x && x.Fornitore) === vId; });
          if (oV && oV.ReagSoc) sVendorName = oV.ReagSoc;
        } catch (e0) {  }

        var mmct = (oVm && oVm.getProperty("/mmctFieldsByCat")) || {};
        var aCats = Object.keys(mmct || {});
        var sCat = aCats[0] || "CF";

        var aMock = MockData.buildDataSetRows({
          vendorId: this._sVendorId,
          vendorName: sVendorName,
          material: this._sMaterial,
          userId: sUserId,
          forceStato: sForceStato,
          cat: sCat
        }) || [];

        this._log("[MOCK S4] buildDataSetRows", {
          rows: aMock.length,
          forceStato: sForceStato || "(none)",
          cat: sCat
        });

        done(aMock);
        return;
      }

      // =========================
      // BACKEND read DataSet
      // =========================
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

          // forza stato (se impostato in Screen0)
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

    // recordsByKey “compatibile” con Screen3 (almeno: guidKey, Fibra, idx, Stato/__status + campi s01)
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
        var sKey = sGuidKey + "||" + sFibra;

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
      var sKey = this._getCacheKeySafe();

      var aAllRows = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || null;
      var aRecords = oVm.getProperty("/cache/recordsByKey/" + sKey) || null;

      var after = function () {
        var oDetail = this.getView().getModel("detail");

        var iIdx = parseInt(this._sRecordKey, 10);
        if (isNaN(iIdx) || iIdx < 0) iIdx = 0;

        var oRec = (aRecords && aRecords[iIdx]) || (aRecords && aRecords[0]) || null;
        if (!oRec) {
          oDetail.setProperty("/RowsAll", []);
          oDetail.setProperty("/Rows", []);
          oDetail.setProperty("/RowsCount", 0);
          if (typeof fnDone === "function") fnDone();
          return;
        }

        var sGuidKey = this._toStableString(oRec.guidKey);
        var sFibra = this._toStableString(oRec.Fibra);

        var aSelected = (aAllRows || []).filter(function (r) {
          return this._rowGuidKey(r) === sGuidKey && this._rowFibra(r) === sFibra;
        }.bind(this));

        // ruolo
        var oVm2 = this.getOwnerComponent().getModel("vm");
        var sRole = (oVm2 && oVm2.getProperty("/userType")) || "";
        sRole = String(sRole || "").trim().toUpperCase();

        // stato record (aggregato)
        var groupStatus = "ST";
        (aSelected || []).forEach(function (r) {
          var st = this._normStatoRow(r);
          groupStatus = this._mergeStatus(groupStatus, st);
        }.bind(this));

        var bCanEdit = this._canEdit(sRole, groupStatus);

        // applico readonly alle righe e valorizzo Stato
        (aSelected || []).forEach(function (r) {
          r.Stato = this._normStatoRow(r);
          r.__readOnly = !bCanEdit;
        }.bind(this));

        // flags su detail (usabili da footer)
        oDetail.setProperty("/__role", sRole);
        oDetail.setProperty("/__status", groupStatus);
        oDetail.setProperty("/__canEdit", bCanEdit);
        oDetail.setProperty("/__canAddRow", (sRole === "E" && groupStatus !== "AP"));
        oDetail.setProperty("/__canApprove", this._canApprove(sRole, groupStatus));
        oDetail.setProperty("/__canReject", this._canReject(sRole, groupStatus));

        var r0 = aSelected[0] || {};
        var sCat = String(r0.CatMateriale || "").trim();
        var aCfg02 = sCat ? this._cfgForScreen02(sCat) : [];

        // MULTI: garantisci array per i campi multiple
        function toArray(v) {
          if (Array.isArray(v)) return v;
          var s = String(v || "").trim();
          if (!s) return [];
          return s.split(/[;,|]+/).map(function (x) { return x.trim(); }).filter(Boolean);
        }
        (aSelected || []).forEach(function (row) {
          (aCfg02 || []).forEach(function (f) {
            if (f && f.ui && f.multiple) row[f.ui] = toArray(row[f.ui]);
          });
        });

        oDetail.setProperty("/guidKey", sGuidKey);
        oDetail.setProperty("/Fibra", sFibra);
        oDetail.setProperty("/_mmct", { cat: sCat, s02: aCfg02 });

        oDetail.setProperty("/RowsAll", aSelected || []);
        oDetail.setProperty("/Rows", aSelected || []);
        oDetail.setProperty("/RowsCount", (aSelected || []).length);

        this._log("_loadSelectedRecordRows", {
          cacheKey: sKey,
          recIdx: iIdx,
          guidKey: sGuidKey,
          fibra: sFibra,
          rows: (aSelected || []).length,
          s02Cols: aCfg02.length,
          role: sRole,
          status: groupStatus
        });

        if (typeof fnDone === "function") fnDone();
      }.bind(this);

      // cache già pronta (flow standard: Screen3 -> Screen4)
      if (Array.isArray(aAllRows) && aAllRows.length && Array.isArray(aRecords) && aRecords.length) {
        after();
        return;
      }

      // fallback: refresh diretto su Screen4 => carico DataSet e creo cache coerente (anche per Screen3)
      this._reloadDataFromBackend(function (aResults) {
        aAllRows = aResults || [];

        // costruisco records “compatibili” con Screen3 (almeno)
        var r0 = aAllRows[0] || {};
        var sCat = String(r0.CatMateriale || "").trim();
        var aCfg01 = sCat ? this._cfgForScreen01(sCat) : [];
        aRecords = this._buildRecords01ForCache(aAllRows, aCfg01);

        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aAllRows);
        oVm.setProperty("/cache/recordsByKey/" + sKey, aRecords);

        after();
      }.bind(this));
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

    _forceP13nAllVisible: async function (oTbl, reason) {
      if (!oTbl || !StateUtil) return;
      try {
        var st = await StateUtil.retrieveExternalState(oTbl);
        var patched = JSON.parse(JSON.stringify(st || {}));

        var arr =
          patched.items ||
          patched.columns ||
          patched.Columns ||
          (patched.table && patched.table.items) ||
          null;

        if (Array.isArray(arr) && arr.length) {
          arr.forEach(function (it) {
            if (!it) return;
            if (it.visible === false) it.visible = true;
            if (it.visible == null) it.visible = true;
          });

          await StateUtil.applyExternalState(oTbl, patched);
          this._log("P13N applyExternalState FORCED visible @ " + reason);
          if (typeof oTbl.rebind === "function") oTbl.rebind();
        }
      } catch (e) {
        this._log("P13N force visible FAILED @ " + reason, e && e.message);
      }
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

      this._snapshotRows = deepClone(oDetail.getProperty("/Rows") || []);

      if (typeof oTbl.rebind === "function") oTbl.rebind();

      await this._forceP13nAllVisible(oTbl, "t0");
      setTimeout(function () { this._forceP13nAllVisible(oTbl, "t300"); }.bind(this), 300);

      this._logTable("TABLE STATE @ after _bindRowsAndColumns");
    },

    // =========================
    // Filter
    // =========================
    onGlobalFilter: function (oEvt) {
      var q = String(oEvt.getParameter("value") || "").trim().toUpperCase();
      var oDetail = this.getView().getModel("detail");
      var aAll = oDetail.getProperty("/RowsAll") || [];

      if (!q) {
        oDetail.setProperty("/Rows", aAll);
        oDetail.setProperty("/RowsCount", (aAll || []).length);
        return;
      }

      var aFiltered = aAll.filter(function (r) {
        return Object.keys(r || {}).some(function (k) {
          if (k === "__metadata" || k === "AllData") return false;
          var v = r[k];
          if (v === null || v === undefined) return false;
          if (Array.isArray(v)) v = v.join(", ");
          return String(v).toUpperCase().indexOf(q) >= 0;
        });
      });

      oDetail.setProperty("/Rows", aFiltered);
      oDetail.setProperty("/RowsCount", (aFiltered || []).length);
    },

    // =========================
    // ADD ROW (Screen4)
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

        var oNew = deepClone(oBase) || {};
        delete oNew.__metadata;
        oNew.__readOnly = false;

        // aggiunta/modifica -> CH
        oNew.Stato = "CH";
        oNew.Approved = 0;
        oNew.Rejected = 0;
        oNew.ToApprove = 1;

        oNew.__localId = "NEW_" + Date.now() + "_" + Math.floor(Math.random() * 100000);

        // MULTI -> array
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

        // set CH su tutto il gruppo
        var aRowsAll2 = aRowsAll.slice();
        var aRows2 = Array.isArray(aRows) ? aRows.slice() : [];

        this._applyGroupStatusToRows(aRowsAll2, "CH", false);

        aRowsAll2.push(oNew);
        aRows2.push(oNew);

        oDetail.setProperty("/RowsAll", aRowsAll2);
        oDetail.setProperty("/Rows", aRows2);
        oDetail.setProperty("/RowsCount", aRowsAll2.length);

        oDetail.setProperty("/__status", "CH");
        oDetail.setProperty("/__canEdit", true);
        oDetail.setProperty("/__canAddRow", true);
        oDetail.setProperty("/__canApprove", false);
        oDetail.setProperty("/__canReject", false);
        oDetail.setProperty("/__dirty", true);

        // persistenza in cache VM (usa la STESSA reference oNew, così le modifiche successive non si perdono)
        var oVm = this._ensureVmCache();
        var sKey = this._getCacheKeySafe();

        var aCacheAll = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || [];
        if (!Array.isArray(aCacheAll)) aCacheAll = [];

        var sGuidKeySel = this._toStableString(oDetail.getProperty("/guidKey"));
        var sFibraSel = this._toStableString(oDetail.getProperty("/Fibra"));

        // patch gruppo in cache -> CH
        aCacheAll.forEach(function (r) {
          if (this._rowGuidKey(r) === sGuidKeySel && this._rowFibra(r) === sFibraSel) {
            r.Stato = "CH";
            r.Approved = 0;
            r.Rejected = 0;
            r.ToApprove = 1;
          }
        }.bind(this));

        aCacheAll = aCacheAll.slice();
        aCacheAll.push(oNew); // stessa ref

        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aCacheAll);

        // aggiorno record status in cache (per Screen3 quando torni indietro)
        var sRole = String(oDetail.getProperty("/__role") || "").trim().toUpperCase();
        this._updateVmRecordStatus(sKey, sGuidKeySel, sFibraSel, sRole, "CH");

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

    // =========================
    // APPROVE / REJECT (safe stubs: aggiornano stato + cache)
    // =========================
    onApprove: function () {
      try {
        var oDetail = this.getView().getModel("detail");
        if (!oDetail) return;

        if (!oDetail.getProperty("/__canApprove")) {
          MessageToast.show("Non hai permessi per approvare");
          return;
        }

        var aRowsAll = oDetail.getProperty("/RowsAll") || [];
        this._applyGroupStatusToRows(aRowsAll, "AP", true);

        oDetail.setProperty("/__status", "AP");
        oDetail.setProperty("/__canEdit", false);
        oDetail.setProperty("/__canAddRow", false);
        oDetail.setProperty("/__canApprove", false);
        oDetail.setProperty("/__canReject", false);
        oDetail.setProperty("/__dirty", true);

        var sKey = this._getCacheKeySafe();
        var sGuid = this._toStableString(oDetail.getProperty("/guidKey"));
        var sFibra = this._toStableString(oDetail.getProperty("/Fibra"));
        var sRole = String(oDetail.getProperty("/__role") || "").trim().toUpperCase();
        this._updateVmRecordStatus(sKey, sGuid, sFibra, sRole, "AP");

        var oTbl = this.byId("mdcTable4");
        if (oTbl && typeof oTbl.rebind === "function") oTbl.rebind();

        MessageToast.show("Record approvato (cache)");
      } catch (e) {
        console.error("[S4] onApprove ERROR", e);
        MessageToast.show("Errore approvazione");
      }
    },

    onReject: function () {
      try {
        var oDetail = this.getView().getModel("detail");
        if (!oDetail) return;

        if (!oDetail.getProperty("/__canReject")) {
          MessageToast.show("Non hai permessi per respingere");
          return;
        }

        var aRowsAll = oDetail.getProperty("/RowsAll") || [];
        this._applyGroupStatusToRows(aRowsAll, "RJ", true);

        oDetail.setProperty("/__status", "RJ");
        oDetail.setProperty("/__canEdit", false);
        oDetail.setProperty("/__canAddRow", false);
        oDetail.setProperty("/__canApprove", false);
        oDetail.setProperty("/__canReject", false);
        oDetail.setProperty("/__dirty", true);

        var sKey = this._getCacheKeySafe();
        var sGuid = this._toStableString(oDetail.getProperty("/guidKey"));
        var sFibra = this._toStableString(oDetail.getProperty("/Fibra"));
        var sRole = String(oDetail.getProperty("/__role") || "").trim().toUpperCase();
        this._updateVmRecordStatus(sKey, sGuid, sFibra, sRole, "RJ");

        var oTbl = this.byId("mdcTable4");
        if (oTbl && typeof oTbl.rebind === "function") oTbl.rebind();

        MessageToast.show("Record respinto (cache)");
      } catch (e) {
        console.error("[S4] onReject ERROR", e);
        MessageToast.show("Errore respinta");
      }
    },

    // =========================
    // NavBack
    // =========================
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
 */


// webapp/controller/Screen4.controller.js
sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/routing/History",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/core/BusyIndicator",
  "sap/m/MessageToast",
  "sap/ui/mdc/table/Column",
  "sap/m/HBox",
  "sap/m/Text",
  "sap/m/Input",
  "sap/m/ComboBox",
  "sap/m/MultiComboBox",
  "sap/ui/core/Item",
  "sap/ui/mdc/p13n/StateUtil",
  "sap/m/VBox",
  "apptracciabilita/apptracciabilita/util/mockData"
], function (
  Controller,
  History,
  JSONModel,
  Filter,
  FilterOperator,
  BusyIndicator,
  MessageToast,
  MdcColumn,
  HBox,
  Text,
  Input,
  ComboBox,
  MultiComboBox,
  Item,
  StateUtil,
  VBox,
  MockData
) {
  "use strict";

  function ts() { return new Date().toISOString(); }
  function deepClone(x) { try { return JSON.parse(JSON.stringify(x)); } catch (e) { return x; } }

  return Controller.extend("apptracciabilita.apptracciabilita.controller.Screen4", {

    onInit: function () {
      this._log("onInit");

      var oRouter = this.getOwnerComponent().getRouter();
      oRouter.getRoute("Screen4").attachPatternMatched(this._onRouteMatched, this);

      // UI model per show/hide filtri dentro header
      this.getView().setModel(new JSONModel({
        showHeaderFilters: false
      }), "ui");

      var oDetail = new JSONModel({
        VendorId: "",
        Material: "",
        recordKey: "0",
        guidKey: "",
        Fibra: "",
        RowsAll: [],
        Rows: [],
        RowsCount: 0,
        _mmct: { cat: "", s02: [] },

        __dirty: false,
        __role: "",
        __status: "",
        __canEdit: false,
        __canAddRow: false,
        __canApprove: false,
        __canReject: false
      });

      this.getView().setModel(oDetail, "detail");
      this._snapshotRows = null;

      // UI state (filters/sort)
      this._globalQuery = "";
      this._colFilters = {};   // { FIELD: { type:"text"|"keys"|"key", value: ... } }
      this._sortState = null;  // { key:"FIELD", desc:false }
      this._sortCtrls = {};

      // Header-filters infra (controlli inseriti dentro header colonne della inner table)
      this._hdrFilter = {
        boxesByKey: {},   // { FIELD: { box, lbl, ctrl } }
        seenLast: {}      // per cleanup
      };

      // DEBUG HOOKS MDC/INNER TABLE
      this._setupDebugMdcHooks();
    },

    onExit: function () {
      try {
        if (this._dlgSort) { this._dlgSort.destroy(); this._dlgSort = null; }

        // distruggi header filter box/ctrl creati manualmente
        if (this._hdrFilter && this._hdrFilter.boxesByKey) {
          Object.keys(this._hdrFilter.boxesByKey).forEach(function (k) {
            var p = this._hdrFilter.boxesByKey[k];
            try { if (p && p.box) p.box.destroy(); } catch (e) {  }
          }.bind(this));
        }
        this._hdrFilter = { boxesByKey: {}, seenLast: {} };
      } catch (e) {  }
    },

    // =========================
    // LOG
    // =========================
    _log: function () {
      var a = Array.prototype.slice.call(arguments);
      a.unshift("[S4] " + ts());
      console.log.apply(console, a);
    },

    // =========================
    // DEBUG (MDC / INNER TABLE)
    // =========================
    _dbg: function () {
      // metti a false se vuoi spegnere tutto
      if (this._DBG === false) return;

      var a = Array.prototype.slice.call(arguments);
      a.unshift("[S4DBG] " + ts());
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

        // appena MDC è initialized prova a vedere la inner table e le colonne
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

              // logga aggiornamenti righe: indica che la table è “viva”
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

    // =========================
    // Approved flag -> readOnly
    // =========================
    _toStableString: function (v) {
      if (v === null || v === undefined) return "";
      if (typeof v === "string") return v;
      if (typeof v === "number" || typeof v === "boolean") return String(v);
      try { return JSON.stringify(v); } catch (e) { return String(v); }
    },

    _getApprovedFlag: function (r) {
      if (!r) return 0;
      var v = r.Approved ?? r.APPROVED ?? r.approved ?? r.FLAG_APPROVED ?? r.FlagApproved;
      if (v === true) return 1;
      if (v === false) return 0;
      var n = parseInt(String(v || "0"), 10);
      return isNaN(n) ? 0 : n;
    },

    // =========================
    // IMPOSTAZIONE / MULTIPLE
    // =========================
    _getSettingFlags: function (c) {
      var s = String((c && (c.Impostazione ?? c.IMPOSTAZIONE)) || "").trim().toUpperCase();
      return {
        required: s === "O",
        locked: s === "B",
        hidden: s === "N"
      };
    },

    _isMultipleField: function (c) {
      var s = String((c && (c.MultipleVal ?? c.MULTIPLEVAL)) || "").trim().toUpperCase();
      return s === "X";
    },

    // =========================
    // DOMAINS
    // =========================
    _domainHasValues: function (sDomain) {
      if (!sDomain) return false;
      var oVm = this.getOwnerComponent().getModel("vm");
      var a = (oVm && oVm.getProperty("/domainsByName/" + sDomain)) || [];
      return Array.isArray(a) && a.length > 0;
    },

    // =========================
    // PERMESSI / STATO
    // =========================
    _rankStato: function (st) {
      st = String(st || "").trim().toUpperCase();
      if (st === "AP") return 4;
      if (st === "CH") return 3;
      if (st === "RJ") return 2;
      return 1; // ST default
    },

    _mergeStatus: function (a, b) {
      return (this._rankStato(b) > this._rankStato(a)) ? b : a;
    },

    _canEdit: function (role, status) {
      role = String(role || "").trim().toUpperCase();
      status = String(status || "").trim().toUpperCase();
      if (role === "S") return false;
      if (role === "I") return false;
      if (role === "E") return status !== "AP";
      return false;
    },

    _canApprove: function (role, status) {
      role = String(role || "").trim().toUpperCase();
      status = String(status || "").trim().toUpperCase();
      return role === "I" && (status === "ST" || status === "CH");
    },

    _canReject: function (role, status) {
      role = String(role || "").trim().toUpperCase();
      status = String(status || "").trim().toUpperCase();
      return role === "I" && (status === "ST" || status === "CH");
    },

    _normStatoRow: function (r) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var sForceStato = String(mock.forceStato || "").trim().toUpperCase();

      if (sForceStato === "ST" || sForceStato === "AP" || sForceStato === "RJ" || sForceStato === "CH") {
        return sForceStato;
      }

      var s = String((r && (r.Stato || r.STATO)) || "").trim().toUpperCase();
      if (s === "ST" || s === "AP" || s === "RJ" || s === "CH") return s;

      var ap = this._getApprovedFlag(r);
      if (ap === 1) return "AP";

      var rej = parseInt(String(r.Rejected || r.REJECTED || "0"), 10) || 0;
      if (rej > 0) return "RJ";

      var pend = parseInt(String(r.ToApprove || r.TOAPPROVE || "0"), 10) || 0;
      if (pend > 0) return "ST";

      return "ST";
    },

    _applyGroupStatusToRows: function (aRows, status, bReadOnly) {
      var st = String(status || "ST").trim().toUpperCase();
      (aRows || []).forEach(function (r) {
        if (!r) return;
        r.Stato = st;
        if (st === "AP") { r.Approved = 1; r.ToApprove = 0; r.Rejected = 0; }
        if (st === "RJ") { r.Approved = 0; r.ToApprove = 0; r.Rejected = 1; }
        if (st === "ST") { r.Approved = 0; r.ToApprove = 1; r.Rejected = 0; }
        if (st === "CH") { r.Approved = 0; r.ToApprove = 1; r.Rejected = 0; }
        r.__readOnly = !!bReadOnly;
      });
    },

    _updateVmRecordStatus: function (sCacheKey, sGuidKeySel, sFibraSel, sRole, sStatus) {
      var oVm = this._ensureVmCache();
      var aRecs = oVm.getProperty("/cache/recordsByKey/" + sCacheKey) || [];
      if (!Array.isArray(aRecs) || !aRecs.length) return;

      var idx = aRecs.findIndex(function (r) {
        return String(r && r.guidKey || "") === String(sGuidKeySel || "") &&
               String(r && r.Fibra || "") === String(sFibraSel || "");
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
        this._applyGroupStatusToRows(aRowsAll, "CH", false);

        oDetail.setProperty("/__status", "CH");
        oDetail.setProperty("/__canEdit", true);
        oDetail.setProperty("/__canAddRow", true);
        oDetail.setProperty("/__canApprove", false);
        oDetail.setProperty("/__canReject", false);

        var sKey = this._getCacheKeySafe();
        var sGuid = this._toStableString(oDetail.getProperty("/guidKey"));
        var sFibra = this._toStableString(oDetail.getProperty("/Fibra"));
        this._updateVmRecordStatus(sKey, sGuid, sFibra, sRole, "CH");
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
      var bRequired = !!(oMeta && oMeta.required);
      var bLocked = !!(oMeta && oMeta.locked);
      var bMultiple = !!(oMeta && oMeta.multiple);

      var sDomain = String((oMeta && oMeta.domain) || "").trim();
      var bUseCombo = !!sDomain && this._domainHasValues(sDomain);

      var sValueBind = "{detail>" + sKey + "}";
      var sReadOnlyExpr = "${detail>__readOnly}";
      var sIsEmptyExpr =
        "(${detail>" + sKey + "} === null || ${detail>" + sKey + "} === undefined || ${detail>" + sKey + "} === '' || ${detail>" + sKey + "}.length === 0)";

      var sValueState = (bRequired && !bLocked)
        ? "{= (!" + sReadOnlyExpr + " && " + sIsEmptyExpr + ") ? 'Error' : 'None' }"
        : "None";

      var sValueStateText = (bRequired && !bLocked) ? "Campo obbligatorio" : "";

      var oText = new Text({
        text: sValueBind,
        visible: "{= " + sReadOnlyExpr + " }"
      });

      var oEditCtrl;

      if (bUseCombo) {
        if (bMultiple) {
          oEditCtrl = new MultiComboBox({
            visible: "{= !" + sReadOnlyExpr + " }",
            enabled: !bLocked,
            allowCustomValues: false,
            selectedKeys: sValueBind,
            valueState: sValueState,
            valueStateText: sValueStateText,
            items: {
              path: "vm>/domainsByName/" + sDomain,
              template: new Item({ key: "{vm>key}", text: "{vm>text}" })
            }
          });
        } else {
          oEditCtrl = new ComboBox({
            visible: "{= !" + sReadOnlyExpr + " }",
            enabled: !bLocked,
            allowCustomValues: false,
            selectedKey: sValueBind,
            valueState: sValueState,
            valueStateText: sValueStateText,
            items: {
              path: "vm>/domainsByName/" + sDomain,
              template: new Item({ key: "{vm>key}", text: "{vm>text}" })
            }
          });
        }
      } else {
        oEditCtrl = new Input({
          visible: "{= !" + sReadOnlyExpr + " }",
          editable: !bLocked,
          value: sValueBind,
          valueState: sValueState,
          valueStateText: sValueStateText
        });
      }

      this._hookDirtyOnEdit(oEditCtrl);
      return new HBox({ items: [oText, oEditCtrl] });
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

      this._loadSelectedRecordRows(function () {
        this._bindRowsAndColumns();
      }.bind(this));
    },

    // =========================
    // CACHE VM
    // =========================
    _ensureVmCache: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      if (!oVm) oVm = new JSONModel({});

      if (!oVm.getProperty("/cache")) oVm.setProperty("/cache", {});
      if (!oVm.getProperty("/cache/dataRowsByKey")) oVm.setProperty("/cache/dataRowsByKey", {});
      if (!oVm.getProperty("/cache/recordsByKey")) oVm.setProperty("/cache/recordsByKey", {});
      if (!oVm.getProperty("/mdcCfg")) oVm.setProperty("/mdcCfg", {});

      this.getOwnerComponent().setModel(oVm, "vm");
      return oVm;
    },

    _getCacheKeySafe: function () {
      return encodeURIComponent((this._sVendorId || "") + "||" + (this._sMaterial || ""));
    },

    // =========================
    // MMCT
    // =========================
    _getMmctCfgForCat: function (sCat) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var aUserInfos = (oVm && (oVm.getProperty("/UserInfosMMCT") || oVm.getProperty("/userInfosMMCT"))) || [];
      if (!Array.isArray(aUserInfos)) return [];

      var oCat = aUserInfos.find(function (x) { return String(x && x.CatMateriale) === String(sCat); });
      var aFields = (oCat && oCat.UserMMCTFields && oCat.UserMMCTFields.results) ? oCat.UserMMCTFields.results : [];
      return Array.isArray(aFields) ? aFields : [];
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
        var sKey = sGuidKey + "||" + sFibra;

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
      var sKey = this._getCacheKeySafe();

      var aAllRows = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || null;
      var aRecords = oVm.getProperty("/cache/recordsByKey/" + sKey) || null;

      var after = function () {
        var oDetail = this.getView().getModel("detail");

        var iIdx = parseInt(this._sRecordKey, 10);
        if (isNaN(iIdx) || iIdx < 0) iIdx = 0;

        var oRec = (aRecords && aRecords[iIdx]) || (aRecords && aRecords[0]) || null;
        if (!oRec) {
          oDetail.setProperty("/RowsAll", []);
          oDetail.setProperty("/Rows", []);
          oDetail.setProperty("/RowsCount", 0);
          this._applyUiPermissions();
          if (typeof fnDone === "function") fnDone();
          return;
        }

        var sGuidKey = this._toStableString(oRec.guidKey);
        var sFibra = this._toStableString(oRec.Fibra);

        var aSelected = (aAllRows || []).filter(function (r) {
          return this._rowGuidKey(r) === sGuidKey && this._rowFibra(r) === sFibra;
        }.bind(this));

        var oVm2 = this.getOwnerComponent().getModel("vm");
        var sRole = (oVm2 && oVm2.getProperty("/userType")) || "";
        sRole = String(sRole || "").trim().toUpperCase();

        var groupStatus = "ST";
        (aSelected || []).forEach(function (r) {
          var st = this._normStatoRow(r);
          groupStatus = this._mergeStatus(groupStatus, st);
        }.bind(this));

        var bCanEdit = this._canEdit(sRole, groupStatus);

        (aSelected || []).forEach(function (r) {
          r.Stato = this._normStatoRow(r);
          r.__readOnly = !bCanEdit;
        }.bind(this));

        oDetail.setProperty("/__role", sRole);
        oDetail.setProperty("/__status", groupStatus);
        oDetail.setProperty("/__canEdit", bCanEdit);
        oDetail.setProperty("/__canAddRow", (sRole === "E" && groupStatus !== "AP"));
        oDetail.setProperty("/__canApprove", this._canApprove(sRole, groupStatus));
        oDetail.setProperty("/__canReject", this._canReject(sRole, groupStatus));

        var r0 = aSelected[0] || {};
        var sCat = String(r0.CatMateriale || "").trim();
        var aCfg02 = sCat ? this._cfgForScreen02(sCat) : [];

        function toArray(v) {
          if (Array.isArray(v)) return v;
          var s = String(v || "").trim();
          if (!s) return [];
          return s.split(/[;,|]+/).map(function (x) { return x.trim(); }).filter(Boolean);
        }
        (aSelected || []).forEach(function (row) {
          (aCfg02 || []).forEach(function (f) {
            if (f && f.ui && f.multiple) row[f.ui] = toArray(row[f.ui]);
          });
        });

        oDetail.setProperty("/guidKey", sGuidKey);
        oDetail.setProperty("/Fibra", sFibra);
        oDetail.setProperty("/_mmct", { cat: sCat, s02: aCfg02 });

        oDetail.setProperty("/RowsAll", aSelected || []);
        oDetail.setProperty("/Rows", aSelected || []);
        oDetail.setProperty("/RowsCount", (aSelected || []).length);

        this._log("_loadSelectedRecordRows", {
          cacheKey: sKey,
          recIdx: iIdx,
          guidKey: sGuidKey,
          fibra: sFibra,
          rows: (aSelected || []).length,
          s02Cols: aCfg02.length,
          role: sRole,
          status: groupStatus
        });

        this._applyUiPermissions();
        this._applyFiltersAndSort();

        if (typeof fnDone === "function") fnDone();
      }.bind(this);

      if (Array.isArray(aAllRows) && aAllRows.length && Array.isArray(aRecords) && aRecords.length) {
        after();
        return;
      }

      this._reloadDataFromBackend(function (aResults) {
        aAllRows = aResults || [];

        var r0 = aAllRows[0] || {};
        var sCat = String(r0.CatMateriale || "").trim();
        var aCfg01 = sCat ? this._cfgForScreen01(sCat) : [];
        aRecords = this._buildRecords01ForCache(aAllRows, aCfg01);

        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aAllRows);
        oVm.setProperty("/cache/recordsByKey/" + sKey, aRecords);

        after();
      }.bind(this));
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

    _forceP13nAllVisible: async function (oTbl, reason) {
      if (!oTbl || !StateUtil) return;
      try {
        var st = await StateUtil.retrieveExternalState(oTbl);
        var patched = JSON.parse(JSON.stringify(st || {}));

        var arr =
          patched.items ||
          patched.columns ||
          patched.Columns ||
          (patched.table && patched.table.items) ||
          null;

        if (Array.isArray(arr) && arr.length) {
          arr.forEach(function (it) {
            if (!it) return;
            if (it.visible === false) it.visible = true;
            if (it.visible == null) it.visible = true;
          });

          await StateUtil.applyExternalState(oTbl, patched);
          this._log("P13N applyExternalState FORCED visible @ " + reason);
          if (typeof oTbl.rebind === "function") oTbl.rebind();
        }
      } catch (e) {
        this._log("P13N force visible FAILED @ " + reason, e && e.message);
      }
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

      this._snapshotRows = deepClone(oDetail.getProperty("/RowsAll") || []);

      if (typeof oTbl.rebind === "function") oTbl.rebind();

      await this._forceP13nAllVisible(oTbl, "t0");
      setTimeout(function () { this._forceP13nAllVisible(oTbl, "t300"); }.bind(this), 300);

      // >>> INIETTA FILTRI DENTRO HEADER (inner GridTable) <<<
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
    _valToText: function (v) {
      if (v === null || v === undefined) return "";
      if (Array.isArray(v)) return v.join(", ");
      if (typeof v === "object") {
        try { return JSON.stringify(v); } catch (e) { return String(v); }
      }
      return String(v);
    },

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
        var sKeySort = this._sortState.key;
        var bDesc = !!this._sortState.desc;

        a.sort(function (r1, r2) {
          var v1 = r1 ? r1[sKeySort] : "";
          var v2 = r2 ? r2[sKeySort] : "";

          var s1 = this._valToText(v1);
          var s2 = this._valToText(v2);

          var n1 = parseFloat(s1.replace(",", "."));
          var n2 = parseFloat(s2.replace(",", "."));
          var bothNum = !isNaN(n1) && !isNaN(n2);

          var cmp;
          if (bothNum) cmp = (n1 < n2 ? -1 : (n1 > n2 ? 1 : 0));
          else cmp = s1.localeCompare(s2);

          return bDesc ? -cmp : cmp;
        }.bind(this));
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
  var oMdc = this.byId("mdcTable4");
  if (!oMdc) {
    if (bDebug) this._dbg("_getInnerTable: mdcTable4 not found");
    return null;
  }

  var oInner = null;
  var sMdcMeta = "";
  try {
    sMdcMeta = (oMdc.getMetadata && oMdc.getMetadata().getName && oMdc.getMetadata().getName()) || "";
  } catch (eMeta) {  }

  try {
    // 1) alcune versioni/contesti NON espongono getTable() sul MDC Table
    if (typeof oMdc.getTable === "function") {
      oInner = oMdc.getTable();
    }

    // 2) fallback tipico: "content" (spesso qui trovi direttamente la sap.ui.table.Table / sap.m.Table)
    if (!oInner && typeof oMdc.getContent === "function") {
      oInner = oMdc.getContent();
    }

    // 3) fallback su aggregazioni (a seconda della versione, il nome può cambiare)
    if (!oInner && typeof oMdc.getAggregation === "function") {
      oInner =
        oMdc.getAggregation("content") ||
        oMdc.getAggregation("_content") ||
        oMdc.getAggregation("_table") ||
        null;
    }

    // 4) fallback privati (ultima spiaggia)
    if (!oInner && oMdc._oTable) {
      oInner = oMdc._oTable;
    }
    if (!oInner && typeof oMdc._getTable === "function") {
      oInner = oMdc._getTable();
    }
  } catch (e) {
    if (bDebug) this._dbg("_getInnerTable: resolve error", { mdcMeta: sMdcMeta, err: e && e.message });
  }

  // Unwrap: a volte "content" NON è la tabella finale ma il "TableType"
  // (che poi contiene la vera tabella)
  try {
    if (oInner && typeof oInner.getColumns !== "function") {
      if (typeof oInner.getTable === "function") {
        oInner = oInner.getTable();
      } else if (typeof oInner.getInnerTable === "function") {
        oInner = oInner.getInnerTable();
      } else if (oInner._oTable) {
        oInner = oInner._oTable;
      }
    }
  } catch (e2) {  }

  if (bDebug) {
    this._dbg("_getInnerTable resolved", {
      mdcMeta: sMdcMeta,
      hasInner: !!oInner,
      innerMeta: oInner && oInner.getMetadata && oInner.getMetadata().getName && oInner.getMetadata().getName(),
      hasGetColumns: !!(oInner && typeof oInner.getColumns === "function")
    });
  }

  return oInner || null;
},

    _setInnerHeaderHeight: function (oInner, bShow) {
      try {
        if (!oInner) return;
        // con VBox (label + input) serve piu' altezza
        if (typeof oInner.setColumnHeaderHeight === "function") {
          oInner.setColumnHeaderHeight(bShow ? 64 : 32);
        } else {
          this._dbg("_setInnerHeaderHeight: setColumnHeaderHeight not available on inner");
        }
      } catch (e) {  }
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
        var oCtrl = this._createHeaderFilterCtrl(sKey, fMeta);

        var oBox = new VBox({
          width: "100%",
          renderType: "Bare",
          items: [oLbl, oCtrl]
        });

        this._hdrFilter.boxesByKey[sKey] = { box: oBox, lbl: oLbl, ctrl: oCtrl };
      } else {
        p.lbl.setText(sHeader);
      }

      return this._hdrFilter.boxesByKey[sKey];
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

  // 1) prova a leggere la key dalla inner column (spesso vuota)
  var sKey = this._normKeyFromInnerCol(c);

  // 2) fallback: usa la corrispondente colonna MDC (mappa per indice)
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
}.bind(this));

// se okKeys è 0, per te non è un "success" vero: forza retry
if (!okKeys) {
  this._dbg("inject attempt FAIL: 0 keys resolved", { reason: reason, attempt: attempt });
  return false;
}


        // cleanup box non piu' presenti
        var boxes = (this._hdrFilter && this._hdrFilter.boxesByKey) || {};
        Object.keys(boxes).forEach(function (k) {
          if (!seen[k]) {
            try { if (boxes[k] && boxes[k].box) boxes[k].box.destroy(); } catch (e) {  }
            delete boxes[k];
          }
        });

        // header height coerente con show/hide
        var oUi = this.getView().getModel("ui");
        var bShow = !!(oUi && oUi.getProperty("/showHeaderFilters"));
        this._setInnerHeaderHeight(oInner, bShow);

        // allinea stato controlli ai filtri correnti
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

      // attendo initialized + qualche retry (perche' la inner table e le colonne arrivano dopo rebind)
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

    // Bottone "filtri per colonna" -> show/hide dentro header
    onOpenColumnFilters: function () {
      this._dbg("CLICK onOpenColumnFilters()");
      var oUi = this.getView().getModel("ui");
      var bNow = !!(oUi && oUi.getProperty("/showHeaderFilters"));
      var bNew = !bNow;

      this._dbg("toggle showHeaderFilters", { bNow: bNow, bNew: bNew });
      this._getInnerTable(true);

      if (oUi) oUi.setProperty("/showHeaderFilters", bNew);

      // assicurati che i controlli siano presenti e aggiorna altezza header
      
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

    // =========================
    // Sort dialog (come prima)
    // =========================
    onOpenSort: function () {
      var oDetail = this.getView().getModel("detail");
      var aCfg02 = (oDetail && oDetail.getProperty("/_mmct/s02")) || [];
      var that = this;

      sap.ui.require(["sap/m/Dialog", "sap/m/Button", "sap/m/VBox", "sap/m/Label"], function (Dialog, Button, VBoxDlg, Label) {
        try {
          if (that._dlgSort) {
            that._syncSortDialogFromState();
            that._dlgSort.open();
            return;
          }

          var vbox = new VBoxDlg({ width: "100%", renderType: "Bare" });

          var cbField = new ComboBox({ width: "24rem", allowCustomValues: false, placeholder: "Campo..." });
          (aCfg02 || []).forEach(function (f) {
            if (!f || !f.ui) return;
            cbField.addItem(new Item({ key: String(f.ui), text: String(f.label || f.ui) }));
          });

          var cbDir = new ComboBox({ width: "24rem", allowCustomValues: false });
          cbDir.addItem(new Item({ key: "ASC", text: "Ascendente" }));
          cbDir.addItem(new Item({ key: "DESC", text: "Discendente" }));

          that._sortCtrls = { field: cbField, dir: cbDir };

          vbox.addItem(new Label({ text: "Ordina per", width: "100%" }));
          vbox.addItem(cbField);
          vbox.addItem(new Label({ text: "Direzione", width: "100%", class: "sapUiTinyMarginTop" }));
          vbox.addItem(cbDir);

          var dlg = new Dialog({
            title: "Ordinamento",
            contentWidth: "30rem",
            content: [vbox],
            beginButton: new Button({
              text: "Applica",
              type: "Emphasized",
              press: function () {
                that._readSortDialogToState();
                that._applyFiltersAndSort();
                dlg.close();
              }
            }),
            endButton: new Button({
              text: "Reset",
              press: function () {
                that._sortState = null;
                that._syncSortDialogFromState(true);
                that._applyFiltersAndSort();
              }
            })
          });

          that.getView().addDependent(dlg);
          that._dlgSort = dlg;

          that._syncSortDialogFromState();
          dlg.open();

        } catch (e) {
          console.error("[S4] onOpenSort ERROR", e);
          MessageToast.show("Errore apertura ordinamento");
        }
      });
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
          this._applyGroupStatusToRows(aRemain, "CH", false);
          oDetail.setProperty("/__status", "CH");
          oDetail.setProperty("/__canEdit", true);
          oDetail.setProperty("/__canAddRow", true);
          oDetail.setProperty("/__canApprove", false);
          oDetail.setProperty("/__canReject", false);
        }

        oDetail.setProperty("/RowsAll", aRemain);
        oDetail.setProperty("/__dirty", true);

        var oVm = this._ensureVmCache();
        var sKey = this._getCacheKeySafe();
        var sGuidKeySel = this._toStableString(oDetail.getProperty("/guidKey"));
        var sFibraSel = this._toStableString(oDetail.getProperty("/Fibra"));

        var aCacheAll = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || [];
        if (!Array.isArray(aCacheAll)) aCacheAll = [];

        aCacheAll = aCacheAll.filter(function (r) {
          return !(this._rowGuidKey(r) === sGuidKeySel && this._rowFibra(r) === sFibraSel);
        }.bind(this));

        aCacheAll = aCacheAll.concat(aRemain);
        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aCacheAll);

        if (sRole === "E" && oDetail.getProperty("/__status") === "CH") {
          this._updateVmRecordStatus(sKey, sGuidKeySel, sFibraSel, sRole, "CH");
        }

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
        var sKey = this._getCacheKeySafe();

        var sGuidKeySel = this._toStableString(oDetail.getProperty("/guidKey"));
        var sFibraSel = this._toStableString(oDetail.getProperty("/Fibra"));

        var aCacheAll = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || [];
        if (!Array.isArray(aCacheAll)) aCacheAll = [];

        aCacheAll = aCacheAll.filter(function (r) {
          return !(this._rowGuidKey(r) === sGuidKeySel && this._rowFibra(r) === sFibraSel);
        }.bind(this));

        aCacheAll = aCacheAll.concat(aRowsAll);
        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aCacheAll);

        var sRole = String(oDetail.getProperty("/__role") || "").trim().toUpperCase();
        var sStatus = String(oDetail.getProperty("/__status") || "ST").trim().toUpperCase();
        this._updateVmRecordStatus(sKey, sGuidKeySel, sFibraSel, sRole, sStatus);

        this._snapshotRows = deepClone(aRowsAll);
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

        var oNew = deepClone(oBase) || {};
        delete oNew.__metadata;
        oNew.__readOnly = false;

        oNew.Stato = "CH";
        oNew.Approved = 0;
        oNew.Rejected = 0;
        oNew.ToApprove = 1;

        oNew.__localId = "NEW_" + Date.now() + "_" + Math.floor(Math.random() * 100000);

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

        this._applyGroupStatusToRows(aRowsAll2, "CH", false);

        aRowsAll2.push(oNew);
        aRows2.push(oNew);

        oDetail.setProperty("/RowsAll", aRowsAll2);
        oDetail.setProperty("/__status", "CH");
        oDetail.setProperty("/__canEdit", true);
        oDetail.setProperty("/__canAddRow", true);
        oDetail.setProperty("/__canApprove", false);
        oDetail.setProperty("/__canReject", false);
        oDetail.setProperty("/__dirty", true);

        var oVm = this._ensureVmCache();
        var sKey = this._getCacheKeySafe();

        var aCacheAll = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || [];
        if (!Array.isArray(aCacheAll)) aCacheAll = [];

        var sGuidKeySel = this._toStableString(oDetail.getProperty("/guidKey"));
        var sFibraSel = this._toStableString(oDetail.getProperty("/Fibra"));

        aCacheAll.forEach(function (r) {
          if (this._rowGuidKey(r) === sGuidKeySel && this._rowFibra(r) === sFibraSel) {
            r.Stato = "CH";
            r.Approved = 0;
            r.Rejected = 0;
            r.ToApprove = 1;
          }
        }.bind(this));

        aCacheAll = aCacheAll.slice();
        aCacheAll.push(oNew);

        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aCacheAll);

        var sRole = String(oDetail.getProperty("/__role") || "").trim().toUpperCase();
        this._updateVmRecordStatus(sKey, sGuidKeySel, sFibraSel, sRole, "CH");

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

    // =========================
    // NavBack
    // =========================
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
 