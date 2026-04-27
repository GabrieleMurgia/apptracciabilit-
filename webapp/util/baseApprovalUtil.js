sap.ui.define([
  "sap/m/MessageToast",
  "apptracciabilita/apptracciabilita/util/vmModelPaths",
  "apptracciabilita/apptracciabilita/util/i18nUtil"
], function (MessageToast, VmPaths, I18n) {
  "use strict";

  function rowGuid(r) {
    return String((r && (r.guidKey || r.Guid || r.GUID)) || "").trim();
  }

  function rowFibra(r) {
    return String((r && (r.Fibra || r.FIBRA)) || "").trim();
  }

  return {
    applyStatusChange: function (opts) {
      var oDetail = opts.detailModel;
      if (!oDetail) return;

      var aSelected = opts.selectedRows || [];
      var sNewStatus = String(opts.newStatus || "").trim().toUpperCase();
      var sNote = opts.note || "";
      var bIsParentTable = !!opts.isParentTable;

      var aMatchGuids = [];
      var aCompositeKeys = [];
      aSelected.forEach(function (r) {
        var sGuid = rowGuid(r);
        if (!sGuid) return;
        if (bIsParentTable) {
          aMatchGuids.push(sGuid);
        } else {
          aCompositeKeys.push({ guid: sGuid, fibra: rowFibra(r) });
        }
      });

      function matchesRow(r) {
        var sGuid = rowGuid(r);
        if (bIsParentTable) {
          return aMatchGuids.indexOf(sGuid) >= 0;
        }
        var sFibra = rowFibra(r);
        return aCompositeKeys.some(function (ck) {
          if (ck.fibra) return ck.guid === sGuid && ck.fibra === sFibra;
          return ck.guid === sGuid;
        });
      }

      ["/RecordsAll", "/RowsAll"].forEach(function (sPath) {
        var aAll = oDetail.getProperty(sPath);
        if (!Array.isArray(aAll)) return;
        aAll.forEach(function (r) {
          if (!r || !matchesRow(r)) return;
          r.Stato = sNewStatus;
          r.__status = sNewStatus;
          r.StatoText = (sNewStatus === "AP") ? "Approvato" : "Rifiutato";
          r.__readOnly = true;
          r.__canEdit = false;
          r.__canApprove = false;
          r.__canReject = false;
          if (sNewStatus === "RJ" && sNote) r.Note = sNote;
        });
      });

      var aRawAll = opts.vmModel.getProperty(VmPaths.dataRowsByKeyPath(opts.cacheKey));
      if (Array.isArray(aRawAll)) {
        aRawAll.forEach(function (r) {
          if (!r || !matchesRow(r)) return;
          r.Stato = sNewStatus;
          if (sNewStatus === "RJ" && sNote) r.Note = sNote;
          r.CodAgg = "U";
          if (r.CODAGG !== undefined) delete r.CODAGG;
        });
      }

      oDetail.refresh(true);

      if (typeof opts.onStatusChangeAppliedFn === "function") {
        opts.onStatusChangeAppliedFn(sNewStatus, aSelected);
      }

      MessageToast.show(
        I18n.text(
          opts.context || null,
          "msg.statusAppliedSavePrompt",
          [aSelected.length, (sNewStatus === "AP" ? "approvati" : "rifiutati")],
          "{0} record {1}. Premi Salva per confermare."
        )
      );
    }
  };
});
