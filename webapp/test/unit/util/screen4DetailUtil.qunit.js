/* global QUnit */
sap.ui.define([
  "sap/ui/model/json/JSONModel",
  "apptracciabilita/apptracciabilita/util/screen4DetailUtil",
  "apptracciabilita/apptracciabilita/util/vmModelPaths",
  "apptracciabilita/apptracciabilita/util/statusUtil"
], function (JSONModel, Screen4DetailUtil, VmPaths, StatusUtil) {
  "use strict";

  QUnit.module("util/screen4DetailUtil");

  function buildVm(sCacheKey, sUserType) {
    var oVm = new JSONModel({
      userType: sUserType || "I",
      cache: { recordsByKey: {}, dataRowsByKey: {} }
    });
    oVm.setProperty(VmPaths.dataRowsByKeyPath(sCacheKey), []);
    oVm.setProperty(VmPaths.recordsByKeyPath(sCacheKey), []);
    return oVm;
  }

  QUnit.test("resolveOrSynthRowsForGuid appends a synthetic row when cache has no matching guid", function (assert) {
    var oVm = buildVm("CK-S4");
    var aRows = Screen4DetailUtil.resolveOrSynthRowsForGuid({
      guid: "G1",
      record: { Guid: "G1", Fibra: "F1" },
      selectedParent: null,
      allRows: [],
      cacheKey: "CK-S4",
      vmModel: oVm
    });

    assert.strictEqual(aRows.length, 1, "synthetic row returned");
    assert.strictEqual(aRows[0].__synthetic, true, "row flagged synthetic");
    assert.strictEqual(oVm.getProperty(VmPaths.dataRowsByKeyPath("CK-S4")).length, 1, "synthetic row persisted into cache");
  });

  QUnit.test("applyGroupStatusAndPerms normalizes row state and aggregate permissions", function (assert) {
    var oVm = buildVm("CK-S4", "I");
    var oDetail = new JSONModel({});
    var aSelected = [{ Stato: "AP" }, { Stato: "RJ" }];

    Screen4DetailUtil.applyGroupStatusAndPerms({
      selectedRows: aSelected,
      vmModel: oVm,
      detailModel: oDetail
    });

    assert.strictEqual(oDetail.getProperty("/__status"), "RJ", "aggregate status computed");
    assert.strictEqual(oDetail.getProperty("/__canEdit"), StatusUtil.canEdit("I", "RJ"), "edit permission recalculated");
    assert.strictEqual(aSelected[0].__readOnly, true, "row readonly updated");
  });

  QUnit.test("applyGroupStatusAndPerms lets superuser add rows on approved groups without broadening copy/delete", function (assert) {
    var oVm = buildVm("CK-S4", "S");
    var oDetail = new JSONModel({});
    var aSelected = [{ Stato: "AP" }];

    Screen4DetailUtil.applyGroupStatusAndPerms({
      selectedRows: aSelected,
      vmModel: oVm,
      detailModel: oDetail
    });

    assert.strictEqual(oDetail.getProperty("/__canEdit"), false, "approved group stays read-only");
    assert.strictEqual(oDetail.getProperty("/__canAddRow"), true, "superuser can still add rows");
    assert.strictEqual(oDetail.getProperty("/__canCopyRow"), false, "copy stays disabled");
    assert.strictEqual(oDetail.getProperty("/__canDeleteRow"), false, "delete stays disabled");
  });

  QUnit.test("resolveCatForSelection falls back to caches and backfills missing CatMateriale", function (assert) {
    var oRec = {};
    var sCat = Screen4DetailUtil.resolveCatForSelection({
      selectedRows: [{}],
      record: oRec,
      selectedParent: null,
      allRows: [{ CatMateriale: "CAT1" }],
      records: []
    });

    assert.strictEqual(sCat, "CAT1", "category resolved from raw rows");
    assert.strictEqual(oRec.CatMateriale, "CAT1", "record backfilled with resolved category");
  });

  QUnit.test("applyCfg02NormalizationToRows normalizes multi fields and fills missing scalars", function (assert) {
    var aRows = [{ Multi: "A;B", Single: null }];

    Screen4DetailUtil.applyCfg02NormalizationToRows({
      selectedRows: aRows,
      cfg02: [{ ui: "Multi", multiple: true }, { ui: "Single", multiple: false }],
      toArrayMultiFn: function (v) { return String(v).split(";"); }
    });

    assert.deepEqual(aRows[0].Multi, ["A", "B"], "multi value normalized");
    assert.strictEqual(aRows[0].Single, "", "missing scalar defaulted");
  });

  QUnit.test("applySelectedRecordToDetail populates detail model and triggers dependent callbacks", function (assert) {
    var oVm = buildVm("CK-S4");
    var oDetail = new JSONModel({});
    var iHdr = 0;
    var iPerms = 0;
    var iFilters = 0;
    var iAttach = 0;

    Screen4DetailUtil.applySelectedRecordToDetail({
      allRows: [{ Guid: "G1", guidKey: "G1", CatMateriale: "CAT1", Stato: "ST" }],
      records: [{ Guid: "G1", guidKey: "G1", CatMateriale: "CAT1", Stato: "ST" }],
      cacheKey: "CK-S4",
      recordKey: "0",
      vmModel: oVm,
      detailModel: oDetail,
      cfgForScreenFn: function () { return [{ ui: "CampoA", multiple: false }]; },
      toArrayMultiFn: function (v) { return v; },
      buildHeader4FromMmct00Fn: function () { return { s00: [{ ui: "CampoA" }], hdr4: [{ ui: "CampoA" }] }; },
      refreshHeader4FieldsFn: function () { iHdr++; },
      applyUiPermissionsFn: function () { iPerms++; },
      applyFiltersAndSortFn: function () { iFilters++; },
      syncAttachmentCountersFn: function () { iAttach++; },
      setSnapshotRowsFn: function () {},
      doneFn: function () {}
    });

    assert.strictEqual(oDetail.getProperty("/RowsAll").length, 1, "rows bound to detail model");
    assert.strictEqual(oDetail.getProperty("/guidKey"), "G1", "guid stored on detail model");
    assert.strictEqual(oDetail.getProperty("/RowsCount"), 1, "row count stored on detail model");
    assert.strictEqual(iHdr, 1, "header refresh called");
    assert.strictEqual(iPerms, 1, "permissions recalculated");
    assert.strictEqual(iFilters, 1, "filters reapplied");
    assert.strictEqual(iAttach, 1, "attachment counters synced");
  });
});
