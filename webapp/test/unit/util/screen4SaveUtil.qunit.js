/* global QUnit, sinon */
sap.ui.define([
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "apptracciabilita/apptracciabilita/util/screen4SaveUtil",
  "apptracciabilita/apptracciabilita/util/vmModelPaths",
  "apptracciabilita/apptracciabilita/util/recordsUtil",
  "apptracciabilita/apptracciabilita/util/screen4LoaderUtil",
  "apptracciabilita/apptracciabilita/util/saveUtil"
], function (JSONModel, MessageToast, MessageBox, Screen4SaveUtil, VmPaths, RecordsUtil, S4Loader, SaveUtil) {
  "use strict";

  QUnit.module("util/screen4SaveUtil");

  function buildVm(sCacheKey) {
    var oData = { cache: { recordsByKey: {}, dataRowsByKey: {} } };
    oData.cache.recordsByKey[sCacheKey] = [];
    oData.cache.dataRowsByKey[sCacheKey] = [];
    return new JSONModel(oData);
  }

  QUnit.test("assignStableGuidBeforeSave rewrites local guid consistently across caches and detail rows", function (assert) {
    var sCacheKey = "CK-S4";
    var oVm = buildVm(sCacheKey);
    var oDetail = new JSONModel({
      guidKey: "NEW_LOCAL_GUID",
      RowsAll: [
        { Guid: "NEW_LOCAL_GUID", guidKey: "NEW_LOCAL_GUID" },
        { Guid: "KEEP_ME", guidKey: "KEEP_ME" }
      ]
    });

    oVm.setProperty(VmPaths.recordsByKeyPath(sCacheKey), [
      { Guid: "NEW_LOCAL_GUID", guidKey: "NEW_LOCAL_GUID" },
      { Guid: "KEEP_ME", guidKey: "KEEP_ME" }
    ]);
    oVm.setProperty(VmPaths.dataRowsByKeyPath(sCacheKey), [
      { Guid: "NEW_LOCAL_GUID", guidKey: "NEW_LOCAL_GUID" },
      { Guid: "KEEP_ME", guidKey: "KEEP_ME" }
    ]);

    var aRecords = Screen4SaveUtil.assignStableGuidBeforeSave({
      detailModel: oDetail,
      vmModel: oVm,
      cacheKey: sCacheKey
    });
    var sNewGuid = oDetail.getProperty("/guidKey");

    assert.ok(!!sNewGuid, "a stable guid is assigned");
    assert.notStrictEqual(sNewGuid, "NEW_LOCAL_GUID", "local guid is replaced");
    assert.strictEqual(aRecords[0].Guid, sNewGuid, "records cache is rewritten");
    assert.strictEqual(oVm.getProperty(VmPaths.dataRowsByKeyPath(sCacheKey))[0].guidKey, sNewGuid, "detail cache is rewritten");
    assert.strictEqual(oDetail.getProperty("/RowsAll/0/Guid"), sNewGuid, "detail model rows are rewritten");
    assert.strictEqual(oDetail.getProperty("/RowsAll/1/Guid"), "KEEP_ME", "unrelated rows are preserved");
  });

  QUnit.test("assignStableGuidBeforeSave preserves already stable guids", function (assert) {
    var sCacheKey = "CK-S4-STABLE";
    var oVm = buildVm(sCacheKey);
    var oDetail = new JSONModel({
      guidKey: "cf0c35f6-92b2-4f4b-bdb2-9fa28d35c7c8",
      RowsAll: [{ Guid: "cf0c35f6-92b2-4f4b-bdb2-9fa28d35c7c8", guidKey: "cf0c35f6-92b2-4f4b-bdb2-9fa28d35c7c8" }]
    });

    Screen4SaveUtil.assignStableGuidBeforeSave({
      detailModel: oDetail,
      vmModel: oVm,
      cacheKey: sCacheKey
    });

    assert.strictEqual(
      oDetail.getProperty("/guidKey"),
      "cf0c35f6-92b2-4f4b-bdb2-9fa28d35c7c8",
      "stable guid is preserved"
    );
  });

  // -------------------------------------------------------
  // onSaveLocal
  // -------------------------------------------------------

  QUnit.test("onSaveLocal short-circuits when /__dirty is false", function (assert) {
    var stubToast = sinon.stub(MessageToast, "show");
    try {
      var oVm = buildVm("CK-CLEAN");
      var oDetail = new JSONModel({ __dirty: false, RowsAll: [], guidKey: "G" });
      var spyUpdate = sinon.spy();
      var spySnapshot = sinon.spy();
      var spyPerms = sinon.spy();

      Screen4SaveUtil.onSaveLocal({
        detailModel: oDetail,
        vmModel: oVm,
        cacheKey: "CK-CLEAN",
        updateVmRecordStatusFn: spyUpdate,
        setSnapshotRowsFn: spySnapshot,
        applyUiPermissionsFn: spyPerms
      });

      assert.strictEqual(spyUpdate.callCount, 0, "no VM record update when not dirty");
      assert.strictEqual(spySnapshot.callCount, 0, "no snapshot taken when not dirty");
      assert.strictEqual(spyPerms.callCount, 0, "no permission re-apply when not dirty");
      assert.strictEqual(oDetail.getProperty("/__dirty"), false, "dirty stays false");
    } finally {
      stubToast.restore();
    }
  });

  QUnit.test("onSaveLocal merges new rows into cache, resets dirty, snapshots and re-applies perms", function (assert) {
    var stubToast = sinon.stub(MessageToast, "show");
    var stubValid = sinon.stub(RecordsUtil, "validatePercBeforeSave").returns(true);
    var stubGuid = sinon.stub(S4Loader, "rowGuidKey", function (r) {
      return (r && (r.Guid || r.guidKey)) || "";
    });
    try {
      var sCK = "CK-DIRTY";
      var oVm = buildVm(sCK);
      // Pre-populate cache: one row with guid G-OLD, one with guid G-KEEP
      oVm.setProperty(VmPaths.dataRowsByKeyPath(sCK), [
        { Guid: "G-OLD", v: "stale" },
        { Guid: "G-KEEP", v: "keep" }
      ]);

      var oDetail = new JSONModel({
        __dirty: true,
        guidKey: "G-OLD",
        Fibra: "F1",
        __role: "i",
        __status: "ST",
        RowsAll: [{ Guid: "G-OLD", v: "fresh-1" }, { Guid: "G-OLD", v: "fresh-2" }]
      });

      var spyUpdate = sinon.spy();
      var spySnapshot = sinon.spy();
      var spyPerms = sinon.spy();

      Screen4SaveUtil.onSaveLocal({
        detailModel: oDetail,
        vmModel: oVm,
        cacheKey: sCK,
        updateVmRecordStatusFn: spyUpdate,
        setSnapshotRowsFn: spySnapshot,
        applyUiPermissionsFn: spyPerms
      });

      var aMerged = oVm.getProperty(VmPaths.dataRowsByKeyPath(sCK));
      assert.strictEqual(aMerged.length, 3, "cache has KEEP-row + 2 fresh rows");
      assert.strictEqual(aMerged[0].Guid, "G-KEEP", "G-KEEP preserved as first");
      assert.strictEqual(aMerged[1].v, "fresh-1", "fresh row 1 appended");
      assert.strictEqual(aMerged[2].v, "fresh-2", "fresh row 2 appended");

      assert.strictEqual(spyUpdate.callCount, 1, "VM record status updated once");
      var statusArgs = spyUpdate.firstCall.args;
      assert.strictEqual(statusArgs[0], sCK, "cache key forwarded");
      assert.strictEqual(statusArgs[1], "G-OLD", "guid forwarded");
      assert.strictEqual(statusArgs[2], "F1", "fibra forwarded");
      assert.strictEqual(statusArgs[3], "I", "role normalized to upper");
      assert.strictEqual(statusArgs[4], "ST", "status normalized to upper");

      assert.strictEqual(spySnapshot.callCount, 1, "snapshot taken once");
      assert.notStrictEqual(spySnapshot.firstCall.args[0], oDetail.getProperty("/RowsAll"),
        "snapshot is a clone, not the same reference");
      assert.deepEqual(spySnapshot.firstCall.args[0], oDetail.getProperty("/RowsAll"),
        "snapshot is structurally equal to current rows");

      assert.strictEqual(oDetail.getProperty("/__dirty"), false, "dirty reset to false after save");
      assert.strictEqual(spyPerms.callCount, 1, "UI permissions re-applied once");
    } finally {
      stubGuid.restore();
      stubValid.restore();
      stubToast.restore();
    }
  });

  QUnit.test("onSaveLocal aborts when validatePercBeforeSave returns false (no cache write, dirty stays true)", function (assert) {
    var stubToast = sinon.stub(MessageToast, "show");
    var stubValid = sinon.stub(RecordsUtil, "validatePercBeforeSave").returns(false);
    try {
      var sCK = "CK-INVALID";
      var oVm = buildVm(sCK);
      oVm.setProperty(VmPaths.dataRowsByKeyPath(sCK), [{ Guid: "G", v: "before" }]);

      var oDetail = new JSONModel({
        __dirty: true, guidKey: "G", Fibra: "", __role: "I", __status: "ST",
        RowsAll: [{ Guid: "G", v: "after" }]
      });
      var spyUpdate = sinon.spy();

      Screen4SaveUtil.onSaveLocal({
        detailModel: oDetail,
        vmModel: oVm,
        cacheKey: sCK,
        updateVmRecordStatusFn: spyUpdate,
        setSnapshotRowsFn: function () {},
        applyUiPermissionsFn: function () {}
      });

      assert.deepEqual(
        oVm.getProperty(VmPaths.dataRowsByKeyPath(sCK)),
        [{ Guid: "G", v: "before" }],
        "cache untouched on validation failure"
      );
      assert.strictEqual(spyUpdate.callCount, 0, "VM record not updated on validation failure");
      assert.strictEqual(oDetail.getProperty("/__dirty"), true, "dirty preserved on validation failure");
    } finally {
      stubValid.restore();
      stubToast.restore();
    }
  });

  // -------------------------------------------------------
  // buildSavePayload
  // -------------------------------------------------------

  QUnit.test("buildSavePayload returns null and shows MessageBox.error when validation reports missing required fields", function (assert) {
    var stubMb = sinon.stub(MessageBox, "error");
    var stubVal = sinon.stub(SaveUtil, "validateRequiredBeforePost").returns({
      ok: false,
      errors: [
        { page: "S00", label: "ColoreFibra", row: 1 },
        { page: "S02", label: "Percentuale", row: 1 }
      ]
    });
    var stubBuild = sinon.stub(SaveUtil, "buildSavePayload").returns({ shouldNotBeCalled: true });
    try {
      var oVm = buildVm("CK-VAL");
      var oDetail = new JSONModel({ _mmct: { cat: "" }, RowsAll: [] });

      var ret = Screen4SaveUtil.buildSavePayload({
        detailModel: oDetail,
        vmModel: oVm,
        cacheKey: "CK-VAL",
        recordsAll: [],
        cfgForScreenFn: function () { return []; },
        getCacheKeySafeFn: function () { return "CK-VAL"; },
        getDataCacheKeyFn: function () { return "CK-VAL"; },
        vendorId: "VEND",
        material: "MAT"
      });

      assert.strictEqual(ret, null, "returns null on validation failure");
      assert.strictEqual(stubMb.callCount, 1, "MessageBox.error shown once");
      assert.ok(/ColoreFibra/.test(stubMb.firstCall.args[0]), "error message includes the missing field label");
      assert.strictEqual(stubBuild.callCount, 0, "buildSavePayload skipped on validation failure");
    } finally {
      stubBuild.restore();
      stubVal.restore();
      stubMb.restore();
    }
  });

  QUnit.test("buildSavePayload returns proxy + payload when validation passes", function (assert) {
    var stubVal = sinon.stub(SaveUtil, "validateRequiredBeforePost").returns({ ok: true, errors: [] });
    var sentinelPayload = { PostDataCollection: [{ row: 1 }] };
    var stubBuild = sinon.stub(SaveUtil, "buildSavePayload").returns(sentinelPayload);
    try {
      var oVm = buildVm("CK-OK");
      oVm.setProperty("/userId", "USER1");
      var oDetail = new JSONModel({ _mmct: { cat: "TESSUTI" }, RowsAll: [{ a: 1 }] });

      var ret = Screen4SaveUtil.buildSavePayload({
        detailModel: oDetail,
        vmModel: oVm,
        cacheKey: "CK-OK",
        recordsAll: [{ idx: 0 }],
        cfgForScreenFn: function (sCat, sScreen) { return [{ ui: sCat + "-" + sScreen }]; },
        getCacheKeySafeFn: function () { return "CK-OK"; },
        getDataCacheKeyFn: function () { return "CK-OK"; },
        vendorId: "0000123456",
        material: "MAT"
      });

      assert.ok(ret, "returns truthy on validation success");
      assert.strictEqual(ret.payload, sentinelPayload, "payload comes from SaveUtil.buildSavePayload");
      assert.ok(ret.proxy && typeof ret.proxy.getProperty === "function", "proxy is a JSONModel");
      assert.deepEqual(ret.proxy.getProperty("/RecordsAll"), [{ idx: 0 }], "proxy carries recordsAll");
      assert.strictEqual(stubBuild.callCount, 1, "SaveUtil.buildSavePayload invoked");
    } finally {
      stubBuild.restore();
      stubVal.restore();
    }
  });
});
