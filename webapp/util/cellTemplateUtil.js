sap.ui.define([
  "sap/m/HBox",
  "sap/m/Text",
  "sap/m/Input",
  "sap/m/ComboBox",
  "sap/m/MultiComboBox",
  "sap/ui/core/Item",
  "sap/m/SuggestionItem",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator"
], function (HBox, Text, Input, ComboBox, MultiComboBox, Item, SuggestionItem, Filter, FilterOperator) {
  "use strict";

  function createCellTemplate(sKey, oMeta, opts) {
    opts = opts || {};
    var domainHasValuesFn = opts.domainHasValuesFn;

    var bRequired = !!(oMeta && oMeta.required);
    var bLocked = !!(oMeta && oMeta.locked);
    var sNewRowExpr = "${detail>__isNew}"; 
    
    var bMultiple = !!(oMeta && oMeta.multiple);
    


    var sSugPath = "vm>/suggestionsByField/" + sKey; // es: vm>/suggestionsByField/PartitaFornitore
var bHasSuggestions = false;
try {
  var oVm = opts.view && opts.view.getModel && opts.view.getModel("vm");
  var aSug = oVm && oVm.getProperty("/suggestionsByField/" + sKey);
  bHasSuggestions = Array.isArray(aSug) && aSug.length > 0;
} catch (e) {}

    var sDomain = String((oMeta && oMeta.domain) || "").trim();
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
oEditCtrl = new sap.m.MultiComboBox({
  width: "100%",
  visible: "{= !" + sReadOnlyExpr + " }",
  /* enabled: bLocked ? "{= (" + sNewRowExpr + " === true) }" : true, */
  enabled: !bLocked,

  selectedKeys: sValueBind,

  valueState: sValueState,
  valueStateText: sValueStateText,
  showValueStateMessage: true, 
  showSecondaryValues:true,

  items: {
    path: "vm>/domainsByName/" + sDomain,
    template: new sap.ui.core.ListItem({
      key: "{vm>key}",
      text: "{vm>key}",
      additionalText: "{vm>text}"
    })
  }
});

      } else {
        oEditCtrl = new ComboBox({
          /* width: "100%", */
          visible: "{= !" + sReadOnlyExpr + " }",
          enabled: !bLocked,
          /* enabled: bLocked ? "{= (" + sNewRowExpr + " === true) }" : true, */ // locked=B -> abilita solo se riga nuova
          
          selectedKey: sValueBind,
          valueState: sValueState,
          valueStateText: sValueStateText,
          items: {
            path: "vm>/domainsByName/" + sDomain,
            template: new Item({
              /* width: "100%", */ 
              key: "{vm>key}", 
              text: "{vm>text}"  
            }),
            length: 500
          }
        });


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
  // se ho suggestions per questo campo -> Input con showSuggestion
  if (bHasSuggestions) {
    oEditCtrl = new Input({
      visible: "{= !" + sReadOnlyExpr + " }",
      /* editable: bLocked ? "{= (" + sNewRowExpr + " === true) }" : true, */
      editable: !bLocked,
      value: sValueBind,
       showSuggestion: true,
  autocomplete: true,  
  startSuggestion: 0,
      valueState: sValueState,
      valueStateText: sValueStateText,

      showSuggestion: true,
      startSuggestion: 0,

      suggestionItems: {
        path: sSugPath,
        template: new SuggestionItem({ text: "{vm>key}" })
      },

      suggest: function (oEvt) {
        var sVal = String(oEvt.getParameter("suggestValue") || "").trim();
        var oB = oEvt.getSource().getBinding("suggestionItems");
        if (!oB) return;

        var aF = [];
        if (sVal) aF.push(new Filter("key", FilterOperator.Contains, sVal));
        oB.filter(aF);
      }
    });

  } else {
    // default: Input normale
    oEditCtrl = new Input({
      visible: "{= !" + sReadOnlyExpr + " }",
      /* editable: bLocked ? "{= (" + sNewRowExpr + " === true) }" : true, */
      editable: !bLocked,
      value: sValueBind,
      valueState: sValueState,
      valueStateText: sValueStateText
    });
  }
}


    if (typeof opts.hookDirtyOnEditFn === "function") {
      opts.hookDirtyOnEditFn(oEditCtrl);
    }

    return new HBox({ /* width: "100%", */ items: [oText, oEditCtrl] });
  }

  return { createCellTemplate: createCellTemplate };
});
