sap.ui.define([
  "sap/m/MessageToast",
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/vmModelPaths",
  "apptracciabilita/apptracciabilita/util/statusUtil",
  "apptracciabilita/apptracciabilita/util/touchCodAggUtil",
  "apptracciabilita/apptracciabilita/util/screen4LoaderUtil",
  "apptracciabilita/apptracciabilita/util/mdcTableUtil",
  "apptracciabilita/apptracciabilita/util/i18nUtil"
], function (MessageToast, N, VmPaths, StatusUtil, TouchCodAggUtil, S4Loader, MdcTableUtil, I18n) {
  "use strict";

  function vMatch(v1, v2) {
    if (Array.isArray(v1) && Array.isArray(v2)) return JSON.stringify(v1) === JSON.stringify(v2);
    return String(v1 == null ? "" : v1) === String(v2 == null ? "" : v2);
  }

  function checkRowDirtyRevert(opts) {
    var row = opts.row;
    var ctx = opts.context;
    var snap = opts.snapshotRows;
    if (!snap || !row || row.__isNew) return;

    var oD = opts.detailModel;
    var aKeys = (oD.getProperty("/_mmct/s02") || []).map(function (f) { return f && f.ui; }).filter(Boolean);
    if (!aKeys.length) return;

    var sGuid = N.toStableString(row.guidKey || "");
    var sLId = String(row.__localId || "");
    var snapRow = null;
    snap.forEach(function (s) {
      if (snapRow) return;
      if (sGuid && N.toStableString(s.guidKey || "") === sGuid) { snapRow = s; return; }
      if (sLId && String(s.__localId || "") === sLId) snapRow = s;
    });
    if (!snapRow) return;

    if (!aKeys.every(function (k) { return vMatch(row[k], snapRow[k]); })) return;

    row.CodAgg = snapRow.CodAgg || "";
    if (ctx && ctx.getPath) oD.setProperty(ctx.getPath() + "/CodAgg", row.CodAgg);

    var aRows = oD.getProperty("/RowsAll") || [];
    var allClean = aRows.every(function (r) {
      if (!r || r.__isNew) return false;
      var rGuid = N.toStableString(r.guidKey || "");
      var rLId = String(r.__localId || "");
      var sn = null;
      snap.forEach(function (s) {
        if (sn) return;
        if (rGuid && N.toStableString(s.guidKey || "") === rGuid) { sn = s; return; }
        if (rLId && String(s.__localId || "") === rLId) sn = s;
      });
      if (!sn) return false;
      return aKeys.every(function (k) { return vMatch(r[k], sn[k]); });
    });

    if (allClean) {
      oD.setProperty("/__dirty", false);
      opts.applyUiPermissionsFn();
    }
  }

  return {
    hookDirtyOnEdit: function (opts) {
      var oCtrl = opts.control;
      if (!oCtrl) return;
      try { if (oCtrl.data && oCtrl.data("dirtyHooked")) return; if (oCtrl.data) oCtrl.data("dirtyHooked", true); } catch (e) { console.debug("[screen4RowsUtil] suppressed error", e); }
      try { if (oCtrl.isA && oCtrl.isA("sap.m.Input") && oCtrl.setValueLiveUpdate) oCtrl.setValueLiveUpdate(true); } catch (e) { console.debug("[screen4RowsUtil] suppressed error", e); }

      var self = this;
      var fn = function (oEvt) {
        opts.markDirtyFn();
        var src = (oEvt && oEvt.getSource) ? oEvt.getSource() : oCtrl;
        var ctx = (src.getBindingContext && (src.getBindingContext("detail") || src.getBindingContext())) || null;
        var row = ctx && ctx.getObject && ctx.getObject();
        if (!row) return;
        var before = TouchCodAggUtil.getCodAgg(row);
        TouchCodAggUtil.touchCodAggRow(row);
        if (before !== TouchCodAggUtil.getCodAgg(row) && ctx.getPath) {
          opts.detailModel.setProperty(ctx.getPath() + "/CodAgg", row.CodAgg);
        }
        checkRowDirtyRevert({
          row: row,
          context: ctx,
          detailModel: opts.detailModel,
          snapshotRows: opts.snapshotRowsFn(),
          applyUiPermissionsFn: opts.applyUiPermissionsFn
        });
      };
      if (oCtrl.attachLiveChange) oCtrl.attachLiveChange(fn);
      if (oCtrl.attachChange) oCtrl.attachChange(fn);
      if (oCtrl.attachSelectionChange) oCtrl.attachSelectionChange(fn);
      if (oCtrl.attachSelectionFinish) oCtrl.attachSelectionFinish(fn);
      if (oCtrl.attachSubmit) oCtrl.attachSubmit(fn);
    },

    checkRowDirtyRevert: checkRowDirtyRevert,

    updateVmRecordStatus: function (opts) {
      var aRecs = opts.vmModel.getProperty(VmPaths.recordsByKeyPath(opts.cacheKey)) || [];
      if (!Array.isArray(aRecs) || !aRecs.length) return;

      var idx = aRecs.findIndex(function (r) {
        if (String(r && r.guidKey || "") !== String(opts.guid || "")) return false;
        return !opts.fibra || String(r && r.Fibra || "") === String(opts.fibra || "");
      });
      if (idx < 0) return;

      var rec = aRecs[idx];
      var st = String(opts.status || "ST").trim().toUpperCase();
      rec.__status = st;
      rec.Stato = st;
      rec.__canEdit = StatusUtil.canEdit(opts.role, st);
      rec.__canApprove = StatusUtil.canApprove(opts.role, st);
      rec.__canReject = StatusUtil.canReject(opts.role, st);
      rec.__readOnly = !rec.__canEdit;
      aRecs = aRecs.slice();
      aRecs[idx] = rec;
      opts.vmModel.setProperty(VmPaths.recordsByKeyPath(opts.cacheKey), aRecs);
    },

    getSelectedRowObjects: function (opts) {
      var oTbl = opts.table;
      if (!oTbl) return [];
      var aCtx = [];
      try { aCtx = (typeof oTbl.getSelectedContexts === "function") ? (oTbl.getSelectedContexts() || []) : []; } catch (e) { console.debug("[screen4RowsUtil] suppressed error", e); }
      if (!aCtx.length && typeof oTbl.getTable === "function") {
        try {
          var t = oTbl.getTable();
          if (t && t.getSelectedIndices) aCtx = (t.getSelectedIndices() || []).map(function (i) { return t.getContextByIndex(i); }).filter(Boolean);
          else if (t && t.getSelectedItems) aCtx = (t.getSelectedItems() || []).map(function (x) {
            return (x.getBindingContext && (x.getBindingContext("detail") || x.getBindingContext())) || null;
          }).filter(Boolean);
        } catch (e2) { console.debug("[screen4RowsUtil] suppressed error", e2); }
      }
      return aCtx.map(function (c) { return c && c.getObject ? c.getObject() : null; }).filter(Boolean);
    },

    onDeleteRows: function (opts) {
      try {
        var oD = opts.detailModel;
        if (!oD) return;
        if (!oD.getProperty("/__canDeleteRow")) {
          MessageToast.show(I18n.text(null, "msg.noPermissionDeleteRows", [], "Non hai permessi per eliminare righe"));
          return;
        }
        var aSel = this.getSelectedRowObjects({ table: opts.table });
        if (!aSel.length) {
          MessageToast.show(I18n.text(null, "msg.selectAtLeastOneRow", [], "Seleziona almeno una riga"));
          return;
        }
        var aAll = oD.getProperty("/RowsAll") || [];
        if (!aAll.length) return;

        var mSel = {};
        aSel.forEach(function (r) { if (r && r.__localId) mSel[r.__localId] = true; });
        var aRem = aAll.filter(function (r) {
          if (r && r.__localId && mSel[r.__localId]) return false;
          return aSel.indexOf(r) < 0;
        });
        if (!aRem.length) {
          MessageToast.show(I18n.text(null, "msg.cannotDeleteAllRows", [], "Non puoi eliminare tutte le righe"));
          return;
        }

        var sRole = String(oD.getProperty("/__role") || "").trim().toUpperCase();
        if (sRole === "E" && String(oD.getProperty("/__status") || "").toUpperCase() !== "AP") {
          oD.setProperty("/__canEdit", true);
          oD.setProperty("/__canAddRow", true);
          oD.setProperty("/__canApprove", false);
          oD.setProperty("/__canReject", false);
        }
        oD.setProperty("/RowsAll", aRem);
        oD.setProperty("/__dirty", true);

        var oVm = opts.vmModel;
        var sCK = opts.cacheKey;
        var sGuid = N.toStableString(oD.getProperty("/guidKey"));
        var aC = (oVm.getProperty(VmPaths.dataRowsByKeyPath(sCK)) || []).filter(function (r) {
          return S4Loader.rowGuidKey(r) !== sGuid;
        });
        aRem.forEach(function (l) { if (!l.CodAgg) l.CodAgg = "U"; });
        oVm.setProperty(VmPaths.dataRowsByKeyPath(sCK), aC.concat(aRem));

        opts.applyUiPermissionsFn();
        opts.applyFiltersAndSortFn();
        if (opts.table && opts.table.rebind) opts.table.rebind();
        MessageToast.show(I18n.text(null, "msg.rowsDeleted", [], "Righe eliminate"));
      } catch (e) {
        console.error("[S4] onDeleteRows ERROR", e);
        MessageToast.show(I18n.text(null, "msg.deleteRowsError", [], "Errore eliminazione righe"));
      }
    },

    onAddRow: function (opts) {
      try {
        var oD = opts.detailModel;
        if (!oD) return;
        if (!oD.getProperty("/__canAddRow")) {
          MessageToast.show(I18n.text(null, "msg.noPermissionAddRows", [], "Non hai permessi per aggiungere righe"));
          return;
        }
        var aAll = oD.getProperty("/RowsAll") || [];
        if (!aAll.length) {
          MessageToast.show(I18n.text(null, "msg.noBaseRow", [], "Nessuna riga di base"));
          return;
        }

        var oBase = aAll[0] || {};
        var sGuid = N.toStableString(oD.getProperty("/guidKey")) || oBase.Guid || oBase.GUID || "";
        var oFullRow = aAll.reduce(function (best, r) {
          return (Object.keys(r).length > Object.keys(best).length) ? r : best;
        }, oBase);
        var oNew = N.deepClone(oFullRow) || {};

        Object.keys(oNew).forEach(function (k) {
          if (k.indexOf("__") === 0 || k === "__metadata") { delete oNew[k]; return; }
          if (["Guid", "GUID", "guidKey", "Fornitore", "Materiale", "CatMateriale", "Stagione", "Plant"].indexOf(k) >= 0) return;
          oNew[k] = Array.isArray(oNew[k]) ? [] : "";
        });

        oNew.Guid = sGuid;
        oNew.GUID = sGuid;
        oNew.guidKey = sGuid;
        oNew.Fornitore = oBase.Fornitore || "";
        oNew.Materiale = oBase.Materiale || "";
        oNew.CatMateriale = oBase.CatMateriale || oD.getProperty("/_mmct/cat") || "";
        oNew.Stagione = oBase.Stagione || "";
        oNew.Plant = oBase.Plant || "";
        oNew.Fibra = "";
        oNew.Stato = "ST";
        oNew.Note = "";

        (oD.getProperty("/_mmct/s02") || []).forEach(function (f) {
          if (f && f.ui && f.multiple) oNew[f.ui.trim()] = opts.toArrayMultiFn(oNew[f.ui.trim()]);
        });

        var shouldUpd = false;
        try {
          shouldUpd = Object.values(opts.vmModel.getData().cache.dataRowsByKey)[0]
            .filter(function (i) { return i.Guid === oNew.Guid; })
            .filter(function (i) { return !(i && i.Guid && i.Guid.toLowerCase().indexOf("new") >= 0); }).length > 0;
        } catch (e) { console.debug("[screen4RowsUtil] suppressed error", e); }

        oNew.CodAgg = shouldUpd ? "U" : "I";
        oNew.__isNew = true;
        oNew.__readOnly = false;
        oNew.__localId = "NEW_" + Date.now() + "_" + Math.floor(Math.random() * 100000);

        aAll = aAll.slice();
        aAll.push(oNew);
        oD.setProperty("/RowsAll", aAll);
        oD.setProperty("/__canEdit", true);
        oD.setProperty("/__canAddRow", true);
        oD.setProperty("/__dirty", true);

        var aC = (opts.vmModel.getProperty(VmPaths.dataRowsByKeyPath(opts.cacheKey)) || []).slice();
        aC.push(oNew);
        opts.vmModel.setProperty(VmPaths.dataRowsByKeyPath(opts.cacheKey), aC);

        opts.applyUiPermissionsFn();
        opts.applyFiltersAndSortFn();
        if (opts.table && opts.table.rebind) opts.table.rebind();

        var aFiltered = oD.getProperty("/Rows") || oD.getProperty("/RowsAll") || [];
        MdcTableUtil.scrollToRow(opts.table, aFiltered.length - 1);

        opts.syncAttachmentCountersFn();
        MessageToast.show(I18n.text(null, "msg.rowAdded", [], "Riga aggiunta"));
      } catch (e) {
        console.error("[S4] onAddRow ERROR", e);
        MessageToast.show(I18n.text(null, "msg.addRowError", [], "Errore aggiunta riga"));
      }
    },

    onCopyRow: function (opts) {
      try {
        var oD = opts.detailModel;
        if (!oD) return;
        if (!oD.getProperty("/__canCopyRow")) {
          MessageToast.show(I18n.text(null, "msg.noPermissionCopyRows", [], "Non hai permessi per copiare righe"));
          return;
        }

        var aSel = this.getSelectedRowObjects({ table: opts.table });
        if (!aSel.length) {
          MessageToast.show(I18n.text(null, "msg.selectRowToCopy", [], "Seleziona una riga da copiare"));
          return;
        }
        if (aSel.length > 1) {
          MessageToast.show(I18n.text(null, "msg.selectSingleRowToCopy", [], "Seleziona una sola riga da copiare"));
          return;
        }

        var oSource = aSel[0];
        var oNew = N.deepClone(oSource) || {};

        ["/_mmct/s01", "/_mmct/s02"].forEach(function (sPath) {
          (oD.getProperty(sPath) || []).forEach(function (f) {
            if (f && f.ui && f.attachment) oNew[f.ui.trim()] = "0";
          });
        });

        var shouldUpd = false;
        try {
          shouldUpd = Object.values(opts.vmModel.getData().cache.dataRowsByKey)[0]
            .filter(function (i) { return i.Guid === oNew.Guid; })
            .filter(function (i) { return !(i && i.Guid && i.Guid.toLowerCase().indexOf("new") >= 0); }).length > 0;
        } catch (e) { console.debug("[screen4RowsUtil] suppressed error", e); }

        oNew.CodAgg = shouldUpd ? "U" : "I";
        oNew.__isNew = true;
        oNew.__readOnly = false;
        oNew.__localId = "COPY_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
        oNew.Stato = "ST";
        oNew.Note = "";
        delete oNew.__metadata;

        (oD.getProperty("/_mmct/s02") || []).forEach(function (f) {
          if (f && f.ui && f.multiple) oNew[f.ui.trim()] = opts.toArrayMultiFn(oNew[f.ui.trim()]);
        });

        var aAll = (oD.getProperty("/RowsAll") || []).slice();
        aAll.push(oNew);
        oD.setProperty("/RowsAll", aAll);
        oD.setProperty("/__dirty", true);

        var aC = (opts.vmModel.getProperty(VmPaths.dataRowsByKeyPath(opts.cacheKey)) || []).slice();
        aC.push(oNew);
        opts.vmModel.setProperty(VmPaths.dataRowsByKeyPath(opts.cacheKey), aC);

        opts.applyUiPermissionsFn();
        opts.applyFiltersAndSortFn();
        if (opts.table && opts.table.rebind) opts.table.rebind();

        var aFiltered = oD.getProperty("/Rows") || oD.getProperty("/RowsAll") || [];
        MdcTableUtil.scrollToRow(opts.table, aFiltered.length - 1);

        opts.syncAttachmentCountersFn();
        MessageToast.show(I18n.text(null, "msg.rowCopied", [], "Riga copiata"));
      } catch (e) {
        console.error("[S4] onCopyRow ERROR", e);
        MessageToast.show(I18n.text(null, "msg.copyRowError", [], "Errore copia riga"));
      }
    }
  };
});
