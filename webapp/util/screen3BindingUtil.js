sap.ui.define([
  "sap/m/Button",
  "sap/ui/mdc/table/Column",
  "sap/ui/mdc/p13n/StateUtil",
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/vmModelPaths",
  "apptracciabilita/apptracciabilita/util/recordsUtil",
  "apptracciabilita/apptracciabilita/util/dataLoaderUtil",
  "apptracciabilita/apptracciabilita/util/postUtil",
  "apptracciabilita/apptracciabilita/util/statusUtil",
  "apptracciabilita/apptracciabilita/util/mdcTableUtil",
  "apptracciabilita/apptracciabilita/util/p13nUtil",
  "apptracciabilita/apptracciabilita/util/TableColumnAutoSize"
], function (Button, MdcColumn, StateUtil, N, VmPaths, RecordsUtil, DataLoaderUtil, PostUtil, StatusUtil, MdcTableUtil, P13nUtil, TableColumnAutoSize) {
  "use strict";

  function applySnapshotStatusAndNotes(opts) {
    var mRawByGuid = {};
    (opts.rows || []).forEach(function (r) {
      var g = RecordsUtil.rowGuidKey(r);
      if (!g) return;
      if (!mRawByGuid[g]) mRawByGuid[g] = [];
      mRawByGuid[g].push(r);
    });

    (opts.snapshot || []).forEach(function (rec) {
      if (!rec) return;
      var g = N.toStableString(rec.guidKey || rec.GUID || rec.Guid || "");
      var aRaw = mRawByGuid[g] || [];
      if (!aRaw.length) return;

      var aRawSt = aRaw.map(function (r) { return String(r.Stato || "ST").trim().toUpperCase(); });
      var st;
      if (aRawSt.every(function (s) { return s === "AP"; })) st = "AP";
      else if (aRawSt.some(function (s) { return s === "RJ"; })) st = "RJ";
      else if (aRawSt.some(function (s) { return s === "CH"; })) st = "CH";
      else st = "ST";
      rec.__status = st;
      rec.Stato = st;

      var rNote = aRaw.find(function (r) { return r.Note && String(r.Note).trim(); });
      if (rNote) rec.Note = rNote.Note;
    });
  }

  function excludeTemplatesByRawRows(opts) {
    var mTpl = {};
    (opts.rows || []).forEach(function (r) {
      if (N.getCodAgg(r) === "N") mTpl[RecordsUtil.rowGuidKey(r)] = true;
    });
    return (opts.records || []).filter(function (rec) {
      return !mTpl[N.toStableString(rec && (rec.guidKey || rec.GUID || rec.Guid))];
    });
  }

  function hydrateAndFormat(opts) {
    var result = DataLoaderUtil.hydrateMmctFromRows(opts.rows, opts.detailModel, opts.vmModel, N.getCodAgg);
    opts.logFn("_hydrateMmctFromRows", result);
    var mMulti = PostUtil.getMultiFieldsMap(opts.detailModel);
    PostUtil.formatIncomingRowsMultiSeparators(opts.rows, mMulti);
  }

  function ensureMdcCfgScreen3(opts) {
    var seen = Object.create(null);
    var aProps = [];

    (opts.cfg01 || []).forEach(function (f) {
      var name = String(f && f.ui || "").trim();
      if (!name) return;
      if (name.toUpperCase() === "STATO") name = "Stato";
      var k = name.toUpperCase();
      if (seen[k]) return;
      seen[k] = true;
      aProps.push({ name: name, label: f.label || name, dataType: "String", domain: f.domain || "", required: !!f.required });
    });

    if (!seen.STATO) {
      aProps.unshift({ name: "Stato", label: "Stato", dataType: "String", domain: "", required: false });
    }

    opts.vmModel.setProperty("/mdcCfg/screen3", { modelName: "detail", collectionPath: "/Records", properties: aProps });
    opts.logFn("vm>/mdcCfg/screen3 set", { props: aProps.length });
  }

  async function rebuildColumnsHard(opts) {
    var oTbl = opts.table;
    if (!oTbl) return;
    if (oTbl.initialized) await oTbl.initialized();

    var aOld = (oTbl.getColumns && oTbl.getColumns()) || [];
    aOld.slice().forEach(function (c) { oTbl.removeColumn(c); c.destroy(); });

    var seen = Object.create(null);
    var aCfgUnique = (opts.cfg01 || []).filter(function (f) {
      var ui = String(f && f.ui || "").trim();
      if (!ui) return false;
      if (ui.toUpperCase() === "STATO") return false;
      var k = ui.toUpperCase();
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });

    if (opts.hasDetail) {
      oTbl.addColumn(new MdcColumn({
        header: "Dettaglio",
        visible: true,
        width: "100px",
        template: new Button({ icon: "sap-icon://enter-more", type: "Transparent", press: opts.onGoToScreen4FromRowFn })
      }));
    }

    var mP = MdcColumn.getMetadata().getAllProperties();
    var oStatoProps = {
      width: "70px",
      header: "Stato",
      visible: true,
      dataProperty: "Stato",
      template: opts.createStatusCellTemplateFn("Stato")
    };
    if (mP.propertyKey) oStatoProps.propertyKey = "Stato";
    opts.setStatusColumnFn(new MdcColumn(oStatoProps));
    oTbl.addColumn(opts.getStatusColumnFn());

    aCfgUnique.forEach(function (f) {
      var sKey = String(f.ui || "").trim();
      if (!sKey) return;
      var sHeader = (f.label || sKey) + (f.required ? " *" : "");
      var oColProps = {
        header: sHeader,
        visible: true,
        dataProperty: sKey,
        template: opts.createCellTemplateFn(sKey, f)
      };
      if (mP.propertyKey) oColProps.propertyKey = sKey;
      oTbl.addColumn(new MdcColumn(oColProps));
    });
  }

  async function bindRecords(opts) {
    var oDetail = opts.detailModel;
    var a = opts.records || [];
    oDetail.setProperty("/RecordsAll", a);
    oDetail.setProperty("/Records", a);
    oDetail.setProperty("/RecordsCount", a.length);

    var sRole = String((opts.vmModel && opts.vmModel.getProperty("/userType")) || "").trim().toUpperCase();
    var aSt = a.map(function (r) { return String((r && (r.__status || r.Stato)) || "ST").trim().toUpperCase(); });
    var allAP = aSt.length > 0 && aSt.every(function (s) { return s === "AP"; });
    var anyRJ = aSt.some(function (s) { return s === "RJ"; });
    var anyCH = aSt.some(function (s) { return s === "CH"; });
    var sAgg = allAP ? "AP" : (anyRJ ? "RJ" : (anyCH ? "CH" : "ST"));

    oDetail.setProperty("/__status", sAgg);
    oDetail.setProperty("/__canAddRow", StatusUtil.canAddRow(sRole, sAgg));
    oDetail.setProperty("/__role", sRole);

    if (opts.noMatListMode) {
      oDetail.setProperty("/__canAddRow", false);
      oDetail.setProperty("/__noMatListMode", true);
      oDetail.setProperty("/__canCopyRow", sRole === "E" && StatusUtil.canEdit(sRole, sAgg));
      oDetail.setProperty("/__canDeleteRow", sRole === "E" && StatusUtil.canEdit(sRole, sAgg));
    } else {
      oDetail.setProperty("/__canCopyRow", sRole === "E" && StatusUtil.canEdit(sRole, sAgg));
      oDetail.setProperty("/__canDeleteRow", sRole === "E" && StatusUtil.canEdit(sRole, sAgg));
    }

    var bCanApproveReject = (sRole === "I" || sRole === "S");
    oDetail.setProperty("/__canApprove", bCanApproveReject);
    oDetail.setProperty("/__canReject", bCanApproveReject);

    RecordsUtil.refreshHeader3Fields(oDetail);
    opts.logFn("_refreshHeader3Fields done");
    opts.setSnapshotRecordsFn(N.deepClone(a));
    if (!opts.keepOriginalSnapshot) {
      opts.setOriginalSnapshotFn(N.deepClone(a));
    }

    var oTbl = opts.table;
    var aCfg01Table = oDetail.getProperty("/_mmct/s01Table") || [];
    ensureMdcCfgScreen3({
      cfg01: aCfg01Table,
      vmModel: opts.vmModel,
      logFn: opts.logFn
    });
    var oInlineFs = MdcTableUtil.ensureInlineFS(opts.inlineFs);
    MdcTableUtil.resetInlineHeaderControls(oInlineFs);
    opts.setInlineFsFn(oInlineFs);
    await rebuildColumnsHard({
      table: oTbl,
      cfg01: aCfg01Table,
      hasDetail: !!(oDetail && oDetail.getProperty("/_mmct/hasDetail")),
      onGoToScreen4FromRowFn: opts.onGoToScreen4FromRowFn,
      createStatusCellTemplateFn: opts.createStatusCellTemplateFn,
      createCellTemplateFn: opts.createCellTemplateFn,
      setStatusColumnFn: opts.setStatusColumnFn,
      getStatusColumnFn: opts.getStatusColumnFn
    });
    TableColumnAutoSize.autoSize(opts.table, 60);
    if (oTbl && oTbl.initialized) await oTbl.initialized();
    if (oTbl) oTbl.setModel(oDetail, "detail");

    await opts.applyInlineHeaderFilterSortFn(oTbl);
    opts.applyClientFiltersFn();
    if (oTbl && typeof oTbl.rebind === "function") oTbl.rebind();

    opts.clearSelectionFn();

    await P13nUtil.forceP13nAllVisible(oTbl, StateUtil, opts.logFn, "t0");
    await opts.applyInlineHeaderFilterSortFn(oTbl);

    opts.scheduleHeaderFilterSortFn(oTbl);

    opts.logTableFn("TABLE STATE @ after _bindRecords");
    opts.ensurePostErrorRowHooksFn(oTbl);
  }

  return {
    applySnapshotStatusAndNotes: applySnapshotStatusAndNotes,
    excludeTemplatesByRawRows: excludeTemplatesByRawRows,
    hydrateAndFormat: hydrateAndFormat,
    ensureMdcCfgScreen3: ensureMdcCfgScreen3,
    rebuildColumnsHard: rebuildColumnsHard,
    bindRecords: bindRecords,

    loadDataOnce: function (opts) {
      var aRows = opts.vmModel.getProperty(VmPaths.dataRowsByKeyPath(opts.cacheKey)) || null;
      var aRecs = opts.vmModel.getProperty(VmPaths.recordsByKeyPath(opts.cacheKey)) || null;
      var bSkip = opts.consumeSkipBackendFn(opts.vmModel);
      var bHasCache = Array.isArray(aRows) && aRows.length && Array.isArray(aRecs) && aRecs.length;

      if (bHasCache) {
        opts.bindFromCacheFn(aRows, opts.cacheKey, bSkip, opts.savedSnapshot);
      }

      if (bSkip && bHasCache) {
        opts.logFn("_loadDataOnce: skip backend reload (back from Screen4)", { cacheKey: opts.cacheKey });
        return;
      }

      var iToken = opts.nextLoadTokenFn();
      opts.reloadDataFromBackendFn(function (aResults) {
        if (iToken !== opts.getLoadTokenFn()) return;
        opts.bindFromBackendFn(aResults, opts.cacheKey);
      });
    },

    bindFromCache: function (opts) {
      try {
        hydrateAndFormat({
          rows: opts.rows,
          detailModel: opts.detailModel,
          vmModel: opts.vmModel,
          logFn: opts.logFn
        });
        opts.vmModel.setProperty(VmPaths.dataRowsByKeyPath(opts.cacheKey), opts.rows);

        var aRecs;
        if (opts.skip && opts.savedSnapshot && opts.savedSnapshot.length) {
          applySnapshotStatusAndNotes({ snapshot: opts.savedSnapshot, rows: opts.rows });
          aRecs = opts.noMatListMode
            ? opts.savedSnapshot
            : excludeTemplatesByRawRows({ records: opts.savedSnapshot, rows: opts.rows });
        } else {
          aRecs = RecordsUtil.buildRecords01(opts.rows, {
            oDetail: opts.detailModel,
            oVm: opts.vmModel,
            includeTemplates: !!opts.noMatListMode
          });
          if (!opts.noMatListMode) {
            aRecs = excludeTemplatesByRawRows({ records: aRecs, rows: opts.rows });
          }
        }

        opts.vmModel.setProperty(VmPaths.recordsByKeyPath(opts.cacheKey), aRecs);
        var resC = RecordsUtil.computeOpenOdaFromRows(opts.rows);
        if (resC.hasSignalProp) opts.detailModel.setProperty("/OpenOda", resC.flag);

        if (opts.skip && opts.savedSnapshot) opts.setKeepOriginalSnapshotFn(true);
        opts.bindRecordsFn(aRecs);
        opts.setKeepOriginalSnapshotFn(false);

        if (opts.savedSnapshot) opts.setSnapshotRecordsFn(opts.savedSnapshot);
      } catch (e) {
        console.warn("[screen3BindingUtil] cache bind failed", e);
      }
    },

    bindFromBackend: function (opts) {
      hydrateAndFormat({
        rows: opts.rows,
        detailModel: opts.detailModel,
        vmModel: opts.vmModel,
        logFn: opts.logFn
      });

      var res = RecordsUtil.computeOpenOdaFromRows(opts.rows);
      if (res.hasSignalProp) opts.detailModel.setProperty("/OpenOda", res.flag);

      var aRecordsBuilt = RecordsUtil.buildRecords01(opts.rows, {
        oDetail: opts.detailModel,
        oVm: opts.vmModel,
        includeTemplates: !!opts.noMatListMode
      });
      if (!opts.noMatListMode) {
        aRecordsBuilt = excludeTemplatesByRawRows({ records: aRecordsBuilt, rows: opts.rows });
      }

      opts.vmModel.setProperty(VmPaths.dataRowsByKeyPath(opts.cacheKey), opts.rows);
      opts.vmModel.setProperty(VmPaths.recordsByKeyPath(opts.cacheKey), aRecordsBuilt);
      opts.bindRecordsFn(aRecordsBuilt);
    }
  };
});
