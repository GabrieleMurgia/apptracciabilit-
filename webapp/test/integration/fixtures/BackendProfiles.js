sap.ui.define([], function () {
  "use strict";

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function buildMmctFields(sCat) {
    function row(sUiFieldname, sUiFieldLabel, sLivello, sSetting, iOrd, bSummary, iSummarySort, sTestata1, sTestata2) {
      return {
        CatMateriale: sCat,
        UiFieldname: sUiFieldname,
        UiFieldLabel: sUiFieldLabel,
        LivelloSchermata: sLivello,
        Testata1: sTestata1 || "",
        Testata2: sTestata2 || "",
        Impostazione: sSetting,
        Dominio: "",
        MultipleVal: "",
        Ordinamento: iOrd,
        InSummary: bSummary ? "X" : "",
        SummarySort: iSummarySort || 0
      };
    }

    return [
      row("Materiale", "Materiale", "00", "B", 1, true, 1, "X", ""),
      row("Collezione", "Collezione", "00", "B", 2, false, 0, "X", "X"),
      row("Linea", "Linea", "00", "B", 3, false, 0, "X", "X"),
      row("Plant", "Plant", "00", "B", 4, false, 0, "X", ""),
      row("MaterialeFornitore", "Materiale Fornitore", "01", "F", 10, true, 2),
      row("PartitaFornitore", "Partita Fornitore", "01", "F", 11, true, 3),
      row("NoteMateriale", "Note Materiale", "01", "F", 12, false, 0),
      row("Fibra", "Fibra", "02", "B", 20, true, 4),
      row("QtaFibra", "Qta Fibra", "02", "F", 21, false, 0),
      row("PartitaFornitore", "Partita Fornitore", "02", "F", 22, false, 0),
      row("Note", "Note", "02", "F", 23, false, 0)
    ];
  }

  function buildSupplierRealState() {
    var sUserId = "";
    var sVendor = "0000002056";
    var sVendorName = "CITY MODELES";
    var sCat = "CF";

    return {
      profileName: "supplier-real-e",
      source: "real-payload-derived",
      defaultUserId: sUserId,
      defaultVendor: sVendor,
      defaultVendorName: sVendorName,
      defaultMaterial: "N/R",
      defaultMaterialDescription: "NOT RELEVANT",
      defaultSeason: "46",
      defaultCat: sCat,
      templateBase64: "",
      userInfo: {
        UserID: sUserId,
        UserType: "E",
        UserDescription: "Supplier profile derived from realPayload.txt",
        UserInfosDomains: { results: [] },
        UserInfosVend: { results: [] },
        UserInfosMMCT: {
          results: [{
            UserID: sUserId,
            CatMateriale: sCat,
            CatMaterialeDesc: "Categoria CF",
            Dettaglio: "X",
            NoMatList: "X",
            UserMMCTFields: {
              results: buildMmctFields(sCat)
            }
          }]
        }
      },
      vendorRows: [{
        UserID: sUserId,
        Fornitore: sVendor,
        ReagSoc: sVendorName,
        CatMateriale: sCat,
        MatCatDesc: "Categoria CF",
        MatQty: 5,
        Open: "X",
        ToApprove: 1,
        Approved: 0,
        Rejected: 0,
        Modified: 0,
        ToUnlock: 0
      }],
      materialRows: [{
        UserID: sUserId,
        Fornitore: sVendor,
        Materiale: "N/R",
        Stagione: "46",
        CatMateriale: sCat,
        DescCatMateriale: "Categoria CF",
        DescMateriale: "NOT RELEVANT",
        MatStatus: "DMMY",
        Open: "X",
        Rejected: 0,
        ToApprove: 1,
        Approved: 0,
        Modified: 0
      }, {
        UserID: sUserId,
        Fornitore: sVendor,
        Materiale: "N/R",
        Stagione: "44",
        CatMateriale: sCat,
        DescCatMateriale: "Categoria CF",
        DescMateriale: "NOT RELEVANT",
        MatStatus: "DMMY",
        Open: "X",
        Rejected: 0,
        ToApprove: 1,
        Approved: 0,
        Modified: 0
      }],
      dataRows: [{
        UserID: sUserId,
        Fornitore: sVendor,
        RagSoc: sVendorName,
        Materiale: "IW20151LBB3",
        DescMat: "",
        Stagione: "46",
        CatMateriale: sCat,
        Collezione: "",
        Linea: "",
        Plant: "",
        Guid: "ZW7uaV37vR7hAAAACoUQxA==",
        Fibra: "LI",
        QtaFibra: "40.00",
        MaterialeFornitore: "FORN",
        PartitaFornitore: "AO2OKO",
        NoteMateriale: "",
        Note: "",
        Stato: "NW",
        Approved: 0,
        Rejected: 0,
        ToApprove: 1,
        Open: "X",
        OnlySaved: "",
        CodAgg: "N"
      }, {
        UserID: sUserId,
        Fornitore: sVendor,
        RagSoc: sVendorName,
        Materiale: "IW20151LBB3",
        DescMat: "",
        Stagione: "46",
        CatMateriale: sCat,
        Collezione: "",
        Linea: "",
        Plant: "",
        Guid: "ZW7uaV37vR7hAAAACoUQxA==",
        Fibra: "WV",
        QtaFibra: "60.00",
        MaterialeFornitore: "FORN",
        PartitaFornitore: "AO2OKO",
        NoteMateriale: "",
        Note: "",
        Stato: "NW",
        Approved: 0,
        Rejected: 0,
        ToApprove: 1,
        Open: "X",
        OnlySaved: "",
        CodAgg: "N"
      }, {
        UserID: sUserId,
        Fornitore: sVendor,
        RagSoc: sVendorName,
        Materiale: "IW2B0640SVS",
        DescMat: "",
        Stagione: "46",
        CatMateriale: sCat,
        Collezione: "",
        Linea: "",
        Plant: "",
        Guid: "vVfoafRjBifhAAAACoUQxA==",
        Fibra: "03",
        QtaFibra: "0.00",
        MaterialeFornitore: "DDD",
        PartitaFornitore: "",
        NoteMateriale: "",
        Note: "",
        Stato: "ST",
        Approved: 0,
        Rejected: 0,
        ToApprove: 1,
        Open: "X",
        OnlySaved: "",
        CodAgg: ""
      }],
      vendorBatchRows: [],
      excelMaterialRows: [{
        CatMateriale: sCat,
        MatCatDesc: "Categoria CF",
        Fornitore: sVendor,
        Materiale: "MATNEW01",
        DescMat: "Materiale nuovo da Excel",
        Stagione: "47",
        Collezione: "COL-2",
        Linea: "LINEA-2",
        Uscita: "U1",
        Fibra: "PA",
        QtaFibra: "100.000",
        UmFibra: "%",
        UdM: "PC",
        Plant: "5110",
        DestUso: "TEST",
        Famiglia: "FAM-1"
      }],
      screen34Posts: [],
      screen6Checks: [],
      screen6Posts: [],
      materialStatusUpdates: [],
      massMaterialStatusUpdates: []
    };
  }

  return {
    buildSupplierRealState: function () {
      return clone(buildSupplierRealState());
    }
  };
});
