/* global QUnit */
sap.ui.define([
  "sap/ui/model/json/JSONModel",
  "apptracciabilita/apptracciabilita/util/screen4SaveUtil",
  "apptracciabilita/apptracciabilita/util/vmModelPaths"
], function (JSONModel, Screen4SaveUtil, VmPaths) {
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
});
