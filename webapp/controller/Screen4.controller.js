sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/routing/History",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/core/BusyIndicator",
  "sap/m/MessageToast",
  "sap/m/Column",
  "sap/m/Text",
  "sap/m/ColumnListItem",
  "sap/m/ComboBox",
  "sap/m/MultiComboBox",
  "sap/ui/core/Item"
], function (
  Controller,
  History,
  JSONModel,
  Filter,
  FilterOperator,
  BusyIndicator,
  MessageToast,
  Column,
  Text,
  ColumnListItem,
  ComboBox,
  MultiComboBox,
  Item
) {
  "use strict";

  return Controller.extend("apptracciabilita.apptracciabilita.controller.Screen4", {

    onInit: function () {
      var oRouter = this.getOwnerComponent().getRouter();
      oRouter.getRoute("Screen4").attachPatternMatched(this._onRouteMatched, this);

      var oDetail = new JSONModel({
        VendorId: "",
        VendorName: "",
        Material: "",
        Fibra: "",
        QTA_FIBRA: "",
        UM_FIBRA: "",
        recordKey: "",
        guidKey: "",
        Rows: [],
        HeaderFields: [],        // <-- Schermata 01
        Screen02Fields: []        // <-- Schermata 02 (solo debug)
      });
      oDetail.setDefaultBindingMode(sap.ui.model.BindingMode.TwoWay);
      this.getView().setModel(oDetail, "detail");
    },

    _onRouteMatched: function (oEvent) {
      var oArgs = oEvent.getParameter("arguments") || {};
      this._sMode = oArgs.mode || "A";
      this._sVendorId = decodeURIComponent(oArgs.vendorId || "");
      this._sMaterial = decodeURIComponent(oArgs.material || "");
      this._sRecordKey = decodeURIComponent(oArgs.recordKey || "0");

      var oDetail = this.getView().getModel("detail");
      oDetail.setData({
        VendorId: this._sVendorId,
        VendorName: "",
        Material: this._sMaterial,
        Fibra: "",
        QTA_FIBRA: "",
        UM_FIBRA: "",
        recordKey: this._sRecordKey,
        guidKey: "",
        Rows: [],
        HeaderFields: [],
        Screen02Fields: []
      }, true);

      this._hydrateHeaderFromVm();

      this._loadSelectedRecordRows(function () {
        this._buildHeaderFromScreen01();   // <-- usa MMCT schermata 01
        this._buildScreen02Table();        // <-- usa MMCT schermata 02
      }.bind(this));
    },

    _hydrateHeaderFromVm: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      if (!oVm) return;

      var aVendors = oVm.getProperty("/userVendors") || [];
      var oVend = aVendors.find(function (v) {
        return String(v.Fornitore || v.Vendor || "") === String(this._sVendorId);
      }.bind(this));

      if (oVend) {
        this.getView().getModel("detail").setProperty("/VendorName",
          oVend.ReagSoc || oVend.VendorName || oVend.RagioneSociale || ""
        );
      }
    },

    // =========================
    // CACHE
    // =========================
    _getCacheKey: function () {
      return (this._sVendorId || "") + "||" + (this._sMaterial || "");
    },

    _ensureVmCache: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      if (!oVm) return null;

      var oCache = oVm.getProperty("/cache") || {};
      if (!oCache.dataRowsByKey) oCache.dataRowsByKey = {};
      if (!oCache.fiberRecordsByKey) oCache.fiberRecordsByKey = {};
      oVm.setProperty("/cache", oCache);
      return oVm;
    },

    _loadSelectedRecordRows: function (fnDone) {
      var oVm = this._ensureVmCache();
      var sCacheKey = this._getCacheKey();

      var aAllRows = (oVm && oVm.getProperty("/cache/dataRowsByKey/" + sCacheKey)) || null;
      var aFiberRecords = (oVm && oVm.getProperty("/cache/fiberRecordsByKey/" + sCacheKey)) || null;

      if (Array.isArray(aAllRows) && aAllRows.length && Array.isArray(aFiberRecords) && aFiberRecords.length) {
        this._applyRecordSelection(aAllRows, aFiberRecords);
        if (typeof fnDone === "function") fnDone();
        return;
      }

      this._reloadDataFromBackend(function (aResults) {
        var aFib = this._buildFiberRecords(aResults);

        if (oVm) {
          oVm.setProperty("/cache/dataRowsByKey/" + sCacheKey, aResults);
          oVm.setProperty("/cache/fiberRecordsByKey/" + sCacheKey, aFib);
        }

        this._applyRecordSelection(aResults, aFib);
        if (typeof fnDone === "function") fnDone();
      }.bind(this));
    },

    // =========================
    // DATA LOAD (stesso schema Screen3)
    // =========================
    _reloadDataFromBackend: function (fnDone) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var sUserId = (oVm && oVm.getProperty("/userId")) || "E_ZEMAF";
      var oODataModel = this.getOwnerComponent().getModel();

      function norm(v) { return String(v || "").trim().toUpperCase(); }

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

      function clientMatch(rowMat) {
        var m = norm(rowMat);
        if (!m) return false;
        if (aMatVariants.indexOf(m) >= 0) return true;
        if (sRouteMat && m.startsWith(sRouteMat)) return true;
        return false;
      }

      function done(a) { if (typeof fnDone === "function") fnDone(a || []); }

      function readNoMaterialFilter() {
        var aFilters = [
          new Filter("UserID", FilterOperator.EQ, sUserId),
          new Filter("Fornitore", FilterOperator.EQ, sVendor)
        ];

        BusyIndicator.show(0);
        oODataModel.read("/DataSet", {
          filters: aFilters,
          urlParameters: { "sap-language": "IT" },
          success: function (oData) {
            BusyIndicator.hide();
            var aAll = (oData && oData.results) || [];
            var aFiltered = aAll.filter(function (r) { return clientMatch(r && r.Materiale); });
            if (!aFiltered.length) aFiltered = aAll;
            done(aFiltered);
          },
          error: function (oError) {
            BusyIndicator.hide();
            console.error("Errore lettura DataSet (fallback)", oError);
            MessageToast.show("Errore nel caricamento dei dettagli");
            done([]);
          }
        });
      }

      var aFiltersTry1 = [
        new Filter("UserID", FilterOperator.EQ, sUserId),
        new Filter("Fornitore", FilterOperator.EQ, sVendor)
      ];

      if (aMatVariants.length) {
        var aMatFilters = aMatVariants.map(function (m) {
          return new Filter("Materiale", FilterOperator.EQ, m);
        });
        aFiltersTry1.push(new Filter({ filters: aMatFilters, and: false }));
      }

      BusyIndicator.show(0);
      oODataModel.read("/DataSet", {
        filters: aFiltersTry1,
        urlParameters: { "sap-language": "IT" },
        success: function (oData) {
          BusyIndicator.hide();
          var aRes = (oData && oData.results) || [];
          if (!aRes.length) {
            readNoMaterialFilter();
            return;
          }
          done(aRes);
        },
        error: function (oError) {
          BusyIndicator.hide();
          console.error("Errore lettura DataSet (try1)", oError);
          readNoMaterialFilter();
        }
      });
    },

    // =========================
    // MMCT: split schermata 01/02 (LivelloSchermata + UiFieldname)
    // =========================
    _getMmctCfgForCat: function (sCat) {
      var oVm = this.getOwnerComponent().getModel("vm");
      if (!oVm || !sCat) return [];

      var mByCat = oVm.getProperty("/mmctFieldsByCat");
      if (mByCat && Array.isArray(mByCat[sCat])) return mByCat[sCat];

      var aUserInfos = oVm.getProperty("/UserInfosMMCT") || [];
      if (!Array.isArray(aUserInfos) || !aUserInfos.length) return [];

      var oCat = aUserInfos.find(function (x) {
        return String(x && x.CatMateriale) === String(sCat);
      });

      var aFields = (oCat && oCat.UserMMCTFields && oCat.UserMMCTFields.results) ? oCat.UserMMCTFields.results : [];
      return Array.isArray(aFields) ? aFields : [];
    },

    _getUiFieldsForScreen: function (sCat, sScreen) {
      var a = this._getMmctCfgForCat(sCat) || [];
      var sTarget = String(sScreen || "").padStart(2, "0");

      return (a || [])
        .filter(function (c) { return String(c.LivelloSchermata || "").padStart(2, "0") === sTarget; })
        .map(function (i) { return String(i.UiFieldname || "").trim(); })
        .filter(Boolean);
    },

    // =========================
    // RECORDS (UNICI per Guid+Fibra)
    // =========================
    _toStableString: function (v) {
      if (v === null || v === undefined) return "";
      if (typeof v === "string") return v;
      if (typeof v === "number" || typeof v === "boolean") return String(v);
      try { return JSON.stringify(v); } catch (e) { return String(v); }
    },

    _rowGuidKey: function (r) {
      var v = r && (r.Guid || r.GUID || r.ItmGuid || r.ItemGuid || r.GUID_ITM || r.GUID_ITM2);
      return this._toStableString(v);
    },

    _rowFibra: function (r) {
      var v = r && (r.Fibra || r.FIBRA || r.Fiber || r.FIBER);
      return this._toStableString(v);
    },

    _buildFiberRecords: function (aAllRows) {
      var m = {};
      var a = [];

      (aAllRows || []).forEach(function (r) {
        var sGuidKey = this._rowGuidKey(r);
        var sFibra = this._rowFibra(r);
        var sKey = sGuidKey + "||" + sFibra;
        if (m[sKey]) return;
        m[sKey] = true;

        a.push({
          idx: a.length,
          guidKey: sGuidKey,
          Fibra: sFibra,
          QTA_FIBRA: r.QtaFibra || r.PerccompFibra || r.QTA_FIBRA || "",
          UM_FIBRA: r.UmFibra || r.UdM || r.UM_FIBRA || "",
          Zstatus: r.Stato || r.Zstatus || r.Status || ""
        });
      }.bind(this));

      return a;
    },

    _applyRecordSelection: function (aAllRows, aFiberRecords) {
      var iIdx = parseInt(this._sRecordKey, 10);
      if (isNaN(iIdx) || iIdx < 0) iIdx = 0;

      var oRec = (aFiberRecords && aFiberRecords[iIdx]) || null;
      if (!oRec) {
        MessageToast.show("Record non trovato, uso il primo disponibile");
        oRec = (aFiberRecords && aFiberRecords[0]) || { idx: 0, guidKey: "", Fibra: "" };
      }

      var sGuidKey = this._toStableString(oRec.guidKey);
      var sFibra = this._toStableString(oRec.Fibra);

      var aSelectedRows = (aAllRows || []).filter(function (r) {
        return this._rowGuidKey(r) === sGuidKey && this._rowFibra(r) === sFibra;
      }.bind(this));

      var r0 = aSelectedRows[0] || {};
      var oDetail = this.getView().getModel("detail");

      oDetail.setProperty("/guidKey", sGuidKey);
      oDetail.setProperty("/Fibra", sFibra);
      oDetail.setProperty("/QTA_FIBRA", oRec.QTA_FIBRA || r0.QtaFibra || r0.QTA_FIBRA || "");
      oDetail.setProperty("/UM_FIBRA", oRec.UM_FIBRA || r0.UmFibra || r0.UM_FIBRA || "");

      // CatMateriale: serve per MMCT
      if (r0 && !r0.CatMateriale) {
        r0.CatMateriale = r0.CatMat || r0.MaterialCategory || "";
      }

      oDetail.setProperty("/Rows", aSelectedRows || []);
    },

    // =========================
    // HEADER = Schermata 01
    // =========================
    _buildHeaderFromScreen01: function () {
      var aRows = this.getView().getModel("detail").getProperty("/Rows") || [];
      var r0 = aRows[0] || {};
      var sCat = String(r0.CatMateriale || "").trim();

      var aUi01 = this._getUiFieldsForScreen(sCat, "01");

      // fallback se MMCT mancante: header vuoto (o metti 5 campi base)
      var aHeader = (aUi01 || []).map(function (p) {
        var v = r0[p];
        return { label: p, value: (v === null || v === undefined) ? "" : String(v) };
      }).filter(function (x) { return x && x.label; });

      this.getView().getModel("detail").setProperty("/HeaderFields", aHeader);
    },

    // =========================
    // TABLE = Schermata 02
    // =========================
    _getDomainsByName: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      return (oVm && oVm.getProperty("/domainsByName")) || {};
    },

    _calcColumnWidthPx: function (label, aRows, fieldName) {
      var maxLen = (label || "").length;
      (aRows || []).forEach(function (r) {
        var v = r ? r[fieldName] : "";
        var s = (v === null || v === undefined) ? "" : String(v);
        if (s.length > maxLen) maxLen = s.length;
      });
      return Math.max(120, Math.min(420, 8 * maxLen + 40));
    },

    _buildDynamicTableFromUiFields: function (oTable, aRows, aUiFields, mDomainsByName) {
      if (!oTable) return;

      oTable.removeAllColumns();
      oTable.unbindItems();
      oTable.destroyItems();

      if (!Array.isArray(aRows) || !aRows.length) return;

      var aCells = [];
      var totalWidth = 0;

      (aUiFields || []).forEach(function (fieldName) {
        fieldName = String(fieldName || "").trim();
        if (!fieldName) return;

        var label = fieldName;
        var colPx = this._calcColumnWidthPx(label, aRows, fieldName);
        totalWidth += colPx;

        oTable.addColumn(new Column({
          width: colPx + "px",
          header: new Text({ text: label })
        }));

        // se vuoi domini: serve una mappa "fieldName -> domainName" (non ce l'hai qui),
        // quindi per ora Text semplice (coerente con richiesta).
        aCells.push(new Text({ text: "{detail>" + fieldName + "}" }));
      }.bind(this));

      var oTemplate = new ColumnListItem({ cells: aCells });
      oTable.setFixedLayout(false);
      oTable.setWidth(Math.max(1000, totalWidth) + "px");

      oTable.bindItems({
        path: "detail>/Rows",
        template: oTemplate
      });
    },

    _buildScreen02Table: function () {
      var oDetail = this.getView().getModel("detail");
      var aRows = oDetail.getProperty("/Rows") || [];
      var r0 = aRows[0] || {};
      var sCat = String(r0.CatMateriale || "").trim();

      var aUi02 = this._getUiFieldsForScreen(sCat, "02");
      oDetail.setProperty("/Screen02Fields", aUi02); // solo debug

      // fallback: se MMCT non c'è, mostra tutto
      if (!aUi02 || !aUi02.length) {
        aUi02 = Object.keys(r0).filter(function (k) {
          return k !== "__metadata" && k !== "AllData";
        });
      }

      var oTable = this.byId("tableData4"); // <<<<< ID tabella (adatta se diverso)
      this._buildDynamicTableFromUiFields(oTable, aRows, aUi02, this._getDomainsByName());
    },

    // =========================
    // NAV
    // =========================
    onNavBack: function () {
      var oHistory = History.getInstance();
      var sPreviousHash = oHistory.getPreviousHash();

      if (sPreviousHash !== undefined) {
        window.history.go(-1);
      } else {
        this.getOwnerComponent().getRouter().navTo("Screen3", {
          vendorId: encodeURIComponent(this._sVendorId),
          material: encodeURIComponent(this._sMaterial),
          mode: this._sMode || "A"
        }, true);
      }
    }

  });
});
