/* global QUnit, sinon */
sap.ui.define([
  "sap/ui/model/json/JSONModel",
  "apptracciabilita/apptracciabilita/util/screen3BindingUtil",
  "apptracciabilita/apptracciabilita/util/vmModelPaths"
], function (JSONModel, Screen3BindingUtil, VmPaths) {
  "use strict";

  QUnit.module("util/screen3BindingUtil");

  QUnit.test("applySnapshotStatusAndNotes recalculates aggregate status and propagates note from raw rows", function (assert) {
    var aSnapshot = [{ guidKey: "G1", Stato: "ST", __status: "ST", Note: "" }];
    var aRows = [
      { Guid: "G1", Stato: "AP" },
      { Guid: "G1", Stato: "RJ", Note: "reject note" }
    ];

    Screen3BindingUtil.applySnapshotStatusAndNotes({
      snapshot: aSnapshot,
      rows: aRows
    });

    assert.strictEqual(aSnapshot[0].Stato, "RJ", "aggregate status computed from raw rows");
    assert.strictEqual(aSnapshot[0].__status, "RJ", "shadow status synchronized");
    assert.strictEqual(aSnapshot[0].Note, "reject note", "note propagated from raw rows");
  });

  QUnit.test("excludeTemplatesByRawRows removes parent records backed by CodAgg N template rows", function (assert) {
    var aFiltered = Screen3BindingUtil.excludeTemplatesByRawRows({
      records: [{ guidKey: "G1" }, { guidKey: "G2" }],
      rows: [{ Guid: "G1", CodAgg: "N" }, { Guid: "G2", CodAgg: "U" }]
    });

    assert.deepEqual(aFiltered, [{ guidKey: "G2" }], "template-backed parent removed");
  });

  QUnit.test("ensureMdcCfgScreen3 deduplicates properties and injects Stato when missing", function (assert) {
    var oVm = new JSONModel({ mdcCfg: {} });

    Screen3BindingUtil.ensureMdcCfgScreen3({
      cfg01: [{ ui: "CampoA", label: "Campo A" }, { ui: "CampoA", label: "Dup" }],
      vmModel: oVm,
      logFn: function () {}
    });

    var aProps = oVm.getProperty("/mdcCfg/screen3/properties");
    assert.strictEqual(aProps[0].name, "Stato", "Stato injected first");
    assert.strictEqual(aProps[1].name, "CampoA", "custom property preserved");
    assert.strictEqual(aProps.length, 2, "duplicates removed");
  });

  QUnit.test("loadDataOnce serves cache and skips backend reload when skip flag is consumed", function (assert) {
    var oVm = new JSONModel({ cache: { dataRowsByKey: {}, recordsByKey: {} } });
    oVm.setProperty(VmPaths.dataRowsByKeyPath("CK"), [{ Guid: "G1" }]);
    oVm.setProperty(VmPaths.recordsByKeyPath("CK"), [{ guidKey: "G1" }]);

    var iCacheCalls = 0;
    var iBackendCalls = 0;

    Screen3BindingUtil.loadDataOnce({
      vmModel: oVm,
      cacheKey: "CK",
      savedSnapshot: [{ guidKey: "G1" }],
      consumeSkipBackendFn: function () { return true; },
      bindFromCacheFn: function (aRows, sKey, bSkip, aSaved) {
        iCacheCalls++;
        assert.strictEqual(sKey, "CK", "cache key forwarded");
        assert.strictEqual(bSkip, true, "skip flag forwarded");
        assert.strictEqual(aSaved.length, 1, "saved snapshot forwarded");
      },
      reloadDataFromBackendFn: function () { iBackendCalls++; },
      bindFromBackendFn: function () {},
      logFn: function () {},
      nextLoadTokenFn: function () { return 1; },
      getLoadTokenFn: function () { return 1; }
    });

    assert.strictEqual(iCacheCalls, 1, "cache bind used");
    assert.strictEqual(iBackendCalls, 0, "backend skipped");
  });

  QUnit.test("bindRecords lets superuser add, copy and delete on approved groups", async function (assert) {
    var oVm = new JSONModel({ userType: "S", mdcCfg: {} });
    var oDetail = new JSONModel({ _mmct: { s01Table: [] } });

    await Screen3BindingUtil.bindRecords({
      detailModel: oDetail,
      records: [{ guidKey: "G1", Stato: "AP", __status: "AP" }],
      vmModel: oVm,
      noMatListMode: false,
      inlineFs: {},
      setInlineFsFn: function () {},
      logFn: function () {},
      setSnapshotRecordsFn: function () {},
      setOriginalSnapshotFn: function () {},
      keepOriginalSnapshot: false,
      table: null,
      onGoToScreen4FromRowFn: function () {},
      createStatusCellTemplateFn: function () {},
      createCellTemplateFn: function () {},
      setStatusColumnFn: function () {},
      getStatusColumnFn: function () { return null; },
      applyInlineHeaderFilterSortFn: async function () {},
      applyClientFiltersFn: function () {},
      clearSelectionFn: function () {},
      scheduleHeaderFilterSortFn: function () {},
      logTableFn: function () {},
      ensurePostErrorRowHooksFn: function () {}
    });

    assert.strictEqual(oDetail.getProperty("/__canAddRow"), true, "superuser keeps add-row permission");
    assert.strictEqual(oDetail.getProperty("/__canCopyRow"), true, "copy-row is enabled for superuser");
    assert.strictEqual(oDetail.getProperty("/__canDeleteRow"), true, "delete-row is enabled for superuser");
  });
});
