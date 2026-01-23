sap.ui.define([
  "sap/m/HBox",
  "sap/m/Text",
  "sap/m/Input",
  "sap/m/ComboBox",
  "sap/m/MultiComboBox",
  "sap/ui/core/Item"
], function (HBox, Text, Input, ComboBox, MultiComboBox, Item) {
  "use strict";

  function createCellTemplate(sKey, oMeta, opts) {
    opts = opts || {};
    var domainHasValuesFn = opts.domainHasValuesFn;

    var bRequired = !!(oMeta && oMeta.required);
    var bLocked = !!(oMeta && oMeta.locked);
    var sNewRowExpr = "${detail>__isNew}"; 
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
          /* enabled: !bLocked, */
          enabled: bLocked ? "{= (" + sNewRowExpr + " === true) }" : true,// locked=B -> abilita solo se riga nuova
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
          /* enabled: !bLocked, */
          enabled: bLocked ? "{= (" + sNewRowExpr + " === true) }" : true, // locked=B -> abilita solo se riga nuova
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
        /* editable: !bLocked, */
        editable: bLocked ? "{= (" + sNewRowExpr + " === true) }" : true, // locked=B -> editabile solo se riga nuova
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
