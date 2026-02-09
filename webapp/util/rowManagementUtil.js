sap.ui.define([
  "sap/m/MessageToast",
  "apptracciabilita/apptracciabilita/util/common",
  "apptracciabilita/apptracciabilita/util/postUtil",
  "apptracciabilita/apptracciabilita/util/recordsUtil"
], function (MessageToast, Common, PostUtil, RecordsUtil) {
  "use strict";

  var deepClone = Common.deepClone;

  return {

    /**
     * Trova il GUID del template da usare per una nuova riga parent
     */
    pickTemplateGuidForNewParent: function (opts) {
      var aSel = opts.selectedObjects || [];
      var oVm = opts.oVm;
      var cacheKey = opts.cacheKey;
      var toStableString = opts.toStableString;
      var rowGuidKey = opts.rowGuidKey;
      var getCodAgg = opts.getCodAgg;

      if (Array.isArray(aSel) && aSel.length === 1) {
        var gSel = toStableString(aSel[0] && (aSel[0].guidKey || aSel[0].GID || aSel[0].GUID || aSel[0].Guid));
        if (gSel) return gSel;
      }

      var aRaw = oVm.getProperty("/cache/dataRowsByKey/" + cacheKey) || [];
      if (!Array.isArray(aRaw)) aRaw = [];

      var rTpl = aRaw.find(function (r) {
        return getCodAgg(r) === "N" && rowGuidKey(r);
      });

      if (!rTpl) {
        rTpl = aRaw.find(function (r) {
          return getCodAgg(r) === "" && rowGuidKey(r);
        });
      }

      return rTpl ? rowGuidKey(rTpl) : "";
    },

    /**
     * Ottiene le righe template per un dato GUID
     */
    getTemplateRowsByGuid: function (guidTpl, opts) {
      var oVm = opts.oVm;
      var cacheKey = opts.cacheKey;
      var rowGuidKey = opts.rowGuidKey;
      var isBaseCodAgg = opts.isBaseCodAgg;

      var aRaw = oVm.getProperty("/cache/dataRowsByKey/" + cacheKey) || [];
      if (!Array.isArray(aRaw)) aRaw = [];

      var aTpl = aRaw.filter(function (r) {
        return rowGuidKey(r) === guidTpl && isBaseCodAgg(r);
      });

      if (!aTpl.length) {
        aTpl = aRaw.filter(function (r) {
          return rowGuidKey(r) === guidTpl;
        });
      }

      return aTpl;
    },

    /**
     * Clona i campi locked da un template
     */
    cloneLockedFields: function (src, aCfg, toArrayMulti) {
      src = src || {};
      var out = {};

      (aCfg || []).forEach(function (f) {
        if (!f || !f.ui) return;
        var k = String(f.ui).trim();
        if (!k) return;
        if (k.toUpperCase() === "STATO") k = "Stato";

        if (f) {
          var v = src[k];
          if (f.multiple) out[k] = toArrayMulti(v);
          else out[k] = (v == null ? "" : v);
        } else {
          out[k] = f.multiple ? [] : "";
        }
      });

      return out;
    },

    /**
     * Crea una nuova riga parent
     */
    createNewParentRow: function (opts) {
      var oDetail = opts.oDetail;
      var tpl0 = opts.template;
      var aCfg01 = opts.cfg01;
      var sVendorId = opts.vendorId;
      var sMaterial = opts.material;
      var normalizeVendor10 = opts.normalizeVendor10;
      var toArrayMulti = opts.toArrayMulti;
      var statusText = opts.statusText;
      var genGuidNew = opts.genGuidNew;

      var aAll = oDetail.getProperty("/RecordsAll") || [];

      var iMax = -1;
      (aAll || []).forEach(function (r) {
        var n = parseInt((r && r.idx) != null ? r.idx : -1, 10);
        if (!isNaN(n) && n > iMax) iMax = n;
      });
      var iNewIdx = iMax + 1;

      var sGuidNew = genGuidNew();

      var oLockedParent = this.cloneLockedFields(tpl0, aCfg01, toArrayMulti);

      var oNewRow = deepClone(Object.assign({}, oLockedParent, {
        idx: iNewIdx,

        GUID: sGuidNew,
        Guid: sGuidNew,
        guidKey: sGuidNew,

        CatMateriale: tpl0.CatMateriale || oDetail.getProperty("/_mmct/cat") || "",
        Fornitore: tpl0.Fornitore || normalizeVendor10(sVendorId),
        Materiale: tpl0.Materiale || String(sMaterial || "").trim(),

        Fibra: "",

        CodAgg: "I",

        Stato: "ST",
        StatoText: statusText("ST"),
        __status: "ST",

        __canEdit: true,
        __canApprove: false,
        __canReject: false,
        __readOnly: false,

        __isNew: true,
        __state: "NEW"
      }));

      (aCfg01 || []).forEach(function (f) {
        if (!f || !f.ui) return;
        var k = String(f.ui).trim();
        if (!k) return;
        if (k.toUpperCase() === "STATO") k = "Stato";
        if (oNewRow[k] === undefined) oNewRow[k] = f.multiple ? [] : "";
        if (f.multiple && !Array.isArray(oNewRow[k])) oNewRow[k] = toArrayMulti(oNewRow[k]);
      });

      return {
        row: oNewRow,
        idx: iNewIdx,
        guid: sGuidNew
      };
    },

    /**
     * Crea le righe dettaglio per un nuovo parent
     */
    createNewDetailRows: function (aTplRows, opts) {
      var tpl0 = opts.template;
      var aCfg02 = opts.cfg02;
      var sGuidNew = opts.guid;
      var sVendorId = opts.vendorId;
      var sMaterial = opts.material;
      var sCat = opts.cat;
      var normalizeVendor10 = opts.normalizeVendor10;
      var toArrayMulti = opts.toArrayMulti;

      var self = this;

      return (aTplRows && aTplRows.length ? aTplRows : [tpl0]).map(function (src) {
        var oLockedDet = self.cloneLockedFields(src, aCfg02, toArrayMulti);

        var x = deepClone(src);
        Object.assign(x, oLockedDet);

        var fibraSrc = (src.Fibra != null ? src.Fibra : src.FIBRA);
        if (fibraSrc != null && String(fibraSrc).trim() !== "") {
          x.Fibra = fibraSrc;
        }

        x.Guid = sGuidNew;
        x.GUID = sGuidNew;
        x.guidKey = sGuidNew;

        x.Fornitore = x.Fornitore || normalizeVendor10(sVendorId);
        x.Materiale = x.Materiale || String(sMaterial || "").trim();
        x.CatMateriale = x.CatMateriale || tpl0.CatMateriale || sCat || "";

        x.CodAgg = "I";
        x.__localId = "NEW_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
        x.__isNew = true;

        x.Approved = 0;
        x.Rejected = 0;
        x.ToApprove = 1;

        (aCfg02 || []).forEach(function (f) {
          if (!f || !f.ui || !f.multiple) return;
          var k = String(f.ui).trim();
          if (!k) return;
          x[k] = toArrayMulti(x[k]);
        });

        return x;
      });
    },

    /**
     * Verifica se le righe selezionate possono essere eliminate
     */
    canDeleteSelectedRows: function (aSel) {
      var aForbidden = (aSel || []).filter(function (r) {
        var st = String((r && (r.__status || r.Stato)) || "").trim().toUpperCase();
        return st === "AP" || st === "RJ" || st === "CH";
      });

      return {
        canDelete: aForbidden.length === 0,
        forbidden: aForbidden
      };
    },

    /**
     * Estrae gli idx da rimuovere dalle righe selezionate
     */
    getIdxToRemove: function (aSel) {
      return aSel
        .map(function (r) { return parseInt(r && r.idx, 10); })
        .filter(function (n) { return !isNaN(n) && n >= 0; });
    }

  };
});