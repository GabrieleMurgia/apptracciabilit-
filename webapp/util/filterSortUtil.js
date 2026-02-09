sap.ui.define([
  "apptracciabilita/apptracciabilita/util/mdcTableUtil"
], function (MdcTableUtil) {
  "use strict";

  var FilterSortUtil = {

    applyClientFilters: function (oDetail, inlineFS, oTbl) {
      var aAll = oDetail.getProperty("/RecordsAll") || [];
      var q = String(oDetail.getProperty("/__q") || "").trim().toUpperCase();
      var sStatus = String(oDetail.getProperty("/__statusFilter") || "").trim().toUpperCase();

      var aFiltered = (aAll || []).filter(function (r) {
        if (sStatus) {
          var st = String((r && (r.__status || r.Stato)) || "").trim().toUpperCase();
          if (st !== sStatus) return false;
        }
        if (q) {
          var ok = Object.keys(r || {}).some(function (k) {
            if (k === "__metadata" || k === "AllData") return false;
            if (k.indexOf("__") === 0) return false;
            var v = r[k];
            if (v === null || v === undefined) return false;
            if (Array.isArray(v)) v = v.join(", ");
            return String(v).toUpperCase().indexOf(q) >= 0;
          });
          if (!ok) return false;
        }
        return true;
      });

      var mCol = (inlineFS && inlineFS.filters) || {};
      var aColKeys = Object.keys(mCol).filter(function (k) {
        return String(mCol[k] || "").trim() !== "";
      });
      if (aColKeys.length) {
        aFiltered = aFiltered.filter(function (r) {
          return aColKeys.every(function (k) {
            var wanted = String(mCol[k] || "").trim().toUpperCase();
            if (!wanted) return true;
            var v = (r && r[k] != null) ? r[k] : "";
            if (Array.isArray(v)) v = v.join(", ");
            return String(v).toUpperCase().indexOf(wanted) >= 0;
          });
        });
      }

      var st2 = (inlineFS && inlineFS.sort) || { key: "", desc: false };
      if (st2.key) {
        var key = st2.key, desc = !!st2.desc;
        aFiltered.sort(function (a, b) {
          var va = (a && a[key] != null) ? a[key] : "";
          var vb = (b && b[key] != null) ? b[key] : "";
          if (Array.isArray(va)) va = va.join(", ");
          if (Array.isArray(vb)) vb = vb.join(", ");
          va = String(va); vb = String(vb);
          var cmp = va.localeCompare(vb, undefined, { numeric: true, sensitivity: "base" });
          return desc ? -cmp : cmp;
        });
      }

      oDetail.setProperty("/Records", aFiltered);
      oDetail.setProperty("/RecordsCount", aFiltered.length);
      if (oTbl && oTbl.getModel && oTbl.getModel("detail") && typeof oTbl.rebind === "function") {
        oTbl.rebind();
      }
    },

    onStatusFilterPress: function (oEvt, oDetail, applyFn) {
      var oSrc = oEvt.getSource();
      var s = MdcTableUtil.getCustomDataValue(oSrc, "status");
      s = String(s || "").trim().toUpperCase();
      oDetail.setProperty("/__statusFilter", s);
      applyFn();
    },

    onGlobalFilter: function (oEvt, oDetail, applyFn) {
      var q = String(oEvt.getParameter("value") || "").trim();
      oDetail.setProperty("/__q", q);
      applyFn();
    },

    onInlineColFilterLiveChange: function (oEvt, inlineFS, applyFn) {
      var oInput = oEvt.getSource();
      var sField = oInput && oInput.data && oInput.data("field");
      if (!sField) return;
      var sVal = String(oEvt.getParameter("value") || "");
      if (!inlineFS.filters) inlineFS.filters = {};
      inlineFS.filters[sField] = sVal;
      applyFn();
    },

    onInlineColSortPress: function (oEvt, inlineFS, applyFn) {
      var oBtn = oEvt.getSource();
      var sField = oBtn && oBtn.data && oBtn.data("field");
      if (!sField) return;
      if (!inlineFS.sort) inlineFS.sort = { key: "", desc: false };
      if (inlineFS.sort.key === sField) { inlineFS.sort.desc = !inlineFS.sort.desc; }
      else { inlineFS.sort.key = sField; inlineFS.sort.desc = false; }
      MdcTableUtil.refreshInlineSortIcons(inlineFS);
      applyFn();
    },

    resetFiltersAndSort: function (opts) {
      var oDetail = opts.oDetail;
      var inlineFS = opts.inlineFS;
      oDetail.setProperty("/__q", "");
      oDetail.setProperty("/__statusFilter", "");
      if (opts.inputFilter && opts.inputFilter.setValue) opts.inputFilter.setValue("");
      inlineFS.filters = {};
      inlineFS.sort = { key: "", desc: false };
      MdcTableUtil.refreshInlineSortIcons(inlineFS);
      opts.applyClientFiltersFn();
      if (opts.table) {
        opts.applyInlineHeaderFilterSortFn(opts.table);
        opts.setInnerHeaderHeightFn(opts.table);
      }
    },

    toggleHeaderFilters: function (oUi, oTbl, setHeightFn, applyInlineFn) {
      if (!oUi) return;
      var bNow = !!oUi.getProperty("/showHeaderFilters");
      oUi.setProperty("/showHeaderFilters", !bNow);
      setHeightFn(oTbl);
      applyInlineFn(oTbl);
    },

    toggleHeaderSort: function (oUi, oTbl, applyInlineFn) {
      if (!oUi) return;
      var bNow = !!oUi.getProperty("/showHeaderSort");
      oUi.setProperty("/showHeaderSort", !bNow);
      applyInlineFn(oTbl);
    }
  };

  return FilterSortUtil;
});