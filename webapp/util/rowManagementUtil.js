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
    },
        onAddRow: function () {
      var oDetail = this._getODetail();
      if (!oDetail) return MessageToast.show("Model 'detail' non trovato");

      if (!oDetail.getProperty("/__canAddRow")) {
        MessageToast.show("Non hai permessi per aggiungere righe");
        return;
      }

      var oVm = this._getOVm();
      var sCacheKey = this._getExportCacheKey();

      var guidTpl = RowManagementUtil.pickTemplateGuidForNewParent({
        selectedObjects: this._getSelectedParentObjectsFromMdc(),
        oVm: oVm,
        cacheKey: sCacheKey,
        toStableString: this._toStableString.bind(this),
        rowGuidKey: this._rowGuidKey.bind(this),
        getCodAgg: this._getCodAgg.bind(this)
      });

      var aTplRows = RowManagementUtil.getTemplateRowsByGuid(guidTpl, {
        oVm: oVm,
        cacheKey: sCacheKey,
        rowGuidKey: this._rowGuidKey.bind(this),
        isBaseCodAgg: this._isBaseCodAgg.bind(this)
      });

      var tpl0 = aTplRows[0] || {};
      var aCfg01 = oDetail.getProperty("/_mmct/s01") || [];
      var aCfg02 = oDetail.getProperty("/_mmct/s02") || [];

      var result = RowManagementUtil.createNewParentRow({
        oDetail: oDetail,
        template: tpl0,
        cfg01: aCfg01,
        vendorId: this._sVendorId,
        material: this._sMaterial,
        normalizeVendor10: this._normalizeVendor10.bind(this),
        toArrayMulti: this._toArrayMulti.bind(this),
        statusText: this._statusText.bind(this),
        genGuidNew: this._genGuidNew.bind(this)
      });

      var oNewRow = result.row;
      var iNewIdx = result.idx;
      var sGuidNew = result.guid;

      var aNewDetails = RowManagementUtil.createNewDetailRows(aTplRows, {
        template: tpl0,
        cfg02: aCfg02,
        guid: sGuidNew,
        vendorId: this._sVendorId,
        material: this._sMaterial,
        cat: oDetail.getProperty("/_mmct/cat") || "",
        normalizeVendor10: this._normalizeVendor10.bind(this),
        toArrayMulti: this._toArrayMulti.bind(this)
      });

      // Update RecordsAll
      var aAll = (oDetail.getProperty("/RecordsAll") || []).slice();
      aAll.push(oNewRow);
      oDetail.setProperty("/RecordsAll", aAll);

      // Update cache
      var aRecsCache = (oVm.getProperty("/cache/recordsByKey/" + sCacheKey) || []).slice();
      aRecsCache.push(oNewRow);
      oVm.setProperty("/cache/recordsByKey/" + sCacheKey, aRecsCache);

      var aRowsCache = (oVm.getProperty("/cache/dataRowsByKey/" + sCacheKey) || []).slice();
      aRowsCache = aRowsCache.concat(aNewDetails);
      oVm.setProperty("/cache/dataRowsByKey/" + sCacheKey, aRowsCache);

      this._setSelectedParentForScreen4(oNewRow);
      this._ensureScreen4CacheForParentIdx(iNewIdx, sGuidNew);

      this._applyClientFilters();

      MessageToast.show("Riga aggiunta");
    },
        onDeleteRows: function () {
      var oDetail = this._getODetail();
      if (!oDetail) return MessageToast.show("Model 'detail' non trovato");

      var aSel = this._getSelectedParentObjectsFromMdc();
      if (!aSel.length) {
        return MessageToast.show("Seleziona almeno una riga da eliminare");
      }

      var checkResult = RowManagementUtil.canDeleteSelectedRows(aSel);
      if (!checkResult.canDelete) {
        MessageToast.show("Non puoi eliminare partita fornitore approvati");
        return;
      }

      var aIdxToRemove = RowManagementUtil.getIdxToRemove(aSel);
      if (!aIdxToRemove.length) return MessageToast.show("Nessun idx valido nelle righe selezionate");

      // Track deleted parents
      var aDeletedParents = oDetail.getProperty("/__deletedParents") || [];
      aSel.forEach(function (r) {
        var g = (r && (r.GUID || r.Guid || r.guidKey)) || "";
        if (g && String(g).indexOf("-new") < 0) aDeletedParents.push(r);
      });
      oDetail.setProperty("/__deletedParents", aDeletedParents);

      // Remove from RecordsAll
      var aAll = oDetail.getProperty("/RecordsAll") || [];
      var aRemaining = (aAll || []).filter(function (r) {
        var n = parseInt(r && r.idx, 10);
        return aIdxToRemove.indexOf(n) < 0;
      });
      oDetail.setProperty("/RecordsAll", aRemaining);

      // Update cache
      var oVm = this._getOVm();
      var sKeyCache = this._getExportCacheKey();

      var mDelPair = {}, mDelGuid = {};
      aSel.forEach(function (p) {
        var g = this._toStableString(p && (p.guidKey || p.GUID || p.Guid));
        var f = this._toStableString(p && p.Fibra);
        if (g && f) mDelPair[g + "||" + f] = true;
        else if (g) mDelGuid[g] = true;
      }.bind(this));

      var aRecsCache = oVm.getProperty("/cache/recordsByKey/" + sKeyCache) || [];
      oVm.setProperty("/cache/recordsByKey/" + sKeyCache, (aRecsCache || []).filter(function (r) {
        var n = parseInt(r && r.idx, 10);
        return aIdxToRemove.indexOf(n) < 0;
      }));

      var aRowsCacheBefore = oVm.getProperty("/cache/dataRowsByKey/" + sKeyCache) || [];
      aSel.forEach(function (p) {
        this._stashDeleteForPostFromCache(p, aRowsCacheBefore, oDetail);
      }.bind(this));

      var aRowsCache = oVm.getProperty("/cache/dataRowsByKey/" + sKeyCache) || [];
      oVm.setProperty("/cache/dataRowsByKey/" + sKeyCache, (aRowsCache || []).filter(function (r) {
        var g = this._rowGuidKey(r);
        var f = this._rowFibra(r);
        return !(mDelPair[g + "||" + f] || mDelGuid[g]);
      }.bind(this)));

      this._purgeScreen4CacheByParentIdx(aIdxToRemove);

      var oSel = this._getSelectedParentForScreen4();
      var iSelIdx = oSel ? parseInt(oSel.idx, 10) : NaN;
      if (!isNaN(iSelIdx) && aIdxToRemove.indexOf(iSelIdx) >= 0) {
        this._setSelectedParentForScreen4(null);
      }

      this._applyClientFilters();
      this._clearSelectionMdc();

      MessageToast.show("Righe eliminate");
    },

  };
});