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
   /*  var bUseCombo = !!sDomain && (typeof domainHasValuesFn === "function" ? domainHasValuesFn(sDomain) : false); */
   var bUseCombo = !!sDomain && (
  (typeof domainHasValuesFn === "function" && domainHasValuesFn(sDomain)) ||
  (opts.view && opts.view.getModel("vm") &&
    Array.isArray(opts.view.getModel("vm").getProperty("/domainsByName/" + sDomain)) &&
    opts.view.getModel("vm").getProperty("/domainsByName/" + sDomain).length > 0)
);

    var sValueBind = "{detail>" + sKey + "}";
    var sReadOnlyExpr = "${detail>__readOnly}";
    var sIsEmptyExpr =
      "(${detail>" + sKey + "} === null || ${detail>" + sKey + "} === undefined || ${detail>" + sKey + "} === '' || ${detail>" + sKey + "}.length === 0)";

    var sValueState = (bRequired && !bLocked)
      ? "{= (!" + sReadOnlyExpr + " && " + sIsEmptyExpr + ") ? 'Error' : 'None' }"
      : "None";

    var sValueStateText = (bRequired && !bLocked) ? "Campo obbligatorio" : "";

    var oText = new Text({
      width: "100%",
      text: sValueBind,
      visible: "{= " + sReadOnlyExpr + " }"
    });

    var oEditCtrl;

    if (bUseCombo) {
      if (bMultiple) {
        oEditCtrl = new MultiComboBox({
          forceSelection: false,
          width: "100%",
          visible: "{= !" + sReadOnlyExpr + " }",
          /* enabled: !bLocked, */
          enabled: bLocked ? "{= (" + sNewRowExpr + " === true) }" : true,// locked=B -> abilita solo se riga nuova
          
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
          width: "100%",
          visible: "{= !" + sReadOnlyExpr + " }",
          /* enabled: !bLocked, */
          enabled: bLocked ? "{= (" + sNewRowExpr + " === true) }" : true, // locked=B -> abilita solo se riga nuova
          
          selectedKey: sValueBind,
          valueState: sValueState,
          valueStateText: sValueStateText,
          items: {
            path: "vm>/domainsByName/" + sDomain,
            template: new Item({width: "100%", key: "{vm>key}", text: "{vm>text}" }),
            length: 500
          }
        });


/* if (sKey === "Fibra") {
  var dump = function (phase) {
    var ctxDetail = oEditCtrl.getBindingContext("detail");
    var ctxDefault = oEditCtrl.getBindingContext(); // utile per capire se il context è sul default

    // ✅ Se non ho NESSUN context, è un template/dummy -> skip
    if (!ctxDetail && !ctxDefault) return;

    var row = (ctxDetail && ctxDetail.getObject && ctxDetail.getObject()) ||
              (ctxDefault && ctxDefault.getObject && ctxDefault.getObject()) || null;

    var vm = oEditCtrl.getModel("vm");
    var dom = vm ? (vm.getProperty("/domainsByName/" + sDomain) || []) : [];

    console.log("[DBG Fibra][" + phase + "]", {
      hasVm: !!vm,
      ctxDetail: ctxDetail && ctxDetail.getPath && ctxDetail.getPath(),
      ctxDefault: ctxDefault && ctxDefault.getPath && ctxDefault.getPath(),
      rowVal: row && row.Fibra,
      selectedKey: oEditCtrl.getSelectedKey(),
      itemsLen: oEditCtrl.getItems().length,
      domain: sDomain,
      domainKeys: dom.map(d => d.key)
    });
  };

  oEditCtrl.attachModelContextChange(() => dump("modelContextChange"));
  oEditCtrl.addEventDelegate({ onAfterRendering: () => dump("afterRendering") });
  setTimeout(() => dump("t+0"), 0);
  setTimeout(() => dump("t+300"), 300);
}
 */

      }

      if (sKey === "Fibra" && oEditCtrl instanceof sap.m.ComboBox) {

  // logga quando cambia il contesto riga (quindi hai rowVal vero)
  oEditCtrl.attachModelContextChange(function () {
    var ctx = oEditCtrl.getBindingContext("detail");
    if (!ctx) return;

    // quando arrivano/si aggiornano gli items (dominio)
    var bItems = oEditCtrl.getBinding("items");
    if (bItems && !bItems.__dbgAttached) {
      bItems.__dbgAttached = true;
      bItems.attachChange(function () {
        var row = ctx.getObject();
        var keys = oEditCtrl.getItems().map(i => i.getKey());
        console.log("[DBG FIBRA DOMAIN]", {
          rowFibra: row && row.Fibra,
          selectedKey: oEditCtrl.getSelectedKey(),
          itemsLen: keys.length,
          hasWV: keys.indexOf("WV") >= 0,
          hasAG: keys.indexOf("AG") >= 0,
          sample: keys.slice(0, 30)
        });
      });
    }
  });
}

    } else {
      oEditCtrl = new Input({
        width: "100%",
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

    return new HBox({ width: "100%", items: [oText, oEditCtrl] });
  }

  return { createCellTemplate: createCellTemplate };
});
