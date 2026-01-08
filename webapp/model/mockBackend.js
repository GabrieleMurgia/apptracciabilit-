sap.ui.define([
  "sap/ui/model/json/JSONModel"
], function (JSONModel) {
  "use strict";

  function _nowIso() { return new Date().toISOString(); }
  function _delay(fn) { setTimeout(fn, 150); }

  function _normalize10(v) {
    v = String(v || "").trim();
    if (/^\d+$/.test(v) && v.length < 10) return v.padStart(10, "0");
    return v;
  }

  // Estrae EQ da sap.ui.model.Filter in modo "tollerante"
  function _extractEqFilters(aFilters) {
    var out = { UserID: null, Fornitore: null, Materiale: [] };

    function walk(f) {
      if (!f) return;

      // OR group: new Filter({filters:[...], and:false})
      if (Array.isArray(f.aFilters) && f.aFilters.length) {
        f.aFilters.forEach(walk);
        return;
      }

      // "normale" Filter
      var path = f.sPath || f.path || f._sPath;
      var op = f.sOperator || f.operator || f._sOperator;
      var v1 = (f.oValue1 !== undefined) ? f.oValue1 : (f.value1 !== undefined ? f.value1 : f._oValue1);

      path = String(path || "").trim();
      op = String(op || "").toUpperCase();

      if (op !== "EQ") return;

      if (path === "UserID") out.UserID = String(v1 || "");
      if (path === "Fornitore") out.Fornitore = _normalize10(v1);
      if (path === "Materiale") out.Materiale.push(String(v1 || "").trim().toUpperCase());
    }

    (aFilters || []).forEach(walk);
    // uniq
    out.Materiale = Array.from(new Set(out.Materiale.filter(Boolean)));
    return out;
  }

  function _buildMockUserInfos(userId) {
    // Domini -> valori (per MultiComboBox)
    var aDomains = [
      {
        Domain: "S01_COLOR",
        DomainsValues: { results: [{ Value: "RED" }, { Value: "BLUE" }, { Value: "GREEN" }] }
      },
      {
        Domain: "S01_CERTS",
        DomainsValues: { results: [{ Value: "FDA" }, { Value: "BRC" }, { Value: "ISO9001" }] }
      }
    ];

    // MMCT -> campi per Screen3 (01) e Screen4 (02)
    var aMMCT = [
      {
        CatMateriale: "PLAST",
        UserMMCTFields: {
          results: [
            // Screen3 (01)
            { LivelloSchermata: "01", UiFieldname: "S01_COLOR", Descrizione: "Colore", DomainValues: 3, Mandatory: true },
            { LivelloSchermata: "01", UiFieldname: "S01_SUP_BATCH", Descrizione: "Supplier Batch", DomainValues: 0, Mandatory: true },
            { LivelloSchermata: "01", UiFieldname: "S01_CERTS", Descrizione: "Certificazioni", DomainValues: 3, Mandatory: false },

            // Screen4 (02)
            { LivelloSchermata: "02", UiFieldname: "S02_NOTE", Descrizione: "Note", DomainValues: 0, Mandatory: false },
            { LivelloSchermata: "02", UiFieldname: "S02_PLANT", Descrizione: "Plant", DomainValues: 0, Mandatory: true }
          ]
        }
      }
    ];

    var aVend = [
      { Lifnr: "0002072500", Name: "PELLECONI FLORIDA (MOCK)" },
      { Lifnr: "0002072240", Name: "VENDOR X (MOCK)" }
    ];

    return {
      UserType: "E",
      UserInfosDomains: { results: aDomains },
      UserInfosMMCT: { results: aMMCT },
      UserInfosVend: { results: aVend }
    };
  }

  function _buildMockDataSet(userId) {
    // 2 gruppi (Guid+Fibra) -> in Screen3 vedi 2 record, in Screen4 vedi più righe per lo stesso gruppo
    // NB: Stato=1 -> consideralo Approved (se nel tuo codice Approved=1)
    return [
      // GROUP A (GUID_A + F1) => 3 righe
      {
        UserID: userId,
        Fornitore: "0002072500",
        Materiale: "MAT001",
        CatMateriale: "PLAST",
        Guid: "GUID_A",
        Fibra: "F1",
        Stato: 0,

        S01_COLOR: ["RED", "BLUE"],     // multi value (MultiComboBox)
        S01_SUP_BATCH: "BATCH-001",
        S01_CERTS: ["FDA"],

        S02_NOTE: "Riga 1 dettaglio",
        S02_PLANT: "1000"
      },
      {
        UserID: userId,
        Fornitore: "0002072500",
        Materiale: "MAT001",
        CatMateriale: "PLAST",
        Guid: "GUID_A",
        Fibra: "F1",
        Stato: 1, // Approved

        S01_COLOR: ["GREEN"],
        S01_SUP_BATCH: "BATCH-002",
        S01_CERTS: ["BRC", "ISO9001"],

        S02_NOTE: "Riga 2 dettaglio",
        S02_PLANT: "1000"
      },
      {
        UserID: userId,
        Fornitore: "0002072500",
        Materiale: "MAT001",
        CatMateriale: "PLAST",
        Guid: "GUID_A",
        Fibra: "F1",
        Stato: 0,

        S01_COLOR: [],
        S01_SUP_BATCH: "BATCH-003",
        S01_CERTS: [],

        S02_NOTE: "Riga 3 dettaglio",
        S02_PLANT: "1000"
      },

      // GROUP B (GUID_B + F2) => 2 righe
      {
        UserID: userId,
        Fornitore: "0002072500",
        Materiale: "MAT001",
        CatMateriale: "PLAST",
        Guid: "GUID_B",
        Fibra: "F2",
        Stato: 0,

        S01_COLOR: ["BLUE"],
        S01_SUP_BATCH: "BATCH-010",
        S01_CERTS: ["FDA"],

        S02_NOTE: "Dettaglio gruppo B - 1",
        S02_PLANT: "2000"
      },
      {
        UserID: userId,
        Fornitore: "0002072500",
        Materiale: "MAT001",
        CatMateriale: "PLAST",
        Guid: "GUID_B",
        Fibra: "F2",
        Stato: 0,

        S01_COLOR: ["RED"],
        S01_SUP_BATCH: "BATCH-011",
        S01_CERTS: [],

        S02_NOTE: "Dettaglio gruppo B - 2",
        S02_PLANT: "2000"
      }
    ];
  }

  var MockODataModel = JSONModel.extend("apptracciabilita.apptracciabilita.model.MockODataModel", {
    constructor: function (mOpts) {
      JSONModel.apply(this, arguments);

      mOpts = mOpts || {};
      this._userId = mOpts.userId || "E_ZEMAF";

      this._store = {
        UserInfosSet: {},
        DataSet: []
      };

      this._store.UserInfosSet[this._userId] = _buildMockUserInfos(this._userId);
      this._store.DataSet = _buildMockDataSet(this._userId);
    },

    // compat: qualcuno potrebbe chiamarla
    metadataLoaded: function () {
      return Promise.resolve();
    },

    // ==========
    // OData-like API
    // ==========
    read: function (sPath, mParams) {
      mParams = mParams || {};
      var fnSuccess = mParams.success;
      var fnError = mParams.error;

      try {
        // /UserInfosSet('E_ZEMAF')
        var mUser = sPath.match(/^\/UserInfosSet\('([^']+)'\)\s*$/);
        if (mUser) {
          var uid = mUser[1];
          var data = this._store.UserInfosSet[uid] || _buildMockUserInfos(uid);

          _delay(function () {
            if (typeof fnSuccess === "function") fnSuccess(data);
          });
          return;
        }

        // /DataSet
        if (String(sPath || "").trim() === "/DataSet") {
          var a = this._store.DataSet.slice();
          var f = _extractEqFilters(mParams.filters || []);

          // applica filtri (se presenti)
          if (f.UserID) a = a.filter(function (r) { return String(r.UserID) === String(f.UserID); });
          if (f.Fornitore) a = a.filter(function (r) { return _normalize10(r.Fornitore) === _normalize10(f.Fornitore); });
          if (f.Materiale && f.Materiale.length) {
            a = a.filter(function (r) {
              var rm = String(r.Materiale || "").trim().toUpperCase();
              return f.Materiale.indexOf(rm) >= 0;
            });
          }

          _delay(function () {
            if (typeof fnSuccess === "function") fnSuccess({ results: a });
          });
          return;
        }

        throw new Error("MockODataModel.read: path non gestito -> " + sPath);
      } catch (e) {
        _delay(function () {
          if (typeof fnError === "function") {
            fnError({ message: e.message, responseText: e.message, statusCode: 500 });
          }
        });
      }
    },

    create: function (sPath, oData, mParams) {
      mParams = mParams || {};
      var fnSuccess = mParams.success;
      var fnError = mParams.error;

      try {
        if (String(sPath || "").trim() !== "/DataSet") {
          throw new Error("Mock create supportato solo su /DataSet");
        }

        var row = Object.assign({}, oData || {});
        this._store.DataSet.push(row);

        _delay(function () {
          if (typeof fnSuccess === "function") fnSuccess(row);
        });
      } catch (e) {
        _delay(function () {
          if (typeof fnError === "function") fnError({ message: e.message, statusCode: 500 });
        });
      }
    }
  });

  return {
    createMockODataModel: function (mOpts) {
      return new MockODataModel(mOpts || {});
    }
  };
});
