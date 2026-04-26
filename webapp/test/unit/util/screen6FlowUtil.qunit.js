/* global QUnit, sinon */
sap.ui.define([
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/ui/core/BusyIndicator",
  "apptracciabilita/apptracciabilita/util/screen6FlowUtil",
  "apptracciabilita/apptracciabilita/util/s6ExcelUtil"
], function (JSONModel, MessageToast, MessageBox, BusyIndicator, Screen6FlowUtil, S6ExcelUtil) {
  "use strict";

  QUnit.module("util/screen6FlowUtil");

  QUnit.test("buildCategoriesList derives userCategoriesList from MMCT configuration and source categories", function (assert) {
    var oVm = new JSONModel({
      userCategories: [{ key: "A" }],
      mmctFieldsByCat: { A: [{ UiFieldname: "F1" }] }
    });
    var stub = sinon.stub(S6ExcelUtil, "buildCategoryList").returns([{ key: "A", text: "Cat A" }]);
    try {
      Screen6FlowUtil.buildCategoriesList({ vmModel: oVm });
      assert.strictEqual(stub.callCount, 1, "category builder called once");
      assert.deepEqual(oVm.getProperty("/userCategoriesList"), [{ key: "A", text: "Cat A" }], "vm list updated");
    } finally {
      stub.restore();
    }
  });

  QUnit.test("onFileSelected requires a category before attempting XLSX parsing", function (assert) {
    var stubToast = sinon.stub(MessageToast, "show");
    try {
      var bCleared = false;
      var bParsed = false;
      Screen6FlowUtil.onFileSelected({
        event: { getParameter: function () { return [{ name: "x.xlsx" }]; } },
        getSelectedCatFn: function () { return ""; },
        clearFileUploaderFn: function () { bCleared = true; },
        ensureXlsxLoadedFn: function () { return Promise.resolve(); },
        parseExcelFileFn: function () { bParsed = true; }
      });

      assert.strictEqual(stubToast.callCount, 1, "missing category feedback shown");
      assert.ok(bCleared, "uploader cleared");
      assert.strictEqual(bParsed, false, "parsing not attempted");
    } finally {
      stubToast.restore();
    }
  });

  QUnit.test("onFileSelected waits for XLSX load and then parses the selected file", function (assert) {
    var done = assert.async();
    var oFile = { name: "book.xlsx" };

    Screen6FlowUtil.onFileSelected({
      event: { getParameter: function () { return [oFile]; } },
      getSelectedCatFn: function () { return "CAT1"; },
      clearFileUploaderFn: function () {},
      ensureXlsxLoadedFn: function () { return Promise.resolve(); },
      parseExcelFileFn: function (oPassedFile, sCat) {
        assert.strictEqual(oPassedFile, oFile, "file forwarded after library load");
        assert.strictEqual(sCat, "CAT1", "category forwarded");
        done();
      }
    });
  });

  QUnit.test("validateRequiredFieldsForRows returns false and shows a compact warning when required values are missing", function (assert) {
    var stubWarn = sinon.stub(MessageBox, "warning");
    var stubValidate = sinon.stub(S6ExcelUtil, "validateRequiredRows").returns({
      errors: ["Riga 1: Fibra", "Riga 2: Percentuale"]
    });
    try {
      var bOk = Screen6FlowUtil.validateRequiredFieldsForRows({
        rows: [{}, {}],
        cat: "CAT1",
        vmModel: new JSONModel({ mmctFieldsByCat: { CAT1: [] } })
      });

      assert.strictEqual(bOk, false, "validation fails");
      assert.strictEqual(stubWarn.callCount, 1, "warning shown once");
      assert.ok(/Riga 1: Fibra/.test(stubWarn.firstCall.args[0]), "warning contains first missing-field line");
    } finally {
      stubValidate.restore();
      stubWarn.restore();
    }
  });

  QUnit.test("filterOutCheckErrorRows returns null and shows an error when every row has CHECK errors", function (assert) {
    var stubError = sinon.stub(MessageBox, "error");
    var stubFilter = sinon.stub(S6ExcelUtil, "filterRowsWithoutCheckErrors").returns([]);
    try {
      var ret = Screen6FlowUtil.filterOutCheckErrorRows({
        rows: [{ __checkHasError: true }],
        detailModel: new JSONModel({ checkErrorCount: 1 })
      });

      assert.strictEqual(ret, null, "returns null when no valid rows remain");
      assert.strictEqual(stubError.callCount, 1, "blocking error shown");
    } finally {
      stubFilter.restore();
      stubError.restore();
    }
  });

  QUnit.test("filterOutCheckErrorRows keeps only valid rows when some rows passed CHECK", function (assert) {
    var aFiltered = [{ id: 2 }];
    var stubFilter = sinon.stub(S6ExcelUtil, "filterRowsWithoutCheckErrors").returns(aFiltered);
    try {
      var ret = Screen6FlowUtil.filterOutCheckErrorRows({
        rows: [{ id: 1 }, { id: 2 }],
        detailModel: new JSONModel({ checkErrorCount: 1 })
      });

      assert.strictEqual(ret, aFiltered, "filtered rows returned");
    } finally {
      stubFilter.restore();
    }
  });

  QUnit.test("onSendData confirms and delegates to executePost with rows excluding CHECK errors", function (assert) {
    var stubConfirm = sinon.stub(MessageBox, "confirm");
    var stubExecute = sinon.stub(Screen6FlowUtil, "executePost");
    var stubValidate = sinon.stub(Screen6FlowUtil, "validateRequiredFieldsForRows").returns(true);
    var stubFilter = sinon.stub(Screen6FlowUtil, "filterOutCheckErrorRows").returns([{ id: 2 }]);
    try {
      var oDetail = new JSONModel({
        RowsAll: [{ id: 1 }, { id: 2 }],
        checkErrorCount: 1
      });

      Screen6FlowUtil.onSendData.call(Screen6FlowUtil, {
        detailModel: oDetail,
        vmModel: new JSONModel({}),
        getSelectedCatFn: function () { return "CAT1"; },
        odataModel: {},
        clearUploadFn: function () {}
      });

      assert.strictEqual(stubConfirm.callCount, 1, "user confirmation requested");
      assert.ok(/1/.test(stubConfirm.firstCall.args[0]), "confirmation includes excluded-error count");
      stubConfirm.firstCall.args[1].onClose(MessageBox.Action.OK);
      assert.strictEqual(stubExecute.callCount, 1, "executePost delegated after OK");
      assert.deepEqual(stubExecute.firstCall.args[0].rows, [{ id: 2 }], "only valid rows are sent");
      assert.strictEqual(stubExecute.firstCall.args[0].cat, "CAT1", "selected category forwarded");
    } finally {
      stubFilter.restore();
      stubValidate.restore();
      stubExecute.restore();
      stubConfirm.restore();
    }
  });

  QUnit.test("executePost builds payload, posts it and clears the upload on success", function (assert) {
    var stubSuccess = sinon.stub(MessageBox, "success");
    var stubShow = sinon.stub(BusyIndicator, "show");
    var stubHide = sinon.stub(BusyIndicator, "hide");
    var stubBuild = sinon.stub(Screen6FlowUtil, "buildPayloadLines").returns([{ row: 1 }, { row: 2 }]);
    try {
      var oVm = new JSONModel({ userId: "USER1" });
      var oDetail = new JSONModel({});
      var oCreateSpy = sinon.spy(function (sPath, oPayload, mOpts) {
        mOpts.success();
      });
      var oODataModel = {
        setHeaders: sinon.spy(),
        create: oCreateSpy
      };
      var bCleared = false;

      Screen6FlowUtil.executePost.call(Screen6FlowUtil, {
        rows: [{ any: 1 }],
        cat: "CAT1",
        odataModel: oODataModel,
        vmModel: oVm,
        detailModel: oDetail,
        clearUploadFn: function () { bCleared = true; }
      });

      assert.strictEqual(stubBuild.callCount, 1, "payload lines built once");
      assert.strictEqual(oODataModel.setHeaders.callCount, 1, "language header set");
      assert.strictEqual(oCreateSpy.callCount, 1, "POST request executed");
      assert.strictEqual(oCreateSpy.firstCall.args[0], "/PostDataSet", "POST target path correct");
      assert.strictEqual(oCreateSpy.firstCall.args[1].UserID, "USER1", "payload includes user id");
      assert.strictEqual(oCreateSpy.firstCall.args[1].PostDataCollection.length, 2, "payload includes built lines");
      assert.ok(bCleared, "upload cleared after successful send");
      assert.strictEqual(stubSuccess.callCount, 1, "success message shown");
      assert.strictEqual(stubShow.callCount, 1, "busy indicator shown");
      assert.strictEqual(stubHide.callCount, 1, "busy indicator hidden");
    } finally {
      stubBuild.restore();
      stubHide.restore();
      stubShow.restore();
      stubSuccess.restore();
    }
  });
});
