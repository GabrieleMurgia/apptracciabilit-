sap.ui.define([
  "sap/ui/test/Opa5",
  "sap/ui/test/actions/Press",
  "sap/ui/test/actions/EnterText",
  "./Common"
], function (Opa5, Press, EnterText, Common) {
  "use strict";

  Opa5.createPageObjects({
    onTheScreen3Page: {
      actions: {
        iEditParentFieldTo: function (sFieldPath, sValue) {
          return this.waitFor({
            controlType: "sap.m.Input",
            viewName: "Screen3",
            success: function (aInputs) {
              var oInput = Common.findInputByBindingPath(aInputs, "detail", sFieldPath, "inputFilter3", ["/Records/"]);
              Opa5.assert.ok(!!oInput, "Found Screen3 input bound to " + sFieldPath);
              new EnterText({ text: sValue, clearTextFirst: true }).executeOn(oInput);
              Common.writeBoundFieldValue(oInput, "detail", sFieldPath, sValue);
              Common.setInputValue(oInput, sValue);
            },
            errorMessage: "Editable Screen3 input not found for " + sFieldPath
          });
        },

        iPressSave: function () {
          return this.waitFor({
            id: "btnSaveLocal5",
            viewName: "Screen3",
            actions: new Press(),
            errorMessage: "Screen3 save button not found"
          });
        },

        iPressFirstDetailNavigationButton: function () {
          return this.waitFor({
            controlType: "sap.m.Button",
            viewName: "Screen3",
            success: function (aButtons) {
              var oButton = Common.findButtonByIcon(aButtons, "sap-icon://enter-more");
              Opa5.assert.ok(!!oButton, "Found Screen3 detail navigation button");
              oButton.firePress();
            },
            errorMessage: "Screen3 detail navigation button not found"
          });
        }
      },

      assertions: {
        iShouldSeeRecordsLoaded: function () {
          return this.waitFor({
            id: "page3",
            viewName: "Screen3",
            check: function (oPage) {
              var oDetail = oPage.getModel("detail");
              return !!oDetail && (oDetail.getProperty("/RecordsCount") || 0) > 0;
            },
            success: function (oPage) {
              var oDetail = oPage.getModel("detail");
              Opa5.assert.ok((oDetail.getProperty("/RecordsCount") || 0) > 0, "Screen3 records are loaded");
            },
            errorMessage: "Screen3 records were not loaded"
          });
        },

        iShouldBeInNoMatListMode: function () {
          return this.waitFor({
            id: "page3",
            viewName: "Screen3",
            check: function (oPage) {
              var oDetail = oPage.getModel("detail");
              return !!oDetail && oDetail.getProperty("/__noMatListMode") === true;
            },
            success: function () {
              Opa5.assert.ok(true, "Screen3 is running in NoMatList mode");
            },
            errorMessage: "Screen3 did not enter NoMatList mode"
          });
        },

        iShouldSeeNoMatListCrudGuard: function () {
          return this.waitFor({
            id: "page3",
            viewName: "Screen3",
            check: function (oPage) {
              var oDetail = oPage.getModel("detail");
              return !!oDetail &&
                oDetail.getProperty("/__noMatListMode") === true &&
                oDetail.getProperty("/__canAddRow") === false;
            },
            success: function () {
              Opa5.assert.ok(true, "Screen3 NoMatList guard disables add-row and keeps the mode flag active");
            },
            errorMessage: "Screen3 NoMatList guard was not applied"
          });
        },

        iShouldSeeApprovalActionsHidden: function () {
          return this.waitFor({
            id: "page3",
            viewName: "Screen3",
            check: function (oPage) {
              var oDetail = oPage.getModel("detail");
              return !!oDetail &&
                oDetail.getProperty("/__canApprove") === false &&
                oDetail.getProperty("/__canReject") === false;
            },
            success: function () {
              Opa5.assert.ok(true, "Screen3 approval actions are hidden");
            },
            errorMessage: "Screen3 approval actions were not hidden"
          });
        },

        iShouldSeeApprovalActionsVisible: function () {
          return this.waitFor({
            id: "page3",
            viewName: "Screen3",
            check: function (oPage) {
              var oDetail = oPage.getModel("detail");
              return !!oDetail &&
                oDetail.getProperty("/__canApprove") === true &&
                oDetail.getProperty("/__canReject") === true;
            },
            success: function () {
              Opa5.assert.ok(true, "Screen3 approval actions are visible");
            },
            errorMessage: "Screen3 approval actions were not visible"
          });
        },

        iShouldSeeBackendParentFieldValue: function (sFieldPath, sValue) {
          return this.waitFor({
            check: function () {
              var aRows = Common.getBackendSnapshot().dataRows || [];
              var aGuidRows = aRows.filter(function (row) { return row.Guid === "GUID-001"; });
              return aGuidRows.length > 0 && aGuidRows.every(function (row) {
                return String(row[sFieldPath] || "") === sValue;
              });
            },
            success: function () {
              Opa5.assert.ok(true, "Backend state reflects Screen3 save for " + sFieldPath);
            },
            errorMessage: "Backend state was not updated after Screen3 save"
          });
        }
      }
    }
  });
});
