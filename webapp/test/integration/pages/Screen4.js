sap.ui.define([
  "sap/ui/test/Opa5",
  "sap/ui/test/actions/Press",
  "sap/ui/test/actions/EnterText",
  "./Common"
], function (Opa5, Press, EnterText, Common) {
  "use strict";

  Opa5.createPageObjects({
    onTheScreen4Page: {
      actions: {
        iEditDetailFieldTo: function (sFieldPath, sValue) {
          return this.waitFor({
            controlType: "sap.m.Input",
            viewName: "Screen4",
            success: function (aInputs) {
              var oInput = Common.findInputByBindingPath(aInputs, "detail", sFieldPath, "inputFilter4", ["/Rows/"]);
              Opa5.assert.ok(!!oInput, "Found Screen4 input bound to " + sFieldPath);
              new EnterText({ text: sValue, clearTextFirst: true }).executeOn(oInput);
              Common.writeBoundFieldValue(oInput, "detail", sFieldPath, sValue);
              Common.setInputValue(oInput, sValue);
            },
            errorMessage: "Editable Screen4 input not found for " + sFieldPath
          });
        },

        iPressSave: function () {
          return this.waitFor({
            id: "btnSaveToBackend4",
            viewName: "Screen4",
            actions: new Press(),
            errorMessage: "Screen4 save button not found"
          });
        }
      },

      assertions: {
        iShouldSeeRowsLoaded: function () {
          return this.waitFor({
            id: "page4",
            viewName: "Screen4",
            check: function (oPage) {
              var oDetail = oPage.getModel("detail");
              return !!oDetail && (oDetail.getProperty("/RowsCount") || 0) > 0;
            },
            success: function (oPage) {
              var oDetail = oPage.getModel("detail");
              Opa5.assert.ok((oDetail.getProperty("/RowsCount") || 0) > 0, "Screen4 detail rows are loaded");
            },
            errorMessage: "Screen4 rows were not loaded"
          });
        },

        iShouldSeeBackendDetailFieldValue: function (sFieldPath, sValue) {
          return this.waitFor({
            check: function () {
              var aRows = Common.getBackendSnapshot().dataRows || [];
              return aRows.some(function (row) {
                return row.Guid === "GUID-001" && String(row[sFieldPath] || "") === sValue;
              });
            },
            success: function () {
              Opa5.assert.ok(true, "Backend state reflects Screen4 save for " + sFieldPath);
            },
            errorMessage: "Backend state was not updated after Screen4 save"
          });
        }
      }
    }
  });
});
