sap.ui.define([
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/ui/export/library",
  "sap/ui/export/Spreadsheet",
  "sap/ui/core/BusyIndicator",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/mdc/table/Column",
  "sap/ui/mdc/p13n/StateUtil",
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/postUtil",
  "apptracciabilita/apptracciabilita/util/recordsUtil",
  "apptracciabilita/apptracciabilita/util/dataLoaderUtil",
  "apptracciabilita/apptracciabilita/util/p13nUtil",
  "apptracciabilita/apptracciabilita/util/TableColumnAutoSize",
  "apptracciabilita/apptracciabilita/util/i18nUtil"
], function (MessageToast, MessageBox, exportLibrary, Spreadsheet, BusyIndicator, Filter, FilterOperator, MdcColumn, StateUtil, N, PostUtil, RecordsUtil, DataLoaderUtil, P13nUtil, TableColumnAutoSize, I18n) {
  "use strict";

  var EdmType = exportLibrary.EdmType;

  function buildSummaryCfg(aRawFields) {
    var seen = Object.create(null);
    var aCfgAll = (aRawFields || [])
      .filter(function (f) {
        return String(f.InSummary || "").trim().toUpperCase() === "X";
      })
      .sort(function (a, b) {
        var sA = parseInt(String(a.SummarySort != null ? a.SummarySort : a.SUMMARYSORT != null ? a.SUMMARYSORT : "0").trim(), 10) || 0;
        var sB = parseInt(String(b.SummarySort != null ? b.SummarySort : b.SUMMARYSORT != null ? b.SUMMARYSORT : "0").trim(), 10) || 0;
        if (sA > 0 && sB > 0) return sA - sB;
        if (sA > 0) return -1;
        if (sB > 0) return 1;
        return 0;
      })
      .map(function (f) {
        var ui = String(f.UiFieldname || f.UIFIELDNAME || "").trim();
        if (!ui) return null;
        var k = ui.toUpperCase();
        if (seen[k]) return null;
        seen[k] = true;
        var imp = String(f.Impostazione || "").trim().toUpperCase();
        return {
          ui: ui,
          label: String(f.UiFieldLabel || f.Descrizione || ui).trim(),
          domain: String(f.Dominio || "").trim(),
          required: imp === "O",
          locked: imp === "B",
          attachment: imp === "A",
          download: imp === "D",
          multiple: String(f.MultipleVal || "").trim().toUpperCase() === "X",
          order: parseInt(String(f.Ordinamento || "9999").trim(), 10) || 9999,
          numeric: ["Perccomp", "PerccompFibra", "PercMatRicicl", "PesoPack", "QtaFibra", "FattEmissione", "CalcCarbonFoot", "GradoRic"].indexOf(ui) >= 0
        };
      })
      .filter(Boolean);

    if (!seen.STATO) {
      aCfgAll.unshift({ ui: "Stato", label: "Stato", domain: "", required: false });
    }
    return aCfgAll;
  }

  function resolveReadOnlyRows(aRows, oDetail, oVm) {
    var mMulti = PostUtil.getMultiFieldsMap(oDetail);
    PostUtil.formatIncomingRowsMultiSeparators(aRows, mMulti);

    var mDomByKey = oVm.getProperty("/domainsByKey") || {};
    var aCfg01 = oDetail.getProperty("/_mmct/s01") || [];
    var aCfg02 = oDetail.getProperty("/_mmct/s02") || [];
    var mFieldDomain = {};

    [aCfg01, aCfg02].forEach(function (arr) {
      (arr || []).forEach(function (f) {
        if (!f || !f.ui || !f.domain) return;
        var sDom = String(f.domain).trim();
        if (sDom && mDomByKey[sDom]) {
          mFieldDomain[String(f.ui).trim()] = sDom;
        }
      });
    });

    (aRows || []).forEach(function (r) {
      if (!r) return;
      r.__readOnly = true;

      Object.keys(mFieldDomain).forEach(function (sField) {
        var v = r[sField];
        if (v == null || v === "") return;
        var sDom = mFieldDomain[sField];
        var mKeys = mDomByKey[sDom] || {};

        if (Array.isArray(v)) {
          var seen = {};
          r[sField] = v.map(function (k) {
            var sk = String(k || "").trim();
            var txt = mKeys[sk] || sk;
            if (seen[txt]) return null;
            seen[txt] = true;
            return txt;
          }).filter(Boolean);
        } else {
          var sVal = String(v);
          var parts = sVal.split(/[;|]+/).map(function (k) { return k.trim(); }).filter(Boolean);
          if (parts.length > 1) {
            var seen2 = {};
            r[sField] = parts.map(function (k) {
              var txt = mKeys[k] || k;
              if (seen2[txt]) return null;
              seen2[txt] = true;
              return txt;
            }).filter(Boolean).join("; ");
          } else {
            var sk2 = sVal.trim();
            if (mKeys[sk2]) r[sField] = mKeys[sk2];
          }
        }
      });
    });
  }

  function buildExportColumns(aRawFields) {
    return buildSummaryCfg(aRawFields).map(function (f) {
      return { label: f.label || f.ui, property: f.ui, type: "String" };
    }).map(function (c) {
      if (String(c.property || "").toUpperCase() === "STATO") {
        return { label: c.label, property: "StatoText", type: "String" };
      }
      return c;
    });
  }

  return {
    buildSummaryCfg: buildSummaryCfg,
    resolveReadOnlyRows: resolveReadOnlyRows,
    buildExportColumns: buildExportColumns,

    loadDataByCat: function (opts) {
      var sUserId = (opts.vmModel && opts.vmModel.getProperty("/userId")) || "";
      var aFilters = [
        new Filter("UserID", FilterOperator.EQ, sUserId),
        new Filter("OnlySaved", FilterOperator.EQ, "X"),
        new Filter("CatMateriale", FilterOperator.EQ, opts.cat)
      ];

      BusyIndicator.show(0);
      opts.odataModel.read("/DataSet", {
        filters: aFilters,
        urlParameters: { "sap-language": "IT" },
        success: function (oData) {
          BusyIndicator.hide();
          var aResults = (oData && oData.results) || [];
          opts.logFn("DataSet loaded", { count: aResults.length, cat: opts.cat });
          opts.onDataLoadedFn(aResults, opts.cat);
        },
        error: function (oError) {
          BusyIndicator.hide();
          console.error("[Screen5FlowUtil] DataSet read ERROR", oError);
          MessageBox.error(N.getBackendErrorMessage(oError));
        }
      });
    },

    onDataLoaded: function (opts) {
      var oDetail = opts.detailModel;
      var oVm = opts.vmModel;
      var aRows = opts.rows || [];

      var result = DataLoaderUtil.hydrateMmctFromRows(aRows, oDetail, oVm, N.getCodAgg);
      opts.logFn("_hydrateMmctFromRows", result);
      resolveReadOnlyRows(aRows, oDetail, oVm);

      oDetail.setProperty("/_mmct/cat", opts.cat);
      oDetail.setProperty("/RowsAll", aRows);
      oDetail.setProperty("/Rows", aRows);
      oDetail.setProperty("/RowsCount", aRows.length);
      oDetail.setProperty("/__loaded", true);
      oDetail.setProperty("/__q", "");
      oDetail.setProperty("/__statusFilter", "");

      opts.resetInlineFsFn();
      if (opts.inputFilter && opts.inputFilter.setValue) opts.inputFilter.setValue("");
      opts.bindTableFn(aRows);
    },

    bindTable: async function (opts) {
      var oDetail = opts.detailModel;
      var oVm = opts.vmModel;
      var sCat = String(oDetail.getProperty("/_mmct/cat") || "").trim() ||
        String((opts.getSelectedCatFn && opts.getSelectedCatFn()) || "").trim();
      var aCfgAll = buildSummaryCfg(oVm.getProperty("/mmctFieldsByCat/" + sCat) || []);
      var aProps = aCfgAll.map(function (f) {
        var name = String(f.ui || "").trim();
        if (name.toUpperCase() === "STATO") name = "Stato";
        return { name: name, label: f.label || name, dataType: "String", domain: f.domain || "", required: !!f.required };
      });
      oVm.setProperty("/mdcCfg/screen5", { modelName: "detail", collectionPath: "/Rows", properties: aProps });
      opts.logFn("mdcCfg/screen5 set", { props: aProps.length });

      var oTbl = opts.table;
      if (!oTbl) return;
      await this.rebuildColumnsHard({
        table: oTbl,
        cfgAll: aCfgAll,
        createStatusCellTemplateFn: opts.createStatusCellTemplateFn,
        createReadOnlyCellTemplateFn: opts.createReadOnlyCellTemplateFn
      });
      TableColumnAutoSize.autoSize(oTbl, 60);

      if (oTbl.initialized) await oTbl.initialized();
      oTbl.setModel(oDetail, "detail");
      await opts.applyInlineHeaderFilterSortFn(oTbl);
      opts.applyClientFiltersFn();
      if (typeof oTbl.rebind === "function") oTbl.rebind();
      await P13nUtil.forceP13nAllVisible(oTbl, StateUtil, opts.logFn, "t0");
      await opts.applyInlineHeaderFilterSortFn(oTbl);
      opts.scheduleHeaderFilterSortFn(oTbl);
      opts.logFn("_bindTable done", { rows: (opts.rows || []).length, cols: aCfgAll.length });
    },

    rebuildColumnsHard: async function (opts) {
      var oTbl = opts.table;
      if (!oTbl) return;
      if (oTbl.initialized) await oTbl.initialized();

      var aOld = (oTbl.getColumns && oTbl.getColumns()) || [];
      aOld.slice().forEach(function (c) { oTbl.removeColumn(c); c.destroy(); });

      var seen = Object.create(null);
      var aCfgUnique = (opts.cfgAll || []).filter(function (f) {
        var ui = String(f && f.ui || "").trim();
        if (!ui) return false;
        if (ui.toUpperCase() === "STATO") return false;
        var k = ui.toUpperCase();
        if (seen[k]) return false;
        seen[k] = true;
        return true;
      });

      var mP = MdcColumn.getMetadata().getAllProperties();
      var oStatoProps = {
        width: "70px",
        header: "Stato",
        visible: true,
        dataProperty: "Stato",
        template: opts.createStatusCellTemplateFn("Stato")
      };
      if (mP.propertyKey) oStatoProps.propertyKey = "Stato";
      oTbl.addColumn(new MdcColumn(oStatoProps));

      aCfgUnique.forEach(function (f) {
        var sKey = String(f.ui || "").trim();
        if (!sKey) return;
        var oColProps = {
          header: f.label || sKey,
          visible: true,
          dataProperty: sKey,
          template: opts.createReadOnlyCellTemplateFn(sKey, f)
        };
        if (mP.propertyKey) oColProps.propertyKey = sKey;
        oTbl.addColumn(new MdcColumn(oColProps));
      });
    },

    exportExcel: async function (opts) {
      var oDetail = opts.detailModel;
      if (!oDetail.getProperty("/__loaded")) {
        MessageToast.show(I18n.text(opts.context || null, "msg.noDataToExport", [], "Nessun dato da esportare"));
        return;
      }

      var aRows = oDetail.getProperty("/Rows") || [];
      if (!aRows.length) {
        MessageToast.show(I18n.text(opts.context || null, "msg.noRowsToExportCheckFilters", [], "Nessuna riga da esportare (controlla i filtri)"));
        return;
      }

      try {
        BusyIndicator.show(0);
        var sCat = String(oDetail.getProperty("/_mmct/cat") || "").trim();
        var aCols = buildExportColumns(opts.vmModel.getProperty("/mmctFieldsByCat/" + sCat) || []);
        var aData = aRows.map(function (r) {
          var o = {};
          aCols.forEach(function (c) {
            var v = "";
            if (c.property === "StatoText") v = RecordsUtil.statusText(String(r.Stato || r.__status || "ST").trim().toUpperCase());
            else v = (r && r[c.property] != null) ? r[c.property] : "";
            if (Array.isArray(v)) v = v.join(", ");
            o[c.property] = String(v != null ? v : "");
          });
          return o;
        });
        var oSheet = new Spreadsheet({
          workbook: {
            columns: aCols.map(function (c) { return { label: c.label, property: c.property, type: EdmType.String }; })
          },
          dataSource: aData,
          fileName: "DatiTabella_" + (sCat || "export") + ".xlsx"
        });
        await oSheet.build();
        oSheet.destroy();
        MessageToast.show(I18n.text(opts.context || null, "msg.excelExported", [], "Excel esportato"));
      } catch (e) {
        console.error("[Screen5FlowUtil] Export error", e);
        MessageToast.show(I18n.text(opts.context || null, "msg.exportExcelError", [], "Errore export Excel"));
      } finally {
        BusyIndicator.hide();
      }
    }
  };
});
