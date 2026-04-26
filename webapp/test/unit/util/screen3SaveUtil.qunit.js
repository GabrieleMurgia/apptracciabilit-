/* global QUnit, sinon */
sap.ui.define([
  "sap/ui/model/json/JSONModel",
  "apptracciabilita/apptracciabilita/util/screen3SaveUtil",
  "apptracciabilita/apptracciabilita/util/rowErrorUtil",
  "apptracciabilita/apptracciabilita/util/vmModelPaths"
], function (JSONModel, Screen3SaveUtil, RowErrorUtil, VmPaths) {
  "use strict";

  QUnit.module("util/screen3SaveUtil");

  function buildVm(sCacheKey, aRows, aRecords) {
    var oData = { cache: { dataRowsByKey: {}, recordsByKey: {} } };
    oData.cache.dataRowsByKey[sCacheKey] = aRows || ["seed"];
    oData.cache.recordsByKey[sCacheKey] = aRecords || ["seed"];
    return new JSONModel(oData);
  }

  // -------------------------------------------------------
  // invalidateScreen3Cache
  // -------------------------------------------------------

  QUnit.test("invalidateScreen3Cache empties dataRowsByKey and recordsByKey for the given cache key", function (assert) {
    var sCacheKey = "CK-S3-INV";
    var oVm = buildVm(sCacheKey, [{ guid: "A" }], [{ guid: "A" }]);

    Screen3SaveUtil.invalidateScreen3Cache({ vmModel: oVm, cacheKey: sCacheKey });

    assert.deepEqual(oVm.getProperty(VmPaths.dataRowsByKeyPath(sCacheKey)), [], "dataRowsByKey emptied");
    assert.deepEqual(oVm.getProperty(VmPaths.recordsByKeyPath(sCacheKey)), [], "recordsByKey emptied");
  });

  QUnit.test("invalidateScreen3Cache only touches the requested cache key, not others", function (assert) {
    var sUsedKey = "CK-USED";
    var sOtherKey = "CK-OTHER";
    var oVm = buildVm(sUsedKey, [{ a: 1 }], [{ a: 1 }]);
    oVm.setProperty(VmPaths.dataRowsByKeyPath(sOtherKey), [{ keep: true }]);
    oVm.setProperty(VmPaths.recordsByKeyPath(sOtherKey), [{ keep: true }]);

    Screen3SaveUtil.invalidateScreen3Cache({ vmModel: oVm, cacheKey: sUsedKey });

    assert.deepEqual(oVm.getProperty(VmPaths.dataRowsByKeyPath(sUsedKey)), [], "used dataRows emptied");
    assert.deepEqual(oVm.getProperty(VmPaths.dataRowsByKeyPath(sOtherKey)), [{ keep: true }], "other dataRows preserved");
    assert.deepEqual(oVm.getProperty(VmPaths.recordsByKeyPath(sOtherKey)), [{ keep: true }], "other records preserved");
  });

  // -------------------------------------------------------
  // clearPostErrorByContext / markRowsWithPostErrors
  // (thin delegations — characterize the wiring, not RowErrorUtil internals)
  // -------------------------------------------------------

  QUnit.test("clearPostErrorByContext forwards context, detail model and updateRowStyles fn to RowErrorUtil", function (assert) {
    var stub = sinon.stub(RowErrorUtil, "clearPostErrorByContext");
    try {
      var oCtx = { __id: "ctx" };
      var oDetail = new JSONModel({});
      var spyUpdate = sinon.spy();

      Screen3SaveUtil.clearPostErrorByContext({
        context: oCtx,
        detailModel: oDetail,
        updateRowStylesFn: spyUpdate
      });

      assert.strictEqual(stub.callCount, 1, "delegated once");
      assert.strictEqual(stub.firstCall.args[0], oCtx, "context forwarded");
      assert.strictEqual(stub.firstCall.args[1].oDetail, oDetail, "oDetail forwarded");
      assert.strictEqual(stub.firstCall.args[1].updateRowStyles, spyUpdate, "updateRowStyles forwarded");
    } finally {
      stub.restore();
    }
  });

  QUnit.test("markRowsWithPostErrors forwards response lines, detail model, applyClientFilters and ensurePostErrorRowHooks to RowErrorUtil", function (assert) {
    var stub = sinon.stub(RowErrorUtil, "markRowsWithPostErrors");
    try {
      var aResponseLines = [{ Esito: "E", Message: "boom" }];
      var oDetail = new JSONModel({});
      var spyApply = sinon.spy();
      var spyEnsure = sinon.spy();

      Screen3SaveUtil.markRowsWithPostErrors({
        responseLines: aResponseLines,
        detailModel: oDetail,
        applyClientFiltersFn: spyApply,
        ensurePostErrorRowHooksFn: spyEnsure
      });

      assert.strictEqual(stub.callCount, 1, "delegated once");
      assert.strictEqual(stub.firstCall.args[0], aResponseLines, "responseLines forwarded");
      var deps = stub.firstCall.args[1];
      assert.strictEqual(deps.oDetail, oDetail, "oDetail forwarded");
      assert.strictEqual(deps.applyClientFilters, spyApply, "applyClientFilters forwarded");
      assert.strictEqual(deps.ensurePostErrorRowHooks, spyEnsure, "ensurePostErrorRowHooks forwarded");
      assert.strictEqual(typeof deps.toStableString, "function", "toStableString helper provided to util");
    } finally {
      stub.restore();
    }
  });
});
