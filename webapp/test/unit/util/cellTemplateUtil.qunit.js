/* global QUnit */
sap.ui.define([
  "apptracciabilita/apptracciabilita/util/cellTemplateUtil"
], function (CellTemplateUtil) {
  "use strict";

  QUnit.module("util/cellTemplateUtil");

  QUnit.test("adds full-value action without replacing the base text and input controls", function (assert) {
    var oTemplate = CellTemplateUtil.createCellTemplate("NoteValentino", { label: "Note Valentino" }, {});
    var aItems = oTemplate.getItems();

    assert.strictEqual(aItems.length, 3, "the full-value button is additive");
    assert.ok(aItems[0].isA("sap.m.Text"), "read-only Text remains the first item");
    assert.ok(aItems[1].isA("sap.m.Input"), "editable Input remains the second item");
    assert.ok(aItems[2].isA("sap.m.Button"), "full-value action is a Button");
    assert.ok(aItems[1].getBindingInfo("value"), "Input value binding is preserved");
    assert.ok(aItems[2].getBindingInfo("visible"), "Button visibility is data-bound");

    oTemplate.destroy();
  });

  QUnit.test("keeps required value state binding on the base input", function (assert) {
    var oTemplate = CellTemplateUtil.createCellTemplate("RequiredNote", { required: true }, {});
    var oInput = oTemplate.getItems()[1];

    assert.ok(oInput.isA("sap.m.Input"), "base editable control is still Input");
    assert.ok(oInput.getBindingInfo("valueState"), "required valueState binding is preserved");
    assert.strictEqual(oInput.getValueStateText(), "Campo obbligatorio", "required valueStateText is unchanged");

    oTemplate.destroy();
  });
});
