/* global QUnit, sinon */
sap.ui.define([
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "apptracciabilita/apptracciabilita/util/baseApprovalUtil",
  "apptracciabilita/apptracciabilita/util/vmModelPaths"
], function (JSONModel, MessageToast, BaseApprovalUtil, VmPaths) {
  "use strict";

  QUnit.module("util/baseApprovalUtil");

  function buildVm(sCacheKey, aRows) {
    var oVm = new JSONModel({ cache: { dataRowsByKey: {}, recordsByKey: {} } });
    oVm.setProperty(VmPaths.dataRowsByKeyPath(sCacheKey), aRows || []);
    return oVm;
  }

  QUnit.test("applyStatusChange updates parent records by Guid only and marks raw rows as updated", function (assert) {
    var sCacheKey = "REAL|S3";
    var oDetail = new JSONModel({
      RecordsAll: [
        { guidKey: "G1", Fibra: "F1", Stato: "ST", __status: "ST" },
        { guidKey: "G1", Fibra: "F2", Stato: "ST", __status: "ST" }
      ]
    });
    var oVm = buildVm(sCacheKey, [
      { Guid: "G1", Fibra: "F1", Stato: "ST" },
      { Guid: "G1", Fibra: "F2", Stato: "ST" }
    ]);
    var stubToast = sinon.stub(MessageToast, "show");
    try {
      BaseApprovalUtil.applyStatusChange({
        context: null,
        detailModel: oDetail,
        vmModel: oVm,
        cacheKey: sCacheKey,
        selectedRows: [{ guidKey: "G1", Fibra: "F1" }],
        newStatus: "AP",
        note: "",
        isParentTable: true
      });

      assert.strictEqual(oDetail.getProperty("/RecordsAll/0/Stato"), "AP", "first parent row updated");
      assert.strictEqual(oDetail.getProperty("/RecordsAll/1/Stato"), "AP", "all fibras for same guid updated");
      assert.strictEqual(oVm.getProperty(VmPaths.dataRowsByKeyPath(sCacheKey))[0].CodAgg, "U", "raw row marked updated");
      assert.strictEqual(oVm.getProperty(VmPaths.dataRowsByKeyPath(sCacheKey))[1].CodAgg, "U", "all raw rows for guid marked updated");
      assert.strictEqual(stubToast.callCount, 1, "user feedback shown");
    } finally {
      stubToast.restore();
    }
  });

  QUnit.test("applyStatusChange updates detail rows by Guid and Fibra and writes reject note", function (assert) {
    var sCacheKey = "REAL|S4";
    var oDetail = new JSONModel({
      RowsAll: [
        { guidKey: "G1", Fibra: "F1", Stato: "ST", __status: "ST" },
        { guidKey: "G1", Fibra: "F2", Stato: "ST", __status: "ST" }
      ]
    });
    var oVm = buildVm(sCacheKey, [
      { Guid: "G1", Fibra: "F1", Stato: "ST" },
      { Guid: "G1", Fibra: "F2", Stato: "ST" }
    ]);
    var stubToast = sinon.stub(MessageToast, "show");
    try {
      BaseApprovalUtil.applyStatusChange({
        context: null,
        detailModel: oDetail,
        vmModel: oVm,
        cacheKey: sCacheKey,
        selectedRows: [{ guidKey: "G1", Fibra: "F2" }],
        newStatus: "RJ",
        note: "bad data",
        isParentTable: false
      });

      assert.strictEqual(oDetail.getProperty("/RowsAll/0/Stato"), "ST", "non-selected fibra untouched");
      assert.strictEqual(oDetail.getProperty("/RowsAll/1/Stato"), "RJ", "selected fibra updated");
      assert.strictEqual(oDetail.getProperty("/RowsAll/1/Note"), "bad data", "reject note written");
      assert.strictEqual(oVm.getProperty(VmPaths.dataRowsByKeyPath(sCacheKey))[0].Stato, "ST", "raw non-selected fibra untouched");
      assert.strictEqual(oVm.getProperty(VmPaths.dataRowsByKeyPath(sCacheKey))[1].Stato, "RJ", "raw selected fibra updated");
      assert.strictEqual(stubToast.callCount, 1, "user feedback shown");
    } finally {
      stubToast.restore();
    }
  });
});
