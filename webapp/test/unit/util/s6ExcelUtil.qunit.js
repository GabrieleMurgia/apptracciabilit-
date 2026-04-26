/* global QUnit */
sap.ui.define([
  "apptracciabilita/apptracciabilita/util/s6ExcelUtil"
], function (S6ExcelUtil) {
  "use strict";

  QUnit.module("util/s6ExcelUtil");

  function getRawFields() {
    return [
      { UiFieldname: "Fornitore", UiFieldLabel: "Fornitore", Descrizione: "Vendor", Fieldname: "LIFNR" },
      { UiFieldname: "PaesePrAgg", UiFieldLabel: "Paese Produzione", Descrizione: "Production Country", Fieldname: "COUNTRY", MultipleVal: "X" },
      { UiFieldname: "Perccomp", UiFieldLabel: "Percentuale", Descrizione: "Percentage", Fieldname: "PERCCOMP" },
      { UiFieldname: "Certificato", UiFieldLabel: "Certificato", Descrizione: "Certificate", Fieldname: "CERT", Dominio: "DOM_CERT" },
      { UiFieldname: "CampoReq", UiFieldLabel: "Campo Richiesto", Descrizione: "Required Field", Fieldname: "REQ_FIELD", Impostazione: "O" }
    ];
  }

  QUnit.test("maps excel headers to MMCT fields and merges numbered multi-value columns", function (assert) {
    var aMapped = S6ExcelUtil.mapExcelToMmctFields([{
      Vendor: "0000123456",
      "Paese Produzione1": "IT",
      "Paese Produzione 2": "RO",
      Percentage: "12,5"
    }], "CAT-01", getRawFields());

    assert.strictEqual(aMapped.length, 1, "one row is mapped");
    assert.strictEqual(aMapped[0].Fornitore, "0000123456", "structural field is mapped");
    assert.strictEqual(aMapped[0].PaesePrAgg, "IT|RO", "numbered multi-value columns are merged");
    assert.strictEqual(aMapped[0].Perccomp, "12,5", "semantic field is mapped");
    assert.strictEqual(aMapped[0].CatMateriale, "CAT-01", "missing category is defaulted");
  });

  QUnit.test("builds category list with fallback MMCT descriptions", function (assert) {
    var aCatList = S6ExcelUtil.buildCategoryList({}, [
      { CatMateriale: "CAT-B", CatMaterialeDesc: "Beta" },
      { CatMateriale: "CAT-A", CatMaterialeDesc: "Alpha" },
      { CatMateriale: "CAT-A", CatMaterialeDesc: "Ignored duplicate" }
    ]);

    assert.deepEqual(aCatList, [
      { key: "CAT-A", text: "CAT-A – Alpha" },
      { key: "CAT-B", text: "CAT-B – Beta" }
    ], "category list is deduplicated and sorted");
  });

  QUnit.test("decorates uploaded rows for preview and later post", function (assert) {
    var aRows = S6ExcelUtil.decorateUploadedRows([{ Fornitore: "0001" }, { Fornitore: "0002" }], function () {
      return "GUID-STUB";
    });

    assert.strictEqual(aRows[0].__isNew, true, "rows are marked as new");
    assert.strictEqual(aRows[0].__readOnly, false, "rows stay editable in preview");
    assert.strictEqual(aRows[0].CodAgg, "I", "rows are tagged as insert");
    assert.strictEqual(aRows[0].Stato, "ST", "rows start in pending status");
    assert.strictEqual(aRows[1].idx, 1, "row indexes are assigned");
    assert.strictEqual(aRows[1].guidKey, "GUID-STUB", "guid generator is used");
  });

  QUnit.test("builds payload lines with allowed fields, numeric normalization and domain reverse lookup", function (assert) {
    var aPayload = S6ExcelUtil.buildPayloadLines([{
      CatMateriale: "CAT-01",
      Fornitore: "0000123456",
      PaesePrAgg: "IT|RO",
      Perccomp: "12,5",
      Certificato: "Global Recycled Standard",
      UnknownField: "SHOULD_BE_IGNORED"
    }], "CAT-01", {
      sUserId: "USER01",
      mMulti: { PaesePrAgg: true },
      aRawFields: getRawFields(),
      getDomainValues: function (sDom) {
        if (sDom !== "DOM_CERT") return [];
        return [{ key: "GRS", text: "Global Recycled Standard" }];
      }
    });

    assert.strictEqual(aPayload.length, 1, "one payload row is built");
    assert.strictEqual(aPayload[0].CodAgg, "I", "payload rows are tagged as insert");
    assert.strictEqual(aPayload[0].UserID, "USER01", "user id is propagated");
    assert.strictEqual(aPayload[0].Guid, "", "payload guid is blank before backend save");
    assert.strictEqual(aPayload[0].PaesePrAgg, "IT|RO", "multi-value field is preserved");
    assert.strictEqual(aPayload[0].Perccomp, "12.5", "numeric values are normalized");
    assert.strictEqual(aPayload[0].Certificato, "GRS", "domain labels are reverse-mapped to keys");
    assert.strictEqual(aPayload[0].UnknownField, undefined, "unknown fields are dropped");
  });

  QUnit.test("collects required fields and reports missing values per row", function (assert) {
    var aRequired = S6ExcelUtil.collectRequiredFields(getRawFields());
    var aErrors = S6ExcelUtil.findMissingRequiredPerRow([
      { CampoReq: "", Fornitore: "0001" },
      { CampoReq: "OK", Fornitore: "0002" }
    ], aRequired);

    assert.deepEqual(aRequired, [{ ui: "CampoReq", label: "Campo Richiesto" }], "required fields are collected from MMCT metadata");
    assert.deepEqual(aErrors, ["Riga 1: Campo Richiesto"], "missing required fields are reported by row");
  });

  QUnit.test("normalizes CHECK responses into preview state", function (assert) {
    var aRows = [{}, {}, {}, {}];
    var oState = S6ExcelUtil.applyCheckResponse(aRows, {
      PostDataCollection: {
        results: [
          { Esito: "S", Message: "OK" },
          { Esito: "W", Message: "Warn" },
          { Esito: "E", Message: "Error" },
          { Esito: "??", Message: "" }
        ]
      }
    });

    assert.deepEqual(oState, {
      errorCount: 2,
      checkPassed: false,
      checkDone: true
    }, "check state summary is returned");
    assert.strictEqual(aRows[0].__checkEsito, "OK", "success rows are normalized");
    assert.strictEqual(aRows[1].__checkEsito, "Attenzione", "warning rows are normalized");
    assert.strictEqual(aRows[2].__checkHasError, true, "error rows stay blocking");
    assert.strictEqual(aRows[3].__checkEsito, "??", "unknown esito is preserved as blocking state");
  });

  QUnit.test("builds preview config and filters rows without check errors", function (assert) {
    var oPreviewCfg = S6ExcelUtil.buildPreviewConfig(getRawFields());
    var aFiltered = S6ExcelUtil.filterRowsWithoutCheckErrors([
      { id: 1, __checkHasError: false },
      { id: 2, __checkHasError: true },
      { id: 3 }
    ]);

    assert.strictEqual(oPreviewCfg.cfgAll.length, 5, "preview config includes visible MMCT fields");
    assert.strictEqual(oPreviewCfg.props[0].name, "Fornitore", "preview props are built for MDC config");
    assert.deepEqual(aFiltered, [{ id: 1, __checkHasError: false }, { id: 3 }], "only valid rows are kept for posting");
  });
});
