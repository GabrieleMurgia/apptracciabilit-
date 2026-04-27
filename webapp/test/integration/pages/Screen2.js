sap.ui.define([
  "sap/ui/test/Opa5"
], function (Opa5) {
  "use strict";

  Opa5.createPageObjects({
    onTheScreen2Page: {
      actions: {
        iPressFirstMaterial: function () {
          return this.waitFor({
            id: "tableMaterials2",
            viewName: "Screen2",
            success: function (oTable) {
              var aItems = oTable.getItems() || [];
              Opa5.assert.ok(aItems.length > 0, "Material table has at least one row");
              oTable.fireItemPress({ listItem: aItems[0] });
            },
            errorMessage: "Material table not found"
          });
        }
      },

      assertions: {
        iShouldSeeMaterialsLoaded: function () {
          return this.waitFor({
            id: "tableMaterials2",
            viewName: "Screen2",
            check: function (oTable) {
              return (oTable.getItems() || []).length > 0;
            },
            success: function (oTable) {
              Opa5.assert.ok((oTable.getItems() || []).length > 0, "Materials are loaded");
            },
            errorMessage: "Screen2 material rows were not loaded"
          });
        },

        iShouldSeeRealSupplierNoMatListSeed: function () {
          return this.waitFor({
            id: "tableMaterials2",
            viewName: "Screen2",
            check: function (oTable) {
              return (oTable.getItems() || []).length > 0 &&
                !!window.__vendTraceIntegrationBackend &&
                typeof window.__vendTraceIntegrationBackend.getStateSnapshot === "function";
            },
            success: function () {
              var oSnap = window.__vendTraceIntegrationBackend.getStateSnapshot();
              var oFirst = ((oSnap && oSnap.materialRows) || [])[0] || {};
              Opa5.assert.strictEqual(String(oFirst.Materiale || ""), "N/R", "Supplier real-derived seed uses N/R material");
              Opa5.assert.strictEqual(String(oFirst.MatStatus || ""), "DMMY", "Supplier real-derived seed preserves DMMY status");
              Opa5.assert.strictEqual(String(oFirst.CatMateriale || ""), "CF", "Supplier real-derived seed preserves CF category");
            },
            errorMessage: "Screen2 real-derived supplier seed rows were not available"
          });
        }
      }
    }
  });
});
