/**
 * cellTemplateUtil.js — createCellTemplate + formatter per celle MDC.
 *
 * Split:
 *   - dirtyHookUtil.js         → hookDirtyOnEdit
 *   - attachmentCellTemplate.js → attachment / download cell templates
 */
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
  "apptracciabilita/apptracciabilita/util/dirtyHookUtil",
  "apptracciabilita/apptracciabilita/util/attachmentCellTemplate"
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
  DirtyHookUtil,
  AttachmentCellTemplate
) {
  "use strict";

  var hookDirtyOnEdit = DirtyHookUtil.hookDirtyOnEdit;

  // =========================
  // DATE FORMATTER (DD/MM/YYYY)
  // =========================
  function _formatCellValue(v) {
    if (v instanceof Date && !isNaN(v.getTime())) {
      var dd = String(v.getDate()).padStart(2, "0");
      var mm = String(v.getMonth() + 1).padStart(2, "0");
      var yyyy = v.getFullYear();
      return dd + "/" + mm + "/" + yyyy;
    }
    if (v == null) return "";
    return String(v);
  }

  function _formatDecimalValue(v) {
    if (v == null || v === "") return "";
    var n = parseFloat(String(v).replace(",", "."));
    if (isNaN(n)) return String(v);
    var oFormat = sap.ui.core.format.NumberFormat.getFloatInstance({
      minFractionDigits: 2,
      maxFractionDigits: 2
    });
    return oFormat.format(n);
  }

  var DecimalDisplayType = sap.ui.model.SimpleType.extend("DecimalDisplay", {
    formatValue: function (v) {
      if (v == null || v === "") return "";
      return String(v).replace(".", ",");
    },
    parseValue: function (v) {
      if (v == null || v === "") return "";
      return String(v).replace(",", ".");
    },
    validateValue: function () {}
  });

  // =========================
  // CREATE CELL TEMPLATE
  // =========================
  function createCellTemplate(sKey, oMeta, opts) {
    opts = opts || {};
    var domainHasValuesFn = opts.domainHasValuesFn;

    if (oMeta && oMeta.attachment) {
      return AttachmentCellTemplate.createAttachmentCellTemplate(sKey, oMeta, opts);
    }

    if (oMeta && oMeta.download) {
      return AttachmentCellTemplate.createDownloadCellTemplate(sKey, oMeta, opts);
    }

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
    var bNumeric = !!(oMeta && oMeta.numeric);
    var oText;
    if (bUseCombo && sDomain) {
      var _sDomCapture = sDomain;
      var _bMultiCapture = bMultiple;
      var _oViewCapture = opts.view || null;
      oText = new Text({
        width: "100%",
        text: {
          path: "detail>" + sKey,
          formatter: function (v) {
            if (v == null || v === "") return "";
            try {
              var oVmL = _oViewCapture && _oViewCapture.getModel && _oViewCapture.getModel("vm");
              var aDom = (oVmL && oVmL.getProperty("/domainsByName/" + _sDomCapture)) || [];
              if (_bMultiCapture) {
                var arr = Array.isArray(v) ? v : String(v).split(/[;|]+/);
                var mL = {};
                aDom.forEach(function (d) { mL[String(d.key)] = d.text || d.key; });
                return arr.map(function (k) { var s = String(k).trim(); return mL[s] || s; }).filter(Boolean).join(", ");
              } else {
                for (var i = 0; i < aDom.length; i++) {
                  if (String(aDom[i].key) === String(v)) {
                    return aDom[i].text || v;
                  }
                }
              }
            } catch (e) {}
            return _formatCellValue(v);
          }
        },
        visible: "{= " + sReadOnlyExpr + " }"
      });
    } else {
      oText = new Text({
        width: "100%",
        text: { path: "detail>" + sKey, formatter: bNumeric ? _formatDecimalValue : _formatCellValue },
        visible: "{= " + sReadOnlyExpr + " }"
      });
    }

    var oEditCtrl;

    if (bUseCombo) {
      if (bMultiple) {
        oEditCtrl = new MultiComboBox({
          width: "100%",
          visible: "{= !" + sReadOnlyExpr + " }",
          enabled: !bLocked,

          selectedKeys: {
            path: "detail>" + sKey,
            mode: "OneWay"
          },

          valueState: sValueState,
          valueStateText: sValueStateText,
          showValueStateMessage: true,
          showSecondaryValues: true,

          selectionChange: function (oEvt) {
            var oMcb = oEvt.getSource();
            setTimeout(function () { oMcb.setValue(""); }, 0);
          },

          items: {
            path: "vm>/domainsByName/" + sDomain,
            templateShareable: false,
            template: new ListItem({
              key: "{vm>key}",
              text: "{vm>key}",
              additionalText: "{vm>text}"
            }),
            length: 1000
          }
        });

        (function (fieldKey) {
          oEditCtrl.attachSelectionFinish(function (oEvt) {
            var oSrc = oEvt.getSource();
            var aKeys = (oSrc.getSelectedKeys && oSrc.getSelectedKeys()) || [];
            var oCtx = oSrc.getBindingContext("detail");
            if (oCtx && oCtx.getPath) {
              var oModel = oCtx.getModel();
              if (oModel && oModel.setProperty) {
                oModel.setProperty(oCtx.getPath() + "/" + fieldKey, aKeys.slice());
              }
            }
          });
        })(sKey);
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
          value: bNumeric ? { path: "detail>" + sKey, type: new DecimalDisplayType() } : sValueBind,
          valueState: sValueState,
          valueStateText: sValueStateText
        });
      }
    }

    if (typeof opts.hookDirtyOnEditFn === "function") {
      opts.hookDirtyOnEditFn(oEditCtrl);
    } else if (opts.view && typeof opts.touchCodAggParentFn === "function") {
      hookDirtyOnEdit(oEditCtrl, opts);
    }

    if (bNumeric && oEditCtrl && oEditCtrl.setValueLiveUpdate) {
      oEditCtrl.setValueLiveUpdate(false);
    }

    return new HBox({ items: [oText, oEditCtrl] });
  }

  return {
    createCellTemplate: createCellTemplate,
    hookDirtyOnEdit: hookDirtyOnEdit
  };
});
