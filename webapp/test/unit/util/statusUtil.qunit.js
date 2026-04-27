/* global QUnit */
sap.ui.define([
  "apptracciabilita/apptracciabilita/util/statusUtil"
], function (StatusUtil) {
  "use strict";

  QUnit.module("util/statusUtil");

  QUnit.test("merges and ranks statuses deterministically", function (assert) {
    assert.strictEqual(StatusUtil.rankStato("ST"), 1, "ST is the baseline rank");
    assert.strictEqual(StatusUtil.rankStato("RJ"), 2, "RJ outranks ST");
    assert.strictEqual(StatusUtil.rankStato("CH"), 3, "CH outranks RJ");
    assert.strictEqual(StatusUtil.rankStato("AP"), 4, "AP is the highest rank");

    assert.strictEqual(StatusUtil.mergeStatus("ST", "RJ"), "RJ", "higher status wins");
    assert.strictEqual(StatusUtil.mergeStatus("CH", "AP"), "AP", "approval wins over change");
    assert.strictEqual(StatusUtil.mergeStatus("AP", "ST"), "AP", "existing higher status is preserved");
  });

  QUnit.test("enforces edit and action permissions by role and status", function (assert) {
    assert.strictEqual(StatusUtil.canEdit("E", "ST"), true, "editor can edit non-approved rows");
    assert.strictEqual(StatusUtil.canEdit("S", "CH"), true, "superuser can edit changed rows");
    assert.strictEqual(StatusUtil.canEdit("E", "AP"), false, "approved rows are never editable");
    assert.strictEqual(StatusUtil.canEdit("X", "ST"), false, "unknown roles cannot edit");

    assert.strictEqual(StatusUtil.canApprove("I", "ST"), true, "internal role can approve pending rows");
    assert.strictEqual(StatusUtil.canApprove("S", "CH"), true, "superuser can approve changed rows");
    assert.strictEqual(StatusUtil.canApprove("E", "ST"), false, "editor cannot approve");
    assert.strictEqual(StatusUtil.canReject("I", "ST"), true, "internal role can reject pending rows");
    assert.strictEqual(StatusUtil.canReject("I", "AP"), false, "approved rows cannot be rejected");

    assert.strictEqual(StatusUtil.canAddRow("E", "ST"), true, "editor can add rows before approval");
    assert.strictEqual(StatusUtil.canAddRow("E", "AP"), false, "editor cannot add rows after approval");
    assert.strictEqual(StatusUtil.canAddRow("S", "AP"), true, "superuser can always add rows, even on approved groups");
    assert.strictEqual(StatusUtil.canAddRow("S", "ST"), true, "superuser can add rows on open groups");
    assert.strictEqual(StatusUtil.canAddRow("I", "ST"), false, "internal role does not gain add-row permission");
  });

  QUnit.test("normalizes row status using explicit fields and legacy flags", function (assert) {
    assert.strictEqual(StatusUtil.normStatoRow({ Stato: "ch" }), "CH", "explicit status is normalized first");
    assert.strictEqual(StatusUtil.normStatoRow({ Approved: 1 }), "AP", "approved legacy flag maps to AP");
    assert.strictEqual(StatusUtil.normStatoRow({ Rejected: 1 }), "RJ", "rejected legacy flag maps to RJ");
    assert.strictEqual(StatusUtil.normStatoRow({ ToApprove: 1 }), "ST", "pending legacy flag maps to ST");
    assert.strictEqual(StatusUtil.normStatoRow({}), "ST", "default status is ST");
  });
});
