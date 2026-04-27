sap.ui.define([
  "sap/ui/test/Opa5",
  "sap/ui/test/actions/Press"
], function (Opa5, Press) {
  "use strict";

  Opa5.createPageObjects({
    onTheDialog: {
      actions: {
        iConfirmWithOk: function () {
          return this.waitFor({
            searchOpenDialogs: true,
            controlType: "sap.m.Button",
            matchers: function (oButton) {
              return oButton.getText && oButton.getText() === "OK";
            },
            actions: new Press(),
            errorMessage: "No open dialog with OK button found"
          });
        }
      }
    }
  });
});
