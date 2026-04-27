/* global QUnit, sinon */
sap.ui.define([
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "apptracciabilita/apptracciabilita/util/screen2FlowUtil"
], function (JSONModel, MessageToast, Screen2FlowUtil) {
  "use strict";

  QUnit.module("util/screen2FlowUtil");

  QUnit.test("buildRow maps backend fields and computes support fields", function (assert) {
    var oRow = Screen2FlowUtil.buildRow({
      Materiale: "MAT1",
      DescMateriale: "Leather",
      DescCatMateriale: "Pelle",
      CatMateriale: "CAT1",
      Stagione: "44",
      MatStatus: "LOCK",
      Open: "X",
      Rejected: "2",
      ToApprove: "3",
      Approved: "5",
      Modified: "1"
    });

    assert.strictEqual(oRow.Material, "MAT1", "material mapped");
    assert.strictEqual(oRow.OpenPo, 1, "Open flag normalized");
    assert.strictEqual(oRow.Pending, 3, "pending mapped");
    assert.ok(oRow.SearchAllLC.indexOf("mat1") >= 0, "search field computed");
    assert.strictEqual(oRow.StagioneLC, "44", "season lowercase support field computed");
  });

  QUnit.test("extractDistinctFilterValues builds unique category and season lists", function (assert) {
    var oViewModel = new JSONModel({});
    Screen2FlowUtil.extractDistinctFilterValues([
      { DescCatMateriale: "Pelle", Stagione: "44" },
      { DescCatMateriale: "Pelle", Stagione: "45" },
      { DescCatMateriale: "Tessuto", Stagione: "44" }
    ], oViewModel);

    assert.deepEqual(oViewModel.getProperty("/DescCatMaterialeValues"), [
      { key: "Pelle", text: "Pelle" },
      { key: "Tessuto", text: "Tessuto" }
    ], "unique categories extracted");
    assert.deepEqual(oViewModel.getProperty("/StagioneValues"), [
      { key: "44", text: "44" },
      { key: "45", text: "45" }
    ], "unique seasons extracted");
  });

  QUnit.test("applyFilters forwards the expected application filters to the binding", function (assert) {
    var oBinding = { filter: sinon.spy() };
    Screen2FlowUtil.applyFilters({
      binding: oBinding,
      onlyIncomplete: true,
      selectedSeasons: ["44"],
      materialOnly: "mat1",
      generalQuery: "pelle",
      selectedDescCats: ["Pelle"]
    });

    assert.strictEqual(oBinding.filter.callCount, 1, "binding filtered once");
    assert.strictEqual(oBinding.filter.firstCall.args[1], "Application", "application filter group preserved");
    assert.strictEqual(oBinding.filter.firstCall.args[0].length, 5, "all filter groups added");
  });

  QUnit.test("onMatStatusPress posts the toggled status and updates the row on success", function (assert) {
    var done = assert.async();
    var oViewModel = new JSONModel({
      Materials: [{ MaterialOriginal: "MAT1", Stagione: "44", MatStatus: "LOCK", Open: "", OpenPo: 0 }]
    });
    var oCtx = {
      getObject: function () { return oViewModel.getProperty("/Materials/0"); },
      getPath: function () { return "/Materials/0"; }
    };
    var oButton = { setEnabled: sinon.spy() };
    var stubToast = sinon.stub(MessageToast, "show");
    var oODataModel = {
      create: function (sPath, oPayload, mOpts) {
        assert.strictEqual(sPath, "/MaterialStatusSet", "correct endpoint used");
        assert.strictEqual(oPayload.MatStatus, "RELE", "status toggled from LOCK to RELE");
        mOpts.success({ MatStatus: "RELE", Open: "X", ToApprove: 7 });
        setTimeout(function () {
          try {
            assert.strictEqual(oViewModel.getProperty("/Materials/0/MatStatus"), "RELE", "status updated in model");
            assert.strictEqual(oViewModel.getProperty("/Materials/0/OpenPo"), 1, "open flag normalized in model");
            assert.strictEqual(oViewModel.getProperty("/Materials/0/Pending"), 7, "pending updated");
            assert.strictEqual(stubToast.callCount, 1, "toast shown");
          } finally {
            stubToast.restore();
            done();
          }
        }, 0);
      }
    };

    Screen2FlowUtil.onMatStatusPress({
      context: oCtx,
      button: oButton,
      vendorId: "123",
      odataModel: oODataModel,
      viewModel: oViewModel,
      contextForI18n: null
    });
  });
});
