sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/routing/History",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator"
], function (Controller, History, Filter, FilterOperator) {
  "use strict";

  return Controller.extend("apptracciabilita.apptracciabilita.controller.Screen1", {

    onInit: function () {
      var oRouter = this.getOwnerComponent().getRouter();
      oRouter.getRoute("Screen1").attachPatternMatched(this._onRouteMatched, this);
    },

    _onRouteMatched: function (oEvent) {
      var oArgs = oEvent.getParameter("arguments");
      this._sMode = oArgs.mode; // 'A', 'M', 'T'

      // Modello "vm" globale(da view0) 
      var oVm = this.getOwnerComponent().getModel("vm");
      this.getView().setModel(oVm, "vm");

      this._sUserType = oVm.getProperty("/userType");

      this._applyFilters();
    },

    onVendorPress: function (oEvent) {
      var oItem = oEvent.getParameter("listItem");
      if (!oItem) {
        console.error("onVendorPress: nessun listItem nell'evento");
        return;
      }

      var oCtx = oItem.getBindingContext("vm");
      if (!oCtx) {
        console.error("onVendorPress: bindingContext 'vm' non trovato");
        return;
      }

      var sVendorId   = oCtx.getProperty("Fornitore");
      var oRouter = this.getOwnerComponent().getRouter();
      oRouter.navTo("Screen2", {
        vendorId: encodeURIComponent(sVendorId),
        mode: this._sMode || "A"
      });
    },

    onFilterChanged: function () {
      this._applyFilters();
    },

    _applyFilters: function () {
      var oTable   = this.byId("tableVendors1");
      var oBinding = oTable && oTable.getBinding("items");
      if (!oBinding) {
        return;
      }

      var aFilters = [];

      var oSwitch = this.byId("switchOnlyIncomplete1");
      var bOnlyIncomplete = oSwitch ? oSwitch.getState() : false;

      if (bOnlyIncomplete) {
        aFilters.push(new Filter({
          filters: [
            new Filter("Open",      FilterOperator.EQ, "X"),
            new Filter("ToApprove", FilterOperator.GT, 0),
            new Filter("Rejected",  FilterOperator.GT, 0)
          ],
          and: false 
        }));
      }

      var sText = this.byId("inputVendorFilter1").getValue();
      if (sText) {
        aFilters.push(new Filter({
          filters: [
            new Filter("ReagSoc",  FilterOperator.Contains, sText),
            new Filter("Fornitore", FilterOperator.Contains, sText)
          ],
          and: false
        }));
      }

      oBinding.filter(aFilters, "Application");
    },

    onNavBack: function () {
      var oHistory = History.getInstance();
      var sPreviousHash = oHistory.getPreviousHash();

      if (sPreviousHash !== undefined) {
        window.history.go(-1);
      } else {
        this.getOwnerComponent().getRouter().navTo("Screen0", {}, true);
      }
    }
  });
});
