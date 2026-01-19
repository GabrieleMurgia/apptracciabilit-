/* // webapp/controller/Screen3.controller.js
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
  VBox
) {
  "use strict";

  function ts() { return new Date().toISOString(); }
  function deepClone(x) { try { return JSON.parse(JSON.stringify(x)); } catch (e) { return x; } }

  return Controller.extend("apptracciabilita.apptracciabilita.controller.Screen3", {
    onInit: function () {
      this._log("onInit");

      var oRouter = this.getOwnerComponent().getRouter();
      oRouter.getRoute("Screen3").attachPatternMatched(this._onRouteMatched, this);

      var oDetail = new JSONModel({
        VendorId: "",
        Material: "",
        RecordsAll: [],
        Records: [],
        RecordsCount: 0,
        _mmct: { cat: "", s01: [], s02: [] },

        __q: "",
        __statusFilter: ""
      });
      this.getView().setModel(oDetail, "detail");

      this._snapshotRecords = null;

      this._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {} };

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

      var oDetail = this.getView().getModel("detail");
      oDetail.setData({
        VendorId: this._sVendorId,
        Material: this._sMaterial,
        RecordsAll: [],
        Records: [],
        RecordsCount: 0,
        _mmct: { cat: "", s01: [], s02: [] },

        __q: "",
        __statusFilter: ""
      }, true);

      this._logTable("TABLE STATE @ before _loadDataOnce");
      this._loadDataOnce();
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
        required: s === "O", // O = Obbligatorio
        locked: s === "B"    // B = Bloccato
      };
    },

    _isMultipleField: function (c) {
      var s = String((c && (c.MultipleVal ?? c.MULTIPLEVAL)) || "").trim().toUpperCase();
      return s === "X"; // X = multi valori
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
          // MULTI + Dominio -> MultiComboBox (solo valori di dominio)
          oEditCtrl = new MultiComboBox({
            visible: "{= !" + sReadOnlyExpr + " }",
            enabled: !bLocked,
            allowCustomValues: false,
            selectedKeys: sValueBind, // array
            valueState: sValueState,
            valueStateText: sValueStateText,
            items: {
              path: "vm>/domainsByName/" + sDomain,
              template: new Item({ key: "{vm>key}", text: "{vm>text}" })
            }
          });
        } else {
          // SINGLE + Dominio -> ComboBox
          oEditCtrl = new ComboBox({
            visible: "{= !" + sReadOnlyExpr + " }",
            enabled: !bLocked,
            allowCustomValues: false,
            selectedKey: sValueBind, // string
            valueState: sValueState,
            valueStateText: sValueStateText,
            items: {
              path: "vm>/domainsByName/" + sDomain,
              template: new Item({ key: "{vm>key}", text: "{vm>text}" })
            }
          });
        }

      } else {
        // NO Dominio -> Input libero
        oEditCtrl = new Input({
          visible: "{= !" + sReadOnlyExpr + " }",
          editable: !bLocked,
          value: sValueBind,
          valueState: sValueState,
          valueStateText: sValueStateText
        });
      }

      return new HBox({
        items: [oText, oEditCtrl]
      });
    },

    _createStatusCellTemplate: function (sKey) {
      // normalizzo: se arriva "STATO" uso comunque "Stato"
      var sBindKey = (String(sKey || "").toUpperCase() === "STATO") ? "Stato" : sKey;

      var sStateExpr =
        "{= ${detail>" + sBindKey + "} === 'AP' ? 'Success' : " +
        "(${detail>" + sBindKey + "} === 'RJ' ? 'Error' : " +
        "(${detail>" + sBindKey + "} === 'CH' ? 'Information' : " +
        "(${detail>" + sBindKey + "} === 'ST' ? 'Warning' : 'None')))}";

      return new HBox({
        width: "100%",
        justifyContent: "Center",
        alignItems: "Center",
        items: [
          new ObjectStatus({
            text: "", // solo cerchio
            icon: "sap-icon://circle-task",
            state: sStateExpr,
            tooltip: "{= 'Stato: ' + (${detail>" + sBindKey + "} || '') }"
          })
        ]
      });
    },

    // =========================
    // CACHE
    // =========================
    _getCacheKeySafe: function () {
      return encodeURIComponent((this._sVendorId || "") + "||" + (this._sMaterial || ""));
    },

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

    _loadDataOnce: function () {
      var oVm = this._ensureVmCache();
      var sKey = this._getCacheKeySafe();

      var aRows = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || null;
      var aRecs = oVm.getProperty("/cache/recordsByKey/" + sKey) || null;

      this._log("_loadDataOnce cacheKey", sKey, {
        cachedRows: aRows ? aRows.length : null,
        cachedRecs: aRecs ? aRecs.length : null
      });

      if (Array.isArray(aRows) && aRows.length && Array.isArray(aRecs) && aRecs.length) {
        this._hydrateMmctFromRows(aRows);
        this._bindRecords(aRecs);
        return;
      }

      this._reloadDataFromBackend(function (aResults) {
        this._log("_reloadDataFromBackend returned", aResults.length);

        this._hydrateMmctFromRows(aResults);

        var aRecordsBuilt = this._buildRecords01(aResults);

        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aResults);
        oVm.setProperty("/cache/recordsByKey/" + sKey, aRecordsBuilt);

        this._bindRecords(aRecordsBuilt);
      }.bind(this));
    },

    // =========================
    // MMCT -> colonne
    // =========================
    _getMmctCfgForCat: function (sCat) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var aUserInfos = (oVm && (oVm.getProperty("/UserInfosMMCT") || oVm.getProperty("/userInfosMMCT"))) || [];
      if (!Array.isArray(aUserInfos)) return [];
      var oCat = aUserInfos.find(function (x) { return String(x && x.CatMateriale) === String(sCat); });
      var aFields = (oCat && oCat.UserMMCTFields && oCat.UserMMCTFields.results) ? oCat.UserMMCTFields.results : [];
      return Array.isArray(aFields) ? aFields : [];
    },

    _cfgForScreen: function (sCat, sScreen) {
      var a = this._getMmctCfgForCat(sCat) || [];
      var sTarget = String(sScreen || "").padStart(2, "0");

      return (a || [])
        .filter(function (c) { return String(c.LivelloSchermata || "").padStart(2, "0") === sTarget; })
        .map(function (c) {
          var ui = String(c.UiFieldname || c.UIFIELDNAME || "").trim();
          if (!ui) return null;

          var label = (c.Descrizione || c.DESCRIZIONE || ui);
          var domain = String(c.Dominio ?? c.DOMINIO ?? c.Domain ?? c.DOMAIN ?? "").trim();

          var flags = this._getSettingFlags(c);
          var required = !!flags.required; // O
          var locked = !!flags.locked;     // B
          var multiple = this._isMultipleField(c); // MultipleVal

          return { ui: ui, label: label, domain: domain, required: required, locked: locked, multiple: multiple };
        }.bind(this))
        .filter(Boolean);
    },

    _hydrateMmctFromRows: function (aRows) {
      var r0 = (Array.isArray(aRows) && aRows.length) ? (aRows[0] || {}) : {};
      var sCat = String(r0.CatMateriale || "").trim();

      var oDetail = this.getView().getModel("detail");
      var a01 = sCat ? this._cfgForScreen(sCat, "01") : [];
      var a02 = sCat ? this._cfgForScreen(sCat, "02") : [];
      oDetail.setProperty("/_mmct", { cat: sCat, s01: a01, s02: a02 });

      this._log("_hydrateMmctFromRows", { cat: sCat, s01Count: a01.length, s02Count: a02.length });
    },

    // =========================
    // ODATA / MOCK
    // =========================
    _reloadDataFromBackend: function (fnDone) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var sForceStato = String(mock.forceStato || "").trim().toUpperCase(); // ST/AP/RJ/CH/""
      var bMockS3 = !!mock.mockS3;

      var sUserId = (oVm && oVm.getProperty("/userId")) || "E_ZEMAF";
      var oODataModel = this.getOwnerComponent().getModel();

      function norm(v) { return String(v || "").trim().toUpperCase(); }
      function done(a) { if (typeof fnDone === "function") fnDone(a || []); }

      // =========================
      // MOCK via util/mockData.js
      // =========================
      if (bMockS3) {
        var sVendorName = "CITY MODELES";
        try {
          var aVend = (oVm && (oVm.getProperty("/userVendors") || oVm.getProperty("/UserInfosVend"))) || [];
          var vId = String(this._sVendorId || "").trim();
          var oV = aVend.find(function (x) { return String(x && x.Fornitore) === vId; });
          if (oV && oV.ReagSoc) sVendorName = oV.ReagSoc;
        } catch (e0) {  }

        // cat: prima disponibile da mmctFieldsByCat, altrimenti CF
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

        this._log("[MOCK] buildDataSetRows", { rows: aMock.length, forceStato: sForceStato || "(none)", cat: sCat });
        done(aMock);
        return;
      }

      // =========================
      // BACKEND READ normale
      // =========================
      var sVendor2 = String(this._sVendorId || "").trim();
      if (/^\d+$/.test(sVendor2) && sVendor2.length < 10) sVendor2 = sVendor2.padStart(10, "0");

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
          debugger
          BusyIndicator.hide();
          var a = (oData && oData.results) || [];

          // forza stato (se impostato in Screen0)
          if (sForceStato === "ST" || sForceStato === "AP" || sForceStato === "RJ" || sForceStato === "CH") {
            a.forEach(function (r) { r.Stato = sForceStato; });
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

      // mappa campi multi
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

      // ruolo (I/E/S)
      var oVm = this.getOwnerComponent().getModel("vm");
      var sRole = (oVm && oVm.getProperty("/userType")) || "";
      sRole = String(sRole || "").trim().toUpperCase();

      // forceStato (da Screen0)
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var sForce = String(mock.forceStato || "").trim().toUpperCase();

      function normStato(r) {
        if (sForce === "ST" || sForce === "AP" || sForce === "RJ" || sForce === "CH") return sForce;

        var s = String((r && (r.Stato || r.STATO)) || "").trim().toUpperCase();
        if (s === "ST" || s === "AP" || s === "RJ" || s === "CH") return s;

        // fallback se backend lascia Stato vuoto
        var ap = this._getApprovedFlag(r);
        if (ap === 1) return "AP";

        var rej = parseInt(String(r.Rejected || r.REJECTED || "0"), 10) || 0;
        if (rej > 0) return "RJ";

        var pend = parseInt(String(r.ToApprove || r.TOAPPROVE || "0"), 10) || 0;
        if (pend > 0) return "ST";

        return "ST";
      }

      function rank(st) {
        if (st === "AP") return 4;
        if (st === "CH") return 3;
        if (st === "RJ") return 2;
        return 1;
      }
      function mergeStatus(a, b) { return (rank(b) > rank(a)) ? b : a; }

      // permessi
      function canEdit(role, status) {
        if (role === "S") return false;
        if (role === "I") return false;
        if (role === "E") return status !== "AP";
        return false;
      }
      function canApprove(role, status) {
        return role === "I" && (status === "ST" || status === "CH");
      }
      function canReject(role, status) {
        return role === "I" && (status === "ST" || status === "CH");
      }

      this._log("_buildRecords01 role", sRole, "cols", aCols01.length);

      var m = {};
      var a = [];

      (aAllRows || []).forEach(function (r) {
        var sGuidKey = this._rowGuidKey(r);
        var sFibra = this._rowFibra(r);
        var sKey = sGuidKey + "||" + sFibra;

        var stRow = normStato.call(this, r);

        var oRec = m[sKey];

        if (!oRec) {
          oRec = {
            idx: a.length,
            guidKey: sGuidKey,
            Fibra: sFibra,

            Stato: stRow,
            __status: stRow,

            __canEdit: canEdit(sRole, stRow),
            __canApprove: canApprove(sRole, stRow),
            __canReject: canReject(sRole, stRow),

            __readOnly: !canEdit(sRole, stRow)
          };

          aCols01.forEach(function (c) {
            var v = (r && r[c] !== undefined) ? r[c] : "";
            oRec[c] = mIsMulti[c] ? toArray(v) : v;
          });

          m[sKey] = oRec;
          a.push(oRec);

        } else {
          var merged = mergeStatus(oRec.__status, stRow);
          if (merged !== oRec.__status) {
            oRec.__status = merged;
            oRec.Stato = merged;

            oRec.__canEdit = canEdit(sRole, merged);
            oRec.__canApprove = canApprove(sRole, merged);
            oRec.__canReject = canReject(sRole, merged);

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
        var oCtx = oBtn && oBtn.getBindingContext && (
          oBtn.getBindingContext("detail") || oBtn.getBindingContext()
        );

        if (!oCtx) return;

        var oRow = oCtx.getObject && oCtx.getObject();
        var iIdx = (oRow && oRow.idx != null) ? parseInt(oRow.idx, 10) : NaN;

        if (isNaN(iIdx) && oCtx.getPath) {
          var sPath = String(oCtx.getPath() || "");
          var mm = sPath.match(/\/(\d+)\s*$/);
          if (mm) iIdx = parseInt(mm[1], 10);
        }
        if (isNaN(iIdx) || iIdx < 0) iIdx = 0;

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
    // P13N force visible
    // =========================
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

    _ensureMdcCfgScreen3: function (aCfg01) {
      var oVm = this.getOwnerComponent().getModel("vm");

      var aProps = (aCfg01 || []).map(function (f) {
        var name = f.ui;

        // normalizzo eventuale "STATO" -> "Stato"
        if (String(name || "").toUpperCase() === "STATO") name = "Stato";

        return {
          name: name,
          label: f.label || name,
          dataType: "String",
          domain: f.domain || "",
          required: !!f.required
        };
      });

      // se manca, aggiungo la property "Stato" per p13n/sort ecc.
      var hasStato = aProps.some(function (p) {
        return String(p && p.name || "").toUpperCase() === "STATO";
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

  // 1) NAV colonna (sempre prima)
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

  // 2) STATO (sempre seconda)
  this._colStatoS3 = new MdcColumn({
    width: "60px",
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

    var sH = String(sHeader || "").trim().toUpperCase();
    var sK = String(sKey || "").trim().toUpperCase();

    // skip Guid/UserId (solo colonna)
    if (sH === "GUID" || sH === "USERID" || sK === "GUID" || sK === "USERID") return;

    // se MMCT contiene STATO: aggiorno solo l'header della colonna Stato (2ª) e non la ricreo
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
    // FILTER STATUS + TEXT (client side)
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
        // filtro stato
        if (sStatus) {
          var st = String((r && (r.__status || r.Stato)) || "").trim().toUpperCase();
          if (st !== sStatus) return false;
        }

        // filtro testo
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

      // ---- FILTRI PER-COLONNA (header input) ----
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

// ---- SORT PER-COLONNA (header icon) ----
var st = (this._inlineFS && this._inlineFS.sort) || { key: "", desc: false };
if (st.key) {
  var key = st.key;
  var desc = !!st.desc;

  aFiltered.sort(function (a, b) {
    var va = (a && a[key] != null) ? a[key] : "";
    var vb = (b && b[key] != null) ? b[key] : "";
    if (Array.isArray(va)) va = va.join(", ");
    if (Array.isArray(vb)) vb = vb.join(", ");
    va = String(va);
    vb = String(vb);

    // localeCompare con numeric:true ti ordina bene anche "2" < "10"
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

    _getInnerTableFromMdc: function (oMdcTbl) {
  // robust: MDC cambia internamente, quindi provo più strade
  return (oMdcTbl && (
    (typeof oMdcTbl.getTable === "function" && oMdcTbl.getTable()) ||
    oMdcTbl._oTable ||
    (typeof oMdcTbl.getContent === "function" && oMdcTbl.getContent())
  )) || null;
},

_refreshInlineSortIcons: function () {
  var st = (this._inlineFS && this._inlineFS.sort) || { key: "", desc: false };
  var mBtns = (this._inlineFS && this._inlineFS.sortBtns) || {};
  Object.keys(mBtns).forEach(function (k) {
    var b = mBtns[k];
    if (!b || !b.setIcon) return;
    if (!st.key || st.key !== k) {
      b.setIcon("sap-icon://sort");
    } else {
      b.setIcon(st.desc ? "sap-icon://sort-descending" : "sap-icon://sort-ascending");
    }
  });
},

_onInlineColFilterLiveChange: function (oEvt) {
  var oInput = oEvt.getSource();
  var sField = oInput && oInput.data && oInput.data("field");
  if (!sField) return;

  var sVal = String(oEvt.getParameter("value") || "");
  if (!this._inlineFS) this._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {} };
  if (!this._inlineFS.filters) this._inlineFS.filters = {};
  this._inlineFS.filters[sField] = sVal;

  this._applyClientFilters(); // usa la tua funzione già esistente
},

_onInlineColSortPress: function (oEvt) {
  var oBtn = oEvt.getSource();
  var sField = oBtn && oBtn.data && oBtn.data("field");
  if (!sField) return;

  if (!this._inlineFS) this._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {} };
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
  var len = Math.min(aMdcCols.length, aInnerCols.length);

  if (!this._inlineFS) this._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {} };
  if (!this._inlineFS.sortBtns) this._inlineFS.sortBtns = {};

  for (var i = 0; i < len; i++) {
    var mdcCol = aMdcCols[i];
    var innerCol = aInnerCols[i];
    if (!innerCol || typeof innerCol.setHeader !== "function") continue;

    // evita doppia decorazione
    if (innerCol.data && innerCol.data("__inlineFS") === true) continue;

    var sField =
      (mdcCol && (
        (typeof mdcCol.getPropertyKey === "function" && mdcCol.getPropertyKey()) ||
        (typeof mdcCol.getDataProperty === "function" && mdcCol.getDataProperty())
      )) || "";

    // NAV colonna "Dettaglio" non ha propertyKey/dataProperty -> skip
    if (!sField) continue;

    var sHeader = (typeof mdcCol.getHeader === "function" && mdcCol.getHeader()) || sField;

    // sort button
    var oSortBtn = new sap.m.Button({
      type: "Transparent",
      icon: "sap-icon://sort",
      press: this._onInlineColSortPress.bind(this)
    });
    oSortBtn.data("field", sField);
    this._inlineFS.sortBtns[sField] = oSortBtn;

    // filter input (valore persistente se già filtrato)
    var oInp = new sap.m.Input({
      width: "100%",
      placeholder: "Filtra...",
      liveChange: this._onInlineColFilterLiveChange.bind(this)
    });
    oInp.data("field", sField);
    oInp.setValue(String((this._inlineFS.filters && this._inlineFS.filters[sField]) || ""));

    var oTitle = new sap.m.Text({ text: sHeader, wrapping: false });

    var oH = new sap.m.HBox({
      justifyContent: "SpaceBetween",
      alignItems: "Center",
      items: [oTitle, oSortBtn]
    });

    var oV = new sap.m.VBox({ items: [oH, oInp] });

    innerCol.setHeader(oV);
    if (innerCol.data) innerCol.data("__inlineFS", true);
  }

  this._refreshInlineSortIcons();
},


    _bindRecords: async function (aRecords) {
      var oDetail = this.getView().getModel("detail");
      var a = aRecords || [];

      oDetail.setProperty("/RecordsAll", a);
      oDetail.setProperty("/Records", a);
      oDetail.setProperty("/RecordsCount", a.length);

      this._snapshotRecords = deepClone(a);

      var oTbl = this.byId("mdcTable3");
      var aCfg01 = oDetail.getProperty("/_mmct/s01") || [];
      this._ensureMdcCfgScreen3(aCfg01);

      await this._rebuildColumnsHard(oTbl, aCfg01);

      await this._applyInlineHeaderFilterSort(oTbl);

      if (oTbl && oTbl.initialized) await oTbl.initialized();
      if (oTbl) oTbl.setModel(oDetail, "detail");

      this._applyClientFilters();

      if (oTbl && typeof oTbl.rebind === "function") oTbl.rebind();

      await this._forceP13nAllVisible(oTbl, "t0");
      await this._applyInlineHeaderFilterSort(oTbl);
      setTimeout(function () { this._forceP13nAllVisible(oTbl, "t300"); 

        setTimeout(function () { this._applyInlineHeaderFilterSort(oTbl); }.bind(this), 350);
      }.bind(this), 300);
      

      this._logTable("TABLE STATE @ after _bindRecords");
    },

    // =========================
    // Filter (testuale)
    // =========================
    onGlobalFilter: function (oEvt) {
      var q = String(oEvt.getParameter("value") || "").trim();
      var oDetail = this.getView().getModel("detail");
      oDetail.setProperty("/__q", q);
      this._applyClientFilters();
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
}); */

