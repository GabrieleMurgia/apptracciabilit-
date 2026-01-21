
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

  function ts() { return new Date().toISOString(); }

  function safeStr(x) { return (x === null || x === undefined) ? "" : String(x); }

  function looksLikeMatCode(s) {
    s = safeStr(s).trim();
    if (!s) return false;
    if (/\s/.test(s)) return false;             
    if (!/^[A-Za-z0-9._-]+$/.test(s)) return false;
    // tipico MATNR/custom code: abbastanza lungo
    return s.length >= 6;
  }

  // Heuristic: scegli la chiave più “probabile” per DataSet
  // - di default: Materiale
  // - se DescMateriale sembra un codice (e Materiale pure) e sono diversi, usa DescMateriale
  function chooseMaterialKey(m) {
    var mat = safeStr(m && m.Materiale).trim();
    var desc = safeStr(m && m.DescMateriale).trim();

    if (!mat) return desc;
    if (!desc) return mat;

    // se desc non è un “codice”, non usarlo come key
    if (!looksLikeMatCode(desc)) return mat;

    // se mat sembra un codice ma è diverso, spesso DataSet usa la variante
    if (looksLikeMatCode(mat) && desc !== mat) return desc;

    return mat;
  }

  return Controller.extend("apptracciabilita.apptracciabilita.controller.Screen2", {

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
        MaterialFilter: "",
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

      debugger

      this._log("_loadMaterials mock?", { mockS2: bMockS2, mock: mock });

      // =========================
      // MOCK Screen2 -> file generico MaterialDataSet.json
      // =========================
      if (bMockS2) {
        var sVendorWanted = MockData.padVendor(this._sVendorId);
        var sUserId = String((oVm && oVm.getProperty("/userId")) || "E_ZEMAF").trim();

        BusyIndicator.show(0);

        this._log("[MOCK FILE] loading MaterialDataSet.json", { userId: sUserId, vendorId: sVendorWanted });

        MockData.loadMaterialDataSetGeneric().then(function (aAll) {
          // filtro per UserID + Fornitore
          var aFiltered = aAll

          var aMaterials = aFiltered.map(function (m) {
            var keyForDataSet = chooseMaterialKey(m);
            return {
              Material: keyForDataSet,
              MaterialOriginal: safeStr(m.Materiale).trim(),
              MaterialDescription: safeStr(m.DescMateriale).trim(),
              OpenPo: (m.Open === "X" ? 1 : 0),
              Open: m.Open,
              Rejected: m.Rejected,
              Pending: m.ToApprove,
              ToApprove: m.ToApprove,
              Approved: m.Approved
            };
          });

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
          BusyIndicator.hide();

          var aResults = (oData && oData.results) || [];

          var aMaterials = aResults.map(function (m) {
            var keyForDataSet = chooseMaterialKey(m);
            return {
              Material: keyForDataSet,
              MaterialOriginal: safeStr(m.Materiale).trim(),
              MaterialDescription: safeStr(m.DescMateriale).trim(),
              OpenPo: m.Open === "X" ? 1 : 0,
              Open: m.Open,
              Rejected: m.Rejected,
              Pending: m.ToApprove,
              ToApprove: m.ToApprove,
              Approved: m.Approved
            };
          });

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
      var sTextFilter = this.byId("inputMaterialFilter2").getValue();

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

      if (sTextFilter) {
        aFilters.push(new Filter({
          filters: [
            new Filter("Material", FilterOperator.Contains, sTextFilter),
            new Filter("MaterialDescription", FilterOperator.Contains, sTextFilter),
            new Filter("MaterialOriginal", FilterOperator.Contains, sTextFilter)
          ],
          and: false
        }));
      }

      oBinding.filter(aFilters, "Application");
    },

    onMaterialPress: function (oEvent) {
      var oItem = oEvent.getSource().getSelectedItem();
      var oCtx = oItem.getBindingContext();
      var sMaterial = oCtx.getProperty("Material");
      var sMaterialDesc = oCtx.getProperty("MaterialDescription");
      var sMaterialOrig = oCtx.getProperty("MaterialOriginal");

      // cache per Screen3 (nome/desc da MaterialDataSet)
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
