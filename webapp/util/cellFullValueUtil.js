/**
 * cellFullValueUtil.js - Shared helpers to inspect long cell values.
 */
sap.ui.define([
  "sap/m/Button",
  "sap/m/Dialog",
  "sap/m/TextArea"
], function (Button, Dialog, TextArea) {
  "use strict";

  function normalizeValue(v) {
    if (v == null) return "";

    if (Array.isArray(v)) {
      return v.map(function (item) {
        return normalizeValue(item);
      }).filter(function (item) {
        return item !== "";
      }).join(", ");
    }

    if (v instanceof Date && !isNaN(v.getTime())) {
      return v.toISOString();
    }

    if (typeof v === "object") {
      try {
        return JSON.stringify(v);
      } catch (e) {
        return String(v);
      }
    }

    return String(v);
  }

  function _hasListShape(v, sText) {
    if (Array.isArray(v)) {
      return v.length > 1;
    }

    var aParts = String(sText || "").split(/[;|,]/).map(function (part) {
      return String(part || "").trim();
    }).filter(Boolean);

    return aParts.length >= 3;
  }

  function shouldShowFullValueAction(v) {
    var sText = normalizeValue(v);
    if (!sText) return false;
    if (sText.length > 30) return true;
    if (/[\r\n]/.test(sText)) return true;
    return _hasListShape(v, sText);
  }

  function formatValueForDisplay(v, fnFormatter) {
    if (typeof fnFormatter === "function") {
      try {
        return normalizeValue(fnFormatter(v));
      } catch (e) {
        return normalizeValue(v);
      }
    }
    return normalizeValue(v);
  }

  function _calcRows(sText) {
    var iLines = String(sText || "").split(/\r\n|\r|\n/).length;
    return Math.max(4, Math.min(14, iLines + 1));
  }

  function openFullValueDialog(opts) {
    opts = opts || {};
    var sValue = normalizeValue(opts.value);
    var oDialog = new Dialog({
      title: opts.title || "Valore completo",
      contentWidth: "42rem",
      content: [
        new TextArea({
          value: sValue,
          editable: false,
          width: "100%",
          rows: _calcRows(sValue)
        })
      ],
      beginButton: new Button({
        text: "Chiudi",
        press: function () {
          oDialog.close();
        }
      }),
      afterClose: function () {
        oDialog.destroy();
      }
    });

    oDialog.open();
    return oDialog;
  }

  function createFullValueButton(opts) {
    opts = opts || {};
    var sModelName = opts.modelName || "";
    var sPath = opts.path || "";
    var sBindingPath = (sModelName ? sModelName + ">" : "") + sPath;

    return new Button({
      icon: opts.icon || "sap-icon://display-more",
      type: "Transparent",
      tooltip: opts.tooltip || "Leggi valore completo",
      visible: {
        path: sBindingPath,
        formatter: function (v) {
          return shouldShowFullValueAction(v) || shouldShowFullValueAction(formatValueForDisplay(v, opts.valueFormatter));
        }
      },
      press: function (oEvent) {
        var oSrc = oEvent && oEvent.getSource && oEvent.getSource();
        var oCtx = oSrc && oSrc.getBindingContext && oSrc.getBindingContext(sModelName || undefined);
        var v = oCtx && oCtx.getProperty ? oCtx.getProperty(sPath) : undefined;
        openFullValueDialog({
          title: opts.title || "Valore completo",
          value: formatValueForDisplay(v, opts.valueFormatter)
        });
      }
    });
  }

  return {
    normalizeValue: normalizeValue,
    shouldShowFullValueAction: shouldShowFullValueAction,
    formatValueForDisplay: formatValueForDisplay,
    createFullValueButton: createFullValueButton,
    openFullValueDialog: openFullValueDialog
  };
});
