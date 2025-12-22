sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/routing/History",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/core/BusyIndicator",
  "sap/m/MessageToast",
  "sap/m/Column",
  "sap/m/ColumnListItem",
  "sap/m/Text",
  "sap/m/ComboBox",
  "sap/m/MultiComboBox",
  "sap/ui/core/Item",
], function (
  Controller,
  History,
  JSONModel,
  Filter,
  FilterOperator,
  BusyIndicator,
  MessageToast,
  Column,
  ColumnListItem,
  Text,
  ComboBox,
  MultiComboBox,
  Item
) {
  "use strict";

  return Controller.extend("apptracciabilita.apptracciabilita.controller.Screen3", {

    onInit: function () {
      var oRouter = this.getOwnerComponent().getRouter();
      oRouter.getRoute("Screen3").attachPatternMatched(this._onRouteMatched, this);

      // Modello locale "detail"
      var oModel = new JSONModel({
        VendorId: "",
        VendorName: "",
        Material: "",
        MaterialGroup: "",
        Rows: []
      });
      this.getView().setModel(oModel, "detail");
    },

    _onRouteMatched: function (oEvent) {
      var oArgs = oEvent.getParameter("arguments");
      this._sMode       = oArgs.mode || "A";
      this._sVendorId   = decodeURIComponent(oArgs.vendorId);
      this._sMaterial   = decodeURIComponent(oArgs.material);
      this._sVendorName = decodeURIComponent(oArgs.vendorName || "");
      this._sMatGroup   = decodeURIComponent(oArgs.matGroup || "");

      var oDetailModel = this.getView().getModel("detail");
      oDetailModel.setData({
        VendorId:      this._sVendorId,
        VendorName:    this._sVendorName,
        Material:      this._sMaterial,
        MaterialGroup: this._sMatGroup,
        Rows:          []
      }, true);

      this._loadData();
    },

    _loadData: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      var sUserId = (oVm && oVm.getProperty("/userId")) || "E_ZEMAF";
      var oODataModel  = this.getOwnerComponent().getModel(); 

      var oDetailModel = this.getView().getModel("detail");
      var that         = this;

      var aFilters = [
        new Filter("UserID",    FilterOperator.EQ, sUserId),     
        new Filter("Fornitore", FilterOperator.EQ, this._sVendorId),
        new Filter("Materiale", FilterOperator.EQ, this._sMaterial)
      ];

      BusyIndicator.show(0);

      oODataModel.read("/DataSet", {
        filters: aFilters,
        success: function (oData) {
        var oVm = that.getOwnerComponent().getModel("vm");
        console.log("vm model:", oVm);
        console.log("vm data:", oVm && oVm.getData());

          BusyIndicator.hide();
          var aResults = (oData && oData.results) || [];

          oDetailModel.setProperty("/Rows", aResults);

          that._buildDynamicTable(aResults);
        },
        error: function (oError) {
          BusyIndicator.hide();
          console.error("Errore lettura DataSet", oError);
          MessageToast.show("Errore nel caricamento dei dati di tracciabilità");
        }
      });
    },

_buildDynamicTable: function (aRows) {
  var oTable = this.byId("tableData3");
  oTable.removeAllColumns();
  oTable.unbindItems();

  if (!aRows || !aRows.length) {
    return;
  }

  var oVm = this.getOwnerComponent().getModel("vm");
  if (oVm && !this.getView().getModel("vm")) {
    this.getView().setModel(oVm, "vm");
  }

  var mFieldsByCat   = (oVm && oVm.getProperty("/mmctFieldsByCat")) || {};
  var mDomainsByName = (oVm && oVm.getProperty("/domainsByName")) || {};

  var aCats = Array.from(new Set(
    aRows.map(function (r) { return r.CatMateriale; }).filter(Boolean)
  ));

  var mFieldMetaByUi = {};
  aCats.forEach(function (sCat) {
    var aCfg = mFieldsByCat[sCat] || [];
    aCfg.forEach(function (f) {
      var sUi = f.UiFieldname;
      if (!sUi) return;
      if (!mFieldMetaByUi[sUi]) {
        mFieldMetaByUi[sUi] = f;
      }
    });
  });

  var aUiFields = Object.keys(mFieldMetaByUi);

  if (!aUiFields.length) {
    aUiFields = Object.keys(aRows[0]).filter(function (sProp) {
      return sProp !== "__metadata" && sProp !== "AllData";
    });
  }

  var bMultiCat = aCats.length > 1;
  if (bMultiCat && !aUiFields.includes("CatMateriale")) {
    aUiFields.unshift("CatMateriale");
  }

  aUiFields = aUiFields.filter(function (sField) {
    return aRows.some(function (r) { return r && Object.prototype.hasOwnProperty.call(r, sField); });
  });

  function parseMulti(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    return String(v)
      .split(/[;,|]/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  var aColumns = [];
  var aCells = [];
  var iTotalWidthPx = 0;

  var iMinWidthPx = 90;
  var iMaxWidthPx = 260;
  var iCharPx = 8;

  aUiFields.forEach(function (sField) {
    var oMeta = mFieldMetaByUi[sField];

    var sHeader =
      (oMeta && (oMeta.Descrizione || oMeta.Description)) ||
      sField;

    var iMaxLen = sHeader.length;

    aRows.forEach(function (oRow) {
      var v = oRow && oRow[sField];
      if (v !== null && v !== undefined) {
        var len = String(v).length;
        if (len > iMaxLen) iMaxLen = len;
      }
    });

    var iWidthPx = Math.min(Math.max(iMinWidthPx, iMaxLen * iCharPx), iMaxWidthPx);
    iTotalWidthPx += iWidthPx;

    aColumns.push(new sap.m.Column({
      width: iWidthPx + "px",
      header: new sap.m.Text({ text: sHeader, wrapping: false })
    }));

    var sDomain = oMeta && (oMeta.Dominio || oMeta.Domain || oMeta.DOMAIN);
    var bMultiple = oMeta && oMeta.MultipleVal === "X";

    if (sField === "Fibra") {
  console.log("META Fibra", oMeta);
  console.log("Domain Fibra", sDomain);
  console.log("Domain values", mDomainsByName[sDomain]);
}

    var bHasDomainValues = !!(sDomain && mDomainsByName[sDomain] && mDomainsByName[sDomain].length);

    if (bHasDomainValues) {
      if (bMultiple) {
        var oMCB = new sap.m.MultiComboBox({
          width: "100%"
        });

        oMCB.bindItems({
          path: "vm>/domainsByName/" + sDomain,
          template: new sap.ui.core.Item({
            key: "{vm>key}",
            text: "{vm>text}"
          })
        });

        oMCB.bindProperty("selectedKeys", {
          path: "detail>" + sField,
          formatter: parseMulti
        });

        aCells.push(oMCB);

      } else {
        var oCB = new sap.m.ComboBox({
          width: "100%",
          selectedKey: "{detail>" + sField + "}"
        });

        oCB.bindItems({
          path: "vm>/domainsByName/" + sDomain,
          template: new sap.ui.core.Item({
            key: "{vm>key}",
            text: "{vm>text}"
          })
        });

        aCells.push(oCB);
      }

    } else {
      aCells.push(new sap.m.Text({
        text: "{detail>" + sField + "}",
        wrapping: false,
        tooltip: "{detail>" + sField + "}"
      }));
    }
  });

  aColumns.forEach(function (c) { oTable.addColumn(c); });

  var oTemplate = new sap.m.ColumnListItem({ cells: aCells });

  oTable.setFixedLayout(false);              
  oTable.setWidth(iTotalWidthPx + "px");     
  oTable.bindItems({ path: "detail>/Rows", template: oTemplate });

  debugger;
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
