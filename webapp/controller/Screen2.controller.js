sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/routing/History",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/core/BusyIndicator",
  "sap/m/MessageToast",
  "apptracciabilita/apptracciabilita/util/mockData"
], function (Controller, History, JSONModel, Filter, FilterOperator, BusyIndicator, MessageToast, MockData) {
  "use strict";

function getODataErrorMessage(oError) {
  try {
    if (oError && oError.responseText) {
      var o = JSON.parse(oError.responseText);
      var v = o && o.error && o.error.message && (o.error.message.value || o.error.message);
      if (v) return String(v);
    }
    if (oError && oError.message) return String(oError.message);
  } catch (e) { /* ignore */ }
  return "Errore imprevisto";
}

function recomputeSupportFields(row) {
  var searchAll = [
    safeStr(row.Material),
    safeStr(row.MaterialOriginal),
    safeStr(row.MaterialDescription),
    safeStr(row.Stagione),
    safeStr(row.MatStatus),
    safeStr(row.Open),
    safeStr(row.Rejected),
    safeStr(row.Pending),
    safeStr(row.Approved)
  ].join(" ");

  row.StagioneLC = lc(row.Stagione);
  row.MaterialLC = lc(row.Material);
  row.MaterialOriginalLC = lc(row.MaterialOriginal);
  row.SearchAllLC = lc(searchAll);
}

  function ts() { return new Date().toISOString(); }

  function safeStr(x) { return (x === null || x === undefined) ? "" : String(x); }
  function lc(x) { return safeStr(x).toLowerCase(); }

  function looksLikeMatCode(s) {
    s = safeStr(s).trim();
    if (!s) return false;
    if (/\s/.test(s)) return false;
    if (!/^[A-Za-z0-9._-]+$/.test(s)) return false;
    return s.length >= 6;
  }

  function chooseMaterialKey(m) {
    var mat = safeStr(m && m.Materiale).trim();
    var desc = safeStr(m && m.DescMateriale).trim();

    if (!mat) return desc;
    if (!desc) return mat;

    if (!looksLikeMatCode(desc)) return mat;
    if (looksLikeMatCode(mat) && desc !== mat) return desc;

    return mat;
  }

  // ✅ crea una riga coerente (MOCK + BACKEND) e i campi supporto filtri
  function buildRow(m) {
    var keyForDataSet = chooseMaterialKey(m);

    var material = safeStr(keyForDataSet).trim();
    var materialOrig = safeStr(m.Materiale).trim();
    var desc = safeStr(m.DescMateriale).trim();
    var season = safeStr(m.Stagione).trim();
    var status = safeStr(m.MatStatus).trim();

    var open = safeStr(m.Open).trim();
    var rejected = Number(m.Rejected) || 0;
    var pending = Number(m.ToApprove) || 0;
    var approved = Number(m.Approved) || 0;

    var searchAll = [
      material, materialOrig, desc,
      season, status,
      open, rejected, pending, approved
    ].join(" ");

    return {
      Material: material,
      MaterialOriginal: materialOrig,
      MaterialDescription: desc,

      Stagione: season,
      MatStatus: status,

      OpenPo: open === "X" ? 1 : 0,
      Open: open,
      Rejected: rejected,
      Pending: pending,
      ToApprove: pending,
      Approved: approved,

      // supporto filtri testuali case-insensitive
      StagioneLC: lc(season),
      MaterialLC: lc(material),
      MaterialOriginalLC: lc(materialOrig),
      SearchAllLC: lc(searchAll)
    };
  }

  return Controller.extend("apptracciabilita.apptracciabilita.controller.Screen2", {

    onMatStatusPress: function (oEvent) {
  var oBtn = oEvent.getSource();
  var oCtx = oBtn.getBindingContext(); // contesto JSONModel della riga
  if (!oCtx) return;

  var oRow = oCtx.getObject() || {};
  var sPath = oCtx.getPath(); // es: "/Materials/3"

  // valori da inviare
  var sVendor = safeStr(this._sVendorId).trim();
  // se vuoi padding vendor e hai MockData.padVendor, usa questo:
  if (MockData && typeof MockData.padVendor === "function") {
    sVendor = MockData.padVendor(sVendor);
  }

  var sMateriale = safeStr(oRow.MaterialOriginal || oRow.Material).trim();
  var sStagione = safeStr(oRow.Stagione).trim();

  // toggle status
  var sCurr = safeStr(oRow.MatStatus).trim();
  var sNewStatus = (sCurr === "LOCK") ? "RELE" : "LOCK";

  var oPayload = {
    Fornitore: sVendor,
    Materiale: sMateriale,
    Stagione: sStagione,
    MatStatus: sNewStatus
  };

  // se sei in MOCK, aggiorna localmente (così non “rompe” in test)
  var oVm = this.getOwnerComponent().getModel("vm");
  var mock = (oVm && oVm.getProperty("/mock")) || {};
  var bMockS2 = !!mock.mockS2;
  if (bMockS2) {
    var oJson = this.getView().getModel();
    oJson.setProperty(sPath + "/MatStatus", sNewStatus);

    var r = oJson.getProperty(sPath);
    recomputeSupportFields(r);
    oJson.refresh(true);

    MessageToast.show("MOCK: stato aggiornato a " + sNewStatus);
    return;
  }

  var oODataModel = this.getOwnerComponent().getModel();  // OData v2
  var oJsonModel = this.getView().getModel();

  // evita doppio click
  oBtn.setEnabled(false);
  BusyIndicator.show(0);

  oODataModel.create("/MaterialStatusSet", oPayload, {
    success: function (oData) {
      BusyIndicator.hide();
      oBtn.setEnabled(true);

      // fallback: se il backend non rimanda MatStatus, uso quello inviato
      var sReturnedStatus = safeStr((oData && oData.MatStatus) || sNewStatus).trim();

      oJsonModel.setProperty(sPath + "/MatStatus", sReturnedStatus);

      // se torna la stagione aggiornata
      if (oData && oData.Stagione !== undefined) {
        oJsonModel.setProperty(sPath + "/Stagione", safeStr(oData.Stagione).trim());
      }

      // opzionale: se il backend rimanda anche questi campi, li aggiorno
      if (oData && oData.Open !== undefined) {
        var open = safeStr(oData.Open).trim();
        oJsonModel.setProperty(sPath + "/Open", open);
        oJsonModel.setProperty(sPath + "/OpenPo", open === "X" ? 1 : 0);
      }
      if (oData && oData.Rejected !== undefined) {
        oJsonModel.setProperty(sPath + "/Rejected", Number(oData.Rejected) || 0);
      }
      if (oData && oData.ToApprove !== undefined) {
        var pend = Number(oData.ToApprove) || 0;
        oJsonModel.setProperty(sPath + "/Pending", pend);
        oJsonModel.setProperty(sPath + "/ToApprove", pend);
      }
      if (oData && oData.Approved !== undefined) {
        oJsonModel.setProperty(sPath + "/Approved", Number(oData.Approved) || 0);
      }

      // ricalcolo campi filtro
      var row = oJsonModel.getProperty(sPath);
      recomputeSupportFields(row);
      oJsonModel.refresh(true);

      MessageToast.show("Stato aggiornato con successo");
    },
    error: function (oError) {
      BusyIndicator.hide();
      oBtn.setEnabled(true);

      console.error("[Screen2] MaterialStatusSet POST error", oError);
      MessageToast.show("Errore aggiornamento stato: " + getODataErrorMessage(oError));
    }
  });
},


    _log: function () {
      var a = Array.prototype.slice.call(arguments);
      a.unshift("[Screen2] " + ts());
      console.log.apply(console, a);
    },

    onInit: function () {
      var oRouter = this.getOwnerComponent().getRouter();
      oRouter.getRoute("Screen2").attachPatternMatched(this._onRouteMatched, this);

      var oModel = new JSONModel({
        CurrentVendorId: "",
        CurrentVendorName: "",
        MatCategories: [],
        SelectedMatCat: "",
        Materials: []
      });
      this.getView().setModel(oModel);
    },

    _onRouteMatched: function (oEvent) {
      var oArgs = oEvent.getParameter("arguments") || {};
      this._sMode = oArgs.mode || "A";
      this._sVendorId = decodeURIComponent(oArgs.vendorId || "");

      this._log("route matched", { mode: this._sMode, vendorId: this._sVendorId });

      var oViewModel = this.getView().getModel();
      oViewModel.setProperty("/CurrentVendorId", this._sVendorId);

      var oVm = this.getOwnerComponent().getModel("vm");
      var sVendorName = this._sVendorId;

      if (oVm) {
        var aVendors = oVm.getProperty("/userVendors") || oVm.getProperty("/UserInfosVend") || [];
        var oVendor = aVendors.find(function (v) {
          return safeStr(v.Fornitore || v.VENDOR || v.Lifnr) === safeStr(this._sVendorId);
        }.bind(this));

        if (oVendor) sVendorName = oVendor.ReagSoc || oVendor.RagSoc || oVendor.Name || sVendorName;
      }

      oViewModel.setProperty("/CurrentVendorName", sVendorName);

      this._loadMaterials();
    },

    _loadMaterials: function () {
      var oViewModel = this.getView().getModel();
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var bMockS2 = !!mock.mockS2;

      this._log("_loadMaterials mock?", { mockS2: bMockS2, mock: mock });

      // =========================
      // MOCK Screen2
      // =========================
      if (bMockS2) {
        var sVendorWanted = MockData.padVendor(this._sVendorId);
        var sUserId = String((oVm && oVm.getProperty("/userId")) || "E_ZEMAF").trim();

        BusyIndicator.show(0);
        this._log("[MOCK FILE] loading MaterialDataSet.json", { userId: sUserId, vendorId: sVendorWanted });

        MockData.loadMaterialDataSetGeneric().then(function (aAll) {
          // se vuoi filtrare qui, fallo (ora lasciamo tutto)
          var aFiltered = aAll;

          var aMaterials = aFiltered.map(buildRow);
          oViewModel.setProperty("/Materials", aMaterials);

          this._applyFilters();
        }.bind(this)).catch(function (err) {
          console.error("[Screen2][MOCK FILE] ERROR", err);
          MessageToast.show("MOCK MaterialDataSet.json NON TROVATO o non leggibile");
        }).finally(function () {
          BusyIndicator.hide();
        });

        return;
      }

      // =========================
      // BACKEND read MaterialDataSet
      // =========================
      var oODataModel = this.getOwnerComponent().getModel();
      var that = this;

      var sVendorId = this._sVendorId;
      var sUserId2 = (oVm && oVm.getProperty("/userId")) || "E_ZEMAF";

      BusyIndicator.show(0);

      var aFilters = [
        new Filter("Fornitore", FilterOperator.EQ, sVendorId),
        new Filter("UserID", FilterOperator.EQ, sUserId2)
      ];

      oODataModel.read("/MaterialDataSet", {
        filters: aFilters,
        success: function (oData) {
          debugger
          BusyIndicator.hide();

          var aResults = (oData && oData.results) || [];
          var aMaterials = aResults.map(buildRow);

          oViewModel.setProperty("/Materials", aMaterials);
          that._applyFilters();
        },
        error: function (oError) {
          BusyIndicator.hide();
          console.error("Errore lettura MaterialDataSet", oError);
          MessageToast.show("Errore nel caricamento dei materiali");
        }
      });
    },

    onFilterChanged: function () {
      this._applyFilters();
    },

    _applyFilters: function () {
      var oTable = this.byId("tableMaterials2");
      var oBinding = oTable && oTable.getBinding("items");
      if (!oBinding) return;

      var bOnlyIncomplete = this.byId("switchOnlyIncomplete2").getState();

      var sSeasonText = (this.byId("inputSeasonFilter2").getValue() || "").trim().toLowerCase();
      var sMaterialOnly = (this.byId("inputMaterialOnly2").getValue() || "").trim().toLowerCase();
      var sGeneral = (this.byId("inputMaterialFilter2").getValue() || "").trim().toLowerCase();

      var aFilters = [];

      if (bOnlyIncomplete) {
        aFilters.push(new Filter({
          filters: [
            new Filter("OpenPo", FilterOperator.GT, 0),
            new Filter("Pending", FilterOperator.GT, 0),
            new Filter("Rejected", FilterOperator.GT, 0)
          ],
          and: false
        }));
      }

      if (sSeasonText) {
        aFilters.push(new Filter("StagioneLC", FilterOperator.Contains, sSeasonText));
      }

      if (sMaterialOnly) {
        aFilters.push(new Filter({
          filters: [
            new Filter("MaterialLC", FilterOperator.Contains, sMaterialOnly),
            new Filter("MaterialOriginalLC", FilterOperator.Contains, sMaterialOnly)
          ],
          and: false
        }));
      }

      if (sGeneral) {
        aFilters.push(new Filter("SearchAllLC", FilterOperator.Contains, sGeneral));
      }

      oBinding.filter(aFilters, "Application");
    },

    onMaterialPress: function (oEvent) {
        var oSrc = oEvent.getParameter("srcControl");
  if (oSrc && oSrc.isA && oSrc.isA("sap.m.Button")) {
    return; // click su bottone: non navigo
  }
      var oItem = oEvent.getSource().getSelectedItem();
      var oCtx = oItem.getBindingContext();

      var sMaterial = oCtx.getProperty("Material");
      var sMaterialDesc = oCtx.getProperty("MaterialDescription");
      var sMaterialOrig = oCtx.getProperty("MaterialOriginal");

      try {
        var oVm = this.getOwnerComponent().getModel("vm");
        if (oVm) {
          var cache = oVm.getProperty("/cache") || { dataRowsByKey: {}, recordsByKey: {} };
          cache.recordsByKey = cache.recordsByKey || {};

          var k = "MATINFO|" + String(this._sVendorId) + "|" + String(sMaterial);
          cache.recordsByKey[k] = { desc: sMaterialDesc, orig: sMaterialOrig };

          oVm.setProperty("/cache", cache);
        }
      } catch (e) {
        console.warn("[Screen2] cache MATINFO error", e);
      }

      this.getOwnerComponent().getRouter().navTo("Screen3", {
        vendorId: encodeURIComponent(this._sVendorId),
        material: encodeURIComponent(sMaterial),
        mode: this._sMode || "A"
      });
    },

    onNavBack: function () {
      var oHistory = History.getInstance();
      var sPreviousHash = oHistory.getPreviousHash();

      if (sPreviousHash !== undefined) {
        window.history.go(-1);
      } else {
        this.getOwnerComponent().getRouter().navTo("Screen1", {
          mode: this._sMode || "A"
        }, true);
      }
    }
  });
});