/* 
// webapp/controller/Screen3.controller.js
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
  "sap/m/VBox"
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
  VBox
) {
  "use strict";

  function ts() { return new Date().toISOString(); }
  function deepClone(x) { try { return JSON.parse(JSON.stringify(x)); } catch (e) { return x; } }

  return Controller.extend("apptracciabilita.apptracciabilita.controller.Screen3", {
    onInit: function () {
      this._log("onInit");

      var oRouter = this.getOwnerComponent().getRouter();
      oRouter.getRoute("Screen3").attachPatternMatched(this._onRouteMatched, this);

      var oDetail = new JSONModel({
        VendorId: "",
        Material: "",
        RecordsAll: [],
        Records: [],
        RecordsCount: 0,
        _mmct: { cat: "", s01: [], s02: [] },

        __q: "",
        __statusFilter: ""
      });
      this.getView().setModel(oDetail, "detail");

      this._snapshotRecords = null;
      this._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {} };

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

      var oDetail = this.getView().getModel("detail");
      oDetail.setData({
        VendorId: this._sVendorId,
        Material: this._sMaterial,
        RecordsAll: [],
        Records: [],
        RecordsCount: 0,
        _mmct: { cat: "", s01: [], s02: [] },

        __q: "",
        __statusFilter: ""
      }, true);

      this._logTable("TABLE STATE @ before _loadDataOnce");
      this._loadDataOnce();
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
        required: s === "O", // O = Obbligatorio
        locked: s === "B",    // B = Bloccato
        hidden: s === "N"
      };
    },

    _isMultipleField: function (c) {
      var s = String((c && (c.MultipleVal ?? c.MULTIPLEVAL)) || "").trim().toUpperCase();
      return s === "X"; // X = multi valori
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

      return new HBox({
        items: [oText, oEditCtrl]
      });
    },

    _createStatusCellTemplate: function (sKey) {
      var sBindKey = (String(sKey || "").toUpperCase() === "STATO") ? "Stato" : sKey;

      var sStateExpr =
        "{= ${detail>" + sBindKey + "} === 'AP' ? 'Success' : " +
        "(${detail>" + sBindKey + "} === 'RJ' ? 'Error' : " +
        "(${detail>" + sBindKey + "} === 'CH' ? 'Information' : " +
        "(${detail>" + sBindKey + "} === 'ST' ? 'Warning' : 'None')))}";

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
    // CACHE
    // =========================
    _getCacheKeySafe: function () {
      return encodeURIComponent((this._sVendorId || "") + "||" + (this._sMaterial || ""));
    },

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

    _isMockS3Enabled: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      return !!(mock && mock.mockS3);
    },

    _loadDataOnce: function () {
      var oVm = this._ensureVmCache();
      var sBaseKey = this._getCacheKeySafe();

      // ====== PATCH: separo cache REAL vs MOCK (così se toggli da Screen0 non “erediti” roba vecchia) ======
      var bMockS3 = this._isMockS3Enabled();
      var sKey = (bMockS3 ? "MOCK|" : "REAL|") + sBaseKey;
      // ================================================================================================

      var aRows = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || null;
      var aRecs = oVm.getProperty("/cache/recordsByKey/" + sKey) || null;

      this._log("_loadDataOnce cacheKey", sKey, {
        mockS3: bMockS3,
        cachedRows: aRows ? aRows.length : null,
        cachedRecs: aRecs ? aRecs.length : null
      });

      if (Array.isArray(aRows) && aRows.length && Array.isArray(aRecs) && aRecs.length) {
        this._hydrateMmctFromRows(aRows);
        this._bindRecords(aRecs);
        return;
      }

      this._reloadDataFromBackend(function (aResults) {
        this._log("_reloadDataFromBackend returned", aResults.length);

        this._hydrateMmctFromRows(aResults);

        var aRecordsBuilt = this._buildRecords01(aResults);

        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aResults);
        oVm.setProperty("/cache/recordsByKey/" + sKey, aRecordsBuilt);

        this._bindRecords(aRecordsBuilt);
      }.bind(this));
    },

    // =========================
    // MMCT -> colonne
    // =========================
    _getMmctCfgForCat: function (sCat) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var aUserInfos = (oVm && (oVm.getProperty("/UserInfosMMCT") || oVm.getProperty("/userInfosMMCT"))) || [];
      if (!Array.isArray(aUserInfos)) return [];
      var oCat = aUserInfos.find(function (x) { return String(x && x.CatMateriale) === String(sCat); });
      var aFields = (oCat && oCat.UserMMCTFields && oCat.UserMMCTFields.results) ? oCat.UserMMCTFields.results : [];
      return Array.isArray(aFields) ? aFields : [];
    },

     _cfgForScreen: function (sCat, sScreen) {
      var a = this._getMmctCfgForCat(sCat) || [];
      var sTarget = String(sScreen || "").padStart(2, "0");

      return (a || [])
        .filter(function (c) { return String(c.LivelloSchermata || "").padStart(2, "0") === sTarget; })
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
_cfgForScreen: function (sCat, sScreen) {
  var a = this._getMmctCfgForCat(sCat) || [];
  var sTarget = String(sScreen || "").padStart(2, "0");

  return (a || [])
    .filter(function (c) { return String(c.LivelloSchermata || "").padStart(2, "0") === sTarget; })
    .map(function (c) {
      var ui = String(c.UiFieldname || c.UIFIELDNAME || "").trim();
      if (!ui) return null;

      var label = (c.Descrizione || c.DESCRIZIONE || ui);
      var domain = String(c.Dominio ?? c.DOMINIO ?? c.Domain ?? c.DOMAIN ?? "").trim();

      var flags = this._getSettingFlags(c);
      if (flags.hidden) return null; // <<< N = hidden: non creare proprio il campo

      var required = !!flags.required;
      var locked = !!flags.locked;
      var multiple = this._isMultipleField(c);

      return { ui: ui, label: label, domain: domain, required: required, locked: locked, multiple: multiple };
    }.bind(this))
    .filter(Boolean);
},

    _hydrateMmctFromRows: function (aRows) {
      var r0 = (Array.isArray(aRows) && aRows.length) ? (aRows[0] || {}) : {};
      var sCat = String(r0.CatMateriale || "").trim();

      var oDetail = this.getView().getModel("detail");
      var a01 = sCat ? this._cfgForScreen(sCat, "01") : [];
      var a02 = sCat ? this._cfgForScreen(sCat, "02") : [];
      oDetail.setProperty("/_mmct", { cat: sCat, s01: a01, s02: a02 });

      this._log("_hydrateMmctFromRows", { cat: sCat, s01Count: a01.length, s02Count: a02.length });
    },

    // =========================
    // ODATA / MOCK
    // =========================
    _reloadDataFromBackend: function (fnDone) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var sForceStato = String(mock.forceStato || "").trim().toUpperCase(); // ST/AP/RJ/CH/""
      var bMockS3 = !!mock.mockS3;

      var sUserId = (oVm && oVm.getProperty("/userId")) || "E_ZEMAF";
      var oODataModel = this.getOwnerComponent().getModel();

      function norm(v) { return String(v || "").trim().toUpperCase(); }
      function done(a) { if (typeof fnDone === "function") fnDone(a || []); }

      // =========================
      // MOCK: come “dati reali” (ritorna la lista righe DataSet e poi pipeline identica)
      // =========================
      if (bMockS3) {
        BusyIndicator.show(0);

        MockData.loadDataSetGeneric().then(function (aAll) {
          BusyIndicator.hide();

          var a = Array.isArray(aAll) ? aAll : [];
          // forza stato (se impostato in Screen0)
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

      // =========================
      // BACKEND READ normale
      // =========================
      var sVendor2 = String(this._sVendorId || "").trim();
      if (/^\d+$/.test(sVendor2) && sVendor2.length < 10) sVendor2 = sVendor2.padStart(10, "0");

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

          // forza stato (se impostato in Screen0)
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

      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var sForce = String(mock.forceStato || "").trim().toUpperCase();

      function normStato(r) {
        if (sForce === "ST" || sForce === "AP" || sForce === "RJ" || sForce === "CH") return sForce;

        var s = String((r && (r.Stato || r.STATO)) || "").trim().toUpperCase();
        if (s === "ST" || s === "AP" || s === "RJ" || s === "CH") return s;

        var ap = this._getApprovedFlag(r);
        if (ap === 1) return "AP";

        var rej = parseInt(String(r.Rejected || r.REJECTED || "0"), 10) || 0;
        if (rej > 0) return "RJ";

        var pend = parseInt(String(r.ToApprove || r.TOAPPROVE || "0"), 10) || 0;
        if (pend > 0) return "ST";

        return "ST";
      }

      function rank(st) {
        if (st === "AP") return 4;
        if (st === "CH") return 3;
        if (st === "RJ") return 2;
        return 1;
      }
      function mergeStatus(a, b) { return (rank(b) > rank(a)) ? b : a; }

      function canEdit(role, status) {
        if (role === "S") return false;
        if (role === "I") return false;
        if (role === "E") return status !== "AP";
        return false;
      }
      function canApprove(role, status) {
        return role === "I" && (status === "ST" || status === "CH");
      }
      function canReject(role, status) {
        return role === "I" && (status === "ST" || status === "CH");
      }

      this._log("_buildRecords01 role", sRole, "cols", aCols01.length);

      var m = {};
      var a = [];

      (aAllRows || []).forEach(function (r) {
        var sGuidKey = this._rowGuidKey(r);
        var sFibra = this._rowFibra(r);
        var sKey = sGuidKey + "||" + sFibra;

        var stRow = normStato.call(this, r);

        var oRec = m[sKey];

        if (!oRec) {
          oRec = {
            idx: a.length,
            guidKey: sGuidKey,
            Fibra: sFibra,

            Stato: stRow,
            __status: stRow,

            __canEdit: canEdit(sRole, stRow),
            __canApprove: canApprove(sRole, stRow),
            __canReject: canReject(sRole, stRow),

            __readOnly: !canEdit(sRole, stRow)
          };

          aCols01.forEach(function (c) {
            var v = (r && r[c] !== undefined) ? r[c] : "";
            oRec[c] = mIsMulti[c] ? toArray(v) : v;
          });

          m[sKey] = oRec;
          a.push(oRec);

        } else {
          var merged = mergeStatus(oRec.__status, stRow);
          if (merged !== oRec.__status) {
            oRec.__status = merged;
            oRec.Stato = merged;

            oRec.__canEdit = canEdit(sRole, merged);
            oRec.__canApprove = canApprove(sRole, merged);
            oRec.__canReject = canReject(sRole, merged);

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
        var oCtx = oBtn && oBtn.getBindingContext && (
          oBtn.getBindingContext("detail") || oBtn.getBindingContext()
        );

        if (!oCtx) return;

        var oRow = oCtx.getObject && oCtx.getObject();
        var iIdx = (oRow && oRow.idx != null) ? parseInt(oRow.idx, 10) : NaN;

        if (isNaN(iIdx) && oCtx.getPath) {
          var sPath = String(oCtx.getPath() || "");
          var mm = sPath.match(/\/(\d+)\s*$/);
          if (mm) iIdx = parseInt(mm[1], 10);
        }
        if (isNaN(iIdx) || iIdx < 0) iIdx = 0;

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
    // P13N force visible
    // =========================
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
        return String(p && p.name || "").toUpperCase() === "STATO";
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

      // 1) NAV colonna (sempre prima)
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

      // 2) STATO (sempre seconda)
      this._colStatoS3 = new MdcColumn({
        width: "60px",
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

        var sH = String(sHeader || "").trim().toUpperCase();
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
    // FILTER STATUS + TEXT (client side)
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

      // ---- FILTRI PER-COLONNA (header input) ----
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

      // ---- SORT PER-COLONNA (header icon) ----
      var st = (this._inlineFS && this._inlineFS.sort) || { key: "", desc: false };
      if (st.key) {
        var key = st.key;
        var desc = !!st.desc;

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

    _getInnerTableFromMdc: function (oMdcTbl) {
      return (oMdcTbl && (
        (typeof oMdcTbl.getTable === "function" && oMdcTbl.getTable()) ||
        oMdcTbl._oTable ||
        (typeof oMdcTbl.getContent === "function" && oMdcTbl.getContent())
      )) || null;
    },

    _refreshInlineSortIcons: function () {
      var st = (this._inlineFS && this._inlineFS.sort) || { key: "", desc: false };
      var mBtns = (this._inlineFS && this._inlineFS.sortBtns) || {};
      Object.keys(mBtns).forEach(function (k) {
        var b = mBtns[k];
        if (!b || !b.setIcon) return;
        if (!st.key || st.key !== k) {
          b.setIcon("sap-icon://sort");
        } else {
          b.setIcon(st.desc ? "sap-icon://sort-descending" : "sap-icon://sort-ascending");
        }
      });
    },

    _onInlineColFilterLiveChange: function (oEvt) {
      var oInput = oEvt.getSource();
      var sField = oInput && oInput.data && oInput.data("field");
      if (!sField) return;

      var sVal = String(oEvt.getParameter("value") || "");
      if (!this._inlineFS) this._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {} };
      if (!this._inlineFS.filters) this._inlineFS.filters = {};
      this._inlineFS.filters[sField] = sVal;

      this._applyClientFilters();
    },

    _onInlineColSortPress: function (oEvt) {
      var oBtn = oEvt.getSource();
      var sField = oBtn && oBtn.data && oBtn.data("field");
      if (!sField) return;

      if (!this._inlineFS) this._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {} };
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
      var len = Math.min(aMdcCols.length, aInnerCols.length);

      if (!this._inlineFS) this._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {} };
      if (!this._inlineFS.sortBtns) this._inlineFS.sortBtns = {};

      for (var i = 0; i < len; i++) {
        var mdcCol = aMdcCols[i];
        var innerCol = aInnerCols[i];
        if (!innerCol || typeof innerCol.setHeader !== "function") continue;

        if (innerCol.data && innerCol.data("__inlineFS") === true) continue;

        var sField =
          (mdcCol && (
            (typeof mdcCol.getPropertyKey === "function" && mdcCol.getPropertyKey()) ||
            (typeof mdcCol.getDataProperty === "function" && mdcCol.getDataProperty())
          )) || "";

        if (!sField) continue;

        var sHeader = (typeof mdcCol.getHeader === "function" && mdcCol.getHeader()) || sField;

        var oSortBtn = new sap.m.Button({
          type: "Transparent",
          icon: "sap-icon://sort",
          press: this._onInlineColSortPress.bind(this)
        });
        oSortBtn.data("field", sField);
        this._inlineFS.sortBtns[sField] = oSortBtn;

        var oInp = new sap.m.Input({
          width: "100%",
          placeholder: "Filtra...",
          liveChange: this._onInlineColFilterLiveChange.bind(this)
        });
        oInp.data("field", sField);
        oInp.setValue(String((this._inlineFS.filters && this._inlineFS.filters[sField]) || ""));

        var oTitle = new sap.m.Text({ text: sHeader, wrapping: false });

        var oH = new sap.m.HBox({
          justifyContent: "SpaceBetween",
          alignItems: "Center",
          items: [oTitle, oSortBtn]
        });

        var oV = new sap.m.VBox({ items: [oH, oInp] });

        innerCol.setHeader(oV);
        if (innerCol.data) innerCol.data("__inlineFS", true);
      }

      this._refreshInlineSortIcons();
    },

    _bindRecords: async function (aRecords) {
      var oDetail = this.getView().getModel("detail");
      var a = aRecords || [];

      oDetail.setProperty("/RecordsAll", a);
      oDetail.setProperty("/Records", a);
      oDetail.setProperty("/RecordsCount", a.length);

      this._snapshotRecords = deepClone(a);

      var oTbl = this.byId("mdcTable3");
      var aCfg01 = oDetail.getProperty("/_mmct/s01") || [];
      this._ensureMdcCfgScreen3(aCfg01);

      await this._rebuildColumnsHard(oTbl, aCfg01);
      await this._applyInlineHeaderFilterSort(oTbl);

      if (oTbl && oTbl.initialized) await oTbl.initialized();
      if (oTbl) oTbl.setModel(oDetail, "detail");

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
    // Filter (testuale)
    // =========================
    onGlobalFilter: function (oEvt) {
      var q = String(oEvt.getParameter("value") || "").trim();
      var oDetail = this.getView().getModel("detail");
      oDetail.setProperty("/__q", q);
      this._applyClientFilters();
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
 */


