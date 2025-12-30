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
  "sap/m/ColumnListItem"
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
  ColumnListItem
) {
  "use strict";

  return Controller.extend("apptracciabilita.apptracciabilita.controller.Screen3", {

    onInit: function () {
      var oRouter = this.getOwnerComponent().getRouter();
      oRouter.getRoute("Screen3").attachPatternMatched(this._onRouteMatched, this);

      var oDetail = new JSONModel({
        VendorId: "",
        Material: "",
        CatMateriale: "",
        RowsS3: [],
        RowsS3Count: 0
      });
      this.getView().setModel(oDetail, "detail");
    },

    _onRouteMatched: function (oEvent) {
      var oArgs = oEvent.getParameter("arguments") || {};

      this._sMode = oArgs.mode || "A";
      this._sVendorId = decodeURIComponent(oArgs.vendorId || "");
      this._sMaterial = decodeURIComponent(oArgs.material || "");

      var oDetailModel = this.getView().getModel("detail");
      oDetailModel.setData({
        VendorId: this._sVendorId,
        Material: this._sMaterial,
        CatMateriale: "",
        RowsS3: [],
        RowsS3Count: 0
      }, true);

      this._loadDataOnce();
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
      if (!oCache.rowsS3ByKey) oCache.rowsS3ByKey = {};
      if (!oCache.ui01ByCat) oCache.ui01ByCat = {};
      oVm.setProperty("/cache", oCache);
      return oVm;
    },

    _loadDataOnce: function () {
      var oVm = this._ensureVmCache();
      var sCacheKey = this._getCacheKey();

      var aAllRows = (oVm && oVm.getProperty("/cache/dataRowsByKey/" + sCacheKey)) || null;
      var aRowsS3  = (oVm && oVm.getProperty("/cache/rowsS3ByKey/" + sCacheKey)) || null;

      if (Array.isArray(aAllRows) && aAllRows.length && Array.isArray(aRowsS3) && aRowsS3.length) {
        var sCatCached = this.getView().getModel("detail").getProperty("/CatMateriale") || "";
        var aUi01 = (oVm && oVm.getProperty("/cache/ui01ByCat/" + sCatCached)) || null;
        if (!Array.isArray(aUi01) || !aUi01.length) {
          // provo a ricavare dalla prima riga
          var r0c = aAllRows[0] || {};
          var sCat = String(r0c.CatMateriale || r0c.CatMat || r0c.MaterialCategory || "").trim();
          aUi01 = this._getUiFieldsForScreen(sCat, "01");
          if (oVm) oVm.setProperty("/cache/ui01ByCat/" + sCat, aUi01);
          this.getView().getModel("detail").setProperty("/CatMateriale", sCat);
        }
        this._bindRowsS3(aRowsS3);
        this._buildTableS3(aUi01);
        return;
      }

      this._reloadDataFromBackend(function (aResults) {
        var r0 = aResults[0] || {};
        var sCat = String(r0.CatMateriale || r0.CatMat || r0.MaterialCategory || "").trim();

        var aUi01 = this._getUiFieldsForScreen(sCat, "01");
        var aBuilt = this._buildRowsS3(aResults, aUi01);

        if (oVm) {
          oVm.setProperty("/cache/dataRowsByKey/" + sCacheKey, aResults);
          oVm.setProperty("/cache/rowsS3ByKey/" + sCacheKey, aBuilt);
          oVm.setProperty("/cache/ui01ByCat/" + sCat, aUi01);
        }

        this.getView().getModel("detail").setProperty("/CatMateriale", sCat);

        let excludeProp = ["Guid","UserID"]
        let correctColumnsA1 = aUi01.filter(i => !excludeProp?.includes(i))

        this._bindRowsS3(aBuilt);
        this._buildTableS3(correctColumnsA1);

        debugger
      }.bind(this));
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

      var aFields = (oCat && oCat.UserMMCTFields && oCat.UserMMCTFields.results)
        ? oCat.UserMMCTFields.results
        : [];
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
    // DATA LOAD (come tuo)
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

      function clientMaterialMatch(rowMat) {
        var m = norm(rowMat);
        if (!m) return false;
        if (aMatVariants.indexOf(m) >= 0) return true;
        if (sRouteMat && m.startsWith(sRouteMat)) return true;
        return false;
      }

      function done(a) { if (typeof fnDone === "function") fnDone(a || []); }

      function readWithoutMaterialAndFilterClientSide() {
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
            var aFiltered = aAll.filter(function (r) { return clientMaterialMatch(r && r.Materiale); });
            if (!aFiltered.length) aFiltered = aAll;
            done(aFiltered);
          },
          error: function (oError) {
            BusyIndicator.hide();
            console.error("Errore lettura DataSet (fallback)", oError);
            MessageToast.show("Errore nel caricamento dei dati di tracciabilità");
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
            readWithoutMaterialAndFilterClientSide();
            return;
          }
          done(aRes);
        },
        error: function (oError) {
          BusyIndicator.hide();
          console.error("Errore lettura DataSet (try1)", oError);
          readWithoutMaterialAndFilterClientSide();
        }
      });
    },

    // =========================
    // BUILD RowsS3 (UNICO per Guid+Fibra) ma PROIETTA SOLO aUi01
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

    _rowFibraKey: function (r) {
      var v = r && (r.Fibra || r.FIBRA || r.Fiber || r.FIBER);
      return this._toStableString(v);
    },

    _buildRowsS3: function (aAllRows, aUi01) {
      var m = {};
      var a = [];
      var aFields = Array.isArray(aUi01) ? aUi01 : [];

      (aAllRows || []).forEach(function (r) {
        var sGuidKey  = this._rowGuidKey(r);
        var sFibraKey = this._rowFibraKey(r);
        var sKey = sGuidKey + "||" + sFibraKey;
        if (m[sKey]) return;
        m[sKey] = true;

        var oRow = {
          idx: a.length,         // recordKey per Screen4
          __guidKey: sGuidKey,
          __fibraKey: sFibraKey
        };

        aFields.forEach(function (p) {
          oRow[p] = r[p];
        });

        a.push(oRow);
      }.bind(this));

      return a;
    },

    _bindRowsS3: function (aRowsS3) {
      var oDetailModel = this.getView().getModel("detail");
      oDetailModel.setProperty("/RowsS3", aRowsS3 || []);
      oDetailModel.setProperty("/RowsS3Count", (aRowsS3 && aRowsS3.length) || 0);
    },

    // =========================
    // UI: build tabella dinamica SOLO aUi01
    // =========================
    _calcColWidthPx: function (label, aRows, fieldName) {
      var maxLen = (label || "").length;
      (aRows || []).forEach(function (r) {
        var v = r ? r[fieldName] : "";
        var s = (v === null || v === undefined) ? "" : String(v);
        if (s.length > maxLen) maxLen = s.length;
      });
      return Math.max(120, Math.min(420, 8 * maxLen + 40));
    },

    _buildTableS3: function (aUi01) {
      var oTable = this.byId("tableData3");
      if (!oTable) return;

      var aRows = this.getView().getModel("detail").getProperty("/RowsS3") || [];
      var aFields = Array.isArray(aUi01) ? aUi01 : [];

      oTable.removeAllColumns();
      oTable.unbindItems();
      oTable.destroyItems();

      if (!aRows.length || !aFields.length) return;

      var aCells = [];
      var totalWidth = 0;

      aFields.forEach(function (p) {
        var label = p;

        var w = this._calcColWidthPx(label, aRows, p);
        totalWidth += w;

        oTable.addColumn(new Column({
          width: w + "px",
          header: new Text({ text: label })
        }));

        aCells.push(new Text({ text: "{detail>" + p + "}" }));
      }.bind(this));

      var oTemplate = new ColumnListItem({
        type: "Active",
        press: this.onRowPress.bind(this),
        cells: aCells
      });

      oTable.setFixedLayout(false);
      oTable.setWidth(Math.max(1000, totalWidth) + "px");

      oTable.bindItems({
        path: "detail>/RowsS3",
        template: oTemplate
      });
    },

    // =========================
    // EVENTS
    // =========================
    onRowPress: function (oEvent) {
      var oItem = oEvent.getSource();
      var oCtx = oItem.getBindingContext("detail");
      if (!oCtx) return;

      var iIdx = oCtx.getProperty("idx");
      if (iIdx === undefined || iIdx === null) iIdx = 0;

      this.getOwnerComponent().getRouter().navTo("Screen4", {
        vendorId: encodeURIComponent(this._sVendorId),
        material: encodeURIComponent(this._sMaterial),
        recordKey: encodeURIComponent(String(iIdx)),
        mode: this._sMode || "A"
      });
    },

    onNavBack: function () {
      var oHistory = History.getInstance();
      var sPreviousHash = oHistory.getPreviousHash();

      if (sPreviousHash !== undefined) {
        window.history.go(-1);
      } else {
        this.getOwnerComponent().getRouter().navTo("Screen2", {
          vendorId: encodeURIComponent(this._sVendorId),
          mode: this._sMode || "A"
        }, true);
      }
    }

  });
});
