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
      } catch (e) { /* ignore */ }

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
      if (bMockS4) {
        var sVendorName = "CITY MODELES";
        try {
          var aVend = (oVm && (oVm.getProperty("/userVendors") || oVm.getProperty("/UserInfosVend"))) || [];
          var vId = String(this._sVendorId || "").trim();
          var oV = aVend.find(function (x) { return String(x && x.Fornitore) === vId; });
          if (oV && oV.ReagSoc) sVendorName = oV.ReagSoc;
        } catch (e0) { /* ignore */ }

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
