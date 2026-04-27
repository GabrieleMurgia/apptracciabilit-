/* global QUnit, sinon */
sap.ui.define([
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "apptracciabilita/apptracciabilita/util/screen4RowsUtil",
  "apptracciabilita/apptracciabilita/util/vmModelPaths",
  "apptracciabilita/apptracciabilita/util/mdcTableUtil",
  "apptracciabilita/apptracciabilita/util/screen4LoaderUtil"
], function (JSONModel, MessageToast, Screen4RowsUtil, VmPaths, MdcTableUtil, S4Loader) {
  "use strict";

  QUnit.module("util/screen4RowsUtil");

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

  QUnit.test("checkRowDirtyRevert restores CodAgg and resets dirty when all rows match the snapshot", function (assert) {
    var oRow = { guidKey: "G1", CampoA: "A", CodAgg: "U" };
    var oDetail = new JSONModel({
      _mmct: { s02: [{ ui: "CampoA" }] },
      RowsAll: [{ guidKey: "G1", CampoA: "A", CodAgg: "U" }],
      __dirty: true
    });
    var iPermCalls = 0;

    Screen4RowsUtil.checkRowDirtyRevert({
      row: oRow,
      context: makeCtx(oRow, "/RowsAll/0"),
      detailModel: oDetail,
      snapshotRows: [{ guidKey: "G1", CampoA: "A", CodAgg: "N" }],
      applyUiPermissionsFn: function () { iPermCalls++; }
    });

    assert.strictEqual(oRow.CodAgg, "N", "CodAgg restored from snapshot");
    assert.strictEqual(oDetail.getProperty("/RowsAll/0/CodAgg"), "N", "detail model restored");
    assert.strictEqual(oDetail.getProperty("/__dirty"), false, "dirty cleared when all rows are back to snapshot");
    assert.strictEqual(iPermCalls, 1, "permissions recomputed once");
  });

  QUnit.test("updateVmRecordStatus rewrites state flags in records cache for the targeted guid/fibra pair", function (assert) {
    var sCacheKey = "CK-S4-STATUS";
    var oVm = buildVm(sCacheKey);
    oVm.setProperty(VmPaths.recordsByKeyPath(sCacheKey), [
      { guidKey: "G1", Fibra: "F1", __status: "ST" },
      { guidKey: "G2", Fibra: "F2", __status: "ST" }
    ]);

    Screen4RowsUtil.updateVmRecordStatus({
      vmModel: oVm,
      cacheKey: sCacheKey,
      guid: "G2",
      fibra: "F2",
      role: "i",
      status: "ap"
    });

    var aRecs = oVm.getProperty(VmPaths.recordsByKeyPath(sCacheKey));
    assert.strictEqual(aRecs[1].__status, "AP", "status normalized to AP");
    assert.strictEqual(aRecs[1].Stato, "AP", "Stato field synchronized");
    assert.strictEqual(aRecs[1].__canEdit, false, "edit permission recalculated");
    assert.strictEqual(aRecs[1].__readOnly, true, "read only flag synchronized");
  });

  QUnit.test("getSelectedRowObjects uses selected contexts directly when available", function (assert) {
    var oRow1 = { id: 1 };
    var oRow2 = { id: 2 };
    var aRows = Screen4RowsUtil.getSelectedRowObjects({
      table: {
        getSelectedContexts: function () {
          return [makeCtx(oRow1, "/Rows/0"), makeCtx(oRow2, "/Rows/1")];
        }
      }
    });

    assert.deepEqual(aRows, [oRow1, oRow2], "selected row objects extracted from contexts");
  });

  QUnit.test("onDeleteRows removes selected rows from detail model and cache, then reapplies UI state", function (assert) {
    var sCacheKey = "CK-S4-DEL";
    var oVm = buildVm(sCacheKey);
    var oRow1 = { __localId: "L1", Guid: "G1", guidKey: "G1", CodAgg: "U" };
    var oRow2 = { __localId: "L2", Guid: "G1", guidKey: "G1", CodAgg: "U" };
    var oDetail = new JSONModel({
      guidKey: "G1",
      __canEdit: true,
      __canDeleteRow: true,
      __role: "I",
      __status: "ST",
      RowsAll: [oRow1, oRow2]
    });
    var stubToast = sinon.stub(MessageToast, "show");
    var stubRowGuid = sinon.stub(S4Loader, "rowGuidKey").returns("G1");
    try {
      oVm.setProperty(VmPaths.dataRowsByKeyPath(sCacheKey), [oRow1, oRow2]);
      var bPerms = false;
      var bSort = false;
      var bRebind = false;

      Screen4RowsUtil.onDeleteRows.call(Screen4RowsUtil, {
        detailModel: oDetail,
        vmModel: oVm,
        cacheKey: sCacheKey,
        table: {
          rebind: function () { bRebind = true; },
          getSelectedContexts: function () { return [makeCtx(oRow1, "/Rows/0")]; }
        },
        applyUiPermissionsFn: function () { bPerms = true; },
        applyFiltersAndSortFn: function () { bSort = true; }
      });

      assert.strictEqual(oDetail.getProperty("/RowsAll").length, 1, "detail rows filtered");
      assert.strictEqual(oDetail.getProperty("/__dirty"), true, "dirty set after delete");
      assert.strictEqual(oVm.getProperty(VmPaths.dataRowsByKeyPath(sCacheKey)).length, 1, "cache rows rewritten");
      assert.ok(bPerms, "permissions reapplied");
      assert.ok(bSort, "filters/sort reapplied");
      assert.ok(bRebind, "table rebound");
      assert.strictEqual(stubToast.callCount, 1, "toast shown");
    } finally {
      stubRowGuid.restore();
      stubToast.restore();
    }
  });

  QUnit.test("onAddRow clones the fullest base row, appends it to model/cache and scrolls to it", function (assert) {
    var sCacheKey = "CK-S4-ADD";
    var oVm = buildVm(sCacheKey);
    oVm.setProperty(VmPaths.dataRowsByKeyPath(sCacheKey), [{ Guid: "G-BASE" }]);
    var oDetail = new JSONModel({
      guidKey: "G-BASE",
      __canAddRow: true,
      _mmct: { cat: "CAT1", s02: [] },
      RowsAll: [{ Guid: "G-BASE", guidKey: "G-BASE", Fornitore: "V1", Materiale: "M1", CatMateriale: "CAT1", Plant: "P1", Fibra: "F1", Extra: "X" }]
    });
    var stubToast = sinon.stub(MessageToast, "show");
    var stubScroll = sinon.stub(MdcTableUtil, "scrollToRow");
    try {
      var bPerms = false;
      var bSorted = false;
      var bSynced = false;

      Screen4RowsUtil.onAddRow({
        detailModel: oDetail,
        vmModel: oVm,
        cacheKey: sCacheKey,
        table: { rebind: function () {} },
        toArrayMultiFn: function (v) { return v; },
        applyUiPermissionsFn: function () { bPerms = true; },
        applyFiltersAndSortFn: function () {
          bSorted = true;
          oDetail.setProperty("/Rows", oDetail.getProperty("/RowsAll"));
        },
        syncAttachmentCountersFn: function () { bSynced = true; }
      });

      var aRows = oDetail.getProperty("/RowsAll");
      var oNew = aRows[aRows.length - 1];
      assert.strictEqual(aRows.length, 2, "one row appended");
      assert.strictEqual(oVm.getProperty(VmPaths.dataRowsByKeyPath(sCacheKey)).length, 2, "cache row appended");
      assert.ok(/^NEW_/.test(oNew.__localId), "new row local id generated");
      assert.strictEqual(oNew.__isNew, true, "new row flagged");
      assert.ok(bPerms, "permissions reapplied");
      assert.ok(bSorted, "filters/sort rerun");
      assert.ok(bSynced, "attachment sync triggered");
      assert.strictEqual(stubScroll.callCount, 1, "scrolled to appended row");
      assert.strictEqual(stubToast.callCount, 1, "toast shown");
    } finally {
      stubScroll.restore();
      stubToast.restore();
    }
  });

  QUnit.test("onCopyRow duplicates the selected row, resets attachment counters and appends the copy", function (assert) {
    var sCacheKey = "CK-S4-COPY";
    var oVm = buildVm(sCacheKey);
    oVm.setProperty(VmPaths.dataRowsByKeyPath(sCacheKey), [{ Guid: "G-BASE", ATT_DOC: "3" }]);
    var oSource = { __localId: "L1", Guid: "G-BASE", guidKey: "G-BASE", ATT_DOC: "3", Campo: "A" };
    var oDetail = new JSONModel({
      __canAddRow: true,
      __canCopyRow: true,
      _mmct: { s01: [{ ui: "ATT_DOC", attachment: true }], s02: [] },
      RowsAll: [oSource]
    });
    var stubToast = sinon.stub(MessageToast, "show");
    var stubScroll = sinon.stub(MdcTableUtil, "scrollToRow");
    try {
      var bPerms = false;
      var bSorted = false;
      var bSynced = false;

      Screen4RowsUtil.onCopyRow.call(Screen4RowsUtil, {
        detailModel: oDetail,
        vmModel: oVm,
        cacheKey: sCacheKey,
        table: {
          rebind: function () {},
          getSelectedContexts: function () { return [makeCtx(oSource, "/RowsAll/0")]; }
        },
        toArrayMultiFn: function (v) { return v; },
        applyUiPermissionsFn: function () { bPerms = true; },
        applyFiltersAndSortFn: function () {
          bSorted = true;
          oDetail.setProperty("/Rows", oDetail.getProperty("/RowsAll"));
        },
        syncAttachmentCountersFn: function () { bSynced = true; }
      });

      var aRows = oDetail.getProperty("/RowsAll");
      var oCopy = aRows[aRows.length - 1];
      assert.strictEqual(aRows.length, 2, "copy appended");
      assert.strictEqual(oCopy.ATT_DOC, "0", "attachment counter reset on copy");
      assert.ok(/^COPY_/.test(oCopy.__localId), "copy local id generated");
      assert.strictEqual(oVm.getProperty(VmPaths.dataRowsByKeyPath(sCacheKey)).length, 2, "cache copy appended");
      assert.ok(bPerms, "permissions reapplied");
      assert.ok(bSorted, "filters/sort rerun");
      assert.ok(bSynced, "attachment sync triggered");
      assert.strictEqual(stubScroll.callCount, 1, "scrolled to copied row");
      assert.strictEqual(stubToast.callCount, 1, "toast shown");
    } finally {
      stubScroll.restore();
      stubToast.restore();
    }
  });
});
