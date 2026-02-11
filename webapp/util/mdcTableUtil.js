sap.ui.define([
  "sap/m/Button",
  "sap/m/Input",
  "sap/m/HBox",
  "sap/m/VBox",
  "sap/m/Text"
], function (Button, Input, HBox, VBox, Text) {
  "use strict";

  // =========================
  // Inner table helpers
  // =========================
  function getInnerTableFromMdc(oMdcTbl) {
    var oInner = null;

    try {
      if (oMdcTbl && typeof oMdcTbl.getTable === "function") oInner = oMdcTbl.getTable();
      if (!oInner && oMdcTbl && typeof oMdcTbl.getContent === "function") oInner = oMdcTbl.getContent();
      if (!oInner && oMdcTbl && typeof oMdcTbl.getAggregation === "function") {
        oInner =
          oMdcTbl.getAggregation("content") ||
          oMdcTbl.getAggregation("_content") ||
          oMdcTbl.getAggregation("_table") ||
          null;
      }
      if (!oInner && oMdcTbl && oMdcTbl._oTable) oInner = oMdcTbl._oTable;
      if (!oInner && oMdcTbl && typeof oMdcTbl._getTable === "function") oInner = oMdcTbl._getTable();
    } catch (e) { }

    // unwrap “TableType”
    try {
      if (oInner && typeof oInner.getColumns !== "function") {
        if (typeof oInner.getTable === "function") oInner = oInner.getTable();
        else if (typeof oInner.getInnerTable === "function") oInner = oInner.getInnerTable();
        else if (oInner._oTable) oInner = oInner._oTable;
      }
    } catch (e2) { }

    return oInner || null;
  }

  function setInnerHeaderHeight(oInnerOrMdc, bShow) {
    try {
      var oInner = oInnerOrMdc;
      if (oInnerOrMdc && typeof oInnerOrMdc.getColumns !== "function") {
        oInner = getInnerTableFromMdc(oInnerOrMdc);
      }
      if (oInner && typeof oInner.setColumnHeaderHeight === "function") {
        oInner.setColumnHeaderHeight(bShow ? 64 : 32);
      }
    } catch (e) { }
  }

  function setInnerColumnHeader(oInnerCol, oHeaderControl) {
    try {
      if (!oInnerCol) return;
      if (typeof oInnerCol.setLabel === "function") oInnerCol.setLabel(oHeaderControl);
      else if (typeof oInnerCol.setHeader === "function") oInnerCol.setHeader(oHeaderControl);
    } catch (e) { }
  }

  // =========================
  // Inline header FS state
  // =========================
  function ensureInlineFS(oInlineFS) {
    if (!oInlineFS) oInlineFS = {};

    if (!oInlineFS.filters) oInlineFS.filters = {};
    if (!oInlineFS.sort) oInlineFS.sort = { key: "", desc: false };

    if (!oInlineFS.sortBtns) oInlineFS.sortBtns = {};
    if (!oInlineFS.filterInputs) oInlineFS.filterInputs = {};
    if (!oInlineFS.headerTitles) oInlineFS.headerTitles = {};
    if (!oInlineFS.headerRows) oInlineFS.headerRows = {};
    if (!oInlineFS.headerBoxes) oInlineFS.headerBoxes = {};

    return oInlineFS;
  }

  function resetInlineHeaderControls(oInlineFS) {
    oInlineFS = ensureInlineFS(oInlineFS);

    ["sortBtns", "filterInputs", "headerTitles", "headerRows", "headerBoxes"].forEach(function (k) {
      var m = oInlineFS[k] || {};
      Object.keys(m).forEach(function (key) {
        try { m[key] && m[key].destroy && m[key].destroy(); } catch (e) { }
      });
      oInlineFS[k] = {};
    });

    return oInlineFS;
  }

  function getCustomDataValue(oCtrl, sKey) {
    try {
      var a = (oCtrl && oCtrl.getCustomData && oCtrl.getCustomData()) || [];
      var cd = a.find(function (x) { return x && x.getKey && x.getKey() === sKey; });
      return cd ? cd.getValue() : null;
    } catch (e) {
      return null;
    }
  }

  function refreshInlineSortIcons(oInlineFS) {
    oInlineFS = ensureInlineFS(oInlineFS);

    var st2 = oInlineFS.sort || { key: "", desc: false };
    var mBtns = oInlineFS.sortBtns || {};

    Object.keys(mBtns).forEach(function (k) {
      var b = mBtns[k];
      if (!b || !b.setIcon) return;

      if (!st2.key || st2.key !== k) {
        b.setIcon("sap-icon://sort");
      } else {
        b.setIcon(st2.desc ? "sap-icon://sort-descending" : "sap-icon://sort-ascending");
      }
    });
  }

  function onInlineColFilterLiveChange(oEvt, oInlineFS) {
    oInlineFS = ensureInlineFS(oInlineFS);

    var oInput = oEvt && oEvt.getSource && oEvt.getSource();
    var sField = oInput && oInput.data && oInput.data("field");
    if (!sField) return;

    var sVal = String((oEvt && oEvt.getParameter && oEvt.getParameter("value")) || "");
    oInlineFS.filters[sField] = sVal;

    var fn = oInlineFS.__applyClientFilters;
    if (typeof fn === "function") fn();
  }

  function onInlineColSortPress(oEvt, oInlineFS) {
    oInlineFS = ensureInlineFS(oInlineFS);

    var oBtn = oEvt && oEvt.getSource && oEvt.getSource();
    var sField = oBtn && oBtn.data && oBtn.data("field");
    if (!sField) return;

    if (!oInlineFS.sort) oInlineFS.sort = { key: "", desc: false };

    if (oInlineFS.sort.key === sField) {
      oInlineFS.sort.desc = !oInlineFS.sort.desc;
    } else {
      oInlineFS.sort.key = sField;
      oInlineFS.sort.desc = false;
    }

    refreshInlineSortIcons(oInlineFS);

    var fn = oInlineFS.__applyClientFilters;
    if (typeof fn === "function") fn();
  }

  async function applyInlineHeaderFilterSort(oMdcTbl, opts) {
    opts = opts || {};
    if (!oMdcTbl) return;

    var oView = opts.view || null;
    var oInlineFS = ensureInlineFS(opts.inlineFS || {});
    var fnApply = opts.applyClientFilters;
    var fnLog = opts.log;

    // callback “dinamici” (così i controlli riusati puntano sempre all’ultimo)
    oInlineFS.__applyClientFilters = fnApply;
    oInlineFS.__log = fnLog;

    try {
      if (oMdcTbl.initialized) await oMdcTbl.initialized();
    } catch (eInit) { }

    var oInner = getInnerTableFromMdc(oMdcTbl);
    if (!oInner || typeof oInner.getColumns !== "function") {
      try { if (typeof fnLog === "function") fnLog("InlineFS: inner table non trovata o non compatibile"); } catch (eLog) { }
      return;
    }

    var aMdcCols = (oMdcTbl.getColumns && oMdcTbl.getColumns()) || [];
    var aInnerCols = oInner.getColumns() || [];

    function normInnerKey(col) {
      var k = "";
      try {
        if (col && typeof col.getFilterProperty === "function") k = col.getFilterProperty() || "";
        if (!k && col && typeof col.getSortProperty === "function") k = col.getSortProperty() || "";
      } catch (e) { }

      k = String(k || "").trim();
      if (k.indexOf(">") >= 0) k = k.split(">").pop();
      return String(k || "").trim();
    }

    var mInnerByKey = {};
    aInnerCols.forEach(function (c) {
      var k = normInnerKey(c);
      if (!k) return;
      mInnerByKey[k] = c;
      mInnerByKey[k.toUpperCase()] = c;
    });

    var oUiModel = (oView && oView.getModel) ? oView.getModel("ui") : null;

    function fallbackInnerByIndex(iMdc) {
      var col = aInnerCols[iMdc] || null;
      if (col && (typeof col.setLabel === "function" || typeof col.setHeader === "function")) return col;

      col = aInnerCols[iMdc + 1] || null;
      if (col && (typeof col.setLabel === "function" || typeof col.setHeader === "function")) return col;

      return null;
    }

    function isDead(o) { return !o || o.bIsDestroyed; }

    for (var i = 0; i < aMdcCols.length; i++) {
      var mdcCol = aMdcCols[i];

      var sField =
        (mdcCol && (
          (typeof mdcCol.getPropertyKey === "function" && mdcCol.getPropertyKey()) ||
          (typeof mdcCol.getDataProperty === "function" && mdcCol.getDataProperty())
        )) || "";

      sField = String(sField || "").trim();
      if (!sField) continue;

      var sHeader = (typeof mdcCol.getHeader === "function" && mdcCol.getHeader()) || sField;

      var innerCol = mInnerByKey[sField] || mInnerByKey[sField.toUpperCase()] || null;
      if (!innerCol) innerCol = fallbackInnerByIndex(i);
      if (!innerCol) continue;

      // --- Sort Button (riuso) ---
      var oSortBtn = oInlineFS.sortBtns[sField];
      if (isDead(oSortBtn)) {
        try { oSortBtn && oSortBtn.destroy && oSortBtn.destroy(); } catch (e0) { }
        oSortBtn = null;
        delete oInlineFS.sortBtns[sField];
      }
      if (!oSortBtn) {
        oSortBtn = new Button({
          type: "Transparent",
          icon: "sap-icon://sort",
          visible: "{ui>/showHeaderSort}",
          press: function (oEvt) { onInlineColSortPress(oEvt, oInlineFS); }
        });
        oSortBtn.data("field", sField);
        oInlineFS.sortBtns[sField] = oSortBtn;
      } else {
        if (oSortBtn.bindProperty) oSortBtn.bindProperty("visible", "ui>/showHeaderSort");
      }

      // --- Filter Input ---
      var oInp = oInlineFS.filterInputs[sField];
      if (!oInp) {
        oInp = new Input({
          width: "100%",
          placeholder: "Filtra...",
          visible: "{ui>/showHeaderFilters}",
          liveChange: function (oEvt) { onInlineColFilterLiveChange(oEvt, oInlineFS); }
        });
        oInp.data("field", sField);
        oInlineFS.filterInputs[sField] = oInp;
      } else {
        if (oInp.bindProperty) oInp.bindProperty("visible", "ui>/showHeaderFilters");
      }

      var wantedVal = String((oInlineFS.filters && oInlineFS.filters[sField]) || "");
      if (oInp.getValue && oInp.getValue() !== wantedVal) oInp.setValue(wantedVal);

      // --- Title ---
      var oTitle = oInlineFS.headerTitles[sField];
      if (!oTitle) {
        oTitle = new Text({ text: (typeof sHeader === "string" ? sHeader : sField), wrapping: false });
        oInlineFS.headerTitles[sField] = oTitle;
      } else if (oTitle.setText) {
        oTitle.setText(typeof sHeader === "string" ? sHeader : sField);
      }

      // --- Header row + box ---
      var oH = oInlineFS.headerRows[sField];
      if (!oH) {
        oH = new HBox({
          justifyContent: "SpaceBetween",
          alignItems: "Center",
          items: [oTitle, oSortBtn]
        });
        oInlineFS.headerRows[sField] = oH;
      }

      var oV = oInlineFS.headerBoxes[sField];
      if (!oV) {
        oV = new VBox({ items: [oH, oInp] });
        oInlineFS.headerBoxes[sField] = oV;
      }

      // assicuro model ui
      if (oUiModel && oV && oV.setModel) oV.setModel(oUiModel, "ui");

      setInnerColumnHeader(innerCol, oV);

      try { if (innerCol.data) innerCol.data("__inlineFS", true); } catch (eD) { }
    }

    refreshInlineSortIcons(oInlineFS);

    // header height
    try {
      var bShow = !!(oUiModel && oUiModel.getProperty && oUiModel.getProperty("/showHeaderFilters"));
      setInnerHeaderHeight(oMdcTbl, bShow);
    } catch (eH) { }
  }

  // =========================
  // Selection helpers (MDC + inner fallback)
  // =========================
  function getSelectedObjectsFromMdc(oMdc, sModelName) {
    var aObj = [];
    var sM = sModelName || "detail";

    // 1) MDC Table
    try {
      if (oMdc && typeof oMdc.getSelectedContexts === "function") {
        var aCtx = oMdc.getSelectedContexts() || [];
        aCtx.forEach(function (c) {
          var o = c && c.getObject && c.getObject();
          if (o) aObj.push(o);
        });
        if (aObj.length) return aObj;
      }
    } catch (e) { }

    // 2) Inner table fallback
    var oInner = getInnerTableFromMdc(oMdc);

    // sap.ui.table.Table
    try {
      if (oInner && typeof oInner.getSelectedIndices === "function" && typeof oInner.getContextByIndex === "function") {
        var aIdx = oInner.getSelectedIndices() || [];
        aIdx.forEach(function (i) {
          var c = oInner.getContextByIndex(i);
          var o = c && c.getObject && c.getObject();
          if (o) aObj.push(o);
        });
        if (aObj.length) return aObj;
      }
    } catch (e2) { }

    // sap.m.Table / ListBase
    try {
      if (oInner && typeof oInner.getSelectedItems === "function") {
        var aItems = oInner.getSelectedItems() || [];
        aItems.forEach(function (it) {
          var c = it && it.getBindingContext && (it.getBindingContext(sM) || it.getBindingContext());
          var o = c && c.getObject && c.getObject();
          if (o) aObj.push(o);
        });
        if (aObj.length) return aObj;
      }
    } catch (e3) { }

    // single selection fallback
    try {
      if (oInner && typeof oInner.getSelectedItem === "function") {
        var it2 = oInner.getSelectedItem();
        if (it2) {
          var c2 = it2.getBindingContext && (it2.getBindingContext(sM) || it2.getBindingContext());
          var o2 = c2 && c2.getObject && c2.getObject();
          if (o2) aObj.push(o2);
        }
      }
    } catch (e4) { }

    return aObj;
  }

  function clearSelectionMdc(oMdc) {
    try {
      if (oMdc && typeof oMdc.clearSelection === "function") {
        oMdc.clearSelection();
        return;
      }
    } catch (e) { }

    var oInner = getInnerTableFromMdc(oMdc);

    try {
      if (oInner && typeof oInner.clearSelection === "function") {
        oInner.clearSelection();
        return;
      }
    } catch (e2) { }

    try {
      if (oInner && typeof oInner.removeSelections === "function") {
        oInner.removeSelections(true);
        return;
      }
    } catch (e3) { }
  }

  function selectFirstRowMdc(oMdc) {
    var oInner = getInnerTableFromMdc(oMdc);

    // sap.ui.table.Table
    try {
      if (oInner && typeof oInner.setSelectedIndex === "function") {
        oInner.setSelectedIndex(0);
        return;
      }
    } catch (e) { }

    // sap.m.Table / ListBase
    try {
      if (oInner && typeof oInner.getItems === "function" && typeof oInner.setSelectedItem === "function") {
        var it = (oInner.getItems() || [])[0];
        if (it) oInner.setSelectedItem(it, true);
        return;
      }
    } catch (e2) { }
  }

  return {
    // inner table
    getInnerTableFromMdc: getInnerTableFromMdc,
    setInnerHeaderHeight: setInnerHeaderHeight,
    setInnerColumnHeader: setInnerColumnHeader,

    // inline header FS
    ensureInlineFS: ensureInlineFS,
    resetInlineHeaderControls: resetInlineHeaderControls,
    getCustomDataValue: getCustomDataValue,
    refreshInlineSortIcons: refreshInlineSortIcons,
    applyInlineHeaderFilterSort: applyInlineHeaderFilterSort,

    // selection helpers
    getSelectedObjectsFromMdc: getSelectedObjectsFromMdc,
    clearSelectionMdc: clearSelectionMdc,
    selectFirstRowMdc: selectFirstRowMdc

    // NOTE: _ensureMdcCfgScreen3, _rebuildColumnsHard, _createStatusCellTemplate
    // were removed — they used `this` (controller context) and belong in Screen3_controller.js.
  };
});