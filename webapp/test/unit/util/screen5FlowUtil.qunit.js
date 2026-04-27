/* global QUnit, sinon */
sap.ui.define([
  "sap/ui/model/json/JSONModel",
  "apptracciabilita/apptracciabilita/util/screen5FlowUtil",
  "apptracciabilita/apptracciabilita/util/dataLoaderUtil"
], function (JSONModel, Screen5FlowUtil, DataLoaderUtil) {
  "use strict";

  QUnit.module("util/screen5FlowUtil");

  QUnit.test("buildSummaryCfg keeps only summary fields, deduplicates ui keys and prepends Stato", function (assert) {
    var aCfg = Screen5FlowUtil.buildSummaryCfg([
      { UiFieldname: "CampoB", UiFieldLabel: "Campo B", InSummary: "X", SummarySort: "2" },
      { UiFieldname: "CampoA", UiFieldLabel: "Campo A", InSummary: "X", SummarySort: "1" },
      { UiFieldname: "CampoA", UiFieldLabel: "Campo A dup", InSummary: "X", SummarySort: "3" },
      { UiFieldname: "Hidden", UiFieldLabel: "Hidden", InSummary: "" }
    ]);

    assert.strictEqual(aCfg[0].ui, "Stato", "Stato injected first");
    assert.strictEqual(aCfg[1].ui, "CampoA", "SummarySort ascending respected");
    assert.strictEqual(aCfg[2].ui, "CampoB", "second summary field kept");
    assert.strictEqual(aCfg.length, 3, "non-summary and duplicate fields removed");
  });

  QUnit.test("resolveReadOnlyRows maps domain keys to texts and marks rows as read only", function (assert) {
    var oVm = new JSONModel({
      domainsByKey: {
        COLOR: { BLU: "Blu", RED: "Rosso" }
      }
    });
    var oDetail = new JSONModel({
      _mmct: {
        s01: [{ ui: "Colore", domain: "COLOR" }],
        s02: [{ ui: "ColoreMulti", domain: "COLOR" }]
      }
    });
    var aRows = [{
      Colore: "BLU",
      ColoreMulti: "BLU;RED;BLU"
    }];

    Screen5FlowUtil.resolveReadOnlyRows(aRows, oDetail, oVm);

    assert.strictEqual(aRows[0].__readOnly, true, "row marked read only");
    assert.strictEqual(aRows[0].Colore, "Blu", "single domain value resolved");
    assert.strictEqual(aRows[0].ColoreMulti, "Blu; Rosso", "multi domain values resolved and deduplicated");
  });

  QUnit.test("buildExportColumns maps Stato to StatoText and keeps summary labels", function (assert) {
    var aCols = Screen5FlowUtil.buildExportColumns([
      { UiFieldname: "CampoA", UiFieldLabel: "Campo A", InSummary: "X", SummarySort: "1" }
    ]);

    assert.strictEqual(aCols[0].property, "StatoText", "Stato export column uses derived text property");
    assert.strictEqual(aCols[1].label, "Campo A", "summary label preserved");
    assert.strictEqual(aCols[1].property, "CampoA", "summary property preserved");
  });

  QUnit.test("onDataLoaded hydrates mmct, resets filter state and binds the table once", function (assert) {
    var stubHydrate = sinon.stub(DataLoaderUtil, "hydrateMmctFromRows").returns({ cat: "CAT1", s01: [], s02: [] });
    try {
      var oDetail = new JSONModel({
        _mmct: { s01: [], s02: [] }
      });
      var oVm = new JSONModel({});
      var oInput = { setValue: sinon.spy() };
      var iReset = 0;
      var aBound = [];

      Screen5FlowUtil.onDataLoaded({
        rows: [{ Stato: "ST", Campo: "X" }],
        cat: "CAT1",
        detailModel: oDetail,
        vmModel: oVm,
        inputFilter: oInput,
        logFn: function () {},
        resetInlineFsFn: function () { iReset++; },
        bindTableFn: function (aRows) { aBound.push(aRows); }
      });

      assert.strictEqual(stubHydrate.callCount, 1, "MMCT hydration invoked once");
      assert.strictEqual(oDetail.getProperty("/_mmct/cat"), "CAT1", "selected category stored");
      assert.strictEqual(oDetail.getProperty("/RowsAll").length, 1, "RowsAll populated");
      assert.strictEqual(oDetail.getProperty("/RowsCount"), 1, "row count updated");
      assert.strictEqual(oDetail.getProperty("/__loaded"), true, "loaded flag set");
      assert.strictEqual(oDetail.getProperty("/__q"), "", "global filter reset");
      assert.strictEqual(oDetail.getProperty("/__statusFilter"), "", "status filter reset");
      assert.strictEqual(iReset, 1, "inline filters reset once");
      assert.strictEqual(oInput.setValue.callCount, 1, "input cleared");
      assert.strictEqual(aBound.length, 1, "table binding triggered once");
      assert.strictEqual(aBound[0][0].__readOnly, true, "rows normalized before bind");
    } finally {
      stubHydrate.restore();
    }
  });
});
