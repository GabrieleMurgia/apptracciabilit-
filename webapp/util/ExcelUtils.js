sap.ui.define([
  "sap/ui/export/Spreadsheet",
  "sap/m/MessageBox",
  "sap/m/MessageToast"
], function (Spreadsheet, MessageBox, MessageToast) {
  "use strict";

  function _findBoundPath(oCtrl) {
    if (!oCtrl || !oCtrl.getBindingInfo) return null;
    const CANDIDATES = ["text", "value", "dateValue", "selectedKey", "selected", "title", "number", "src"];
    for (const p of CANDIDATES) {
      const bi = oCtrl.getBindingInfo(p);
      if (bi) return bi.path || bi.parts?.[0]?.path || null;
    }
    const infos = oCtrl.mBindingInfos || {};
    for (const k in infos) {
      const bi = infos[k];
      const path = bi?.path || bi?.parts?.[0]?.path;
      if (path) return path;
    }
    return null;
  }

  function buildColumnsFromInnerTable(oInner, aData) {
    if (!oInner || !aData?.length) return [];
    const aInnerCols = (oInner.getColumns && oInner.getColumns()) || [];
    const keys = new Set(Object.keys(aData[0]));
    const cols = aInnerCols
      .filter(col => col.getVisible ? col.getVisible() : true)
      .map(col => {
        const sLabel =
          col.getLabel?.()?.getText?.() ||
          col.getName?.() ||
          col.getHeader?.()?.getText?.() ||
          col.getId();
        const sPath = _findBoundPath(col.getTemplate?.()) || null;
        return { label: sLabel, property: sPath };
      })
      .filter(c => typeof c.property === "string" && keys.has(c.property));
    return cols.length ? cols : Object.keys(aData[0]).map(k => ({ label: k, property: k }));
  }

  function exportSpreadsheet(oMdcTable, oModel, sFileName) {
    if (!oMdcTable) return;
    const aData = oModel?.getProperty("/items") || [];
    if (!aData.length) {
      MessageToast.show("Nessun dato da esportare");
      return;
    }
    const oInner = oMdcTable._oTable || oMdcTable.getInnerTable?.();
    const aCols = buildColumnsFromInnerTable(oInner, aData);
    const oSettings = {
      workbook: { columns: aCols },
      dataSource: aData,
      fileName: (sFileName || "export") + ".xlsx"
    };
    const sheet = new Spreadsheet(oSettings);
    sheet.build().finally(() => sheet.destroy());
  }

  function triggerFileOpen(oFileUploader) {
    if (!oFileUploader) return;
    if (typeof oFileUploader.openFileDialog === "function") {
      oFileUploader.openFileDialog();
      return;
    }
    const el = document.getElementById(oFileUploader.getId() + "-fu");
    if (el?.click) { el.click(); return; }
    const $inp = oFileUploader.$().find("input[type=file]");
    if ($inp && $inp[0]) { $inp[0].click(); return; }
    MessageBox.error("Impossibile aprire la selezione file.");
  }

  // Requires SheetJS (XLSX) disponibile globalmente (caricala in index.html)
  function parseExcelFile(file, mapFn, onSuccess, onError) {
    if (typeof XLSX === "undefined") {
      MessageBox.error("Libreria XLSX non caricata");
      onError && onError(new Error("XLSX missing"));
      return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const mapped = typeof mapFn === "function" ? rows.map(mapFn) : rows;
        onSuccess && onSuccess(mapped);
      } catch (err) {
        console.error(err);
        MessageBox.error("File Excel non valido");
        onError && onError(err);
      }
    };
    reader.onerror = function () {
      MessageBox.error("Lettura file fallita");
      onError && onError(new Error("read error"));
    };
    reader.readAsArrayBuffer(file);
  }

  return {
    buildColumnsFromInnerTable,
    exportSpreadsheet,
    triggerFileOpen,
    parseExcelFile
  };
});
