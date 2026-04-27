sap.ui.define([
  "sap/ui/test/Opa5",
  "sap/ui/test/actions/Press"
], function (Opa5, Press) {
  "use strict";

  Opa5.createPageObjects({
    onTheScreen5Page: {
      actions: {
        iSelectCategory: function (sKey) {
          return this.waitFor({
            id: "comboCatMat5",
            viewName: "Screen5",
            success: function (oCombo) {
              var oItem = (oCombo.getItems() || []).find(function (item) {
                return item.getKey() === sKey;
              });
              oCombo.setSelectedKey(sKey);
              oCombo.fireSelectionChange({ selectedItem: oItem || null });
            },
            errorMessage: "Screen5 category combo not found"
          });
        },

        iPressLoadData: function () {
          return this.waitFor({
            id: "btnLoadData5",
            viewName: "Screen5",
            actions: new Press(),
            errorMessage: "Screen5 load button not found"
          });
        },

        iEnterGlobalFilter: function (sValue) {
          return this.waitFor({
            id: "inputFilter5",
            viewName: "Screen5",
            success: function (oInput) {
              oInput.setValue(sValue);
              oInput.fireLiveChange({ value: sValue });
            },
            errorMessage: "Screen5 filter input not found"
          });
        }
      },

      assertions: {
        iShouldSeeLoadedRows: function () {
          return this.waitFor({
            id: "page5",
            viewName: "Screen5",
            check: function (oPage) {
              var oDetail = oPage.getModel("detail");
              return !!oDetail && (oDetail.getProperty("/RowsCount") || 0) > 0;
            },
            success: function (oPage) {
              Opa5.assert.ok((oPage.getModel("detail").getProperty("/RowsCount") || 0) > 0, "Screen5 rows are loaded");
            },
            errorMessage: "Screen5 rows were not loaded"
          });
        },

        iShouldSeeRowCount: function (iExpected) {
          return this.waitFor({
            id: "page5",
            viewName: "Screen5",
            check: function (oPage) {
              return (oPage.getModel("detail").getProperty("/RowsCount") || 0) === iExpected;
            },
            success: function (oPage) {
              Opa5.assert.strictEqual(
                oPage.getModel("detail").getProperty("/RowsCount"),
                iExpected,
                "Screen5 filtered row count matches"
              );
            },
            errorMessage: "Screen5 filtered row count does not match " + iExpected
          });
        }
      }
    }
  });
});