// webapp/controller/Screen3.controller.js
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
  "sap/m/VBox"
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
  VBox
) {
  "use strict";

  function ts() { return new Date().toISOString(); }
  function deepClone(x) { try { return JSON.parse(JSON.stringify(x)); } catch (e) { return x; } }

  return Controller.extend("apptracciabilita.apptracciabilita.controller.Screen3", {

    onInit: function () {
      this._log("onInit");

      var oRouter = this.getOwnerComponent().getRouter();
      oRouter.getRoute("Screen3").attachPatternMatched(this._onRouteMatched, this);

      //  UI MODEL (come Screen4): toggle filtri header + toggle sort header
      this.getView().setModel(new JSONModel({
        showHeaderFilters: false,
        showHeaderSort: true
      }), "ui");

      var oDetail = new JSONModel({
        VendorId: "",
        Material: "",
        RecordsAll: [],
        Records: [],
        RecordsCount: 0,
        _mmct: { cat: "", s01: [], s02: [] },

        __q: "",
        __statusFilter: ""
      });
      this.getView().setModel(oDetail, "detail");

      this._snapshotRecords = null;

      // Solo header filter/sort (NO dialog)
      this._inlineFS = {
        filters: {},
        sort: { key: "", desc: false },

        // cache controlli header
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

      //  reset toggles header (default come Screen4)
      var oUi = this.getView().getModel("ui");
      if (oUi) {
        oUi.setProperty("/showHeaderFilters", false);
        oUi.setProperty("/showHeaderSort", true);
      }

      var oDetail = this.getView().getModel("detail");
      oDetail.setData({
        VendorId: this._sVendorId,
        Material: this._sMaterial,
        RecordsAll: [],
        Records: [],
        RecordsCount: 0,
        _mmct: { cat: "", s01: [], s02: [] },

        __q: "",
        __statusFilter: ""
      }, true);

      // reset totale FS header
      this._inlineFS = {
        filters: {},
        sort: { key: "", desc: false },
        sortBtns: {},
        filterInputs: {},
        headerTitles: {},
        headerRows: {},
        headerBoxes: {}
      };

      var oInp = this.byId("inputFilter3");
      if (oInp && oInp.setValue) oInp.setValue("");

      this._logTable("TABLE STATE @ before _loadDataOnce");
      this._loadDataOnce();
    },

    // =========================
    //  BUTTONS HEADER (NO DIALOG)
    // =========================
    _setInnerHeaderHeight: function (oMdcTbl) {
      try {
        var oUi = this.getView().getModel("ui");
        var bShowFilters = !!(oUi && oUi.getProperty("/showHeaderFilters"));

        var oInner = this._getInnerTableFromMdc(oMdcTbl);
        if (oInner && typeof oInner.setColumnHeaderHeight === "function") {
          oInner.setColumnHeaderHeight(bShowFilters ? 64 : 32);
        }
      } catch (e) {  }
    },

    onToggleHeaderFilters: function () {
      var oUi = this.getView().getModel("ui");
      if (!oUi) return;

      var bNow = !!oUi.getProperty("/showHeaderFilters");
      oUi.setProperty("/showHeaderFilters", !bNow);

      var oTbl = this.byId("mdcTable3");
      this._setInnerHeaderHeight(oTbl);

      // re-apply per sicurezza (P13N / rebind)
      this._applyInlineHeaderFilterSort(oTbl);
    },

    onToggleHeaderSort: function () {
      var oUi = this.getView().getModel("ui");
      if (!oUi) return;

      var bNow = !!oUi.getProperty("/showHeaderSort");
      oUi.setProperty("/showHeaderSort", !bNow);

      // re-apply per sicurezza (P13N / rebind)
      var oTbl = this.byId("mdcTable3");
      this._applyInlineHeaderFilterSort(oTbl);
    },

    //  ALIAS per i bottoni “Filtri per colonna” / “Ordinamento” nella toolbar (stessa logica inline header)
    onOpenColumnFilters: function () {
      this.onToggleHeaderFilters();
    },

    onOpenSort: function () {
      this.onToggleHeaderSort();
    },

    // =========================
    // Utils
    // =========================
    _toStableString: function (v) {
      if (v === null || v === undefined) return "";
      if (typeof v === "string") return v;
      if (typeof v === "number" || typeof v === "boolean") return String(v);
      try { return JSON.stringify(v); } catch (e) { return String(v); }
    },

    _getApprovedFlag: function (r) {
      if (!r) return 0;

      var v;
      if (r.Approved !== undefined && r.Approved !== null) v = r.Approved;
      else if (r.APPROVED !== undefined && r.APPROVED !== null) v = r.APPROVED;
      else if (r.approved !== undefined && r.approved !== null) v = r.approved;
      else if (r.FLAG_APPROVED !== undefined && r.FLAG_APPROVED !== null) v = r.FLAG_APPROVED;
      else v = r.FlagApproved;

      if (v === true) return 1;
      if (v === false) return 0;

      var n = parseInt(String(v || "0"), 10);
      return isNaN(n) ? 0 : n;
    },

    _getSettingFlags: function (c) {
      var s = String((c && (c.Impostazione !== undefined ? c.Impostazione : c.IMPOSTAZIONE)) || "").trim().toUpperCase();
      return {
        required: s === "O",
        locked: s === "B",
        hidden: s === "N"
      };
    },

    _isMultipleField: function (c) {
      var s = String((c && (c.MultipleVal !== undefined ? c.MultipleVal : c.MULTIPLEVAL)) || "").trim().toUpperCase();
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

      return new HBox({ items: [oText, oEditCtrl] });
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
    // CACHE
    // =========================
    _getCacheKeySafe: function () {
      return encodeURIComponent((this._sVendorId || "") + "||" + (this._sMaterial || ""));
    },

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
        this._bindRecords(aRecs);
        return;
      }

      this._reloadDataFromBackend(function (aResults) {
        this._log("_reloadDataFromBackend returned", aResults.length);

        this._hydrateMmctFromRows(aResults);

        var aRecordsBuilt = this._buildRecords01(aResults);

        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aResults);
        oVm.setProperty("/cache/recordsByKey/" + sKey, aRecordsBuilt);

        this._bindRecords(aRecordsBuilt);
      }.bind(this));
    },

    // =========================
    // MMCT -> colonne
    // =========================
    _getMmctCfgForCat: function (sCat) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var aUserInfos = (oVm && (oVm.getProperty("/UserInfosMMCT") || oVm.getProperty("/userInfosMMCT"))) || [];
      if (!Array.isArray(aUserInfos)) return [];
      var oCat = aUserInfos.find(function (x) { return String(x && x.CatMateriale) === String(sCat); });
      var aFields = (oCat && oCat.UserMMCTFields && oCat.UserMMCTFields.results) ? oCat.UserMMCTFields.results : [];
      return Array.isArray(aFields) ? aFields : [];
    },

    _cfgForScreen: function (sCat, sScreen) {
      var a = this._getMmctCfgForCat(sCat) || [];
      var sTarget = String(sScreen || "");
      if (sTarget.length === 1) sTarget = "0" + sTarget;

      return (a || [])
        .filter(function (c) {
          var lv = String(c.LivelloSchermata || "");
          if (lv.length === 1) lv = "0" + lv;
          return lv === sTarget;
        })
        .map(function (c) {
          var ui = String(c.UiFieldname || c.UIFIELDNAME || "").trim();
          if (!ui) return null;

          var label = (c.Descrizione || c.DESCRIZIONE || ui);
          var domain = String(
            c.Dominio !== undefined ? c.Dominio :
            (c.DOMINIO !== undefined ? c.DOMINIO :
              (c.Domain !== undefined ? c.Domain : (c.DOMAIN !== undefined ? c.DOMAIN : "")))
          ).trim();

          var flags = this._getSettingFlags(c);
          if (flags.hidden) return null;

          var required = !!flags.required;
          var locked = !!flags.locked;
          var multiple = this._isMultipleField(c);

          return { ui: ui, label: label, domain: domain, required: required, locked: locked, multiple: multiple };
        }.bind(this))
        .filter(Boolean);
    },

    _hydrateMmctFromRows: function (aRows) {
      var r0 = (Array.isArray(aRows) && aRows.length) ? (aRows[0] || {}) : {};
      var sCat = String(r0.CatMateriale || "").trim();

      var oDetail = this.getView().getModel("detail");
      var a01 = sCat ? this._cfgForScreen(sCat, "01") : [];
      var a02 = sCat ? this._cfgForScreen(sCat, "02") : [];
      oDetail.setProperty("/_mmct", { cat: sCat, s01: a01, s02: a02 });

      this._log("_hydrateMmctFromRows", { cat: sCat, s01Count: a01.length, s02Count: a02.length });
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
          debugger
          BusyIndicator.hide();
          var a = (oData && oData.results) || [];

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

      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var sForce = String(mock.forceStato || "").trim().toUpperCase();

      function normStato(r) {
        if (sForce === "ST" || sForce === "AP" || sForce === "RJ" || sForce === "CH") return sForce;

        var s = String((r && (r.Stato || r.STATO)) || "").trim().toUpperCase();
        if (s === "ST" || s === "AP" || s === "RJ" || s === "CH") return s;

        var ap = this._getApprovedFlag(r);
        if (ap === 1) return "AP";

        var rej = parseInt(String(r.Rejected || r.REJECTED || "0"), 10) || 0;
        if (rej > 0) return "RJ";

        var pend = parseInt(String(r.ToApprove || r.TOAPPROVE || "0"), 10) || 0;
        if (pend > 0) return "ST";

        return "ST";
      }

      function rank(st) {
        if (st === "AP") return 4;
        if (st === "CH") return 3;
        if (st === "RJ") return 2;
        return 1;
      }
      function mergeStatus(a, b) { return (rank(b) > rank(a)) ? b : a; }

      function canEdit(role, status) {
        if (role === "S") return false;
        if (role === "I") return false;
        if (role === "E") return status !== "AP";
        return false;
      }
      function canApprove(role, status) {
        return role === "I" && (status === "ST" || status === "CH");
      }
      function canReject(role, status) {
        return role === "I" && (status === "ST" || status === "CH");
      }

      this._log("_buildRecords01 role", sRole, "cols", aCols01.length);

      var m = {};
      var a = [];

      (aAllRows || []).forEach(function (r) {
        var sGuidKey = this._rowGuidKey(r);
        var sFibra = this._rowFibra(r);
        var sKey = sGuidKey + "||" + sFibra;

        var stRow = normStato.call(this, r);

        var oRec = m[sKey];

        if (!oRec) {
          oRec = {
             idx: a.length,
  guidKey: sGuidKey,
  Fibra: sFibra,

  Stato: stRow,
  StatoText: this._statusText(stRow),
  __status: stRow,

            __canEdit: canEdit(sRole, stRow),
            __canApprove: canApprove(sRole, stRow),
            __canReject: canReject(sRole, stRow),

            __readOnly: !canEdit(sRole, stRow)
          };

          aCols01.forEach(function (c) {
            var v = (r && r[c] !== undefined) ? r[c] : "";
            oRec[c] = mIsMulti[c] ? toArray(v) : v;
          });

          m[sKey] = oRec;
          a.push(oRec);

        } else {
          var merged = mergeStatus(oRec.__status, stRow);
          if (merged !== oRec.__status) {
            oRec.__status = merged;
            oRec.Stato = merged;
            oRec.StatoText = this._statusText(merged);

            oRec.__canEdit = canEdit(sRole, merged);
            oRec.__canApprove = canApprove(sRole, merged);
            oRec.__canReject = canReject(sRole, merged);

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
        debugger
        var oBtn = oEvent.getSource();
        var oCtx = oBtn && oBtn.getBindingContext && (
          oBtn.getBindingContext("detail") || oBtn.getBindingContext()
        );

        if (!oCtx) return;

        var oRow = oCtx.getObject && oCtx.getObject();
        var iIdx = (oRow && oRow.idx != null) ? parseInt(oRow.idx, 10) : NaN;

        if (isNaN(iIdx) && oCtx.getPath) {
          var sPath = String(oCtx.getPath() || "");
          var mm = sPath.match(/\/(\d+)\s*$/);
          if (mm) iIdx = parseInt(mm[1], 10);
        }
        if (isNaN(iIdx) || iIdx < 0) iIdx = 0;

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
    // P13N force visible
    // =========================
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

      // 1) NAV colonna (sempre prima)
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

      // 2) STATO (sempre seconda)
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
    // FILTER STATUS + TEXT + per-colonna + sort (client side)
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
  var oInner = null;

  try {
    if (oMdcTbl && typeof oMdcTbl.getTable === "function") {
      oInner = oMdcTbl.getTable();
    }

    if (!oInner && oMdcTbl && typeof oMdcTbl.getContent === "function") {
      oInner = oMdcTbl.getContent();
    }

    if (!oInner && oMdcTbl && typeof oMdcTbl.getAggregation === "function") {
      oInner =
        oMdcTbl.getAggregation("content") ||
        oMdcTbl.getAggregation("_content") ||
        oMdcTbl.getAggregation("_table") ||
        null;
    }

    if (!oInner && oMdcTbl && oMdcTbl._oTable) {
      oInner = oMdcTbl._oTable;
    }

    if (!oInner && oMdcTbl && typeof oMdcTbl._getTable === "function") {
      oInner = oMdcTbl._getTable();
    }
  } catch (e) {  }

  // Unwrap: a volte getTable/getContent restituiscono il TableType e non la tabella finale
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

  return oInner || null;
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

  // helper: prova a capire la key vera di una inner column (GridTable/Responsive)
  function normInnerKey(col) {
    var k = "";
    try {
      if (col && typeof col.getFilterProperty === "function") k = col.getFilterProperty() || "";
      if (!k && col && typeof col.getSortProperty === "function") k = col.getSortProperty() || "";
    } catch (e) {  }

    k = String(k || "").trim();
    if (k.indexOf(">") >= 0) k = k.split(">").pop(); // "detail>FIELD" -> "FIELD"
    return String(k || "").trim();
  }

  // mappa inner columns per key (molto più stabile dell’indice)
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

  // fallback “soft” per casi strani: se non troviamo per key, proviamo per indice
  // ma SOLO se l’inner col supporta setLabel/setHeader
  function fallbackInnerByIndex(iMdc) {
    var col = aInnerCols[iMdc] || null;
    if (col && (typeof col.setLabel === "function" || typeof col.setHeader === "function")) return col;

    // prova a shiftare di 1 se c’è una colonna extra (selezione/row actions)
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
    if (!sField) continue; // es. colonna "Dettaglio"

    var sHeader = (typeof mdcCol.getHeader === "function" && mdcCol.getHeader()) || sField;

    // trova inner col per key (preferito), altrimenti fallback per indice
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

    // --- Filter Input (riuso) ---
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

    // riallineo valore input allo stato filtri
    var wantedVal = String((this._inlineFS.filters && this._inlineFS.filters[sField]) || "");
    if (oInp.getValue && oInp.getValue() !== wantedVal) oInp.setValue(wantedVal);

    // --- Title (riuso) ---
    var oTitle = this._inlineFS.headerTitles[sField];
    if (!oTitle) {
      oTitle = new Text({ text: (typeof sHeader === "string" ? sHeader : sField), wrapping: false });
      this._inlineFS.headerTitles[sField] = oTitle;
    } else if (oTitle.setText) {
      oTitle.setText(typeof sHeader === "string" ? sHeader : sField);
    }

    // --- Header row + box (riuso) ---
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

    //  QUI È LA DIFFERENZA CHIAVE:
    // GridTable (sap.ui.table.Column) -> setLabel
    // ResponsiveTable (sap.m.Column)  -> setHeader
    if (typeof innerCol.setLabel === "function") {
      innerCol.setLabel(oV);
    } else if (typeof innerCol.setHeader === "function") {
      innerCol.setHeader(oV);
    }

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

      this._snapshotRecords = deepClone(a);

      var oTbl = this.byId("mdcTable3");
      var aCfg01 = oDetail.getProperty("/_mmct/s01") || [];
      this._ensureMdcCfgScreen3(aCfg01);

      await this._rebuildColumnsHard(oTbl, aCfg01);

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

      // pulisce anche i valori input negli header
      var oTbl = this.byId("mdcTable3");
      this._applyInlineHeaderFilterSort(oTbl);
      this._setInnerHeaderHeight(oTbl);
    },

    // =========================
    // BOTTONI EXTRA (stubs safe)
    // =========================
    onPrint: function () { MessageToast.show("Stampa: TODO"); },
    onExportExcel: function () { MessageToast.show("Export Excel: TODO"); },
    onSave: function () { MessageToast.show("Salva: TODO"); },

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
// ADD/DELETE ROWS (Screen3) - MDC Table (detail>/RecordsAll -> detail>/Records)
// + legame Screen4: cache dettagli vuota per idx + selected parent in vm
// =========================
PARENT_TABLE_ID: "mdcTable3",

onAddRow: function () {
  var oDetail = this.getView().getModel("detail");
  if (!oDetail) return MessageToast.show("Model 'detail' non trovato");

  var aAll = oDetail.getProperty("/RecordsAll") || [];

  // idx stabile (NON usare l'indice array)
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

    // metto TUTTE e 3 per compatibilità con codice esistente
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

  // inizializza campi dinamici MMCT (evita undefined, soprattutto per MultiCombo -> [])
  var aCfg01 = oDetail.getProperty("/_mmct/s01") || [];
  (aCfg01 || []).forEach(function (f) {
    if (!f || !f.ui) return;
    var k = String(f.ui).trim();
    if (!k) return;
    if (k.toUpperCase() === "STATO") k = "Stato";
    if (oNewRow[k] !== undefined) return;
    oNewRow[k] = f.multiple ? [] : "";
  });

  // aggiungi in testa
  aAll.unshift(oNewRow);
  oDetail.setProperty("/RecordsAll", aAll);

  // legame con Screen4: salva parent selezionato + crea bucket dettagli vuoto per questo idx
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
 