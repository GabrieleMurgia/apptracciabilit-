sap.ui.define([
  "sap/m/HBox",
  "sap/m/Text",
  "sap/m/Input",
  "sap/m/ComboBox",
  "sap/m/MultiComboBox",
  "sap/ui/core/Item",
  "sap/ui/core/ListItem",
  "sap/m/SuggestionItem",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/m/MessageBox"
], function (
  HBox,
  Text,
  Input,
  ComboBox,
  MultiComboBox,
  Item,
  ListItem,
  SuggestionItem,
  Filter,
  FilterOperator,
  MessageBox
) {
  "use strict";

  // =========================
  // HOOK DIRTY ON EDIT (spostato dal controller)
  // =========================
  function hookDirtyOnEdit(oCtrl, hookOpts) {
    // debugger; // <-- lasciarlo attivo blocca l'app; riattivalo solo se ti serve
    hookOpts = hookOpts || {};
    var sModelName = hookOpts.modelName || "detail";
    var oView = hookOpts.view || null;

    var touchCodAggParentFn = hookOpts.touchCodAggParentFn;                 // (row, path) => void
    var clearPostErrorByContextFn = hookOpts.clearPostErrorByContextFn;     // (ctx) => void

    if (!oCtrl) return;

    // ---- anti-doppio-hook (MDC riusa i template)
    try {
      if (oCtrl.data && oCtrl.data("dirtyHooked")) return;
      if (oCtrl.data) oCtrl.data("dirtyHooked", true);
    } catch (e) {}

    // ---- per Input: aggiorna binding anche su liveChange
    try {
      if (oCtrl.isA && oCtrl.isA("sap.m.Input") && oCtrl.setValueLiveUpdate) {
        oCtrl.setValueLiveUpdate(true);
      }
    } catch (e2) {}

    function getCtx(ctrl) {
      return (ctrl && ctrl.getBindingContext && (ctrl.getBindingContext(sModelName) || ctrl.getBindingContext())) || null;
    }

    function getModel(ctx) {
      if (ctx && ctx.getModel) return ctx.getModel();
      return (oView && oView.getModel && oView.getModel(sModelName)) || null;
    }

    function getVmModel() {
      // preferisco view model "vm" (propaga dal component), fallback hookOpts.getVmModelFn
      if (hookOpts.vmModel) return hookOpts.vmModel;
      if (oView && oView.getModel) {
        var m = oView.getModel("vm");
        if (m) return m;
      }
      if (typeof hookOpts.getVmModelFn === "function") {
        try { return hookOpts.getVmModelFn(); } catch (e) {}
      }
      return null;
    }

    function getBindingRelPath(ctrl) {
      if (!ctrl || !ctrl.getBinding) return "";
      var b = ctrl.getBinding("value") || ctrl.getBinding("selectedKey") || ctrl.getBinding("selectedKeys");
      if (!b || !b.getPath) return "";
      return String(b.getPath() || "").trim();
    }

    function readCtrlValue(ctrl) {
      // Input
      if (ctrl && typeof ctrl.getValue === "function" && ctrl.getBinding("value")) {
        return ctrl.getValue();
      }
      // ComboBox
      if (ctrl && typeof ctrl.getSelectedKey === "function" && ctrl.getBinding("selectedKey")) {
        return ctrl.getSelectedKey();
      }
      // MultiComboBox
      if (ctrl && typeof ctrl.getSelectedKeys === "function" && ctrl.getBinding("selectedKeys")) {
        return ctrl.getSelectedKeys();
      }
      return undefined;
    }

    function forceUpdateModelIfNeeded(ctrl) {
      var ctx = getCtx(ctrl);
      if (!ctx) return;

      var oModel = getModel(ctx);
      if (!oModel || !oModel.setProperty) return;

      var rel = getBindingRelPath(ctrl);
      if (!rel) return;

      var v = readCtrlValue(ctrl);
      if (v === undefined) return;

      var basePath = (ctx.getPath && ctx.getPath()) || "";
      var fullPath = rel.charAt(0) === "/" ? rel : (basePath ? (basePath + "/" + rel) : rel);

      try { oModel.setProperty(fullPath, v); } catch (e) {}
    }

    function _normStr(v) { return String(v == null ? "" : v).trim(); }

    function _hasSuggestionsForField(field) {
      try {
        var oVm = getVmModel();
        var aSug = oVm && oVm.getProperty("/suggestionsByField/" + field);
        return Array.isArray(aSug) && aSug.length > 0;
      } catch (e) { return false; }
    }

    function _isValueInSuggestions(field, value) {
      try {
        var v = _normStr(value).toUpperCase();
        if (!v) return true; // vuoto => non blocco
        var oVm = getVmModel();
        var aSug = (oVm && oVm.getProperty("/suggestionsByField/" + field)) || [];
        return (aSug || []).some(function (x) {
          var k = (x && x.key != null) ? x.key : x;
          return _normStr(k).toUpperCase() === v;
        });
      } catch (e) { return true; }
    }

    // debounce per liveChange
    function scheduleDirty(ctrl, oEvt) {
      try {
        if (ctrl.__dirtyTimer) clearTimeout(ctrl.__dirtyTimer);
        ctrl.__dirtyTimer = setTimeout(function () {
          ctrl.__dirtyTimer = null;

          var ctx = getCtx(ctrl);
          if (!ctx) return;

          var row = ctx.getObject && ctx.getObject();
          var sPath = ctx.getPath && ctx.getPath();

          if (row && typeof touchCodAggParentFn === "function") {
            touchCodAggParentFn(row, sPath);
          }
        }, (oEvt && oEvt.getId && oEvt.getId() === "liveChange") ? 150 : 0);
      } catch (e) {}
    }

    // salva old value su focusIn solo se il campo ha suggestions
    try {
      if (typeof oCtrl.attachFocusIn === "function") {
        oCtrl.attachFocusIn(function () {
          var rel = getBindingRelPath(oCtrl);
          if (!rel) return;
          if (_hasSuggestionsForField(rel)) {
            try { oCtrl.data("__oldVal", oCtrl.getValue()); } catch (e) {}
          }
        });
      }
    } catch (e3) {}

    function handler(oEvt) {
      var src = (oEvt && oEvt.getSource && oEvt.getSource()) || oCtrl;
      var evtId = (oEvt && oEvt.getId && oEvt.getId()) || "";

      // evita loop quando ripristino valore via setValue
      try {
        if (src && src.data && src.data("__skipConfirmOnce")) {
          src.data("__skipConfirmOnce", false);
          forceUpdateModelIfNeeded(src);
          if (typeof clearPostErrorByContextFn === "function") clearPostErrorByContextFn(getCtx(src));
          scheduleDirty(src, oEvt);
          return;
        }
      } catch (e0) {}

      forceUpdateModelIfNeeded(src);

      // appena l’utente tocca una cella, tolgo subito “KO” dalla riga
      if (typeof clearPostErrorByContextFn === "function") {
        clearPostErrorByContextFn(getCtx(src));
      }

      // confirm se valore non è tra suggeriti (solo Input) su change/submit
      var rel = getBindingRelPath(src);
      var isInput = (src && src.isA && src.isA("sap.m.Input") && typeof src.getValue === "function" && src.getBinding("value"));

      
      if(_hasSuggestionsForField(rel) && evtId === "change"){
        let otherV = isInput.getModel().getData().Records.map(i => i[rel])
        let cValue = src.getValue()
        if(otherV.filter(i => i === cValue).length > 1){
            MessageBox.confirm(
            "Il valore \"" + cValue + "\" è già presente nei valori \"" + rel + "\".\n",
            {
              actions: [MessageBox.Action.OK],
              emphasizedAction: MessageBox.Action.OK,
              onClose: function (action) {
                if (action === MessageBox.Action.OK) {
                  try { src.data("__oldVal", newVal); } catch (e) {}
                  src.setValue('')
                }
              }
            }
          );
          return; 
        }
      }

      if (rel && isInput && (evtId === "change" /* || evtId === "submit" <- CREA DOPPIO CONFIRM */) && _hasSuggestionsForField(rel)) {
        var newVal = _normStr(src.getValue());
        if (newVal && !_isValueInSuggestions(rel, newVal)) {
          var oldVal = _normStr(src.data("__oldVal"));

          MessageBox.confirm(
            "Il valore \"" + newVal + "\" non è presente nei valori previsti per \"" + rel + "\".\nVuoi inserirlo comunque?",
            {
              actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
              emphasizedAction: MessageBox.Action.OK,
              onClose: function (action) {
                if (action === MessageBox.Action.OK) {
                  try { src.data("__oldVal", newVal); } catch (e) {}
                  scheduleDirty(src, oEvt);
                } else {
                  try {
                    if (src.data) src.data("__skipConfirmOnce", true);
                    src.setValue(oldVal);
                  } catch (e2) {}
                  forceUpdateModelIfNeeded(src);
                }
              }
            }
          );
          return; // dirty solo dopo OK
        }
      }

      scheduleDirty(src, oEvt);
    }

    // attach eventi (best-effort)
    if (typeof oCtrl.attachLiveChange === "function") oCtrl.attachLiveChange(handler);
    if (typeof oCtrl.attachChange === "function") oCtrl.attachChange(handler);
    if (typeof oCtrl.attachSelectionChange === "function") oCtrl.attachSelectionChange(handler);
    if (typeof oCtrl.attachSelectionFinish === "function") oCtrl.attachSelectionFinish(handler);
    if (typeof oCtrl.attachSubmit === "function") oCtrl.attachSubmit(handler);
    if (typeof oCtrl.attachTokenUpdate === "function") oCtrl.attachTokenUpdate(handler);
  }

  // =========================
  // CREATE CELL TEMPLATE
  // =========================
  function createCellTemplate(sKey, oMeta, opts) {
    opts = opts || {};
    var domainHasValuesFn = opts.domainHasValuesFn;

    var bRequired = !!(oMeta && oMeta.required);
    var bLocked = !!(oMeta && oMeta.locked);
    var bMultiple = !!(oMeta && oMeta.multiple);

    var sDomain = String((oMeta && oMeta.domain) || "").trim();

    var sValueBind = "{detail>" + sKey + "}";
    var sReadOnlyExpr = "${detail>__readOnly}";
    var sIsEmptyExpr =
      "(${detail>" + sKey + "} === null || ${detail>" + sKey + "} === undefined || ${detail>" + sKey + "} === '' || ${detail>" + sKey + "}.length === 0)";

    var sValueState = (bRequired && !bLocked)
      ? "{= (!" + sReadOnlyExpr + " && " + sIsEmptyExpr + ") ? 'Error' : 'None' }"
      : "None";

    var sValueStateText = (bRequired && !bLocked) ? "Campo obbligatorio" : "";

    // suggestions (Input)
    var sSugPath = "vm>/suggestionsByField/" + sKey;

    var bHasSuggestions = false;
    try {
      var oVm = opts.view && opts.view.getModel && opts.view.getModel("vm");
      var aSug = oVm && oVm.getProperty("/suggestionsByField/" + sKey);
      bHasSuggestions = Array.isArray(aSug) && aSug.length > 0;
    } catch (e) {}

    var bUseCombo = !!sDomain && (
      (typeof domainHasValuesFn === "function" && domainHasValuesFn(sDomain)) ||
      (opts.view && opts.view.getModel && opts.view.getModel("vm") &&
        Array.isArray(opts.view.getModel("vm").getProperty("/domainsByName/" + sDomain)) &&
        opts.view.getModel("vm").getProperty("/domainsByName/" + sDomain).length > 0)
    );

    var oText = new Text({
      width: "100%",
      text: sValueBind,
      visible: "{= " + sReadOnlyExpr + " }"
    });

    var oEditCtrl;

    if (bUseCombo) {
      if (bMultiple) {
        oEditCtrl = new MultiComboBox({
          width: "100%",
          visible: "{= !" + sReadOnlyExpr + " }",
          enabled: !bLocked,

          selectedKeys: sValueBind,

          valueState: sValueState,
          valueStateText: sValueStateText,
          showValueStateMessage: true,
          showSecondaryValues: true,

          items: {
            path: "vm>/domainsByName/" + sDomain,
            templateShareable: false,
            template: new ListItem({
              key: "{vm>key}",
              text: "{vm>key}",
              additionalText: "{vm>text}",
            }),
            length: 1000
          }
        });
      } else {
        oEditCtrl = new ComboBox({
          visible: "{= !" + sReadOnlyExpr + " }",
          enabled: !bLocked,

          selectedKey: sValueBind,
          valueState: sValueState,
          valueStateText: sValueStateText,

          items: {
            path: "vm>/domainsByName/" + sDomain,
            templateShareable: false,
            template: new Item({
              key: "{vm>key}",
              text: "{vm>text}"
            }),
            length: 1000
          }
        });
      }
    } else {
      // Input con suggestions (se presenti) oppure semplice
      if (bHasSuggestions) {
        oEditCtrl = new Input({
          visible: "{= !" + sReadOnlyExpr + " }",
          editable: !bLocked,
          value: sValueBind,

          valueState: sValueState,
          valueStateText: sValueStateText,

          showSuggestion: true,
          autocomplete: true,
          startSuggestion: 0,

          suggestionItems: {
            path: sSugPath,
            templateShareable: false,
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
        oEditCtrl = new Input({
          visible: "{= !" + sReadOnlyExpr + " }",
          editable: !bLocked,
          value: sValueBind,
          valueState: sValueState,
          valueStateText: sValueStateText
        });
      }
    }

    // Hook dirty: se il controller passa la fn, uso quella. Altrimenti posso usare quella del util.
    if (typeof opts.hookDirtyOnEditFn === "function") {
      opts.hookDirtyOnEditFn(oEditCtrl);
    } else if (opts.view && typeof opts.touchCodAggParentFn === "function") {
      hookDirtyOnEdit(oEditCtrl, opts);
    }

    return new HBox({ items: [oText, oEditCtrl] });
  }

  return {
    createCellTemplate: createCellTemplate,
    hookDirtyOnEdit: hookDirtyOnEdit
  };
});
