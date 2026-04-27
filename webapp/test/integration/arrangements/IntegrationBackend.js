sap.ui.define([
  "sap/ui/core/Component",
  "./IntegrationODataModel",
  "../fixtures/Screen6UploadFixture",
  "../fixtures/BackendProfiles"
], function (Component, IntegrationODataModel, Screen6UploadFixture, BackendProfiles) {
  "use strict";

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  var TRANSPARENT_GIF =
    "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=";

  function buildMmctFields() {
    return [
      {
        UiFieldname: "Materiale",
        UiFieldLabel: "Materiale",
        LivelloSchermata: "00",
        Testata1: "X",
        Testata2: "",
        Impostazione: "B",
        Dominio: "",
        MultipleVal: "",
        Ordinamento: 1,
        InSummary: "X",
        SummarySort: 1
      },
      {
        UiFieldname: "Collezione",
        UiFieldLabel: "Collezione",
        LivelloSchermata: "00",
        Testata1: "X",
        Testata2: "X",
        Impostazione: "B",
        Dominio: "",
        MultipleVal: "",
        Ordinamento: 2,
        InSummary: "",
        SummarySort: 0
      },
      {
        UiFieldname: "Linea",
        UiFieldLabel: "Linea",
        LivelloSchermata: "00",
        Testata1: "X",
        Testata2: "X",
        Impostazione: "B",
        Dominio: "",
        MultipleVal: "",
        Ordinamento: 3,
        InSummary: "",
        SummarySort: 0
      },
      {
        UiFieldname: "Plant",
        UiFieldLabel: "Plant",
        LivelloSchermata: "00",
        Testata1: "X",
        Testata2: "",
        Impostazione: "B",
        Dominio: "",
        MultipleVal: "",
        Ordinamento: 4,
        InSummary: "",
        SummarySort: 0
      },
      {
        UiFieldname: "MaterialeFornitore",
        UiFieldLabel: "Materiale Fornitore",
        LivelloSchermata: "01",
        Testata1: "",
        Testata2: "",
        Impostazione: "F",
        Dominio: "",
        MultipleVal: "",
        Ordinamento: 10,
        InSummary: "X",
        SummarySort: 2
      },
      {
        UiFieldname: "PartitaFornitore",
        UiFieldLabel: "Partita Fornitore",
        LivelloSchermata: "01",
        Testata1: "",
        Testata2: "",
        Impostazione: "F",
        Dominio: "",
        MultipleVal: "",
        Ordinamento: 11,
        InSummary: "X",
        SummarySort: 3
      },
      {
        UiFieldname: "NoteMateriale",
        UiFieldLabel: "Note Materiale",
        LivelloSchermata: "01",
        Testata1: "",
        Testata2: "",
        Impostazione: "F",
        Dominio: "",
        MultipleVal: "",
        Ordinamento: 12,
        InSummary: "",
        SummarySort: 0
      },
      {
        UiFieldname: "Fibra",
        UiFieldLabel: "Fibra",
        LivelloSchermata: "02",
        Testata1: "",
        Testata2: "",
        Impostazione: "B",
        Dominio: "",
        MultipleVal: "",
        Ordinamento: 20,
        InSummary: "X",
        SummarySort: 4
      },
      {
        UiFieldname: "QtaFibra",
        UiFieldLabel: "Qtà Fibra",
        LivelloSchermata: "02",
        Testata1: "",
        Testata2: "",
        Impostazione: "F",
        Dominio: "",
        MultipleVal: "",
        Ordinamento: 21,
        InSummary: "",
        SummarySort: 0
      },
      {
        UiFieldname: "PartitaFornitore",
        UiFieldLabel: "Partita Fornitore",
        LivelloSchermata: "02",
        Testata1: "",
        Testata2: "",
        Impostazione: "F",
        Dominio: "",
        MultipleVal: "",
        Ordinamento: 22,
        InSummary: "",
        SummarySort: 0
      },
      {
        UiFieldname: "Note",
        UiFieldLabel: "Note",
        LivelloSchermata: "02",
        Testata1: "",
        Testata2: "",
        Impostazione: "F",
        Dominio: "",
        MultipleVal: "",
        Ordinamento: 23,
        InSummary: "",
        SummarySort: 0
      }
    ];
  }

  function buildInitialState() {
    var sUserId = "";
    var sVendor = "0000001111";
    var sMaterial = "MAT001";
    var sSeason = "46";
    var sCat = "CF";
    var sVendorName = "Integration Vendor";
    var sMaterialDesc = "Mock material integration";
    var aMmctFields = buildMmctFields();

    return {
      defaultUserId: sUserId,
      defaultVendor: sVendor,
      defaultVendorName: sVendorName,
      defaultMaterial: sMaterial,
      defaultMaterialDescription: sMaterialDesc,
      defaultSeason: sSeason,
      defaultCat: sCat,
      templateBase64: Screen6UploadFixture.base64 || "",
      userInfo: {
        UserID: sUserId,
        UserType: "I",
        UserDescription: "Integration Tester",
        UserInfosDomains: { results: [] },
        UserInfosVend: {
          results: [{
            UserID: sUserId,
            Fornitore: sVendor,
            ReagSoc: sVendorName,
            Open: "X",
            ToUnlock: 1,
            Rejected: 0,
            Modified: 0,
            ToApprove: 1,
            Approved: 0,
            CatMateriale: sCat,
            MatCatDesc: "Categoria CF"
          }]
        },
        UserInfosMMCT: {
          results: [{
            UserID: sUserId,
            CatMateriale: sCat,
            CatMaterialeDesc: "Categoria CF",
            Dettaglio: "X",
            NoMatList: "",
            UserMMCTFields: {
              results: clone(aMmctFields)
            }
          }]
        }
      },
      vendorRows: [{
        UserID: sUserId,
        Fornitore: sVendor,
        ReagSoc: sVendorName,
        Open: "X",
        ToUnlock: 1,
        Rejected: 0,
        Modified: 0,
        ToApprove: 1,
        Approved: 0,
        CatMateriale: sCat,
        MatCatDesc: "Categoria CF"
      }],
      materialRows: [{
        UserID: sUserId,
        Fornitore: sVendor,
        Materiale: sMaterial,
        Stagione: sSeason,
        CatMateriale: sCat,
        DescCatMateriale: "Categoria CF",
        DescMateriale: sMaterialDesc,
        MatStatus: "LOCK",
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
        Materiale: sMaterial,
        DescMat: sMaterialDesc,
        Stagione: sSeason,
        CatMateriale: sCat,
        Collezione: "COL-1",
        Linea: "LINEA-1",
        Plant: "5110",
        Guid: "GUID-001",
        Fibra: "CO",
        QtaFibra: "60.000",
        MaterialeFornitore: "VEN-MAT-001",
        PartitaFornitore: "BATCH-CO",
        NoteMateriale: "Parent note",
        Note: "Detail note CO",
        Stato: "ST",
        Approved: 0,
        Rejected: 0,
        ToApprove: 1,
        Open: "X",
        OnlySaved: "X",
        CodAgg: ""
      }, {
        UserID: sUserId,
        Fornitore: sVendor,
        RagSoc: sVendorName,
        Materiale: sMaterial,
        DescMat: sMaterialDesc,
        Stagione: sSeason,
        CatMateriale: sCat,
        Collezione: "COL-1",
        Linea: "LINEA-1",
        Plant: "5110",
        Guid: "GUID-001",
        Fibra: "EA",
        QtaFibra: "40.000",
        MaterialeFornitore: "VEN-MAT-001",
        PartitaFornitore: "BATCH-EA",
        NoteMateriale: "Parent note",
        Note: "Detail note EA",
        Stato: "ST",
        Approved: 0,
        Rejected: 0,
        ToApprove: 1,
        Open: "X",
        OnlySaved: "X",
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

  var oApi = {
    _state: null,
    _originalGetModel: null,
    _profileName: "valentino-synthetic-i",

    install: function (vOptions) {
      var oOptions = (typeof vOptions === "string") ? { profile: vOptions } : (vOptions || {});
      var sProfile = String(oOptions.profile || "valentino-synthetic-i");
      var oState;

      if (sProfile === "supplier-real-e") {
        oState = BackendProfiles.buildSupplierRealState();
      } else {
        oState = buildInitialState();
        if (sProfile === "superuser-synthetic-s") {
          oState.userInfo.UserType = "S";
          oState.userInfo.UserDescription = "Synthetic Superuser";
        } else {
          sProfile = "valentino-synthetic-i";
          oState.userInfo.UserType = "I";
          oState.userInfo.UserDescription = "Integration Tester";
        }
        oState.profileName = sProfile;
        oState.source = "synthetic-integration";
      }

      oApi._state = oState;
      oApi._profileName = sProfile;
      oApi._installComponentGetModelPatch();
      window.__vendTraceIntegrationBackend = oApi;
      return oApi;
    },

    uninstall: function () {
      oApi._restoreComponentGetModelPatch();
      delete window.__vendTraceIntegrationBackend;
      oApi._state = null;
      oApi._profileName = "valentino-synthetic-i";
    },

    createModel: function () {
      if (!oApi._state) oApi.install();
      var oModel = new IntegrationODataModel(oApi._state);
      oModel.__vendTraceIntegrationModel = true;
      return oModel;
    },

    getStateSnapshot: function () {
      return clone(oApi._state || {});
    },

    setTemplateBase64: function (sBase64) {
      if (!oApi._state) oApi.install();
      oApi._state.templateBase64 = String(sBase64 || "");
    },

    getLogoSrc: function () {
      return TRANSPARENT_GIF;
    },

    _installComponentGetModelPatch: function () {
      if (oApi._originalGetModel) return;
      oApi._originalGetModel = Component.prototype.getModel;
      Component.prototype.getModel = function (sName) {
        var oOriginal = oApi._originalGetModel;
        if (sName !== undefined && sName !== null && sName !== "") {
          return oOriginal.apply(this, arguments);
        }

        if (!window.__vendTraceIntegrationBackend) {
          return oOriginal.apply(this, arguments);
        }

        if (this.__vendTraceIntegrationModel && this.__vendTraceIntegrationModel.__vendTraceIntegrationModel) {
          return this.__vendTraceIntegrationModel;
        }

        var oExisting = oOriginal.apply(this, arguments);
        if (oExisting && oExisting.__vendTraceIntegrationModel) {
          this.__vendTraceIntegrationModel = oExisting;
          return oExisting;
        }

        this.__vendTraceIntegrationModel = window.__vendTraceIntegrationBackend.createModel({
          component: this
        });
        return this.__vendTraceIntegrationModel;
      };
    },

    _restoreComponentGetModelPatch: function () {
      if (!oApi._originalGetModel) return;
      Component.prototype.getModel = oApi._originalGetModel;
      oApi._originalGetModel = null;
    }
  };

  return oApi;
});
