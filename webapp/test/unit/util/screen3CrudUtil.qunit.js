/* global QUnit, sinon */
sap.ui.define([
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "apptracciabilita/apptracciabilita/util/screen3CrudUtil",
  "apptracciabilita/apptracciabilita/util/vmModelPaths",
  "apptracciabilita/apptracciabilita/util/rowManagementUtil",
  "apptracciabilita/apptracciabilita/util/postUtil",
  "apptracciabilita/apptracciabilita/util/screen4CacheUtil",
  "apptracciabilita/apptracciabilita/util/touchCodAggUtil",
  "apptracciabilita/apptracciabilita/util/mdcTableUtil"
], function (JSONModel, MessageToast, Screen3CrudUtil, VmPaths, RowManagementUtil, PostUtil, Screen4CacheUtil, TouchCodAggUtil, MdcTableUtil) {
  "use strict";

  QUnit.module("util/screen3CrudUtil");

  function buildVm(sCacheKey) {
    var oData = { cache: { recordsByKey: {}, dataRowsByKey: {} } };
    oData.cache.recordsByKey[sCacheKey] = [];
    oData.cache.dataRowsByKey[sCacheKey] = [];
    return new JSONModel(oData);
  }

  function makeCtx(oRow, sPath) {
    return {
      getObject: function () { return oRow; },
      getPath: function () { return sPath; }
    };
  }

  QUnit.test("checkParentDirtyRevert restores original CodAgg across detail model, cache and snapshot when fields match", function (assert) {
    var sCacheKey = "CK-S3-REVERT";
    var oVm = buildVm(sCacheKey);
    var oParent = { idx: 7, Guid: "GUID-7", Material: "MAT1", Fibra: "COT", CodAgg: "U" };
    var oDetail = new JSONModel({
      _mmct: { s01: [{ ui: "Material" }, { ui: "Fibra" }] },
      RecordsAll: [oParent]
    });
    var aSnapshot = [{ idx: 7, Guid: "GUID-7", Material: "MAT1", Fibra: "COT", CodAgg: "N" }];
    var aOriginal = [{ idx: 7, Guid: "GUID-7", Material: "MAT1", Fibra: "COT", CodAgg: "U" }];

    oVm.setProperty(VmPaths.dataRowsByKeyPath(sCacheKey), [{ Guid: "GUID-7", CodAgg: "U" }]);

    Screen3CrudUtil.checkParentDirtyRevert({
      parent: oParent,
      path: "/RecordsAll/0",
      snapshotRecords: aSnapshot,
      originalSnapshot: aOriginal,
      detailModel: oDetail,
      vmModel: oVm,
      cacheKey: sCacheKey
    });

    assert.strictEqual(oParent.CodAgg, "N", "parent CodAgg restored");
    assert.strictEqual(oDetail.getProperty("/RecordsAll/0/CodAgg"), "N", "detail model row restored");
    assert.strictEqual(oVm.getProperty(VmPaths.dataRowsByKeyPath(sCacheKey))[0].CodAgg, "N", "cache row restored");
    assert.strictEqual(aOriginal[0].CodAgg, "N", "original snapshot refreshed with restored state");
  });

  QUnit.test("touchCodAggParent delegates to TouchCodAggUtil and then reverts CodAgg when snapshot matches", function (assert) {
    var sCacheKey = "CK-S3-TOUCH";
    var oVm = buildVm(sCacheKey);
    var oParent = { idx: 3, Guid: "GUID-3", Campo: "A", CodAgg: "N" };
    var oDetail = new JSONModel({
      _mmct: { s01: [{ ui: "Campo" }] },
      RecordsAll: [oParent]
    });
    var stubTouch = sinon.stub(TouchCodAggUtil, "touchCodAggParent");
    try {
      oVm.setProperty(VmPaths.dataRowsByKeyPath(sCacheKey), [{ Guid: "GUID-3", CodAgg: "N" }]);

      Screen3CrudUtil.touchCodAggParent({
        parent: oParent,
        path: "/RecordsAll/0",
        snapshotRecords: [{ idx: 3, Guid: "GUID-3", Campo: "A", CodAgg: "N" }],
        detailModel: oDetail,
        vmModel: oVm,
        cacheKey: sCacheKey
      });

      assert.strictEqual(stubTouch.callCount, 1, "TouchCodAggUtil invoked once");
      assert.strictEqual(stubTouch.firstCall.args[0], oParent, "parent forwarded");
      assert.strictEqual(oParent.CodAgg, "N", "CodAgg still consistent after revert pass");
    } finally {
      stubTouch.restore();
    }
  });

  QUnit.test("onGoToScreen4FromRow snapshots current records, seeds Screen4 cache and navigates with encoded params", function (assert) {
    var oRow = { idx: 5, guidKey: "GUID 5", Materiale: "MAT" };
    var oDetail = new JSONModel({
      RecordsAll: [oRow, { idx: 6, guidKey: "GUID-6" }]
    });
    var oVm = buildVm("CK-S3-NAV");
    var stubSetSel = sinon.stub(Screen4CacheUtil, "setSelectedParentForScreen4");
    var stubEnsure = sinon.stub(Screen4CacheUtil, "ensureScreen4CacheForParentIdx");
    try {
      var aSnapshots = [];
      var oRouter = { navTo: sinon.spy() };

      Screen3CrudUtil.onGoToScreen4FromRow({
        event: {
          getSource: function () {
            return {
              getBindingContext: function () { return makeCtx(oRow, "/Records/0"); }
            };
          }
        },
        detailModel: oDetail,
        vmModel: oVm,
        router: oRouter,
        component: {},
        vendorId: "00001234",
        material: "MAT/01",
        mode: "C",
        cacheKeySafe: "SAFE-KEY",
        setSnapshotRecordsFn: function (aRows) { aSnapshots.push(aRows); }
      });

      assert.strictEqual(aSnapshots.length, 1, "records snapshot stored once");
      assert.notStrictEqual(aSnapshots[0], oDetail.getProperty("/RecordsAll"), "snapshot is cloned");
      assert.strictEqual(stubSetSel.callCount, 1, "selected parent cached for Screen4");
      assert.strictEqual(stubEnsure.callCount, 1, "Screen4 cache ensured once");
      assert.strictEqual(stubEnsure.firstCall.args[0], 5, "selected idx forwarded");
      assert.strictEqual(stubEnsure.firstCall.args[2], oVm, "vm model forwarded");
      assert.strictEqual(stubEnsure.firstCall.args[3], "SAFE-KEY", "safe cache key forwarded");
      assert.strictEqual(oRouter.navTo.callCount, 1, "router called once");
      assert.strictEqual(oRouter.navTo.firstCall.args[0], "Screen4", "navigates to Screen4");
      assert.strictEqual(oRouter.navTo.firstCall.args[1].vendorId, encodeURIComponent("00001234"), "vendor encoded");
      assert.strictEqual(oRouter.navTo.firstCall.args[1].material, encodeURIComponent("MAT/01"), "material encoded");
      assert.strictEqual(oRouter.navTo.firstCall.args[1].recordKey, encodeURIComponent("5"), "record key encoded");
      assert.strictEqual(oRouter.navTo.firstCall.args[1].mode, "C", "mode preserved");
    } finally {
      stubEnsure.restore();
      stubSetSel.restore();
    }
  });

  QUnit.test("onAddRow appends parent and detail rows into caches and scrolls to the new filtered row", function (assert) {
    var sCacheKey = "CK-S3-ADD";
    var oVm = buildVm(sCacheKey);
    var oDetail = new JSONModel({
      _mmct: { s01: [{ ui: "Campo1" }], s02: [], s00: [], cat: "CAT1" },
      RecordsAll: [],
      Records: [],
      __canAddRow: true
    });
    var stubToast = sinon.stub(MessageToast, "show");
    var stubPick = sinon.stub(RowManagementUtil, "pickTemplateGuidForNewParent").returns("TPL-G");
    var stubGetTpl = sinon.stub(RowManagementUtil, "getTemplateRowsByGuid").returns([{ Guid: "TPL-G", CodAgg: "N" }]);
    var stubCreateParent = sinon.stub(RowManagementUtil, "createNewParentRow").returns({
      row: { idx: 9, guidKey: "NEW-GUID", CodAgg: "I" },
      idx: 9,
      guid: "NEW-GUID"
    });
    var stubCreateDetails = sinon.stub(RowManagementUtil, "createNewDetailRows").returns([
      { Guid: "NEW-GUID", guidKey: "NEW-GUID", Fibra: "F1" },
      { Guid: "NEW-GUID", guidKey: "NEW-GUID", Fibra: "F2" }
    ]);
    var stubSetSel = sinon.stub(Screen4CacheUtil, "setSelectedParentForScreen4");
    var stubEnsure = sinon.stub(Screen4CacheUtil, "ensureScreen4CacheForParentIdx");
    var stubScroll = sinon.stub(MdcTableUtil, "scrollToRow");
    try {
      Screen3CrudUtil.onAddRow({
        detailModel: oDetail,
        vmModel: oVm,
        cacheKey: sCacheKey,
        cacheKeySafe: "SAFE-S3-ADD",
        vendorId: "V01",
        material: "MAT01",
        component: {},
        table: { __id: "tbl" },
        applyClientFiltersFn: function () {
          oDetail.setProperty("/Records", oDetail.getProperty("/RecordsAll"));
        }
      });

      assert.strictEqual(stubPick.callCount, 1, "template guid picked");
      assert.strictEqual(stubGetTpl.callCount, 1, "template rows loaded");
      assert.strictEqual(stubCreateParent.callCount, 1, "parent row created");
      assert.strictEqual(stubCreateDetails.callCount, 1, "detail rows created");
      assert.strictEqual(oDetail.getProperty("/RecordsAll").length, 1, "parent row appended to detail model");
      assert.strictEqual(oVm.getProperty(VmPaths.recordsByKeyPath(sCacheKey)).length, 1, "parent row appended to parent cache");
      assert.strictEqual(oVm.getProperty(VmPaths.dataRowsByKeyPath(sCacheKey)).length, 2, "detail rows appended to detail cache");
      assert.strictEqual(stubSetSel.callCount, 1, "selected parent cached");
      assert.strictEqual(stubEnsure.callCount, 1, "Screen4 cache primed");
      assert.strictEqual(stubScroll.callCount, 1, "table scrolled to new row");
      assert.strictEqual(stubScroll.firstCall.args[1], 0, "scrolled to filtered index 0");
      assert.strictEqual(stubToast.callCount, 1, "user feedback shown");
    } finally {
      stubScroll.restore();
      stubEnsure.restore();
      stubSetSel.restore();
      stubCreateDetails.restore();
      stubCreateParent.restore();
      stubGetTpl.restore();
      stubPick.restore();
      stubToast.restore();
    }
  });

  QUnit.test("onDeleteRows removes selected parents from records and raw caches, purges Screen4 cache and clears selection", function (assert) {
    var sCacheKey = "CK-S3-DEL";
    var oVm = buildVm(sCacheKey);
    var oParent1 = { idx: 1, guidKey: "G1", GUID: "G1", Fibra: "F1" };
    var oParent2 = { idx: 2, guidKey: "G2", GUID: "G2", Fibra: "F2" };
    var oDetail = new JSONModel({
      RecordsAll: [oParent1, oParent2],
      __deletedParents: []
    });
    var stubCanDelete = sinon.stub(RowManagementUtil, "canDeleteSelectedRows").returns({ canDelete: true });
    var stubIdx = sinon.stub(RowManagementUtil, "getIdxToRemove").returns([1]);
    var stubStash = sinon.stub(PostUtil, "stashDeleteForPostFromCache");
    var stubPurge = sinon.stub(Screen4CacheUtil, "purgeScreen4CacheByParentIdx");
    var stubGetSel = sinon.stub(Screen4CacheUtil, "getSelectedParentForScreen4").returns({ idx: 1 });
    var stubSetSel = sinon.stub(Screen4CacheUtil, "setSelectedParentForScreen4");
    var stubToast = sinon.stub(MessageToast, "show");
    try {
      oVm.setProperty(VmPaths.recordsByKeyPath(sCacheKey), [oParent1, oParent2]);
      oVm.setProperty(VmPaths.dataRowsByKeyPath(sCacheKey), [
        { Guid: "G1", guidKey: "G1", Fibra: "F1" },
        { Guid: "G2", guidKey: "G2", Fibra: "F2" }
      ]);

      var bApplied = false;
      var bCleared = false;
      Screen3CrudUtil.onDeleteRows({
        detailModel: oDetail,
        vmModel: oVm,
        cacheKey: sCacheKey,
        cacheKeySafe: "SAFE-S3-DEL",
        component: { getModel: function () { return oVm; } },
        getSelectedParentObjectsFn: function () { return [oParent1]; },
        applyClientFiltersFn: function () { bApplied = true; },
        clearSelectionFn: function () { bCleared = true; }
      });

      assert.strictEqual(oDetail.getProperty("/RecordsAll").length, 1, "detail records filtered");
      assert.strictEqual(oVm.getProperty(VmPaths.recordsByKeyPath(sCacheKey)).length, 1, "records cache filtered");
      assert.strictEqual(oVm.getProperty(VmPaths.dataRowsByKeyPath(sCacheKey)).length, 1, "raw cache filtered");
      assert.strictEqual(stubStash.callCount, 1, "delete payload stash created");
      assert.strictEqual(stubPurge.callCount, 1, "Screen4 cache purged");
      assert.strictEqual(stubSetSel.callCount, 1, "selected parent cleared after delete");
      assert.ok(bApplied, "filters reapplied");
      assert.ok(bCleared, "selection cleared");
      assert.strictEqual(stubToast.callCount, 1, "success toast shown");
    } finally {
      stubToast.restore();
      stubSetSel.restore();
      stubGetSel.restore();
      stubPurge.restore();
      stubStash.restore();
      stubIdx.restore();
      stubCanDelete.restore();
    }
  });
});
