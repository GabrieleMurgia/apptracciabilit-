/* global QUnit */
sap.ui.define([
  "apptracciabilita/apptracciabilita/util/cellFullValueUtil"
], function (CellFullValueUtil) {
  "use strict";

  QUnit.module("util/cellFullValueUtil");

  QUnit.test("normalizes null and undefined to empty text", function (assert) {
    assert.strictEqual(CellFullValueUtil.normalizeValue(null), "", "null becomes empty text");
    assert.strictEqual(CellFullValueUtil.normalizeValue(undefined), "", "undefined becomes empty text");
  });

  QUnit.test("normalizes arrays as readable comma-separated text", function (assert) {
    assert.strictEqual(CellFullValueUtil.normalizeValue(["A", "B", "C"]), "A, B, C", "array values are joined");
  });

  QUnit.test("does not show the action for a short string", function (assert) {
    assert.strictEqual(CellFullValueUtil.shouldShowFullValueAction("short value"), false, "short text does not need the action");
  });

  QUnit.test("shows the action for a long string", function (assert) {
    assert.strictEqual(CellFullValueUtil.shouldShowFullValueAction("1234567890123456789012345678901"), true, "text longer than 30 chars needs the action");
  });

  QUnit.test("shows the action for text with newline", function (assert) {
    assert.strictEqual(CellFullValueUtil.shouldShowFullValueAction("first line\nsecond line"), true, "multiline text needs the action");
  });
});
