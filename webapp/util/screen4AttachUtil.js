sap.ui.define([], function () {
  "use strict";

  function collectAttachmentFields(oDetailModel) {
    var aAttFields = [];

    (oDetailModel.getProperty("/_mmct/s02") || []).forEach(function (f) {
      if (f && f.attachment && f.ui) aAttFields.push(String(f.ui).trim());
    });
    (oDetailModel.getProperty("/_mmct/s00") || []).forEach(function (f) {
      if (f && f.attachment && f.ui) {
        var sUi = String(f.ui).trim();
        if (aAttFields.indexOf(sUi) < 0) aAttFields.push(sUi);
      }
    });

    return aAttFields;
  }

  return {
    syncAttachmentCounters: function (opts) {
      if (opts.isSyncing()) return;

      var oD = opts.getDetailModel();
      if (!oD) return;

      var aRows = oD.getProperty("/RowsAll") || [];
      if (aRows.length <= 1) return;

      var aAttFields = collectAttachmentFields(oD);
      if (!aAttFields.length) return;

      var snap = opts.getAttachSnapshot() || {};
      var bChanged = false;

      aAttFields.forEach(function (sField) {
        var aCurr = aRows.map(function (r) {
          return parseInt(String(r[sField] || "0"), 10) || 0;
        });
        var aPrev = snap[sField] || aCurr.map(function () { return aCurr[0]; });
        var iChangedIdx = -1;
        var iNewVal = aCurr[0];
        var i;

        for (i = 0; i < aCurr.length; i++) {
          if (i < aPrev.length && aCurr[i] !== aPrev[i]) {
            iChangedIdx = i;
            iNewVal = aCurr[i];
            break;
          }
        }

        if (iChangedIdx < 0) {
          var allSame = aCurr.every(function (v) { return v === aCurr[0]; });
          if (allSame) {
            snap[sField] = aCurr.slice();
            return;
          }

          var counts = {};
          var minCount = aRows.length + 1;
          aCurr.forEach(function (v) { counts[v] = (counts[v] || 0) + 1; });
          Object.keys(counts).forEach(function (k) {
            if (counts[k] < minCount) {
              minCount = counts[k];
              iNewVal = parseInt(k, 10);
            }
          });
        }

        aRows.forEach(function (r) {
          var vCur = parseInt(String(r[sField] || "0"), 10) || 0;
          if (vCur !== iNewVal) {
            r[sField] = String(iNewVal);
            bChanged = true;
          }
        });
        snap[sField] = aRows.map(function () { return iNewVal; });
      });

      opts.setAttachSnapshot(snap);

      if (bChanged) {
        opts.setSyncing(true);
        oD.setProperty("/RowsAll", aRows);
        oD.refresh(true);
        opts.setSyncing(false);
      }
    },

    startPolling: function (opts) {
      this.stopPolling(opts);
      opts.setIntervalId(opts.setIntervalFn(function () {
        opts.syncFn();
      }, opts.intervalMs || 500));
    },

    stopPolling: function (opts) {
      var iInterval = opts.getIntervalId();
      if (iInterval) {
        opts.clearIntervalFn(iInterval);
        opts.setIntervalId(null);
      }
    }
  };
});
