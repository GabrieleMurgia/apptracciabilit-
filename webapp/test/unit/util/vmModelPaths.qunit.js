/* global QUnit */
sap.ui.define([
  "apptracciabilita/apptracciabilita/util/vmModelPaths"
], function (VmPaths) {
  "use strict";

  QUnit.module("util/vmModelPaths");

  QUnit.test("builds stable cache paths", function (assert) {
    assert.strictEqual(VmPaths.CACHE_ROOT, "/cache", "cache root is stable");
    assert.strictEqual(VmPaths.DATA_ROWS_BY_KEY_ROOT, "/cache/dataRowsByKey/", "data rows root is stable");
    assert.strictEqual(VmPaths.RECORDS_BY_KEY_ROOT, "/cache/recordsByKey/", "records root is stable");
    assert.strictEqual(VmPaths.DELETED_LINES_FOR_POST_ROOT, "/cache/__deletedLinesForPost_", "deleted-lines root is stable");

    assert.strictEqual(VmPaths.dataRowsByKeyPath("CK1"), "/cache/dataRowsByKey/CK1", "data rows cache path is built correctly");
    assert.strictEqual(VmPaths.recordsByKeyPath("CK1"), "/cache/recordsByKey/CK1", "records cache path is built correctly");
    assert.strictEqual(VmPaths.deletedLinesForPostPath("CK1"), "/cache/__deletedLinesForPost_CK1", "deleted-lines cache path is built correctly");
  });

  QUnit.test("exposes centralized transient state paths", function (assert) {
    assert.strictEqual(VmPaths.SELECTED_SCREEN3_RECORD, "/selectedScreen3Record", "selected parent path is stable");
    assert.strictEqual(VmPaths.SKIP_S3_BACKEND_ONCE, "/__skipS3BackendOnce", "skip-backend flag path is stable");
    assert.strictEqual(VmPaths.FORCE_S3_CACHE_RELOAD, "/__forceS3CacheReload", "force-cache flag path is stable");
    assert.strictEqual(VmPaths.NO_MAT_LIST_MODE, "/__noMatListMode", "no-mat-list mode path is stable");
    assert.strictEqual(VmPaths.NO_MAT_LIST_CAT, "/__noMatListCat", "no-mat-list category path is stable");
    assert.strictEqual(VmPaths.CURRENT_SEASON, "/__currentSeason", "current season path is stable");
    assert.strictEqual(VmPaths.SELECTED_CAT_MATERIALE, "/__selectedCatMateriale", "selected category path is stable");
    assert.strictEqual(VmPaths.VENDOR_CACHE_STALE, "/__vendorCacheStale", "vendor cache stale path is stable");
  });
});
