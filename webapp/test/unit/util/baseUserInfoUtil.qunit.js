/* global QUnit */
sap.ui.define([
  "sap/ui/model/json/JSONModel",
  "apptracciabilita/apptracciabilita/util/baseUserInfoUtil"
], function (JSONModel, BaseUserInfoUtil) {
  "use strict";

  QUnit.module("util/baseUserInfoUtil");

  QUnit.test("buildVmData normalizes domains, MMCT and auth flags into vm structure", function (assert) {
    var oVm = new JSONModel({
      mdcCfg: { keep: true },
      cache: { dataRowsByKey: { X: [] }, recordsByKey: {} }
    });

    var oData = {
      UserType: "I",
      UserDescription: "Valentino User",
      UserInfosDomains: {
        results: [{
          Domain: "COLOR",
          DomainsValues: { results: [{ Value: "BA", Descrizione: "Blue Angel" }] }
        }]
      },
      UserInfosMMCT: {
        results: [{
          CatMateriale: "CAT1",
          UserMMCTFields: { results: [{ CatMateriale: "CAT1", UiFieldname: "F1" }] }
        }]
      }
    };

    var oResult = BaseUserInfoUtil.buildVmData(oVm, oData, "USER1");
    assert.strictEqual(oResult.userId, "USER1", "user id preserved");
    assert.strictEqual(oResult.userType, "I", "user type preserved");
    assert.strictEqual(oResult.auth.role, "VALENTINO", "role derived");
    assert.strictEqual(oResult.showAggregatedTile, true, "aggregated tile enabled for non-supplier");
    assert.deepEqual(oResult.domainsByName.COLOR, [{ key: "BA", text: "Blue Angel" }], "domainsByName built");
    assert.strictEqual(oResult.domainsByKey.COLOR.BA, "Blue Angel", "domainsByKey built");
    assert.strictEqual(oResult.mmctFieldsByCat.CAT1.length, 1, "MMCT grouped by category");
    assert.deepEqual(oResult.mdcCfg, { keep: true }, "existing mdcCfg preserved");
    assert.deepEqual(oResult.cache, { dataRowsByKey: { X: [] }, recordsByKey: {} }, "existing cache preserved");
  });
});
