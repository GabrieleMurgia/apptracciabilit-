sap.ui.define([
  "sap/ui/test/Opa5"
], function (Opa5) {
  "use strict";

  Opa5.createPageObjects({
    onTheScreen1Page: {
      actions: {
        iPressFirstVendor: function () {
          return this.waitFor({
            id: "tableVendors1",
            viewName: "Screen1",
            success: function (oTable) {
              var aItems = oTable.getItems() || [];
              Opa5.assert.ok(aItems.length > 0, "Vendor table has at least one row");
              oTable.fireItemPress({ listItem: aItems[0] });
            },
            errorMessage: "Vendor table not found"
          });
        }
      },

      assertions: {
        iShouldSeeVendorsLoaded: function () {
          return this.waitFor({
            id: "tableVendors1",
            viewName: "Screen1",
            check: function (oTable) {
              return (oTable.getItems() || []).length > 0;
            },
            success: function (oTable) {
              Opa5.assert.ok((oTable.getItems() || []).length > 0, "Vendors are loaded");
            },
            errorMessage: "Screen1 vendor rows were not loaded"
          });
        }
      }
    }
  });
});
