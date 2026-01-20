sap.ui.define([], function () {
  "use strict";

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

  return {
    getInnerTableFromMdc: getInnerTableFromMdc,
    setInnerHeaderHeight: setInnerHeaderHeight,
    setInnerColumnHeader: setInnerColumnHeader
  };
});
