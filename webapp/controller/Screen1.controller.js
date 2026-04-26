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

        // Reload vendors from backend to get fresh counters
        self._reloadVendors();
      });
    },

    // =========================================================
    // RELOAD VENDORS (fresh call to /VendorDataSet)
    // =========================================================
    _reloadVendors: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      var oModel = this.getOwnerComponent().getModel();
      if (!oModel || typeof oModel.read !== "function") { this._applyFilters(); return; }

      var sUserId = oVm.getProperty("/userId") || "";

      var self = this;
      BusyIndicator.show(0);

      oModel.read("/VendorDataSet", {
        filters: sUserId ? [new Filter("UserID", FilterOperator.EQ, sUserId)] : [],
        urlParameters: { "sap-language": "IT" },
        success: function (oData) {
          BusyIndicator.hide();
          var aVend = (oData && oData.results) || [];
          oVm.setProperty("/userVendors", aVend);
          oVm.setProperty("/UserInfosVend", aVend);

          // Invalidate Screen0's cached promise so it reloads too
          oVm.setProperty("/__vendorCacheStale", true);

          // Build categories list with descriptions for ComboBox
          self._buildCategoriesList(aVend);

          self._applyFilters();
        },
        error: function (oError) {
          BusyIndicator.hide();
          console.error("[Screen1] VendorDataSet reload ERROR", oError);
          // Use stale data as fallback
          self._applyFilters();
        }
      });
    },

    // =========================================================
    // BUILD CATEGORIES LIST (with descriptions, like Screen5)
    // =========================================================
    _buildCategoriesList: function (aVendors) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mSeen = {};
      var aCatList = [];

      // Extract from vendor records
      (aVendors || []).forEach(function (v) {
        var sCat = String(v.CatMateriale || "").trim();
        if (!sCat || mSeen[sCat]) return;
        mSeen[sCat] = true;
        var sDesc = String(v.MatCatDesc || "").trim();
        aCatList.push({ key: sCat, text: sDesc ? (sCat + " – " + sDesc) : sCat });
      });

      // Also merge from MMCT if available
      var mCats = oVm.getProperty("/mmctFieldsByCat") || {};
      Object.keys(mCats).forEach(function (k) {
        if (mSeen[k]) return;
        mSeen[k] = true;
        // Try to find description from MMCT
        var sDesc = "";
        try {
          var aMMCT = oVm.getProperty("/userCategories") || oVm.getProperty("/userMMCT") || oVm.getProperty("/UserInfosMMCT") || [];
          (aMMCT || []).some(function (cat) {
            var c = String(cat.CatMateriale || cat.CATMATERIALE || "").trim();
            if (c === k) {
              sDesc = String(cat.CatMaterialeDesc || cat.MatCatDesc || cat.DescCatMateriale || "").trim();
              return true;
            }
            return false;
          });
        } catch (e) {}
        aCatList.push({ key: k, text: sDesc ? (k + " – " + sDesc) : k });
      });

      aCatList.sort(function (a, b) { return a.text.localeCompare(b.text); });

      // Add empty option at the beginning to clear filter
      aCatList.unshift({ key: "", text: "Tutte le categorie" });

      oVm.setProperty("/userCategoriesList", aCatList);
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

      // Save CatMateriale from the clicked row to pass to Screen2
      var sCatFromRow = String(oCtx.getProperty("CatMateriale") || "").trim();
      var oVm = this.getOwnerComponent().getModel("vm");
      if (oVm) {
        oVm.setProperty("/__selectedCatMateriale", sCatFromRow);
      }

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

      // Category filter
      var oCombo = this.byId("comboCatMat1");
      var sSelectedCat = oCombo ? oCombo.getSelectedKey() : "";
      if (sSelectedCat) {
        aFilters.push(new Filter("CatMateriale", FilterOperator.EQ, sSelectedCat));
      }

      // Only incomplete filter
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

      // Vendor text search
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
