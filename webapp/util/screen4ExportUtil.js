sap.ui.define([
  "sap/m/MessageToast",
  "apptracciabilita/apptracciabilita/util/common"
], function (MessageToast, Common) {
  "use strict";

  var S4Export = {

    onPrint: function (oDetail) {
      try {
        var aRows = (oDetail && oDetail.getProperty("/Rows")) || [];
        var aCfg02 = (oDetail && oDetail.getProperty("/_mmct/s02")) || [];

        if (!Array.isArray(aRows) || !aRows.length) {
          MessageToast.show("Nessun dato da stampare"); return;
        }

        var cols = (aCfg02 || []).map(function (f) { return { key: String(f.ui), label: String(f.label || f.ui) }; });
        if (!cols.length) cols = Object.keys(aRows[0] || {}).map(function (k) { return { key: k, label: k }; });

        var html = [];
        html.push("<html><head><meta charset='utf-8'>");
        html.push("<title>Stampa - Tracciabilità</title>");
        html.push("<style>body{font-family:Arial,sans-serif;font-size:12px} table{border-collapse:collapse;width:100%} th,td{border:1px solid #999;padding:6px;vertical-align:top} th{background:#eee}</style>");
        html.push("</head><body>");
        html.push("<h3>Tracciabilità</h3>");
        html.push("<table><thead><tr>");
        cols.forEach(function (c) { html.push("<th>" + (c.label || c.key) + "</th>"); });
        html.push("</tr></thead><tbody>");

        aRows.forEach(function (r) {
          html.push("<tr>");
          cols.forEach(function (c) {
            var v = r ? r[c.key] : "";
            if (Array.isArray(v)) v = v.join(", ");
            html.push("<td>" + String(v === undefined || v === null ? "" : v) + "</td>");
          });
          html.push("</tr>");
        });

        html.push("</tbody></table></body></html>");

        var w = window.open("", "_blank");
        if (!w) { MessageToast.show("Popup bloccato dal browser"); return; }
        w.document.open();
        w.document.write(html.join(""));
        w.document.close();
        w.focus();
        w.print();
      } catch (e) {
        console.error("[S4] onPrint ERROR", e);
        MessageToast.show("Errore stampa");
      }
    },

    onExportExcel: function (oDetail) {
      var aRows = (oDetail && oDetail.getProperty("/Rows")) || [];
      var aCfg02 = (oDetail && oDetail.getProperty("/_mmct/s02")) || [];

      if (!Array.isArray(aRows) || !aRows.length) {
        MessageToast.show("Nessun dato da esportare"); return;
      }

      var sVendor = String((oDetail && oDetail.getProperty("/VendorId")) || "");
      var sMat = String((oDetail && oDetail.getProperty("/Material")) || "");
      var sFile = "Tracciabilita_" + sVendor + "_" + sMat + ".xlsx";

      sap.ui.require(["sap/ui/export/Spreadsheet"], function (Spreadsheet) {
        try {
          var aCols = (aCfg02 || []).map(function (f) {
            return { label: String(f.label || f.ui), property: String(f.ui), type: "string" };
          });
          if (!aCols.length) {
            aCols = Object.keys(aRows[0] || {}).map(function (k) {
              return { label: k, property: k, type: "string" };
            });
          }

          var oSheet = new Spreadsheet({ workbook: { columns: aCols }, dataSource: aRows, fileName: sFile });
          oSheet.build().finally(function () { oSheet.destroy(); });
        } catch (e) {
          console.error("[S4] Excel export ERROR", e);
          MessageToast.show("Errore export Excel");
        }
      }, function () {
        MessageToast.show("Libreria export non disponibile");
      });
    }
  };

  return S4Export;
});