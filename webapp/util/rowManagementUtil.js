/**
 * rowManagementUtil.js — Pure utility functions for row management.
 *
 * REFACTORED:
 * - Uses normalize.js as single source of truth
 * - Removed onAddRow / onDeleteRows (controller methods using `this`)
 */
sap.ui.define([
  "sap/m/MessageToast",
  "apptracciabilita/apptracciabilita/util/normalize"
], function (MessageToast, N) {
  "use strict";

  return {

    /**
     * Trova il GUID del template da usare per una nuova riga parent
     */
    pickTemplateGuidForNewParent: function (opts) {
      var aSel = opts.selectedObjects || [];
      var oVm = opts.oVm;
      var cacheKey = opts.cacheKey;
      var toStableString = opts.toStableString || N.toStableString;
      var rowGuidKey = opts.rowGuidKey || N.rowGuidKey;
      var getCodAgg = opts.getCodAgg || N.getCodAgg;

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
      var rowGuidKey = opts.rowGuidKey || N.rowGuidKey;
      var isBaseCodAgg = opts.isBaseCodAgg || N.isBaseCodAgg;

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
/*     cloneLockedFields: function (src, aCfg, toArrayMulti) {
      src = src || {};
      toArrayMulti = toArrayMulti || N.toArrayMulti;
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
    }, */

        cloneLockedFields: function (src, aCfg, toArrayMulti) {
      src = src || {};
      var out = {};

      (aCfg || []).forEach(function (f) {
        if (!f || !f.ui) return;
        var k = String(f.ui).trim();
        if (!k) return;
        if (k.toUpperCase() === "STATO") k = "Stato";

        if (f.locked) {
          // Locked field: copy from source template
          var v = src[k];
          if (f.multiple) out[k] = toArrayMulti(v);
          else out[k] = (v == null ? "" : v);
        } else {
          // Not locked: use empty default
          out[k] = f.multiple ? [] : "";
        }
      });

      return out;
    },

//V <- old
    /**
     * Clona i campi configurati di s01 per una nuova riga parent.
     * Copia tutti i valori dal template TRANNE:
     *   - campi attachment (resettati a "0")
     *   - campi esclusi (PartitaFornitore, ...) che restano vuoti
     *
     * Usare questa funzione invece di cloneLockedFields quando si crea un
     * nuovo parent, per permettere l'ereditarietà dei campi dominio
     * (es. Fibra e QtaFibra sui pellami) senza trascinarsi contatori
     * allegati o partite fornitore della riga sorgente.
     */
/*     cloneFieldsForNewParent: function (src, aCfg, toArrayMulti) {
      src = src || {};
      var out = {};
      var aExcluded = ["PartitaFornitore"];

      (aCfg || []).forEach(function (f) {
        if (!f || !f.ui) return;
        var k = String(f.ui).trim();
        if (!k) return;
        if (k.toUpperCase() === "STATO") k = "Stato";

        // Attachment fields: reset counter to "0"
        if (f.attachment) {
          out[k] = "0";
          return;
        }

        // Excluded fields: always empty on new row
        if (aExcluded.indexOf(k) >= 0) {
          out[k] = f.multiple ? [] : "";
          return;
        }

        // Otherwise: inherit from template
        var v = src[k];
        if (f.multiple) out[k] = toArrayMulti(v);
        else out[k] = (v == null ? "" : v);
      });

      return out;
    }, */
    /**
     * Clona i campi configurati di s01 per una nuova riga parent.
     *
     * Comportamento:
     *   - Attachment fields  → "0" (contatori azzerati)
     *   - Locked fields (B)  → ereditati dal template
     *   - Tutti gli altri    → vuoti (sono dati specifici della partita,
     *                          NON vanno ereditati: PartitaFornitore,
     *                          FattEmissione, CalcCarbonFoot, certificazioni,
     *                          note, percentuali, ecc.)
     *
     * NOTA: i campi strutturali identificativi del materiale (Stagione, Plant,
     * Famiglia, DescMat, Fibra, QtaFibra, ecc.) vengono copiati separatamente
     * da createNewParentRow tramite override esplicito, perché non sempre
     * sono presenti in aCfg01.
     */
    cloneFieldsForNewParent: function (src, aCfg, toArrayMulti) {
      src = src || {};
      toArrayMulti = toArrayMulti || N.toArrayMulti;
      var out = {};

      (aCfg || []).forEach(function (f) {
        if (!f || !f.ui) return;
        var k = String(f.ui).trim();
        if (!k) return;
        if (k.toUpperCase() === "STATO") k = "Stato";

        // Attachment fields: reset counter to "0"
        if (f.attachment) {
          out[k] = "0";
          return;
        }

        // Locked fields (Impostazione = "B"): inherit from template
        if (f.locked) {
          var v = src[k];
          if (f.multiple) out[k] = toArrayMulti(v);
          else out[k] = (v == null ? "" : v);
          return;
        }

        // All other fields: empty (data specific to the partita)
        out[k] = f.multiple ? [] : "";
      });

      return out;
    },
    
    
    /**
     * Crea una nuova riga parent
     */
/**
     * Crea una nuova riga parent
     */
    createNewParentRow: function (opts) {
      var oDetail = opts.oDetail;
      var tpl0 = opts.template;
      var aCfg01 = opts.cfg01;
      var sVendorId = opts.vendorId;
      var sMaterial = opts.material;
      var normalizeVendor10 = opts.normalizeVendor10 || N.normalizeVendor10;
      var toArrayMulti = opts.toArrayMulti || N.toArrayMulti;
      var statusTextFn = opts.statusText || N.statusText;
      var genGuidNew = opts.genGuidNew || N.genGuidNew;

      var aAll = oDetail.getProperty("/RecordsAll") || [];

      var iMax = -1;
      (aAll || []).forEach(function (r) {
        var n = parseInt((r && r.idx) != null ? r.idx : -1, 10);
        if (!isNaN(n) && n > iMax) iMax = n;
      });
      var iNewIdx = iMax + 1;

      var sGuidNew = genGuidNew();

      // Use cloneFieldsForNewParent so that locked s01 fields are inherited
      // from the template, while attachments are reset and partita-specific
      // data (FattEmissione, CalcCarbonFoot, etc.) are blanked.
      var oParentFields = this.cloneFieldsForNewParent(tpl0, aCfg01, toArrayMulti);

      var oNewRow = N.deepClone(Object.assign({}, oParentFields, {
        idx: iNewIdx,

        GUID: sGuidNew,
        Guid: sGuidNew,
        guidKey: sGuidNew,

        // ── Structural identifiers always inherited from template ──
        // These fields identify the material itself and are constant across
        // all partite. They MUST be inherited regardless of MMCT config,
        // otherwise the new record would be saved with empty Plant/Stagione
        // and would disappear from Screen3 list (which filters by Plant).
        CatMateriale: tpl0.CatMateriale || oDetail.getProperty("/_mmct/cat") || "",
        Fornitore: tpl0.Fornitore || normalizeVendor10(sVendorId),
        Materiale: tpl0.Materiale || String(sMaterial || "").trim(),
        Stagione: tpl0.Stagione || tpl0.STAGIONE || "",
        Plant: tpl0.Plant || tpl0.PLANT || tpl0.WERKS || "",
        Famiglia: tpl0.Famiglia || tpl0.FAMIGLIA || "",
        DescMat: tpl0.DescMat || tpl0.DESC_MAT || "",
        MatCatDesc: tpl0.MatCatDesc || tpl0.MAT_CAT_DESC || "",
        MaterialeFornitore: tpl0.MaterialeFornitore || "",
        // Pellami-specific structural fields (kept here so packaging won't
        // show them but pellami inherits them correctly)
        Fibra: tpl0.Fibra || tpl0.FIBRA || "",
        QtaFibra: tpl0.QtaFibra || tpl0.QTA_FIBRA || "",
/*         UmFibra: tpl0.UmFibra || tpl0.UM_FIBRA || "",
        UdM: tpl0.UdM || tpl0.UDM || "",
        DestUso: tpl0.DestUso || tpl0.DEST_USO || "", */

        CodAgg: "I",

        Stato: "ST",
        StatoText: statusTextFn("ST"),
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
/*     createNewDetailRows: function (aTplRows, opts) {
      var tpl0 = opts.template;
      var aCfg02 = opts.cfg02;
      var sGuidNew = opts.guid;
      var sVendorId = opts.vendorId;
      var sMaterial = opts.material;
      var sCat = opts.cat;
      var normalizeVendor10 = opts.normalizeVendor10 || N.normalizeVendor10;
      var toArrayMulti = opts.toArrayMulti || N.toArrayMulti;

      var self = this;

      return (aTplRows && aTplRows.length ? aTplRows : [tpl0]).map(function (src) {
        var oLockedDet = self.cloneLockedFields(src, aCfg02, toArrayMulti);

        var x = N.deepClone(src);
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
 */
    
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
      var normalizeVendor10 = opts.normalizeVendor10 || N.normalizeVendor10;
      var toArrayMulti = opts.toArrayMulti || N.toArrayMulti;

      var self = this;

      return (aTplRows && aTplRows.length ? aTplRows : [tpl0]).map(function (src) {
        var oLockedDet = self.cloneLockedFields(src, aCfg02, toArrayMulti);

        // Start from empty object — do NOT deepClone src, or we'd inherit
        // attachment counters, component data, and other partita-specific
        // fields from the template.
        var x = {};
        Object.assign(x, oLockedDet);

        // Fibra: preserve only if present on source (pellami-specific)
        var fibraSrc = (src.Fibra != null ? src.Fibra : src.FIBRA);
        if (fibraSrc != null && String(fibraSrc).trim() !== "") {
          x.Fibra = fibraSrc;
        }

        x.Guid = sGuidNew;
        x.GUID = sGuidNew;
        x.guidKey = sGuidNew;

        // ── Structural identifiers always inherited from src/template ──
        // These fields identify the material and must NEVER be empty,
        // otherwise the record would disappear from Screen3 list filters.
        x.Fornitore = normalizeVendor10(sVendorId);
        x.Materiale = String(sMaterial || "").trim();
        x.CatMateriale = src.CatMateriale || tpl0.CatMateriale || sCat || "";
        x.Stagione = src.Stagione || tpl0.Stagione || src.STAGIONE || tpl0.STAGIONE || "";
        x.Plant = src.Plant || tpl0.Plant || src.WERKS || tpl0.WERKS || "";
        x.Famiglia = src.Famiglia || tpl0.Famiglia || "";
        x.DescMat = src.DescMat || tpl0.DescMat || "";
        x.MatCatDesc = src.MatCatDesc || tpl0.MatCatDesc || "";
        x.MaterialeFornitore = src.MaterialeFornitore || tpl0.MaterialeFornitore || "";
        // Pellami-specific structural fields
        if (src.QtaFibra || tpl0.QtaFibra) {
          x.QtaFibra = src.QtaFibra || tpl0.QtaFibra || "";
        }
/*         if (src.UmFibra || tpl0.UmFibra) {
          x.UmFibra = src.UmFibra || tpl0.UmFibra || "";
        }
        if (src.UdM || tpl0.UdM) {
          x.UdM = src.UdM || tpl0.UdM || "";
        }
        if (src.DestUso || tpl0.DestUso) {
          x.DestUso = src.DestUso || tpl0.DestUso || "";
        } */

        x.CodAgg = "I";
        x.Stato = "ST";
        x.__status = "ST";
        x.__readOnly = false;
        x.__localId = "NEW_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
        x.__isNew = true;

        x.Approved = 0;
        x.Rejected = 0;
        x.ToApprove = 1;

        // Initialize multi-value fields as empty arrays
        (aCfg02 || []).forEach(function (f) {
          if (!f || !f.ui) return;
          var k = String(f.ui).trim();
          if (!k) return;
          if (k.toUpperCase() === "STATO") return;
          if (x[k] === undefined) {
            x[k] = f.multiple ? [] : "";
          }
          if (f.multiple && !Array.isArray(x[k])) {
            x[k] = toArrayMulti(x[k]);
          }
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
        return st === "AP" /* || st === "RJ" || st === "CH"; */;
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