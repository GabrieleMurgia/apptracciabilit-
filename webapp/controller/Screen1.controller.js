sap.ui.define([
  "apptracciabilita/apptracciabilita/controller/BaseController",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/core/BusyIndicator"
], function (BaseController, Filter, FilterOperator, BusyIndicator) {
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
        self._reloadVendors();
      });
    },

    _reloadVendors: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      var oModel = this.getOwnerComponent().getModel();
      if (!oModel || typeof oModel.read !== "function") { this._applyFilters(); return; }

      var mock = (oVm && oVm.getProperty("/mock")) || {};
      if (mock.mockS0 || mock.mockVendors) { this._applyFilters(); return; }

      var sUserId = oVm.getProperty("/userId") || "";
      var self = this;
      BusyIndicator.show(0);

      oModel.read("/VendorDataSet", {
        filters: sUserId ? [new Filter("UserID", FilterOperator.EQ, sUserId)] : [],
        urlParameters: { "sap-language": "IT", "$top": "99999" },
        success: function (oData) {
          BusyIndicator.hide();
          var aVend = (oData && oData.results) || [];
          console.log("[Screen1] VendorDataSet reloaded:", aVend.length, "vendors");
          oVm.setProperty("/userVendors", aVend);
          oVm.setProperty("/UserInfosVend", aVend);
          oVm.setProperty("/__vendorCacheStale", true);

          // Build categories list from vendor data
          self._buildCategoriesList(aVend);

          self._applyFilters();
        },
        error: function (oError) {
          BusyIndicator.hide();
          console.error("[Screen1] VendorDataSet reload ERROR", oError);
          self._applyFilters();
        }
      });
    },

    // =========================================================
    // BUILD CATEGORIES LIST from vendor records
    // =========================================================
    _buildCategoriesList: function (aVend) {
      var oVm = this.getOwnerComponent().getModel("vm");
      // If userCategoriesList already populated (from Screen0/Screen5), skip
      var aExisting = oVm.getProperty("/userCategoriesList") || [];
      if (aExisting.length) return;

      // Extract unique CatMateriale values from vendors
      var mCats = {};
      (aVend || []).forEach(function (v) {
        var sCat = String(v.CatMateriale || "").trim();
        if (sCat && !mCats[sCat]) {
          mCats[sCat] = true;
        }
      });

      var aList = Object.keys(mCats).sort().map(function (k) {
        return { key: k, text: k };
      });

      oVm.setProperty("/userCategoriesList", aList);
      console.log("[Screen1] Categories built from vendors:", aList.length);
    },

    // =========================================================
    // VENDOR PRESS — passa anche la categoria selezionata
    // =========================================================
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

      // Save selected category in vm so Screen2 can use it as filter
      var oCombo = this.byId("comboCatMat1");
      var sSelectedCat = (oCombo && oCombo.getSelectedKey()) || "";
      var oVm = this.getOwnerComponent().getModel("vm");
      oVm.setProperty("/__selectedCatMateriale", sSelectedCat);

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
      if (!oBinding) return;

      var aFilters = [];

      // ── Filtro per Categoria Materiale ──
      var oCombo = this.byId("comboCatMat1");
      var sSelectedCat = (oCombo && oCombo.getSelectedKey()) || "";
      if (sSelectedCat) {
        aFilters.push(new Filter("CatMateriale", FilterOperator.EQ, sSelectedCat));
      }

      // ── Filtro solo dati incompleti ──
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

      // ── Filtro testo fornitore ──
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

    _getNavBackFallback: function () {
      return { route: "Screen0", params: {} };
    }
  });
});