/**
 * dirtyHookUtil.js — Hook per marcare righe come "dirty" on edit.
 *
 * Estratto da cellTemplateUtil.js per ridurne la dimensione.
 * Gestisce: debounce dirty, force model update, confirm su valori non in
 * suggestions, uniqueness check per vendor batch.
 */
sap.ui.define([
  "sap/m/MessageBox",
  "apptracciabilita/apptracciabilita/util/i18nUtil"
], function (MessageBox, I18n) {
  "use strict";

  function hookDirtyOnEdit(oCtrl, hookOpts) {
    hookOpts = hookOpts || {};
    var sModelName = hookOpts.modelName || "detail";
    var oView = hookOpts.view || null;

    var touchCodAggParentFn = hookOpts.touchCodAggParentFn;
    var clearPostErrorByContextFn = hookOpts.clearPostErrorByContextFn;

    if (!oCtrl) return;

    try {
      if (oCtrl.data && oCtrl.data("dirtyHooked")) return;
      if (oCtrl.data) oCtrl.data("dirtyHooked", true);
    } catch (e) { console.debug("[dirtyHookUtil] suppressed error", e); }

    try {
      if (oCtrl.isA && oCtrl.isA("sap.m.Input") && oCtrl.setValueLiveUpdate) {
        oCtrl.setValueLiveUpdate(true);
      }
    } catch (e2) { console.debug("[dirtyHookUtil] suppressed error", e2); }

    function getCtx(ctrl) {
      return (ctrl && ctrl.getBindingContext && (ctrl.getBindingContext(sModelName) || ctrl.getBindingContext())) || null;
    }

    function getModel(ctx) {
      if (ctx && ctx.getModel) return ctx.getModel();
      return (oView && oView.getModel && oView.getModel(sModelName)) || null;
    }

    function getVmModel() {
      if (hookOpts.vmModel) return hookOpts.vmModel;
      if (oView && oView.getModel) {
        var m = oView.getModel("vm");
        if (m) return m;
      }
      if (typeof hookOpts.getVmModelFn === "function") {
        try { return hookOpts.getVmModelFn(); } catch (e) { console.debug("[dirtyHookUtil] suppressed error", e); }
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
      if (ctrl && typeof ctrl.getSelectedKey === "function" && ctrl.getBinding("selectedKey")) {
        var sk = ctrl.getSelectedKey();
        if (sk !== undefined && sk !== null && sk !== "") return sk;
      }
      if (ctrl && typeof ctrl.getSelectedKeys === "function" && ctrl.getBinding("selectedKeys")) {
        return ctrl.getSelectedKeys();
      }
      if (ctrl && typeof ctrl.getValue === "function" && ctrl.getBinding("value")) {
        return ctrl.getValue();
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

      try { oModel.setProperty(fullPath, v); } catch (e) { console.debug("[dirtyHookUtil] suppressed error", e); }
    }

    function _normStr(v) { return String(v == null ? "" : v).trim(); }

    function _hasSuggestionsForField(field) {
      try {
        var oVm = getVmModel();
        var aSug = oVm && oVm.getProperty("/suggestionsByField/" + field);
        return Array.isArray(aSug) && aSug.length > 0;
      } catch (e) {
        console.debug("[dirtyHookUtil] suppressed error", e);
        return false;
      }
    }

    function _isValueInSuggestions(field, value) {
      try {
        var v = _normStr(value).toUpperCase();
        if (!v) return true;
        var oVm = getVmModel();
        var aSug = (oVm && oVm.getProperty("/suggestionsByField/" + field)) || [];
        return (aSug || []).some(function (x) {
          var k = (x && x.key != null) ? x.key : x;
          return _normStr(k).toUpperCase() === v;
        });
      } catch (e) {
        console.debug("[dirtyHookUtil] suppressed error", e);
        return true;
      }
    }

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
      } catch (e) { console.debug("[dirtyHookUtil] suppressed error", e); }
    }

    try {
      if (typeof oCtrl.attachFocusIn === "function") {
        oCtrl.attachFocusIn(function () {
          var rel = getBindingRelPath(oCtrl);
          if (!rel) return;
          if (_hasSuggestionsForField(rel)) {
            try { oCtrl.data("__oldVal", oCtrl.getValue()); } catch (e) { console.debug("[dirtyHookUtil] suppressed error", e); }
          }
        });
      }
    } catch (e3) { console.debug("[dirtyHookUtil] suppressed error", e3); }

    function handler(oEvt) {
      var src = (oEvt && oEvt.getSource && oEvt.getSource()) || oCtrl;
      var evtId = (oEvt && oEvt.getId && oEvt.getId()) || "";

      try {
        if (src && src.data && src.data("__skipConfirmOnce")) {
          src.data("__skipConfirmOnce", false);
          forceUpdateModelIfNeeded(src);
          if (typeof clearPostErrorByContextFn === "function") clearPostErrorByContextFn(getCtx(src));
          scheduleDirty(src, oEvt);
          return;
        }
      } catch (e0) { console.debug("[dirtyHookUtil] suppressed error", e0); }

      forceUpdateModelIfNeeded(src);

      if (typeof clearPostErrorByContextFn === "function") {
        clearPostErrorByContextFn(getCtx(src));
      }

      var rel = getBindingRelPath(src);
      var isInput = (src && src.isA && src.isA("sap.m.Input") && typeof src.getValue === "function" && src.getBinding("value"));

      if (rel && isInput && (evtId === "change") && _hasSuggestionsForField(rel)) {
        var newVal = _normStr(src.getValue());

        if (newVal) {
          var bDuplicate = false;
          try {
            var ctx = getCtx(src);
            var sMyPath = ctx && ctx.getPath && ctx.getPath();
            var oModel = ctx && getModel(ctx);
            if (oModel) {
              var aAllRecs = oModel.getProperty("/RecordsAll") || [];
              var sUpper = newVal.toUpperCase();
              bDuplicate = aAllRecs.some(function (r) {
                if (!r) return false;
                var rv = _normStr(r[rel]).toUpperCase();
                if (rv !== sUpper) return false;
                var rIdx = String(r.idx != null ? r.idx : "");
                var myIdx = sMyPath ? (sMyPath.match(/\/(\d+)\s*$/) || [])[1] : null;
                if (myIdx != null && rIdx === myIdx) return false;
                var row = ctx.getObject && ctx.getObject();
                if (row && r.guidKey && row.guidKey && r.guidKey === row.guidKey) return false;
                return true;
              });
            }
          } catch (eUniq) { console.debug("[dirtyHookUtil] suppressed error", eUniq); }

          if (bDuplicate) {
            var oldValDup = _normStr(src.data("__oldVal"));
            MessageBox.error(
              I18n.text(null, "msg.vendorBatchAlreadyPresent", [newVal], "Il Vendor Batch \"{0}\" è già presente in un altro record.\nInserisci un valore univoco.")
            );
            try {
              if (src.data) src.data("__skipConfirmOnce", true);
              src.setValue(oldValDup);
            } catch (e2) { console.debug("[dirtyHookUtil] suppressed error", e2); }
            forceUpdateModelIfNeeded(src);
            return;
          }
        }

        if (newVal && !_isValueInSuggestions(rel, newVal)) {
          var oldVal = _normStr(src.data("__oldVal"));

          MessageBox.confirm(
            I18n.text(null, "msg.valueNotInExpectedList", [newVal, rel], "Il valore \"{0}\" non è presente nei valori previsti per \"{1}\".\nVuoi inserirlo comunque?"),
            {
              actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
              emphasizedAction: MessageBox.Action.OK,
              onClose: function (action) {
                if (action === MessageBox.Action.OK) {
                  try { src.data("__oldVal", newVal); } catch (e) { console.debug("[dirtyHookUtil] suppressed error", e); }
                  scheduleDirty(src, oEvt);
                } else {
                  try {
                    if (src.data) src.data("__skipConfirmOnce", true);
                    src.setValue(oldVal);
                  } catch (e2) { console.debug("[dirtyHookUtil] suppressed error", e2); }
                  forceUpdateModelIfNeeded(src);
                }
              }
            }
          );
          return;
        }
      }

      scheduleDirty(src, oEvt);
    }

    if (typeof oCtrl.attachLiveChange === "function") oCtrl.attachLiveChange(handler);
    if (typeof oCtrl.attachChange === "function") oCtrl.attachChange(handler);
    if (typeof oCtrl.attachSelectionChange === "function") oCtrl.attachSelectionChange(handler);
    if (typeof oCtrl.attachSelectionFinish === "function") oCtrl.attachSelectionFinish(handler);
    if (typeof oCtrl.attachSubmit === "function") oCtrl.attachSubmit(handler);
    if (typeof oCtrl.attachTokenUpdate === "function") oCtrl.attachTokenUpdate(handler);
  }

  return {
    hookDirtyOnEdit: hookDirtyOnEdit
  };
});
