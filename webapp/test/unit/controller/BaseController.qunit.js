/* global QUnit, sinon */
sap.ui.define([
  "apptracciabilita/apptracciabilita/controller/BaseController",
  "apptracciabilita/apptracciabilita/util/filterSortUtil",
  "apptracciabilita/apptracciabilita/util/mdcTableUtil",
  "apptracciabilita/apptracciabilita/util/p13nUtil"
], function (BaseController, FilterSortUtil, MdcTableUtil, P13nUtil) {
  "use strict";

  QUnit.module("controller/BaseController");

  // -------------------------------------------------------
  // _log (commit e0d3047 — fixed silent _log)
  // -------------------------------------------------------

  QUnit.test("_log writes to console.log with prefix and ISO timestamp", function (assert) {
    var spy = sinon.spy(console, "log");
    try {
      var that = { _sLogPrefix: "[T]" };
      BaseController.prototype._log.call(that, "hello", { x: 1 });
      assert.strictEqual(spy.callCount, 1, "console.log called once");
      var args = spy.firstCall.args;
      assert.ok(
        /^\[T\] \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(args[0]),
        "first arg is prefix + ISO timestamp, got: " + args[0]
      );
      assert.strictEqual(args[1], "hello", "second positional arg preserved");
      assert.deepEqual(args[2], { x: 1 }, "third positional arg preserved");
    } finally {
      spy.restore();
    }
  });

  QUnit.test("_log uses subclass _sLogPrefix when called via inherited binding", function (assert) {
    var spy = sinon.spy(console, "log");
    try {
      var Probe = BaseController.extend("test.probe.LogProbe", { _sLogPrefix: "[S99]" });
      var probe = Probe.prototype; // avoid UI5 lifecycle by working on the prototype
      BaseController.prototype._log.call(probe, "x");
      assert.ok(/^\[S99\] /.test(spy.firstCall.args[0]), "uses subclass prefix");
    } finally {
      spy.restore();
    }
  });

  // -------------------------------------------------------
  // Header filter / sort dispatch (commit 7169fd1 — lifted methods)
  // -------------------------------------------------------

  function makeHost(opts) {
    opts = opts || {};
    var oUiModel = opts.uiModel || { __id: "ui" };
    var oTable = opts.table || { __id: "table-mdc" };
    var oInputFilter = opts.inputFilter || { __id: "input-filter" };
    var oDetail = opts.detail || { __id: "detail" };
    return {
      MAIN_TABLE_ID: "mdcTable3",
      MAIN_INPUT_FILTER_ID: "inputFilter3",
      _inlineFS: { filters: {}, sort: { key: "", desc: false } },
      _sLogPrefix: "[T]",
      getView: function () {
        return {
          getModel: function (sName) {
            return sName === "ui" ? oUiModel : (sName === "detail" ? oDetail : null);
          }
        };
      },
      byId: function (sId) {
        if (sId === "mdcTable3") return oTable;
        if (sId === "inputFilter3") return oInputFilter;
        return null;
      },
      _getODetail: function () { return oDetail; },
      _setInnerHeaderHeight: BaseController.prototype._setInnerHeaderHeight,
      _applyInlineHeaderFilterSort: BaseController.prototype._applyInlineHeaderFilterSort,
      _applyClientFilters: function () {},
      _log: function () {},
      __probe: { uiModel: oUiModel, table: oTable, inputFilter: oInputFilter, detail: oDetail }
    };
  }

  QUnit.test("onToggleHeaderFilters resolves byId(MAIN_TABLE_ID) and delegates to FilterSortUtil", function (assert) {
    var host = makeHost();
    var stub = sinon.stub(FilterSortUtil, "toggleHeaderFilters");
    try {
      BaseController.prototype.onToggleHeaderFilters.call(host);
      assert.strictEqual(stub.callCount, 1, "delegated once");
      var args = stub.firstCall.args;
      assert.strictEqual(args[0], host.__probe.uiModel, "ui model from view");
      assert.strictEqual(args[1], host.__probe.table, "table from byId(MAIN_TABLE_ID)");
      assert.strictEqual(typeof args[2], "function", "setInnerHeaderHeight bound function");
      assert.strictEqual(typeof args[3], "function", "applyInlineHeaderFilterSort bound function");
    } finally {
      stub.restore();
    }
  });

  QUnit.test("onToggleHeaderSort delegates to FilterSortUtil with table from MAIN_TABLE_ID", function (assert) {
    var host = makeHost();
    var stub = sinon.stub(FilterSortUtil, "toggleHeaderSort");
    try {
      BaseController.prototype.onToggleHeaderSort.call(host);
      assert.strictEqual(stub.callCount, 1, "delegated once");
      var args = stub.firstCall.args;
      assert.strictEqual(args[0], host.__probe.uiModel, "ui model");
      assert.strictEqual(args[1], host.__probe.table, "table");
      assert.strictEqual(typeof args[2], "function", "applyInlineHeaderFilterSort fn");
    } finally {
      stub.restore();
    }
  });

  QUnit.test("onResetFiltersAndSort wires MAIN_TABLE_ID and MAIN_INPUT_FILTER_ID into the util payload", function (assert) {
    var host = makeHost();
    var stub = sinon.stub(FilterSortUtil, "resetFiltersAndSort");
    try {
      BaseController.prototype.onResetFiltersAndSort.call(host);
      assert.strictEqual(stub.callCount, 1, "delegated once");
      var payload = stub.firstCall.args[0];
      assert.strictEqual(payload.oDetail, host.__probe.detail, "oDetail = view.getModel('detail')");
      assert.strictEqual(payload.inlineFS, host._inlineFS, "inlineFS reference");
      assert.strictEqual(payload.inputFilter, host.__probe.inputFilter, "inputFilter from MAIN_INPUT_FILTER_ID");
      assert.strictEqual(payload.table, host.__probe.table, "table from MAIN_TABLE_ID");
      assert.strictEqual(typeof payload.applyClientFiltersFn, "function", "applyClientFiltersFn provided");
      assert.strictEqual(typeof payload.applyInlineHeaderFilterSortFn, "function", "applyInlineHeaderFilterSortFn provided");
      assert.strictEqual(typeof payload.setInnerHeaderHeightFn, "function", "setInnerHeaderHeightFn provided");
    } finally {
      stub.restore();
    }
  });

  QUnit.test("_setInnerHeaderHeight forwards table + showHeaderFilters flag to MdcTableUtil", function (assert) {
    var oUiModel = { getProperty: function (p) { return p === "/showHeaderFilters" ? true : null; } };
    var oTable = { __id: "tbl" };
    var host = makeHost({ uiModel: oUiModel, table: oTable });
    var stub = sinon.stub(MdcTableUtil, "setInnerHeaderHeight");
    try {
      BaseController.prototype._setInnerHeaderHeight.call(host, oTable);
      assert.strictEqual(stub.callCount, 1, "delegated once");
      assert.strictEqual(stub.firstCall.args[0], oTable, "table forwarded");
      assert.strictEqual(stub.firstCall.args[1], true, "showHeaderFilters flag forwarded");
    } finally {
      stub.restore();
    }
  });

  QUnit.test("_scheduleHeaderFilterSort fires forceP13nAllVisible at +300ms then _applyInlineHeaderFilterSort at +650ms", function (assert) {
    var clock = sinon.useFakeTimers();
    var stubForce = sinon.stub(P13nUtil, "forceP13nAllVisible");
    var spyApply = sinon.spy();
    var host = {
      _log: function () {},
      _sLogPrefix: "[T]",
      _applyInlineHeaderFilterSort: spyApply
    };
    var oTbl = { __id: "scheduled-tbl" };

    try {
      BaseController.prototype._scheduleHeaderFilterSort.call(host, oTbl);

      assert.strictEqual(stubForce.callCount, 0, "no force at t=0");
      assert.strictEqual(spyApply.callCount, 0, "no apply at t=0");

      clock.tick(299);
      assert.strictEqual(stubForce.callCount, 0, "no force at t=299");

      clock.tick(1); // total 300
      assert.strictEqual(stubForce.callCount, 1, "force fires at t=300");
      assert.strictEqual(stubForce.firstCall.args[0], oTbl, "force receives the table");
      assert.strictEqual(spyApply.callCount, 0, "apply still pending at t=300");

      clock.tick(349);
      assert.strictEqual(spyApply.callCount, 0, "apply still pending at t=649");

      clock.tick(1); // total 650
      assert.strictEqual(spyApply.callCount, 1, "apply fires at t=650");
      assert.strictEqual(spyApply.firstCall.args[0], oTbl, "apply receives the table");
    } finally {
      stubForce.restore();
      clock.restore();
    }
  });
});
