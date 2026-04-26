/* global QUnit, sinon */
sap.ui.define([
  "sap/ui/model/json/JSONModel",
  "apptracciabilita/apptracciabilita/util/screen4AttachUtil"
], function (JSONModel, S4Attach) {
  "use strict";

  QUnit.module("util/screen4AttachUtil");

  function buildDetail(aRows, aS00, aS02) {
    return new JSONModel({
      RowsAll: aRows || [],
      _mmct: {
        s00: aS00 || [],
        s02: aS02 || []
      }
    });
  }

  function buildOpts(detailModel, snap, bSyncing) {
    var state = {
      detailModel: detailModel,
      snap: snap || null,
      syncing: !!bSyncing
    };
    return {
      _state: state,
      getDetailModel: function () { return state.detailModel; },
      getAttachSnapshot: function () { return state.snap; },
      setAttachSnapshot: function (oSnap) { state.snap = oSnap; },
      isSyncing: function () { return state.syncing; },
      setSyncing: function (b) { state.syncing = !!b; }
    };
  }

  // -------------------------------------------------------
  // syncAttachmentCounters
  // -------------------------------------------------------

  QUnit.test("syncAttachmentCounters propagates the changed value across all rows for an attachment field", function (assert) {
    var oDetail = buildDetail(
      [{ ATT_DOC: "0" }, { ATT_DOC: "0" }, { ATT_DOC: "5" }],
      [],
      [{ ui: "ATT_DOC", attachment: true }]
    );
    var opts = buildOpts(oDetail, { ATT_DOC: [0, 0, 0] }, false);

    S4Attach.syncAttachmentCounters(opts);

    var aRows = oDetail.getProperty("/RowsAll");
    assert.strictEqual(aRows[0].ATT_DOC, "5", "row 0 propagated");
    assert.strictEqual(aRows[1].ATT_DOC, "5", "row 1 propagated");
    assert.strictEqual(aRows[2].ATT_DOC, "5", "row 2 keeps the new value");
    assert.deepEqual(opts._state.snap.ATT_DOC, [5, 5, 5], "snapshot tracks the new value");
  });

  QUnit.test("syncAttachmentCounters merges attachment fields from both s00 and s02 without duplicating", function (assert) {
    var oDetail = buildDetail(
      [{ ATT_X: "0", ATT_Y: "0" }, { ATT_X: "2", ATT_Y: "0" }],
      [{ ui: "ATT_X", attachment: true }, { ui: "ATT_Y", attachment: true }],
      [{ ui: "ATT_X", attachment: true }] // duplicate ATT_X — must not double-process
    );
    var opts = buildOpts(oDetail, { ATT_X: [0, 0], ATT_Y: [0, 0] }, false);

    S4Attach.syncAttachmentCounters(opts);

    var aRows = oDetail.getProperty("/RowsAll");
    assert.strictEqual(aRows[0].ATT_X, "2", "ATT_X propagated to row 0");
    assert.strictEqual(aRows[1].ATT_X, "2", "ATT_X kept on row 1");
    assert.strictEqual(aRows[0].ATT_Y, "0", "ATT_Y unchanged (no diff)");
  });

  QUnit.test("syncAttachmentCounters is a no-op when isSyncing returns true (re-entrancy guard)", function (assert) {
    var oDetail = buildDetail(
      [{ ATT_DOC: "0" }, { ATT_DOC: "9" }],
      [],
      [{ ui: "ATT_DOC", attachment: true }]
    );
    var opts = buildOpts(oDetail, { ATT_DOC: [0, 0] }, true);

    S4Attach.syncAttachmentCounters(opts);

    var aRows = oDetail.getProperty("/RowsAll");
    assert.strictEqual(aRows[0].ATT_DOC, "0", "row 0 untouched");
    assert.strictEqual(aRows[1].ATT_DOC, "9", "row 1 untouched");
    assert.deepEqual(opts._state.snap, { ATT_DOC: [0, 0] }, "snapshot untouched");
  });

  QUnit.test("syncAttachmentCounters is a no-op for a single row (nothing to propagate)", function (assert) {
    var oDetail = buildDetail(
      [{ ATT_DOC: "0" }],
      [],
      [{ ui: "ATT_DOC", attachment: true }]
    );
    var opts = buildOpts(oDetail, null, false);

    S4Attach.syncAttachmentCounters(opts);

    assert.strictEqual(oDetail.getProperty("/RowsAll/0/ATT_DOC"), "0", "row untouched");
    assert.strictEqual(opts._state.snap, null, "snapshot untouched");
  });

  QUnit.test("syncAttachmentCounters is a no-op when no attachment fields are configured", function (assert) {
    var oDetail = buildDetail(
      [{ X: "0" }, { X: "5" }],
      [{ ui: "X", attachment: false }],
      []
    );
    var opts = buildOpts(oDetail, null, false);

    S4Attach.syncAttachmentCounters(opts);

    assert.strictEqual(oDetail.getProperty("/RowsAll/1/X"), "5", "non-attachment field is not touched");
  });

  // -------------------------------------------------------
  // startPolling / stopPolling
  // -------------------------------------------------------

  QUnit.test("startPolling registers a setInterval with the configured delay and stopPolling clears it", function (assert) {
    var spySet = sinon.spy(function (fn, ms) { return { id: 42, fn: fn, ms: ms }; });
    var spyClear = sinon.spy();
    var iId = null;
    var spySync = sinon.spy();

    var opts = {
      intervalMs: 500,
      syncFn: spySync,
      getIntervalId: function () { return iId; },
      setIntervalId: function (v) { iId = v; },
      setIntervalFn: spySet,
      clearIntervalFn: spyClear
    };

    S4Attach.startPolling(opts);
    assert.strictEqual(spySet.callCount, 1, "setIntervalFn called once");
    assert.strictEqual(spySet.firstCall.args[1], 500, "uses provided delay");
    assert.strictEqual(typeof spySet.firstCall.args[0], "function", "callback is a function");

    // Invoking the registered callback must invoke the syncFn the controller passed in.
    spySet.firstCall.args[0]();
    assert.strictEqual(spySync.callCount, 1, "registered callback delegates to syncFn");

    S4Attach.stopPolling(opts);
    assert.strictEqual(spyClear.callCount, 1, "clearIntervalFn called once");
    assert.deepEqual(spyClear.firstCall.args[0], { id: 42, fn: spySet.firstCall.args[0], ms: 500 },
      "clear receives the previously registered handle");
    assert.strictEqual(iId, null, "interval id reset to null after stop");
  });

  QUnit.test("startPolling cancels the previous interval before registering a new one", function (assert) {
    var iId = null;
    var spySet = sinon.spy(function () { return { id: Math.random() }; });
    var spyClear = sinon.spy();

    var opts = {
      intervalMs: 500,
      syncFn: function () {},
      getIntervalId: function () { return iId; },
      setIntervalId: function (v) { iId = v; },
      setIntervalFn: spySet,
      clearIntervalFn: spyClear
    };

    S4Attach.startPolling(opts);
    var firstHandle = iId;
    S4Attach.startPolling(opts);

    assert.strictEqual(spySet.callCount, 2, "setInterval called twice");
    assert.strictEqual(spyClear.callCount, 1, "previous handle cleared exactly once before re-register");
    assert.strictEqual(spyClear.firstCall.args[0], firstHandle, "clear targets the first handle");
  });
});
