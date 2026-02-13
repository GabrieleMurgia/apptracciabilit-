sap.ui.define([
  "apptracciabilita/apptracciabilita/controller/BaseController",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator"
], function (BaseController, Filter, FilterOperator) {
  "use strict";

  return BaseController.extend("apptracciabilita.apptracciabilita.controller.Screen1", {

    _sLogPrefix: "[S1]",

    onInit: function () {
      var oRouter = this.getOwnerComponent().getRouter();
      oRouter.getRoute("Screen1").attachPatternMatched(this._onRouteMatched, this);
    },

    _onRouteMatched: function (oEvent) {
      var oArgs = oEvent.getParameter("arguments");
      this._sMode = oArgs.mode;

      var self = this;
      this._ensureUserInfosLoaded().then(function () {
        var oVm = self.getOwnerComponent().getModel("vm");
        self.getView().setModel(oVm, "vm");
        self._sUserType = oVm.getProperty("/userType");
        self._applyFilters();
      });
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

      var sVendorId = oCtx.getProperty("Fornitore");
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
      var oTable = this.byId("tableVendors1");
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
            new Filter("Open", FilterOperator.EQ, "X"),
            new Filter("ToApprove", FilterOperator.GT, 0),
            new Filter("Rejected", FilterOperator.GT, 0)
          ],
          and: false
        }));
      }

      var sText = this.byId("inputVendorFilter1").getValue();
      if (sText) {
        aFilters.push(new Filter({
          filters: [
            new Filter("ReagSoc", FilterOperator.Contains, sText),
            new Filter("Fornitore", FilterOperator.Contains, sText)
          ],
          and: false
        }));
      }

      oBinding.filter(aFilters, "Application");
    },

    // NavBack fallback: torna a Screen0
    _getNavBackFallback: function () {
      return { route: "Screen0", params: {} };
    }
  });
});