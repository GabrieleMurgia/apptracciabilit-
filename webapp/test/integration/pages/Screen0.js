sap.ui.define([
  "sap/ui/test/Opa5",
  "sap/ui/test/actions/Press"
], function (Opa5, Press) {
  "use strict";

  Opa5.createPageObjects({
    onTheScreen0Page: {
      actions: {
        iPressFlowATile: function () {
          return this.waitFor({
            id: "tileFlowA",
            viewName: "Screen0",
            actions: new Press(),
            errorMessage: "Flow A tile not found"
          });
        },

        iPressFlowBTile: function () {
          return this.waitFor({
            id: "tileFlowB",
            viewName: "Screen0",
            actions: new Press(),
            errorMessage: "Flow B tile not found"
          });
        },

        iPressFlowCTile: function () {
          return this.waitFor({
            id: "tileFlowC",
            viewName: "Screen0",
            actions: new Press(),
            errorMessage: "Flow C tile not found"
          });
        }
      },

      assertions: {
        iShouldSeeLandingPage: function () {
          return this.waitFor({
            id: "page0",
            viewName: "Screen0",
            success: function () {
              Opa5.assert.ok(true, "Screen0 is visible");
            },
            errorMessage: "Screen0 page not found"
          });
        },

        iShouldExposeUserType: function (sExpected) {
          return this.waitFor({
            id: "page0",
            viewName: "Screen0",
            check: function (oPage) {
              var oVm = oPage.getModel("vm");
              return !!oVm && String(oVm.getProperty("/userType") || "").trim().toUpperCase() === String(sExpected || "").trim().toUpperCase();
            },
            success: function () {
              Opa5.assert.ok(true, "Screen0 vm>/userType matches " + sExpected);
            },
            errorMessage: "Screen0 vm>/userType did not match " + sExpected
          });
        },

        iShouldExposeAggregatedTileState: function (bExpected) {
          return this.waitFor({
            id: "page0",
            viewName: "Screen0",
            check: function (oPage) {
              var oVm = oPage.getModel("vm");
              return !!oVm && !!oVm.getProperty("/showAggregatedTile") === !!bExpected;
            },
            success: function () {
              Opa5.assert.ok(true, "Screen0 aggregated tile state matches " + bExpected);
            },
            errorMessage: "Screen0 aggregated tile state did not match " + bExpected
          });
        }
      }
    }
  });
});
