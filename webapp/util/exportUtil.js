sap.ui.define([
  "sap/ui/export/library",
  "sap/ui/export/Spreadsheet",
  "sap/ui/core/BusyIndicator",
  "sap/m/MessageToast",
  "apptracciabilita/apptracciabilita/util/common",
  "apptracciabilita/apptracciabilita/util/statusUtil",
  "apptracciabilita/apptracciabilita/util/postUtil"
], function (exportLibrary, Spreadsheet, BusyIndicator, MessageToast, Common, StatusUtil, PostUtil) {
  "use strict";

  var EdmType = exportLibrary.EdmType;
  var deepClone = Common.deepClone;

  return {

    // =========================
    // BUILD EXPORT COLUMNS
    // =========================
    buildExportColumnsComplete: function (oDetail) {
      var a01 = (oDetail && oDetail.getProperty("/_mmct/s01")) || [];
      var a02 = (oDetail && oDetail.getProperty("/_mmct/s02")) || [];

      var aCols = [];
      var mSeen = {};

      var add = function (label, prop) {
        prop = String(prop || "").trim();
        if (!prop || mSeen[prop]) return;
        mSeen[prop] = true;

        aCols.push({
          label: label || prop,
          property: prop,
          type: EdmType.String
        });
      };

      add("Fornitore", "Fornitore");
      add("Materiale", "Materiale");
      add("GUID", "GUID");
      add("Fibra", "Fibra");
      add("Stato", "Stato");
      add("Stato testo", "StatoText");

      var addFromCfg = function (arr) {
        (arr || []).forEach(function (f) {
          if (!f || !f.ui) return;
          var p = String(f.ui).trim();
          if (!p) return;
          if (p.toUpperCase() === "STATO") p = "Stato";
          add(f.label || p, p);
        });
      };

      addFromCfg(a01);
      addFromCfg(a02);

      return aCols;
    },

    // =========================
    // MAP ROW TO EXPORT OBJECT
    // =========================
    mapRawRowToExportObject: function (r, aColumns, opts) {
      r = r || {};

      var sStato = StatusUtil.normStatoRow(r, opts.oVm);
      var statusText = opts.statusText;

      var o = {};
      (aColumns || []).forEach(function (c) {
        var p = c.property;
        var v = "";

        if (p === "Fornitore") {
          v = r.Fornitore != null ? r.Fornitore : (opts.vendorId || "");
        } else if (p === "Materiale") {
          v = r.Materiale != null ? r.Materiale : (opts.material || "");
        } else if (p === "GUID") {
          v = r.GUID != null ? r.GUID : (r.Guid != null ? r.Guid : (r.guidKey != null ? r.guidKey : ""));
        } else if (p === "Fibra") {
          v = r.Fibra != null ? r.Fibra : (r.FIBRA != null ? r.FIBRA : "");
        } else if (p === "Stato") {
          v = sStato;
        } else if (p === "StatoText") {
          v = statusText(sStato);
        } else {
          v = (r[p] != null) ? r[p] : "";
        }

        if (Array.isArray(v)) v = v.join(", ");
        if (v === null || v === undefined) v = "";

        o[p] = v;
      });

      return o;
    },

    // =========================
    // APPLY EXPORT FILTERS AND SORT
    // =========================
    applyExportClientFiltersAndSort: function (aData, opts) {
      aData = Array.isArray(aData) ? aData.slice() : [];

      var oDetail = opts.oDetail;
      var inlineFS = opts.inlineFS;

      var q = String((oDetail && oDetail.getProperty("/__q")) || "").trim().toUpperCase();
      var sStatus = String((oDetail && oDetail.getProperty("/__statusFilter")) || "").trim().toUpperCase();

      if (sStatus) {
        aData = aData.filter(function (r) {
          return String((r && r.Stato) || "").trim().toUpperCase() === sStatus;
        });
      }

      if (q) {
        aData = aData.filter(function (r) {
          return Object.keys(r || {}).some(function (k) {
            var v = r[k];
            if (v === null || v === undefined) return false;
            return String(v).toUpperCase().indexOf(q) >= 0;
          });
        });
      }

      var mCol = (inlineFS && inlineFS.filters) || {};
      var aKeys = Object.keys(mCol).filter(function (k) {
        return String(mCol[k] || "").trim() !== "";
      });

      if (aKeys.length) {
        aData = aData.filter(function (r) {
          return aKeys.every(function (k) {
            var wanted = String(mCol[k] || "").trim().toUpperCase();
            if (!wanted) return true;
            var v = (r && r[k] != null) ? r[k] : "";
            return String(v).toUpperCase().indexOf(wanted) >= 0;
          });
        });
      }

      var st = (inlineFS && inlineFS.sort) || { key: "", desc: false };
      if (st.key) {
        var key = st.key;
        var desc = !!st.desc;

        aData.sort(function (a, b) {
          var va = (a && a[key] != null) ? a[key] : "";
          var vb = (b && b[key] != null) ? b[key] : "";
          va = String(va);
          vb = String(vb);
          var cmp = va.localeCompare(vb, undefined, { numeric: true, sensitivity: "base" });
          return desc ? -cmp : cmp;
        });
      }

      return aData;
    },

    // =========================
    // EXPORT EXCEL
    // =========================
    exportExcel: async function (opts) {
      BusyIndicator.show(0);

      try {
        var oVm = opts.oVm;
        var oDetail = opts.oDetail;
        var getCodAgg = PostUtil.getCodAgg;
        var toStableString = opts.toStableString;
        var statusText = opts.statusText;
        var inlineFS = opts.inlineFS;
        var vendorId = opts.vendorId;
        var material = opts.material;

        var recordsScreen4 = Object.values(oVm.getData().cache.dataRowsByKey)[1] || oVm.getProperty("/cache/dataRowsByKey/" + opts.cacheKey) || [];
        var recordsScreen3 = oDetail.getData().Records || [];

        recordsScreen4 = Array.isArray(recordsScreen4) ? recordsScreen4.slice() : [];
        recordsScreen4 = (recordsScreen4 || []).filter(function (r) {
          return getCodAgg(r) !== "N";
        });
        recordsScreen3 = Array.isArray(recordsScreen3) ? recordsScreen3.slice() : [];

        if (!recordsScreen4.length) {
          MessageToast.show("Nessun dato Screen4 in cache (recordsScreen4 vuoto)");
          return;
        }

        function norm(v) { return String(v == null ? "" : v).trim(); }

        function guidOf(x) {
          return norm(x && (x.GUID != null ? x.GUID : (x.Guid != null ? x.Guid : (x.guidKey != null ? x.guidKey : ""))));
        }

        function fibraOf(x) {
          return norm(x && (x.Fibra != null ? x.Fibra : (x.FIBRA != null ? x.FIBRA : "")));
        }

        function keyOf(x) {
          return guidOf(x) + "||" + fibraOf(x);
        }

        function isEmpty(v) {
          if (v == null) return true;
          if (Array.isArray(v)) return v.length === 0;
          if (typeof v === "string") return v.trim() === "";
          return false;
        }

        var mParentByKey = {};
        recordsScreen3.forEach(function (p) {
          var k = keyOf(p);
          if (k !== "||") mParentByKey[k] = p;
        });

        var mergedRows = recordsScreen4.map(function (r4) {
          var out = Object.assign({}, r4);

          var k = keyOf(out);
          var parent = mParentByKey[k] || null;

          if (!parent) {
            var g = guidOf(out);
            if (g) {
              parent = mParentByKey[g + "||"] || null;
            }
          }

          if (parent) {
            Object.keys(parent).forEach(function (prop) {
              if (prop.indexOf("__") === 0) return;
              if (out[prop] === undefined || isEmpty(out[prop])) {
                out[prop] = parent[prop];
              }
            });

            if (isEmpty(out.Stato)) {
              out.Stato = parent.__status || parent.Stato || out.Stato || "";
            }
            if (isEmpty(out.StatoText) && !isEmpty(out.Stato)) {
              out.StatoText = parent.StatoText || statusText(out.Stato);
            }

            if (isEmpty(out.GUID) && !isEmpty(parent.GUID)) out.GUID = parent.GUID;
            if (isEmpty(out.Guid) && !isEmpty(parent.Guid)) out.Guid = parent.Guid;
            if (isEmpty(out.guidKey) && !isEmpty(parent.guidKey)) out.guidKey = parent.guidKey;
            if (isEmpty(out.Fibra) && !isEmpty(parent.Fibra)) out.Fibra = parent.Fibra;
          }

          return out;
        });

        mergedRows = (mergedRows || []).filter(function (r) {
          return getCodAgg(r) !== "N";
        });

        var aColumns = this.buildExportColumnsComplete(oDetail);

        var aData = mergedRows.map(function (r) {
          return this.mapRawRowToExportObject(r, aColumns, {
            oVm: oVm,
            vendorId: vendorId,
            material: material,
            statusText: statusText
          });
        }.bind(this));

        aData = this.applyExportClientFiltersAndSort(aData, {
          oDetail: oDetail,
          inlineFS: inlineFS
        });

        if (!aData.length) {
          MessageToast.show("Nessun dato dopo i filtri attivi");
          return;
        }

        var sDate = new Date().toISOString().slice(0, 10);
        var sFileName =
          "Tracciabilita_" +
          (vendorId || "Vendor") + "_" +
          (material || "Material") + "_" +
          sDate + ".xlsx";

        var oSheet = new Spreadsheet({
          workbook: { columns: aColumns },
          dataSource: aData,
          fileName: sFileName
        });

        await oSheet.build();
        MessageToast.show("Excel esportato");

      } catch (e) {
        console.error("[S3] Export Excel ERROR", e);
        MessageToast.show("Errore export Excel (vedi Console)");
      } finally {
        BusyIndicator.hide();
      }
    }

  };
});