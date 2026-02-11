sap.ui.define([
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/postUtil"
], function (N, PostUtil) {
  "use strict";

  return {

    // =========================
    // SYNC PROPERTY TO RECORDSALL
    // =========================
    syncPropToRecordsAllByIdx: function (oDetail, oRow, sProp, vVal) {
      try {
        if (!oDetail || !oRow) return;

        var idx = (oRow.idx != null) ? parseInt(oRow.idx, 10) : NaN;
        if (isNaN(idx)) return;

        var aAll = oDetail.getProperty("/RecordsAll") || [];
        for (var i = 0; i < aAll.length; i++) {
          if (parseInt(aAll[i] && aAll[i].idx, 10) === idx) {
            oDetail.setProperty("/RecordsAll/" + i + "/" + sProp, vVal);
            break;
          }
        }
      } catch (e) { }
    },

    // =========================
    // CLEAR POST ERROR BY CONTEXT
    // =========================
    clearPostErrorByContext: function (oCtx, opts) {
      try {
        if (!oCtx) return;

        var oModel = oCtx.getModel && oCtx.getModel();
        var sPath = oCtx.getPath && oCtx.getPath();
        var oRow = oCtx.getObject && oCtx.getObject();
        if (!oModel || !sPath || !oRow) return;

        if (!oRow.__postError) return;

        oModel.setProperty(sPath + "/__postError", false);
        oModel.setProperty(sPath + "/__postMessage", "");

        this.syncPropToRecordsAllByIdx(opts.oDetail, oRow, "__postError", false);
        this.syncPropToRecordsAllByIdx(opts.oDetail, oRow, "__postMessage", "");

        if (opts.updateRowStyles) {
          opts.updateRowStyles();
        }
      } catch (e) { }
    },

    // =========================
    // UPDATE POST ERROR ROW STYLES
    // =========================
    updatePostErrorRowStyles: function (oInner, opts) {
      if (!oInner) return;

      var self = this;
      var clearFn = function (oCtx) {
        self.clearPostErrorByContext(oCtx, opts);
      };

      // GridTable
      if (oInner.isA && oInner.isA("sap.ui.table.Table")) {
        var aRows = (oInner.getRows && oInner.getRows()) || [];
        aRows.forEach(function (oRowCtrl) {
          if (!oRowCtrl) return;

          var oCtx = (oRowCtrl.getBindingContext && (oRowCtrl.getBindingContext("detail") || oRowCtrl.getBindingContext())) || null;
          var oObj = oCtx && oCtx.getObject && oCtx.getObject();

          if (oObj && oObj.__postError) oRowCtrl.addStyleClass("s3PostErrorRow");
          else oRowCtrl.removeStyleClass("s3PostErrorRow");

          try {
            if (oRowCtrl.data && !oRowCtrl.data("__s3PostErrClick")) {
              oRowCtrl.data("__s3PostErrClick", true);
              oRowCtrl.attachBrowserEvent("click", function () {
                clearFn(oCtx);
              });
            }
          } catch (e) { }
        });
        return;
      }

      // ResponsiveTable/ListBase
      if (oInner.isA && (oInner.isA("sap.m.Table") || oInner.isA("sap.m.ListBase"))) {
        var aItems = (oInner.getItems && oInner.getItems()) || [];
        aItems.forEach(function (it) {
          if (!it) return;

          var oCtx2 = (it.getBindingContext && (it.getBindingContext("detail") || it.getBindingContext())) || null;
          var oObj2 = oCtx2 && oCtx2.getObject && oCtx2.getObject();

          if (oObj2 && oObj2.__postError) it.addStyleClass("s3PostErrorRow");
          else it.removeStyleClass("s3PostErrorRow");

          try {
            if (it.data && !it.data("__s3PostErrClick")) {
              it.data("__s3PostErrClick", true);
              it.attachBrowserEvent("click", function () {
                clearFn(oCtx2);
              });
            }
          } catch (e) { }
        });
      }
    },

    // =========================
    // ENSURE POST ERROR ROW HOOKS
    // =========================
    ensurePostErrorRowHooks: function (oMdcTbl, opts) {
      try {
        if (!oMdcTbl) return;
        var oInner = opts.getInnerTableFromMdc(oMdcTbl);
        if (!oInner) return;

        if (oInner.data && oInner.data("__s3PostErrHooks")) return;
        if (oInner.data) oInner.data("__s3PostErrHooks", true);

        var self = this;

        // GridTable
        if (oInner.isA && oInner.isA("sap.ui.table.Table")) {
          oInner.attachRowsUpdated(function () {
            self.updatePostErrorRowStyles(oInner, opts);
          });

          if (typeof oInner.attachCellClick === "function") {
            oInner.attachCellClick(function (e) {
              var iRow = e.getParameter("rowIndex");
              var oCtx = oInner.getContextByIndex && oInner.getContextByIndex(iRow);
              self.clearPostErrorByContext(oCtx, opts);
            });
          }

          this.updatePostErrorRowStyles(oInner, opts);
          return;
        }

        // ResponsiveTable/ListBase
        if (oInner.isA && (oInner.isA("sap.m.Table") || oInner.isA("sap.m.ListBase"))) {
          if (typeof oInner.attachUpdateFinished === "function") {
            oInner.attachUpdateFinished(function () {
              self.updatePostErrorRowStyles(oInner, opts);
            });
          }
          this.updatePostErrorRowStyles(oInner, opts);
        }
      } catch (e) { }
    },

    // =========================
    // MARK ROWS WITH POST ERRORS
    // =========================
    markRowsWithPostErrors: function (aRespLines, opts) {
      var oDetail = opts.oDetail;
      var aAll = (oDetail && oDetail.getProperty("/RecordsAll")) || [];
      if (!Array.isArray(aAll)) aAll = [];

      var toStableString = opts.toStableString;
      var normalizeVendor10 = N.normalizeVendor10;
      var normEsito = N.normEsito;
      var normMsg = N.normMsg;

      var mIdxByGuid = {};
      var mIdxByBiz = {};

      aAll.forEach(function (r, i) {
        var g = toStableString(r && (r.guidKey || r.GUID || r.Guid));
        if (g) mIdxByGuid[g] = i;

        var kBiz = [
          normalizeVendor10(r && (r.Fornitore || r.FORNITORE)),
          String(r && (r.Materiale || r.MATERIALE) || "").trim(),
          String(r && (r.PartitaFornitore || r.PARTITAFORNITORE) || "").trim(),
          String(r && (r.Linea || r.LINEA) || "").trim()
        ].join("||");

        if (kBiz !== "||||||") mIdxByBiz[kBiz] = i;
      });

      var mMsgByIdx = {};

      (aRespLines || []).forEach(function (line) {
        var es = normEsito(line && (line.Esito != null ? line.Esito : line.esito));
        if (!es || es === "OK") return;

        var g2 = toStableString(line && (line.Guid || line.GUID || line.guidKey));
        var iIdx = (g2 && mIdxByGuid[g2] != null) ? mIdxByGuid[g2] : null;

        if (iIdx == null) {
          var kBiz2 = [
            normalizeVendor10(line && (line.Fornitore || line.FORNITORE)),
            String(line && (line.Materiale || line.MATERIALE) || "").trim(),
            String(line && (line.PartitaFornitore || line.PARTITAFORNITORE) || "").trim(),
            String(line && (line.Linea || line.LINEA) || "").trim()
          ].join("||");
          if (mIdxByBiz[kBiz2] != null) iIdx = mIdxByBiz[kBiz2];
        }

        if (iIdx == null) return;

        if (!mMsgByIdx[iIdx]) mMsgByIdx[iIdx] = [];
        var msg = normMsg(line);
        if (msg) mMsgByIdx[iIdx].push(msg);
      });

      Object.keys(mMsgByIdx).forEach(function (sI) {
        var i = parseInt(sI, 10);
        var msgs = (mMsgByIdx[i] || []).filter(Boolean);
        oDetail.setProperty("/RecordsAll/" + i + "/__postError", true);
        oDetail.setProperty("/RecordsAll/" + i + "/__postMessage", msgs.join("\n"));
      });

      if (opts.applyClientFilters) opts.applyClientFilters();
      if (opts.ensurePostErrorRowHooks) opts.ensurePostErrorRowHooks();
    }

  };
});