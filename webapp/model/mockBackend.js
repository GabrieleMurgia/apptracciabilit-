/**
 * webapp/model/mockBackend.js
 * Mock “senza $metadata”: risponde alle oModel.read() usate nei tuoi controller.
 */

/* eslint-disable @sap/ui5-jsdocs/no-jsdoc */

sap.ui.define([
  "sap/ui/model/json/JSONModel"
], function (JSONModel) {
  "use strict";

  function asyncCall(fn) {
    setTimeout(fn, 80); // simula async
  }

  function pickFilters(aFilters) {
    // flattener “good enough” per sap.ui.model.Filter (anche MultiFilter)
    var out = [];

    function walk(f) {
      if (!f) return;
      if (Array.isArray(f)) { f.forEach(walk); return; }

      // MultiFilter: contiene aFilters
      if (f.aFilters && f.aFilters.length) { f.aFilters.forEach(walk); return; }

      // semplice
      out.push({
        path: f.sPath,
        op: f.sOperator,
        v1: f.oValue1
      });
    }

    walk(aFilters);
    return out;
  }

  function buildDb(userId) {
    var sUserId = userId || "E_ZEMAF";

    // Domini (per MultiComboBox)
    var domains = [
      {
        Domain: "ZDOM_COLOR",
        DomainsValues: { results: [{ Value: "RED" }, { Value: "BLUE" }, { Value: "GREEN" }] }
      },
      {
        Domain: "ZDOM_YN",
        DomainsValues: { results: [{ Value: "YES" }, { Value: "NO" }] }
      }
    ];

    // MMCT (config colonne dinamiche)
    var mmct = [
      {
        CatMateriale: "PLASTIC",
        UserMMCTFields: {
          results: [
            // Screen3 (01)
            { UiFieldname: "S3_COLOR", Descrizione: "Color", LivelloSchermata: "01", Dominio: "ZDOM_COLOR", Impostazione: "B" },
            { UiFieldname: "S3_NOTE",  Descrizione: "Note",  LivelloSchermata: "01", Dominio: "",          Impostazione: ""  },

            // Screen4 (02)
            { UiFieldname: "S4_CERT",  Descrizione: "Cert",  LivelloSchermata: "02", Dominio: "ZDOM_YN",    Impostazione: "B" },
            { UiFieldname: "S4_BATCH", Descrizione: "Batch", LivelloSchermata: "02", Dominio: "",          Impostazione: ""  }
          ]
        }
      }
    ];

    // Vendors per Screen1
    var vendors = [
      { Fornitore: "0000123456", ReagSoc: "ACME SPA",      Open: "X", ToApprove: 2, Rejected: 0, Approved: 0 },
      { Fornitore: "0000654321", ReagSoc: "BETA SRL",      Open: "",  ToApprove: 0, Rejected: 1, Approved: 0 }
    ];

    // Materials per Screen2 (per vendor)
    var materialsByVendor = {
      "0000123456": [
        { Materiale: "MAT-100", DescMateriale: "Bottle Cap", Open: "X", ToApprove: 1, Rejected: 0, Approved: 0 },
        { Materiale: "MAT-200", DescMateriale: "Label",      Open: "",  ToApprove: 0, Rejected: 0, Approved: 1 }
      ],
      "0000654321": [
        { Materiale: "MAT-300", DescMateriale: "Glue",       Open: "X", ToApprove: 0, Rejected: 1, Approved: 0 }
      ]
    };

    // DataSet per Screen3/4 (righe “dettaglio”)
    // NOTA: stesso Guid+Fibra => 1 record su Screen3, più righe su Screen4
    var dataRows = [
      // vendor 123456, material MAT-100
      {
        UserID: sUserId, Fornitore: "0000123456", Materiale: "MAT-100",
        CatMateriale: "PLASTIC",
        Guid: "GUID-AAA", Fibra: "01",
        Approved: 0,
        S3_COLOR: "RED",
        S3_NOTE: "group AAA-01",
        S4_CERT: "YES",
        S4_BATCH: "B001"
      },
      {
        UserID: sUserId, Fornitore: "0000123456", Materiale: "MAT-100",
        CatMateriale: "PLASTIC",
        Guid: "GUID-AAA", Fibra: "01",
        Approved: 0,
        S3_COLOR: "RED",
        S3_NOTE: "group AAA-01",
        S4_CERT: "NO",
        S4_BATCH: "B002"
      },
      {
        UserID: sUserId, Fornitore: "0000123456", Materiale: "MAT-100",
        CatMateriale: "PLASTIC",
        Guid: "GUID-BBB", Fibra: "02",
        Approved: 1, // questo renderà readOnly
        S3_COLOR: "BLUE",
        S3_NOTE: "group BBB-02",
        S4_CERT: "YES",
        S4_BATCH: "B010"
      },

      // vendor 123456, material MAT-200 (variante)
      {
        UserID: sUserId, Fornitore: "0000123456", Materiale: "MAT-200",
        CatMateriale: "PLASTIC",
        Guid: "GUID-CCC", Fibra: "01",
        Approved: 0,
        S3_COLOR: "GREEN",
        S3_NOTE: "group CCC-01",
        S4_CERT: "YES",
        S4_BATCH: "B900"
      }
    ];

    return {
      userInfos: {
        UserID: sUserId,
        UserType: "E",
        UserDescription: "MOCK USER " + sUserId,
        UserInfosDomains: { results: domains },
        UserInfosMMCT: { results: mmct },
        UserInfosVend: { results: vendors }
      },
      materialsByVendor: materialsByVendor,
      dataRows: dataRows
    };
  }

  var MockODataModel = JSONModel.extend("apptracciabilita.apptracciabilita.model.MockODataModel", {
    constructor: function (mOpts) {
      JSONModel.call(this, {});
      this.__isMock = true;
      this._opts = mOpts || {};
      this._db = buildDb(this._opts.userId || "E_ZEMAF");
      this.setSizeLimit(1000);
    },

    read: function (sPath, mParams) {
      mParams = mParams || {};
      var that = this;

      function ok(data) {
        asyncCall(function () {
          if (typeof mParams.success === "function") {
            mParams.success(data, { statusCode: 200 });
          }
        });
      }

      function fail(code, msg) {
        asyncCall(function () {
          if (typeof mParams.error === "function") {
            mParams.error({
              statusCode: code || 500,
              message: msg || "Mock error",
              responseText: msg || "Mock error"
            });
          }
        });
      }

      // -------- UserInfosSet('X') --------
      var m = String(sPath || "").match(/^\/UserInfosSet\('([^']+)'\)\s*$/);
      if (m) {
        var userId = decodeURIComponent(m[1] || "");
        // rigenera db per user richiesto
        that._db = buildDb(userId || (that._opts.userId || "E_ZEMAF"));
        return ok(that._db.userInfos);
      }

      // -------- MaterialDataSet --------
      if (sPath === "/MaterialDataSet") {
        var flat = pickFilters(mParams.filters);
        var vendor = "";
        var uid = "";

        flat.forEach(function (f) {
          if (f.path === "Fornitore" && f.op === "EQ") vendor = String(f.v1 || "");
          if (f.path === "UserID" && f.op === "EQ") uid = String(f.v1 || "");
        });

        // se non passa uid, usa quello del db
        if (!uid) uid = that._db.userInfos.UserID;

        var arr = (that._db.materialsByVendor[vendor] || []).map(function (x) {
          return {
            UserID: uid,
            Fornitore: vendor,
            Materiale: x.Materiale,
            DescMateriale: x.DescMateriale,
            Open: x.Open,
            Rejected: x.Rejected,
            ToApprove: x.ToApprove,
            Approved: x.Approved
          };
        });

        return ok({ results: arr });
      }

      // -------- DataSet --------
      if (sPath === "/DataSet") {
        var flat2 = pickFilters(mParams.filters);
        var vendor2 = "";
        var uid2 = "";
        var matSet = {};

        flat2.forEach(function (f) {
          if (f.path === "Fornitore" && f.op === "EQ") vendor2 = String(f.v1 || "");
          if (f.path === "UserID" && f.op === "EQ") uid2 = String(f.v1 || "");
          if (f.path === "Materiale" && f.op === "EQ") matSet[String(f.v1 || "").toUpperCase()] = true;
        });

        if (!uid2) uid2 = that._db.userInfos.UserID;

        var hasMatFilter = Object.keys(matSet).length > 0;

        var rows = (that._db.dataRows || []).filter(function (r) {
          if (vendor2 && String(r.Fornitore) !== vendor2) return false;
          if (uid2 && String(r.UserID) !== uid2) return false;
          if (hasMatFilter) {
            return !!matSet[String(r.Materiale || "").toUpperCase()];
          }
          return true;
        });

        return ok({ results: rows });
      }

      return fail(404, "MockBackend: path non gestito: " + sPath);
    }
  });

  return {
    createMockODataModel: function (mOpts) {
      return new MockODataModel(mOpts || {});
    }
  };
});
