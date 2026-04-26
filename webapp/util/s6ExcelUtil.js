/**
 * s6ExcelUtil.js — Pipeline Excel/MMCT per Screen6.
 *
 * Funzioni pure (senza dipendenze da view/controller) che coprono:
 *   - mapExcelToMmctFields: mappatura header Excel → UiFieldname MMCT
 *   - buildPayloadLines   : normalizzazione righe → payload OData (domini,
 *                           campi numerici, multi-value, whitelist)
 *   - collectRequiredFields / findMissingRequiredPerRow: validazione dei
 *                           campi obbligatori prima dell'invio.
 *
 * Il controller resta l'orchestratore (busy, MessageBox, OData I/O, bind UI).
 */
sap.ui.define([
  "apptracciabilita/apptracciabilita/util/normalize"
], function (N) {
  "use strict";

  // ──────────────────────────────────────────────────────────────────────
  // Costanti condivise
  // ──────────────────────────────────────────────────────────────────────

  var STRUCTURAL_LABEL_MAP = {
    "FORNITORE": "Fornitore", "VENDOR": "Fornitore", "LIFNR": "Fornitore",
    "MATERIALE": "Materiale", "MATERIAL": "Materiale", "MATNR": "Materiale",
    "STAGIONE": "Stagione", "SEASON": "Stagione",
    "CATMATERIALE": "CatMateriale", "CAT. MATERIALE": "CatMateriale", "CATEGORIA MATERIALE": "CatMateriale",
    "FIBRA": "Fibra", "FIBER": "Fibra",
    "COLLEZIONE": "Collezione", "COLLECTION": "Collezione",
    "USCITA": "Uscita",
    "LINEA": "Linea", "LINE": "Linea",
    "PLANT": "Plant", "STABILIMENTO": "Plant",
    "LOTTO FORNITORE": "PartitaFornitore", "VENDOR BATCH": "PartitaFornitore", "PARTITA FORNITORE": "PartitaFornitore",
    "LOTTO FORNITORE / COMMESSA": "PartitaFornitore"
  };

  var NUMERIC_FIELDS = [
    "Perccomp", "PerccompFibra", "PercMatRicicl", "PesoPack",
    "QtaFibra", "FattEmissione", "CalcCarbonFoot", "GradoRic"
  ];

  var STRUCTURAL_ALLOWED = [
    "CodAgg", "UserID", "Guid", "CatMateriale", "Fornitore", "Materiale",
    "Stagione", "Fibra", "Collezione", "Linea", "Uscita", "Plant",
    "PartitaFornitore", "Famiglia", "Stato", "Note", "UdM",
    "DescMat", "MatCatDesc", "DestUso", "QtaFibra", "UmFibra"
  ];

  function getNumericFieldNames() {
    return NUMERIC_FIELDS.slice();
  }

  // ──────────────────────────────────────────────────────────────────────
  // Screen6 UI-facing pure helpers
  // ──────────────────────────────────────────────────────────────────────

  function buildCategoryList(mCats, aMmct) {
    var aCatKeys = Object.keys(mCats || {});

    if (!aCatKeys.length) {
      var aSeen = {};
      (aMmct || []).forEach(function (cat) {
        var sCat = String(cat && (cat.CatMateriale || cat.CATMATERIALE || cat.Categoria || "") || "").trim();
        if (!sCat || aSeen[sCat]) return;
        aSeen[sCat] = true;
        aCatKeys.push(sCat);
      });
    }

    return aCatKeys.map(function (k) {
      var sDesc = "";
      (aMmct || []).some(function (cat) {
        var sCat = String(cat && (cat.CatMateriale || cat.CATMATERIALE || "") || "").trim();
        if (sCat !== k) return false;
        sDesc = String(cat.CatMaterialeDesc || cat.DescCatMateriale || cat.MatCatDesc || cat.Description || "").trim();
        return true;
      });
      return { key: k, text: sDesc ? (k + " – " + sDesc) : k };
    }).sort(function (a, b) {
      return a.text.localeCompare(b.text);
    });
  }

  function decorateUploadedRows(aRows, fnGenGuid) {
    var iNow = Date.now();
    return (aRows || []).map(function (r, i) {
      r.__readOnly = false;
      r.__isNew = true;
      r.CodAgg = "I";
      r.Stato = "ST";
      r.idx = i;
      r.guidKey = fnGenGuid ? fnGenGuid() : ("EXCEL-" + iNow + "-" + i);
      return r;
    });
  }

  function extractCheckResponseLines(oData) {
    if (oData && oData.PostDataCollection && oData.PostDataCollection.results) {
      return oData.PostDataCollection.results;
    }
    if (oData && oData.PostDataCollection && Array.isArray(oData.PostDataCollection)) {
      return oData.PostDataCollection;
    }
    return [];
  }

  function applyCheckResponse(aRows, oData) {
    var aRespLines = extractCheckResponseLines(oData);
    var iErrors = 0;

    (aRows || []).forEach(function (row, idx) {
      var oResp = aRespLines[idx] || {};
      var sEsito = String(oResp.Esito || oResp.esito || oResp.ESITO || "").trim().toUpperCase();
      var sMessage = String(oResp.Message || oResp.message || oResp.MESSAGE || oResp.Messaggio || "").trim();

      if (sEsito === "E" || sEsito === "ERROR" || sEsito === "KO") {
        row.__checkEsito = "Errore";
        row.__checkMessage = sMessage || "Errore";
        row.__checkHasError = true;
        iErrors++;
        return;
      }

      if (sEsito === "W" || sEsito === "WARNING") {
        row.__checkEsito = "Attenzione";
        row.__checkMessage = sMessage || "Attenzione";
        row.__checkHasError = false;
        return;
      }

      if (sEsito === "S" || sEsito === "OK" || sEsito === "SUCCESS" || sEsito === "") {
        row.__checkEsito = "OK";
        row.__checkMessage = sMessage || "OK";
        row.__checkHasError = false;
        return;
      }

      row.__checkEsito = sEsito || "Errore";
      row.__checkMessage = sMessage || "Esito sconosciuto: " + sEsito;
      row.__checkHasError = true;
      iErrors++;
    });

    return {
      errorCount: iErrors,
      checkPassed: iErrors === 0,
      checkDone: true
    };
  }

  function buildPreviewConfig(aRawFields) {
    var aNums = getNumericFieldNames();
    var mSeen = Object.create(null);
    var aCfgAll = [];

    (aRawFields || []).forEach(function (f) {
      var sUi = String(f.UiFieldname || f.UIFIELDNAME || "").trim();
      if (!sUi) return;

      var sKey = sUi.toUpperCase();
      if (mSeen[sKey]) return;
      mSeen[sKey] = true;

      var sImp = String(f.Impostazione || "").trim().toUpperCase();
      if (sImp === "N") return;

      aCfgAll.push({
        ui: sUi,
        label: String(f.UiFieldLabel || f.Descrizione || sUi).trim(),
        domain: String(f.Dominio || "").trim(),
        required: sImp === "O",
        locked: sImp === "B",
        attachment: sImp === "A",
        download: sImp === "D",
        multiple: String(f.MultipleVal || "").trim().toUpperCase() === "X",
        order: parseInt(String(f.Ordinamento || "9999").trim(), 10) || 9999,
        numeric: aNums.indexOf(sUi) >= 0
      });
    });

    aCfgAll.sort(function (a, b) {
      return (a.order || 9999) - (b.order || 9999);
    });

    return {
      cfgAll: aCfgAll,
      props: aCfgAll.map(function (f) {
        var sName = String(f.ui || "").trim();
        if (sName.toUpperCase() === "STATO") sName = "Stato";
        return {
          name: sName,
          label: f.label || sName,
          dataType: "String",
          domain: f.domain || "",
          required: !!f.required
        };
      })
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Excel → MMCT mapping
  // ──────────────────────────────────────────────────────────────────────

  function buildLabelToFieldMap(aRawFields) {
    var m = {};
    (aRawFields || []).forEach(function (f) {
      var sUi = String(f.UiFieldname || f.UIFIELDNAME || "").trim();
      if (!sUi) return;
      var sLabelIT = String(f.UiFieldLabel || "").trim();
      var sLabelEN = String(f.Descrizione || "").trim();
      var sFieldname = String(f.Fieldname || "").trim();
      if (sLabelIT) m[sLabelIT.toUpperCase()] = sUi;
      if (sLabelEN) m[sLabelEN.toUpperCase()] = sUi;
      if (sFieldname) m[sFieldname.toUpperCase()] = sUi;
      m[sUi.toUpperCase()] = sUi;
    });
    Object.keys(STRUCTURAL_LABEL_MAP).forEach(function (k) {
      if (!m[k]) m[k] = STRUCTURAL_LABEL_MAP[k];
    });
    return m;
  }

  function buildExcelColumnMap(aExcelHeaders, mLabelToField) {
    var mColMap = {};
    aExcelHeaders.forEach(function (h) {
      var sUpper = String(h || "").trim().toUpperCase();
      if (mLabelToField[sUpper]) {
        mColMap[h] = mLabelToField[sUpper];
        return;
      }
      var sMatch = Object.keys(mLabelToField).find(function (k) {
        return k.indexOf(sUpper) >= 0 || sUpper.indexOf(k) >= 0;
      });
      mColMap[h] = sMatch ? mLabelToField[sMatch] : h;
    });
    return mColMap;
  }

  function buildMultiFieldsLookup(aRawFields) {
    var m = {};
    (aRawFields || []).forEach(function (f) {
      if (String(f.MultipleVal || "").trim().toUpperCase() !== "X") return;
      var sUi = String(f.UiFieldname || f.UIFIELDNAME || "").trim();
      if (!sUi) return;
      m[sUi.toUpperCase()] = sUi;
      var sLabelIT = String(f.UiFieldLabel || "").trim();
      if (sLabelIT) m[sLabelIT.toUpperCase()] = sUi;
      var sLabelEN = String(f.Descrizione || "").trim();
      if (sLabelEN) m[sLabelEN.toUpperCase()] = sUi;
      var sFn = String(f.Fieldname || "").trim();
      if (sFn) m[sFn.toUpperCase()] = sUi;
    });
    return m;
  }

  // Pattern: header Excel = base + cifre finali → base matcha un campo multi-value.
  // Es. "Paese Cucitura1" / "Paese Cucitura 1" → base "Paese Cucitura" → target "PaesePrAgg".
  function buildMultiMergeGroups(aExcelHeaders, mMultiFields) {
    var mGroups = {};
    aExcelHeaders.forEach(function (h) {
      var match = String(h || "").trim().match(/^(.+?)\s*(\d+)$/);
      if (!match) return;
      var sBaseUpper = match[1].trim().toUpperCase();
      var sTarget = mMultiFields[sBaseUpper];
      if (!sTarget) return;
      if (!mGroups[sTarget]) mGroups[sTarget] = [];
      mGroups[sTarget].push(h);
    });
    Object.keys(mGroups).forEach(function (field) {
      mGroups[field].sort(function (a, b) {
        var nA = parseInt(a.match(/(\d+)$/)[1], 10);
        var nB = parseInt(b.match(/(\d+)$/)[1], 10);
        return nA - nB;
      });
    });
    return mGroups;
  }

  function mapExcelToMmctFields(aJsonRows, sCat, aRawFields) {
    if (!Array.isArray(aJsonRows) || !aJsonRows.length) return [];

    var mLabelToField = buildLabelToFieldMap(aRawFields);
    var aExcelHeaders = Object.keys(aJsonRows[0] || {});
    var mColMap = buildExcelColumnMap(aExcelHeaders, mLabelToField);
    var mMultiFields = buildMultiFieldsLookup(aRawFields);
    var mMergeGroups = buildMultiMergeGroups(aExcelHeaders, mMultiFields);

    return aJsonRows.map(function (row) {
      var oMapped = {};
      Object.keys(row).forEach(function (h) {
        oMapped[mColMap[h] || h] = row[h];
      });

      Object.keys(mMergeGroups).forEach(function (sTarget) {
        var aHeaders = mMergeGroups[sTarget];
        var aValues = [];
        aHeaders.forEach(function (h) {
          var v = String(row[h] != null ? row[h] : "").trim();
          if (v) aValues.push(v);
        });
        if (aValues.length) oMapped[sTarget] = aValues.join("|");
        aHeaders.forEach(function (h) {
          var sMappedKey = mColMap[h] || h;
          if (sMappedKey !== sTarget) delete oMapped[sMappedKey];
        });
      });

      if (!oMapped.CatMateriale) oMapped.CatMateriale = sCat;
      return oMapped;
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  // Payload builder
  // ──────────────────────────────────────────────────────────────────────

  function buildAllowedAndDomains(aRawFields) {
    var mAllowed = {};
    var mFieldDomain = {};
    (aRawFields || []).forEach(function (f) {
      var sUi = String(f.UiFieldname || f.UIFIELDNAME || "").trim();
      if (sUi) mAllowed[sUi] = true;
      var sFn = String(f.Fieldname || "").trim();
      if (sFn) mAllowed[sFn] = true;
      var sDom = String(f.Dominio || "").trim();
      if (sUi && sDom) mFieldDomain[sUi] = sDom;
    });
    STRUCTURAL_ALLOWED.forEach(function (k) { mAllowed[k] = true; });
    return { mAllowed: mAllowed, mFieldDomain: mFieldDomain };
  }

  function buildDomainReverseLookups(mFieldDomain, fnGetDomainValues) {
    var mDomainReverse = {};
    Object.keys(mFieldDomain).forEach(function (field) {
      var sDom = mFieldDomain[field];
      if (mDomainReverse[sDom]) return;
      var aDomValues = (typeof fnGetDomainValues === "function")
        ? fnGetDomainValues(sDom) || []
        : [];
      var mReverse = {};
      aDomValues.forEach(function (entry) {
        var sKey = String(entry.key || "").trim();
        var sText = String(entry.text || "").trim();
        if (sKey && sText) {
          mReverse[sText.toUpperCase()] = sKey;
          mReverse[sKey.toUpperCase()] = sKey;
        }
      });
      mDomainReverse[sDom] = mReverse;
    });
    return mDomainReverse;
  }

  function resolveDomainValue(sVal, mReverse) {
    if (!sVal || !mReverse) return sVal;
    var sUpper = String(sVal).trim().toUpperCase();
    return mReverse[sUpper] !== undefined ? mReverse[sUpper] : sVal;
  }

  /**
   * Costruisce le righe del payload OData a partire dalle righe Excel mappate.
   *
   * @param {Array}  aRows - righe mappate (output di mapExcelToMmctFields)
   * @param {string} sCat  - categoria materiale di default
   * @param {Object} opts  - { sUserId, mMulti, aRawFields, getDomainValues(sDom) }
   * @returns {Array} righe normalizzate pronte per PostDataCollection
   */
  function buildPayloadLines(aRows, sCat, opts) {
    opts = opts || {};
    var sUserId = opts.sUserId || "";
    var mMulti = opts.mMulti || {};
    var aRawFields = opts.aRawFields || [];
    var fnGetDomainValues = opts.getDomainValues;

    var ad = buildAllowedAndDomains(aRawFields);
    var mAllowed = ad.mAllowed;
    var mFieldDomain = ad.mFieldDomain;
    var mDomainReverse = buildDomainReverseLookups(mFieldDomain, fnGetDomainValues);

    var mNumeric = {};
    NUMERIC_FIELDS.forEach(function (k) { mNumeric[k] = true; });

    return (aRows || []).map(function (r) {
      var o = {};
      Object.keys(r).forEach(function (k) {
        if (!k || k.indexOf("__") === 0) return;
        if (k === "__metadata" || k === "AllData") return;
        if (k === "idx" || k === "guidKey" || k === "StatoText") return;
        if (!mAllowed[k]) return;

        var v = r[k];
        var sDomain = mFieldDomain[k];
        var mReverse = sDomain ? mDomainReverse[sDomain] : null;

        if (mMulti[k]) {
          var sRaw = N.normalizeMultiString
            ? N.normalizeMultiString(v, "|")
            : (Array.isArray(v) ? v.join("|") : String(v || ""));
          if (mReverse) {
            sRaw = String(sRaw).split("|").map(function (p) {
              return resolveDomainValue(p.trim(), mReverse);
            }).filter(Boolean).join("|");
          }
          v = sRaw;
        } else if (Array.isArray(v)) {
          v = v.join(";");
        } else if (mReverse) {
          v = resolveDomainValue(String(v != null ? v : ""), mReverse);
        }

        if (mNumeric[k]) {
          var sVal = String(v != null ? v : "").trim().replace(",", ".");
          var fNum = parseFloat(sVal);
          v = isNaN(fNum) ? "0" : String(fNum);
        }

        o[k] = (v === undefined ? "" : v);
      });

      o.CodAgg = "I";
      o.UserID = sUserId;
      o.Guid = "";
      if (!o.CatMateriale) o.CatMateriale = sCat;

      delete o.GUID;
      delete o.GuidKey;

      return o;
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  // Required-fields validation
  // ──────────────────────────────────────────────────────────────────────

  function collectRequiredFields(aRawFields) {
    var aRequired = [];
    (aRawFields || []).forEach(function (f) {
      if (String(f.Impostazione || "").trim().toUpperCase() !== "O") return;
      var sUi = String(f.UiFieldname || f.UIFIELDNAME || "").trim();
      if (!sUi) return;
      var sLabel = String(f.UiFieldLabel || f.Descrizione || sUi).trim();
      aRequired.push({ ui: sUi, label: sLabel });
    });
    return aRequired;
  }

  function findMissingRequiredPerRow(aRows, aRequired) {
    var aErrors = [];
    (aRows || []).forEach(function (row, idx) {
      var aMissing = [];
      (aRequired || []).forEach(function (req) {
        var v = row[req.ui];
        if (v == null || String(v).trim() === "") aMissing.push(req.label);
      });
      if (aMissing.length) aErrors.push("Riga " + (idx + 1) + ": " + aMissing.join(", "));
    });
    return aErrors;
  }

  function validateRequiredRows(aRows, aRawFields) {
    var aRequired = collectRequiredFields(aRawFields);
    var aErrors = findMissingRequiredPerRow(aRows, aRequired);
    return {
      required: aRequired,
      errors: aErrors,
      ok: aErrors.length === 0
    };
  }

  function filterRowsWithoutCheckErrors(aRows) {
    return (aRows || []).filter(function (r) {
      return !r.__checkHasError;
    });
  }

  return {
    buildCategoryList: buildCategoryList,
    decorateUploadedRows: decorateUploadedRows,
    mapExcelToMmctFields: mapExcelToMmctFields,
    buildPayloadLines: buildPayloadLines,
    applyCheckResponse: applyCheckResponse,
    buildPreviewConfig: buildPreviewConfig,
    collectRequiredFields: collectRequiredFields,
    findMissingRequiredPerRow: findMissingRequiredPerRow,
    validateRequiredRows: validateRequiredRows,
    filterRowsWithoutCheckErrors: filterRowsWithoutCheckErrors
  };
});
