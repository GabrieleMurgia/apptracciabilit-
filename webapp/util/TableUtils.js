sap.ui.define([
  "sap/m/Menu",
  "sap/m/MenuItem",
  "sap/m/MessageBox",
], function (Menu, MenuItem, MessageBox) {
  "use strict";

  function getInnerTable(oMdcTable) {
    return oMdcTable && (oMdcTable._oTable || oMdcTable.getInnerTable?.());
  }

  function getSelectionPlugin(oInner) {
    if (!oInner) return null;
    let p = oInner.getPlugins ? oInner.getPlugins().find(pl => pl?.isA?.("sap.ui.table.plugins.SelectionPlugin")) : null;
    if (!p && typeof oInner._getSelectionPlugin === "function") p = oInner._getSelectionPlugin(); // fallback MDC
    return p;
  }

  function getSelectedRowPaths(oInner, sRowCtxPathFallback) {
    if (!oInner) return [];
    const p = getSelectionPlugin(oInner);
    let aIdx = [];
    if (p?.getSelectedIndices) aIdx = p.getSelectedIndices();
    else if (oInner.getSelectedIndices) aIdx = oInner.getSelectedIndices();

    const aPaths = aIdx
      .map(i => oInner.getContextByIndex(i))
      .filter(Boolean)
      .map(ctx => ctx.getPath());

    if (!aPaths.length && sRowCtxPathFallback) aPaths.push(sRowCtxPathFallback);
    return Array.from(new Set(aPaths));
  }

  function _indexFromPath(sPath) {
    return parseInt(String(sPath).split("/").pop(), 10);
  }

  function insertRowAboveBySelection(oMdc, oModel, sCollectionPath, fnEmptyRow, sRowCtxPath) {
    const oInner = getInnerTable(oMdc);
    const aPaths = getSelectedRowPaths(oInner, sRowCtxPath);
    if (!aPaths.length) return;
    const iRef = _indexFromPath(aPaths[0]);
    const aItems = oModel.getProperty(sCollectionPath || "/items");
    aItems.splice(iRef, 0, fnEmptyRow());
    oModel.refresh(true);
  }

  function insertRowBelowBySelection(oMdc, oModel, sCollectionPath, fnEmptyRow, sRowCtxPath) {
    const oInner = getInnerTable(oMdc);
    const aPaths = getSelectedRowPaths(oInner, sRowCtxPath);
    if (!aPaths.length) return;
    const iRef = _indexFromPath(aPaths[0]);
    const aItems = oModel.getProperty(sCollectionPath || "/items");
    aItems.splice(iRef + 1, 0, fnEmptyRow());
    oModel.refresh(true);
  }

  function deleteSelectedRows(oMdc, oModel, sCollectionPath, sRowCtxPath) {
    const oInner = getInnerTable(oMdc);
    const aPaths = getSelectedRowPaths(oInner, sRowCtxPath);
    if (!aPaths.length) return;
    const aItems = oModel.getProperty(sCollectionPath || "/items");
    const aIdx = aPaths.map(_indexFromPath).filter(Number.isInteger).sort((a, b) => b - a);
    aIdx.forEach(i => { if (i >= 0 && i < aItems.length) aItems.splice(i, 1); });
    oModel.refresh(true);
    oInner?.clearSelection && oInner.clearSelection();
  }

  function duplicateRowByCtxPath(oModel, sRowCtxPath, sCollectionPath) {
    if (!sRowCtxPath) return;
    const row = oModel.getProperty(sRowCtxPath);
    if (!row) return;
    const aItems = oModel.getProperty(sCollectionPath || "/items");
    const iIdx = _indexFromPath(sRowCtxPath);
    const clone = JSON.parse(JSON.stringify(row));
    aItems.splice(iIdx + 1, 0, clone);
    oModel.refresh(true);
    return iIdx + 1;
  }

  function selectAllRows(oMdc) {
    const oInner = getInnerTable(oMdc);
    if (!oInner) return;
    let p = getSelectionPlugin(oInner);
    if (p?.setSelectionInterval) {
      const len = oInner.getBinding("rows")?.getLength() || 0;
      if (len > 0) p.setSelectionInterval(0, len - 1);
      return;
    }
    if (!p && typeof oInner.selectAll === "function") oInner.selectAll();
  }

  function addContextMenuDelegate(oMdc, fnHandler, that) {
    debugger
    if (!oMdc || !oMdc.initialized) return;
    oMdc.initialized().then(function (ready) {
      const oInner = ready._oTable || ready.getInnerTable?.();
      if (oInner) {
        oInner.addEventDelegate({
          oncontextmenu: fnHandler.bind(that)
        });
      }
    });
  }

  function createContextMenu(cfg, view) {
    const menu = new Menu({
      items: [
        new MenuItem({ text: "Inserisci riga sopra",  icon: "sap-icon://add",    press: cfg.onInsertAbove }),
        new MenuItem({ text: "Inserisci riga sotto",  icon: "sap-icon://add",    press: cfg.onInsertBelow }),
        new MenuItem({ text: "Duplica riga",          icon: "sap-icon://copy",   press: cfg.onDuplicate }),
        new MenuItem({ text: "Elimina righe selezionate", icon: "sap-icon://delete", press: cfg.onDelete }),
        cfg.onImport ? new MenuItem({ text: "Importa Excel…", icon: "sap-icon://upload", press: cfg.onImport }) : null
      ].filter(Boolean)
    });
    view.addDependent(menu);
    return menu;
  }

  function _getVisibleColsFromStateOrInner(oMdc) {
    const stateCols = oMdc?.getCurrentState?.()?.columns || [];
    if (stateCols?.length) return stateCols.filter(c => c.visible).map(c => ({ label: c.label || c.name, name: c.name }));
    const inner = getInnerTable(oMdc);
    const cols = (inner?.getColumns?.() || []).filter(c => c.getVisible ? c.getVisible() : true).map(col => ({
      label: col.getLabel?.()?.getText?.() || col.getHeader?.()?.getText?.() || col.getName?.() || col.getId(),
      name: (function () {
        const t = col.getTemplate?.();
        if (t && t.getBindingInfo) {
          const bi = t.getBindingInfo("text") || t.getBindingInfo("value");
          return bi?.path || bi?.parts?.[0]?.path || "";
        }
        return "";
      }())
    }));
    return cols;
  }

  function buildPrintableHtml(oMdc, aRows, sTitle) {
    const aCols = _getVisibleColsFromStateOrInner(oMdc);
    const th = aCols.map(c => `<th style="text-align:left;padding:6px;border-bottom:1px solid #ccc">${c.label || c.name}</th>`).join("");
    const tr = (aRows || []).map(r => `<tr>${aCols.map(c => `<td style="padding:4px 6px;border-bottom:1px solid #eee">${(r[c.name] ?? "")}</td>`).join("")}</tr>`).join("");
    return `<!doctype html><html><head><meta charset="utf-8"><title>${sTitle || ""}</title>
      <style>body{font-family:sans-serif;margin:16px} table{border-collapse:collapse;width:100%}</style></head>
      <body><h3 style="margin:0 0 8px 0">${sTitle || ""}</h3>
      <table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
      <script>window.onload=function(){window.print();}</script></body></html>`;
  }

  function print(oMdc, aData, sTitle) {
    const html = buildPrintableHtml(oMdc, aData, sTitle);
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
  }

  function _setEditModeForTable(bEdit) {
    const oMdc = this.byId("mdcTable");
    if (!oMdc?.getColumns) return;

    // Fallback: se i Field NON hanno il binding su "editMode",
    // forziamo il template editMode qui.
    oMdc.getColumns().forEach(col => {
      const tpl = col.getTemplate && col.getTemplate();
      if (tpl && typeof tpl.setEditMode === "function" && !tpl.getBindingInfo("editMode")) {
        tpl.setEditMode(bEdit ? "Editable" : "Display");
      }
    });

    oMdc.invalidate(); // forza il rerender se servisse
  }

  function onEdit(e) {
    const ui = this.getView().getModel("ui");
    const now = !ui.getProperty("/edit");
    ui.setProperty("/edit", now);

    // Aggiorna icona/tooltip del bottone (opzionale)
    const b = this.byId("tbEdit");
    if (b) {
      b.setIcon(now ? "sap-icon://display" : "sap-icon://edit");
      b.setTooltip(now ? "Visualizza" : "Modifica");
    }

    // Fallback per chi non usa il binding su editMode:
    _setEditModeForTable.call(this, now);
  }

  return {
    getInnerTable,
    getSelectionPlugin,
    getSelectedRowPaths,
    insertRowAboveBySelection,
    insertRowBelowBySelection,
    deleteSelectedRows,
    duplicateRowByCtxPath,
    selectAllRows,
    addContextMenuDelegate,
    createContextMenu,
    buildPrintableHtml,
    print,
    onEdit,
    _setEditModeForTable
  };
});
