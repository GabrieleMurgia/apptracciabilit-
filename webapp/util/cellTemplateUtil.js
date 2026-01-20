sap.ui.define([
  "sap/m/HBox",
  "sap/m/Text",
  "sap/m/Input",
  "sap/m/ComboBox",
  "sap/m/MultiComboBox",
  "sap/ui/core/Item"
], function (HBox, Text, Input, ComboBox, MultiComboBox, Item) {
  "use strict";

  /**
   * Copia della tua _createCellTemplate con 1 estensione: hookDirtyOnEdit opzionale.
   * opts:
   * - domainHasValuesFn(domain)->bool
   * - hookDirtyOnEditFn(ctrl) (opzionale)
   */
  function createCellTemplate(sKey, oMeta, opts) {
    opts = opts || {};
    var domainHasValuesFn = opts.domainHasValuesFn;

    var bRequired = !!(oMeta && oMeta.required);
    var bLocked = !!(oMeta && oMeta.locked);
    var bMultiple = !!(oMeta && oMeta.multiple);

    var sDomain = String((oMeta && oMeta.domain) || "").trim();
    var bUseCombo = !!sDomain && (typeof domainHasValuesFn === "function" ? domainHasValuesFn(sDomain) : false);

    var sValueBind = "{detail>" + sKey + "}";
    var sReadOnlyExpr = "${detail>__readOnly}";
    var sIsEmptyExpr =
      "(${detail>" + sKey + "} === null || ${detail>" + sKey + "} === undefined || ${detail>" + sKey + "} === '' || ${detail>" + sKey + "}.length === 0)";

    var sValueState = (bRequired && !bLocked)
      ? "{= (!" + sReadOnlyExpr + " && " + sIsEmptyExpr + ") ? 'Error' : 'None' }"
      : "None";

    var sValueStateText = (bRequired && !bLocked) ? "Campo obbligatorio" : "";

    var oText = new Text({
      text: sValueBind,
      visible: "{= " + sReadOnlyExpr + " }"
    });

    var oEditCtrl;

    if (bUseCombo) {
      if (bMultiple) {
        oEditCtrl = new MultiComboBox({
          visible: "{= !" + sReadOnlyExpr + " }",
          enabled: !bLocked,
          allowCustomValues: false,
          selectedKeys: sValueBind,
          valueState: sValueState,
          valueStateText: sValueStateText,
          items: {
            path: "vm>/domainsByName/" + sDomain,
            template: new Item({ key: "{vm>key}", text: "{vm>text}" })
          }
        });
      } else {
        oEditCtrl = new ComboBox({
          visible: "{= !" + sReadOnlyExpr + " }",
          enabled: !bLocked,
          allowCustomValues: false,
          selectedKey: sValueBind,
          valueState: sValueState,
          valueStateText: sValueStateText,
          items: {
            path: "vm>/domainsByName/" + sDomain,
            template: new Item({ key: "{vm>key}", text: "{vm>text}" })
          }
        });
      }
    } else {
      oEditCtrl = new Input({
        visible: "{= !" + sReadOnlyExpr + " }",
        editable: !bLocked,
        value: sValueBind,
        valueState: sValueState,
        valueStateText: sValueStateText
      });
    }

    if (typeof opts.hookDirtyOnEditFn === "function") {
      opts.hookDirtyOnEditFn(oEditCtrl);
    }

    return new HBox({ items: [oText, oEditCtrl] });
  }

  return { createCellTemplate: createCellTemplate };
});
