// webapp/controller/Screen2.controller.js
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

  return Controller.extend("apptracciabilita.apptracciabilita.controller.Screen2", {

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
      var oArgs = oEvent.getParameter("arguments");
      this._sMode = oArgs.mode; // 'A', 'M', 'T'
      this._sVendorId = decodeURIComponent(oArgs.vendorId);

      var oViewModel = this.getView().getModel();
      oViewModel.setProperty("/CurrentVendorId", this._sVendorId);

      // Recupero nome vendor da vm
      var oVm = this.getOwnerComponent().getModel("vm");
      var sVendorName = this._sVendorId;

      if (oVm) {
        var aVendors = oVm.getProperty("/userVendors") || [];
        var oVendor = aVendors.find(function (v) {
          return String(v.Fornitore) === String(this._sVendorId);
        }.bind(this));
        if (oVendor) sVendorName = oVendor.ReagSoc;
      }

      oViewModel.setProperty("/CurrentVendorName", sVendorName);

      this._loadMaterials();
    },

    _loadMaterials: function () {
      var oViewModel = this.getView().getModel();
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var bMockS2 = !!mock.mockS2;

      // =========================
      // ✅ MOCK Screen2
      // =========================
      if (bMockS2) {
        BusyIndicator.show(0);

        // piccolo delay per simulare async
        setTimeout(function () {
          try {
            var aMaterials = MockData.buildMaterialsForVendor(this._sVendorId) || [];
            oViewModel.setProperty("/Materials", aMaterials);
            this._applyFilters();
          } catch (e) {
            console.error("[Screen2][MOCK] buildMaterialsForVendor ERROR", e);
            MessageToast.show("Errore mock materiali");
          } finally {
            BusyIndicator.hide();
          }
        }.bind(this), 60);

        return;
      }

      // =========================
      // ✅ BACKEND read MaterialDataSet
      // =========================
      var oODataModel = this.getOwnerComponent().getModel(); // ZVEND_TRACE_SRV
      var that = this;

      var sVendorId = this._sVendorId;
      var sUserId = (oVm && oVm.getProperty("/userId")) || "E_ZEMAF";

      BusyIndicator.show(0);

      var aFilters = [
        new Filter("Fornitore", FilterOperator.EQ, sVendorId),
        new Filter("UserID", FilterOperator.EQ, sUserId)
      ];

      oODataModel.read("/MaterialDataSet", {
        filters: aFilters,
        success: function (oData) {
          BusyIndicator.hide();

          var aResults = (oData && oData.results) || [];

          var aMaterials = aResults.map(function (m) {
            return {
              Material: m.Materiale,
              MaterialDescription: m.DescMateriale,
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
            new Filter("MaterialDescription", FilterOperator.Contains, sTextFilter)
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
