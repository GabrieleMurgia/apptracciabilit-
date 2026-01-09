// Screen3.controller.js
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
  "sap/ui/mdc/p13n/StateUtil"
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
  StateUtil
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
        required: s === "O", // ✅ O = Obbligatorio
        locked: s === "B"    // ✅ B = Bloccato
      };
    },

    _isMultipleField: function (c) {
      var s = String((c && (c.MultipleVal ?? c.MULTIPLEVAL)) || "").trim().toUpperCase();
      return s === "X"; // ✅ X = multi valori
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
          // ✅ MULTI + Dominio -> MultiComboBox (solo valori di dominio)
          oEditCtrl = new MultiComboBox({
            visible: "{= !" + sReadOnlyExpr + " }",
            enabled: !bLocked,
            allowCustomValues: false,
            selectedKeys: sValueBind, // ✅ array
            valueState: sValueState,
            valueStateText: sValueStateText,
            items: {
              path: "vm>/domainsByName/" + sDomain,
              template: new Item({ key: "{vm>key}", text: "{vm>text}" })
            }
          });
        } else {
          // ✅ SINGLE + Dominio -> ComboBox
          oEditCtrl = new ComboBox({
            visible: "{= !" + sReadOnlyExpr + " }",
            enabled: !bLocked,
            allowCustomValues: false,
            selectedKey: sValueBind, // ✅ string
            valueState: sValueState,
            valueStateText: sValueStateText,
            items: {
              path: "vm>/domainsByName/" + sDomain,
              template: new Item({ key: "{vm>key}", text: "{vm>text}" })
            }
          });
        }

      } else {
        // ✅ NO Dominio -> Input libero
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
          var required = !!flags.required; // ✅ O
          var locked = !!flags.locked;     // ✅ B
          var multiple = this._isMultipleField(c); // ✅ MultipleVal

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
    // ODATA
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
      // MOCK DATASET Screen3 (2 casi per ST/AP/RJ/CH) -> 16 righe (2 righe per record)
      // =========================
      if (bMockS3) {
        var sVendor = String(this._sVendorId || "").trim();
        if (/^\d+$/.test(sVendor) && sVendor.length < 10) sVendor = sVendor.padStart(10, "0");

        var sMat = norm(this._sMaterial);

        // cat "esistente": prendo la prima categoria disponibile dal vm, altrimenti CF
        var mmct = (oVm && oVm.getProperty("/mmctFieldsByCat")) || {};
        var aCats = Object.keys(mmct || {});
        var sCat = aCats[0] || "CF";

        function mkBase() {
          return {
            CalcCarbonFoot: "",
            CatMateriale: sCat,
            CertMat: "",
            CertProcess: "",
            CertRic: "",
            CodiceDenSempl: "",
            Collezione: "",
            Compost: "",
            DataIns: null,
            DataMod: null,
            DescrPack: "",
            DestPack: "",
            DestUso: "",
            EnteCert: "",
            Esito: "",
            Famiglia: "",
            FattEmissione: "0.000",
            Fibra: "",
            FineVal: null,
            Fornitore: sVendor,
            GerProd: "CAL B1 BD",
            GradoRic: "",
            GruppoMerci: String(sMat || "IW2B0626SVS"),
            Guid: "",
            InizioVal: null,
            Linea: "1R",
            LocAllev: "",
            LocConciaCrust: "",
            LocConciaPf: "",
            LocConfez: "",
            LocFibra: "",
            LocFilatura: "",
            LocMacellazione: "",
            LocPolimero: "",
            LocTessitura: "",
            LocTintura: "",
            Materiale: String(sMat || "IW2B0626SVS"),
            MaterialeFornitore: "",
            MatnrMp: "",
            Message: "",
            MpFittizio: "",
            NReport: "",
            NoteCertMat: "",
            NoteCertProcess: "",
            NoteMateriale: "",
            OtherAction: "",
            PaeseAllev: "",
            PaeseConciaCrust: "",
            PaeseConciaPf: "",
            PaeseConfez: "",
            PaeseFibra: "",
            PaeseFilatura: "",
            PaeseMacellazione: "",
            PaesePolimero: "",
            PaesePrAgg: "",
            PaesePrMont: "",
            PaesePrRif: "",
            PaeseTessitura: "",
            PaeseTintura: "",
            PartitaFornitore: "",
            PercMatRicicl: "",
            Perccomp: "",
            PerccompFibra: "0.00",
            PesoPack: "0.000",
            Plant: "5110",
            PresSost: "",
            QtaFibra: "0.000",
            RagSoc: "CITY MODELES",
            RiciPack: "",
            Stagione: "44",
            Stato: "",
            TipSost: "",
            UdM: "PC",
            UserID: sUserId,
            UserIns: "",
            UserMod: "",
            Approved: 0,
            ToApprove: 0,
            Rejected: 0,
            Open: "X"
          };
        }

        function applyFlagsByStato(r, stato) {
          r.Stato = stato;

          // coerente con i tuoi campi backend
          if (stato === "AP") { r.Approved = 1; r.ToApprove = 0; r.Rejected = 0; }
          if (stato === "RJ") { r.Approved = 0; r.ToApprove = 0; r.Rejected = 1; }
          if (stato === "ST") { r.Approved = 0; r.ToApprove = 1; r.Rejected = 0; }
          if (stato === "CH") { r.Approved = 0; r.ToApprove = 1; r.Rejected = 0; }
        }

        function mkRecord2Rows(stato, idx) {
          var guid = "GUID_" + stato + "_" + idx;
          var fibra = "FIB_" + stato + "_" + idx;

          var r1 = mkBase();
          r1.Guid = guid;
          r1.Fibra = fibra;
          r1.Linea = "1R";
          r1.FattEmissione = (idx * 0.111).toFixed(3);
          r1.QtaFibra = (idx * 1.234).toFixed(3);
          applyFlagsByStato(r1, stato);

          var r2 = mkBase();
          r2.Guid = guid;
          r2.Fibra = fibra;
          r2.Linea = "2R";
          r2.FattEmissione = (idx * 0.222).toFixed(3);
          r2.QtaFibra = (idx * 2.468).toFixed(3);
          applyFlagsByStato(r2, stato);

          return [r1, r2];
        }

        var aMock = []
          .concat(mkRecord2Rows("ST", 1), mkRecord2Rows("ST", 2))
          .concat(mkRecord2Rows("AP", 1), mkRecord2Rows("AP", 2))
          .concat(mkRecord2Rows("RJ", 1), mkRecord2Rows("RJ", 2))
          .concat(mkRecord2Rows("CH", 1), mkRecord2Rows("CH", 2));

        // forza stato (se impostato in Screen0)
        if (sForceStato === "ST" || sForceStato === "AP" || sForceStato === "RJ" || sForceStato === "CH") {
          aMock.forEach(function (r) { r.Stato = sForceStato; });
        }

        console.log("[Screen3][MOCK] rows:", aMock.length, "forceStato:", sForceStato || "(none)");
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

      // ✅ mappa campi multi
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
        return 1; // ST
      }
      function mergeStatus(a, b) { return (rank(b) > rank(a)) ? b : a; }

      // permessi
      function canEdit(role, status) {
        if (role === "S") return false;
        if (role === "I") return false;
        if (role === "E") return status !== "AP"; // fornitore: edit NO solo AP
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

      // 1) NAV colonna
      oTbl.addColumn(new MdcColumn({
        header: "",
        visible: true,
        template: new Button({
          icon: "sap-icon://navigation-right-arrow",
          type: "Transparent",
          tooltip: "Apri dettagli",
          press: this.onGoToScreen4FromRow.bind(this)
        })
      }));

      // 1.5) STATO fisso se non presente in MMCT
      var hasStatoInCfg = (aCfg01 || []).some(function (f) {
        return String(f && f.ui || "").toUpperCase() === "STATO" || String(f && f.ui || "") === "Stato";
      });
      if (!hasStatoInCfg) {
        oTbl.addColumn(new MdcColumn({
          header: "Stato",
          visible: true,
          dataProperty: "Stato",
          propertyKey: "Stato",
          template: this._createStatusCellTemplate("Stato")
        }));
      }

      // 2) Colonne dinamiche MMCT (con override STATO -> semaforo)
      (aCfg01 || []).forEach(function (f) {
        var sKeyRaw = String(f.ui || "").trim();
        if (!sKeyRaw) return;

        // normalizzo "STATO" -> "Stato"
        var bIsStato = (sKeyRaw.toUpperCase() === "STATO");
        var sKey = bIsStato ? "Stato" : sKeyRaw;

        var sHeader = (f.label || sKeyRaw) + (f.required ? " *" : "");

        oTbl.addColumn(new MdcColumn({
          header: sHeader,
          visible: true,
          dataProperty: sKey,
          propertyKey: sKey,
          template: bIsStato ? this._createStatusCellTemplate(sKey) : this._createCellTemplate(sKey, f)
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
      s = String(s || "").trim().toUpperCase(); // "" = tutti

      var oDetail = this.getView().getModel("detail");
      oDetail.setProperty("/__statusFilter", s);

      this._applyClientFilters();
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

      // applico eventuali filtri (anche se vuoti -> mostra tutto)
      this._applyClientFilters();

      if (oTbl && typeof oTbl.rebind === "function") oTbl.rebind();

      await this._forceP13nAllVisible(oTbl, "t0");
      setTimeout(function () { this._forceP13nAllVisible(oTbl, "t300"); }.bind(this), 300);

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
