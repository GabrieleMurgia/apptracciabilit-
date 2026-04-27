sap.ui.define([
  "sap/ui/test/Opa5",
  "sap/ui/test/actions/Press",
  "./Common",
  "../fixtures/Screen6UploadFixture"
], function (Opa5, Press, Common, UploadFixture) {
  "use strict";

  Opa5.createPageObjects({
    onTheScreen6Page: {
      actions: {
        iSelectCategory: function (sKey) {
          return this.waitFor({
            id: "comboCatMat6",
            viewName: "Screen6",
            success: function (oCombo) {
              var oItem = (oCombo.getItems() || []).find(function (item) {
                return item.getKey() === sKey;
              });
              oCombo.setSelectedKey(sKey);
              oCombo.fireSelectionChange({ selectedItem: oItem || null });
            },
            errorMessage: "Screen6 category combo not found"
          });
        },

        iUploadFixtureWorkbook: function () {
          return this.waitFor({
            id: "fileUploader6",
            viewName: "Screen6",
            success: function (oUploader) {
              var oParent = oUploader;
              while (oParent && typeof oParent.getController !== "function" && typeof oParent.getParent === "function") {
                oParent = oParent.getParent();
              }
              var oController = oParent && oParent.getController && oParent.getController();
              Opa5.assert.ok(!!oController, "Resolved Screen6 controller for upload fixture");

              oController._ensureXlsxLoaded().then(function () {
                var wb = window.XLSX.utils.book_new();
                var ws = window.XLSX.utils.json_to_sheet(UploadFixture.rows);
                window.XLSX.utils.book_append_sheet(wb, ws, "Upload");
                var sBinary = window.XLSX.write(wb, { type: "binary", bookType: "xlsx" });
                var aBytes = new Uint8Array(sBinary.length);
                var i;
                for (i = 0; i < sBinary.length; i++) {
                  aBytes[i] = sBinary.charCodeAt(i) & 0xFF;
                }
                var oFile = new window.File([aBytes], UploadFixture.fileName, { type: UploadFixture.mimeType });
                oUploader.fireChange({ files: [oFile] });
              });
            },
            errorMessage: "Screen6 file uploader not found"
          });
        },

        iPressSendData: function () {
          return this.waitFor({
            id: "btnSendData6",
            viewName: "Screen6",
            actions: new Press(),
            errorMessage: "Screen6 send button not found"
          });
        }
      },

      assertions: {
        iShouldSeePreviewLoaded: function () {
          return this.waitFor({
            id: "page6",
            viewName: "Screen6",
            check: function (oPage) {
              var oDetail = oPage.getModel("detail");
              return !!oDetail &&
                (oDetail.getProperty("/RowsCount") || 0) > 0 &&
                oDetail.getProperty("/checkDone") === true &&
                (oDetail.getProperty("/checkErrorCount") || 0) === 0;
            },
            success: function (oPage) {
              Opa5.assert.ok((oPage.getModel("detail").getProperty("/RowsCount") || 0) > 0, "Screen6 preview rows are loaded");
            },
            errorMessage: "Screen6 preview did not finish loading"
          });
        },

        iShouldSeeUploadCleared: function () {
          return this.waitFor({
            id: "page6",
            viewName: "Screen6",
            check: function (oPage) {
              var oDetail = oPage.getModel("detail");
              return !!oDetail && (oDetail.getProperty("/RowsCount") || 0) === 0;
            },
            success: function () {
              Opa5.assert.ok(true, "Screen6 upload buffer has been cleared");
            },
            errorMessage: "Screen6 upload buffer was not cleared"
          });
        },

        iShouldSeeBackendPostCount: function (iExpected) {
          return this.waitFor({
            check: function () {
              return (Common.getBackendSnapshot().screen6Posts || []).length === iExpected;
            },
            success: function () {
              Opa5.assert.ok(true, "Screen6 backend POST count matches");
            },
            errorMessage: "Screen6 backend POST count does not match " + iExpected
          });
        }
      }
    }
  });
});
