/* global QUnit */
sap.ui.define([
  "sap/ui/model/json/JSONModel",
  "apptracciabilita/apptracciabilita/util/screenFlowStateUtil"
], function (JSONModel, ScreenFlowState) {
  "use strict";

  QUnit.module("util/screenFlowStateUtil");

  function createVm() {
    return new JSONModel({});
  }

  QUnit.test("stores and clears selected parent for Screen4", function (assert) {
    var oVm = createVm();
    var oParent = { idx: 4, guidKey: "G-100" };

    ScreenFlowState.setSelectedParentForScreen4(oVm, oParent);
    assert.deepEqual(ScreenFlowState.getSelectedParentForScreen4(oVm), oParent, "selected parent is stored");

    ScreenFlowState.clearSelectedParentForScreen4(oVm);
    assert.strictEqual(ScreenFlowState.getSelectedParentForScreen4(oVm), null, "selected parent is cleared");
  });

  QUnit.test("manages no-mat-list context and season without changing stored values", function (assert) {
    var oVm = createVm();

    ScreenFlowState.setNoMatListContext(oVm, true, "CAT-01");
    assert.deepEqual(ScreenFlowState.getNoMatListContext(oVm), {
      enabled: true,
      catMateriale: "CAT-01"
    }, "no-mat-list context is stored");

    ScreenFlowState.setCurrentSeason(oVm, "FW26");
    assert.strictEqual(ScreenFlowState.getCurrentSeason(oVm), "FW26", "season is stored");

    ScreenFlowState.setNoMatListContext(oVm, false, "IGNORED");
    assert.deepEqual(ScreenFlowState.getNoMatListContext(oVm), {
      enabled: false,
      catMateriale: ""
    }, "disabling no-mat-list clears category but keeps semantics");
  });

  QUnit.test("consumes transient flags exactly once", function (assert) {
    var oVm = createVm();

    assert.strictEqual(ScreenFlowState.shouldSkipScreen3BackendOnce(oVm), false, "skip flag starts false");
    ScreenFlowState.markReturnFromScreen4(oVm);
    assert.strictEqual(ScreenFlowState.shouldSkipScreen3BackendOnce(oVm), true, "skip flag is set");
    assert.strictEqual(ScreenFlowState.consumeSkipScreen3BackendOnce(oVm), true, "skip flag is consumed");
    assert.strictEqual(ScreenFlowState.consumeSkipScreen3BackendOnce(oVm), false, "skip flag resets after consumption");

    assert.strictEqual(ScreenFlowState.shouldForceScreen3CacheReload(oVm), false, "force flag starts false");
    ScreenFlowState.markForceScreen3CacheReload(oVm);
    assert.strictEqual(ScreenFlowState.shouldForceScreen3CacheReload(oVm), true, "force flag is set");
    assert.strictEqual(ScreenFlowState.consumeForceScreen3CacheReload(oVm), true, "force flag is consumed");
    assert.strictEqual(ScreenFlowState.consumeForceScreen3CacheReload(oVm), false, "force flag resets after consumption");

    assert.strictEqual(ScreenFlowState.consumeVendorCacheStale(oVm), false, "vendor cache stale starts false");
    ScreenFlowState.markVendorCacheStale(oVm);
    assert.strictEqual(ScreenFlowState.consumeVendorCacheStale(oVm), true, "vendor cache stale is consumed");
    assert.strictEqual(ScreenFlowState.consumeVendorCacheStale(oVm), false, "vendor cache stale resets after consumption");
  });

  QUnit.test("stores and clears selected material category", function (assert) {
    var oVm = createVm();

    ScreenFlowState.setSelectedCatMateriale(oVm, "TESSUTI");
    assert.strictEqual(ScreenFlowState.getSelectedCatMateriale(oVm), "TESSUTI", "selected category is stored");

    ScreenFlowState.clearSelectedCatMateriale(oVm);
    assert.strictEqual(ScreenFlowState.getSelectedCatMateriale(oVm), "", "selected category is cleared");
  });
});
