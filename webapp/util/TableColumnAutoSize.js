/**
 * Auto-size MDC Table column widths based on header text length + padding.
 *
 * Usage:
 *   sap.ui.require([
 *     "apptracciabilita/apptracciabilita/util/TableColumnAutoSize"
 *   ], function(TableColumnAutoSize) {
 *       TableColumnAutoSize.autoSize(this.byId("mdcTable3"), 30);
 *   });
 */
sap.ui.define([], function () {
    "use strict";

    /** Off-screen canvas, created once */
    var _oCanvas = null;

    /**
     * Measures text width using an off-screen canvas (no DOM reflow).
     */
    function _measureText(sText, sFont) {
        if (!_oCanvas) {
            _oCanvas = document.createElement("canvas");
        }
        var ctx = _oCanvas.getContext("2d");
        ctx.font = sFont || "600 13px Arial, Helvetica, sans-serif";
        return Math.ceil(ctx.measureText(sText).width);
    }

    /**
     * Reads the computed font from the first rendered column header cell.
     */
    function _getHeaderFont(oMdcTable) {
        var oDom = oMdcTable.getDomRef();
        if (!oDom) {
            return null;
        }
        // GridTable header
        var oCell = oDom.querySelector(".sapUiTableColHdrCnt .sapUiTableCol .sapUiTableColCell");
        if (!oCell) {
            // Responsive table fallback
            oCell = oDom.querySelector(".sapMListTblHeaderCell");
        }
        if (oCell) {
            var cs = window.getComputedStyle(oCell);
            return cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
        }
        return null;
    }

    /**
     * Core resize logic.
     */
    function _doResize(oMdcTable, iExtraPx, iMinWidth) {
        var aColumns = oMdcTable.getColumns();
        if (!aColumns || aColumns.length === 0) {
            return;
        }

        var sFont = _getHeaderFont(oMdcTable) || "600 13px Arial, Helvetica, sans-serif";

        aColumns.forEach(function (oColumn) {
            var sHeader = oColumn.getHeader() || "";
            if (!sHeader) {
                return;
            }
            var iTextWidth = _measureText(sHeader, sFont);
            var iFinalWidth = Math.max(iTextWidth + iExtraPx, iMinWidth);
            oColumn.setWidth(iFinalWidth + "px");
        });
    }

    return {

        /**
         * Auto-size all columns of the given MDC Table.
         *
         * @param {sap.ui.mdc.Table} oMdcTable  – the MDC Table instance
         * @param {number} [iExtraPx=30]         – extra pixels beyond measured text width
         * @param {number} [iMinWidth=60]        – minimum column width in px
         */
        autoSize: function (oMdcTable, iExtraPx, iMinWidth) {
            if (!oMdcTable) {
                return;
            }

            iExtraPx = iExtraPx !== undefined ? iExtraPx : 30;
            iMinWidth = iMinWidth !== undefined ? iMinWidth : 60;

            if (oMdcTable.getDomRef()) {
                setTimeout(function () {
                    _doResize(oMdcTable, iExtraPx, iMinWidth);
                }, 100);
            } else {
                var oDelegate = {
                    onAfterRendering: function () {
                        setTimeout(function () {
                            _doResize(oMdcTable, iExtraPx, iMinWidth);
                        }, 200);
                        oMdcTable.removeEventDelegate(oDelegate);
                    }
                };
                oMdcTable.addEventDelegate(oDelegate);
            }
        }
    };
});