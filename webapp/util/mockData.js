// webapp/util/mockData.js
sap.ui.define([], function () {
  "use strict";

  function padVendor(v) {
    var s = String(v || "").trim();
    if (/^\d+$/.test(s) && s.length < 10) s = s.padStart(10, "0");
    return s;
  }

  function norm(s) { return String(s || "").trim().toUpperCase(); }

  function toDomainsByKey(domainsByName) {
    var out = {};
    Object.keys(domainsByName || {}).forEach(function (d) {
      var m = {};
      (domainsByName[d] || []).forEach(function (it) { m[it.key] = it.text; });
      out[d] = m;
    });
    return out;
  }

  function buildDomains() {
    return {
      domainsByName: {
        "DOM_COUNTRY": [
          { key: "IT", text: "Italia" },
          { key: "FR", text: "Francia" },
          { key: "ES", text: "Spagna" },
          { key: "DE", text: "Germania" }
        ],
        "DOM_CERT": [
          { key: "GRS", text: "GRS" },
          { key: "RCS", text: "RCS" },
          { key: "LWG", text: "LWG" },
          { key: "FSC", text: "FSC" }
        ],
        "DOM_FIBRA": [
          { key: "COTONE", text: "Cotone" },
          { key: "LANA", text: "Lana" },
          { key: "POLIESTERE", text: "Poliestere" },
          { key: "PELLE", text: "Pelle" }
        ],
        "DOM_STAGIONE": [
          { key: "43", text: "43" },
          { key: "44", text: "44" },
          { key: "45", text: "45" }
        ]
      }
    };
  }

  function buildUserVendors() {
    return [
      {
        Fornitore: "0000123456",
        ReagSoc: "CITY MODELES",
        Open: "X",
        ToApprove: 2,
        Rejected: 1
      },
      {
        Fornitore: "0000654321",
        ReagSoc: "ALPHA SUPPLIES SRL",
        Open: "X",
        ToApprove: 1,
        Rejected: 0
      },
      {
        Fornitore: "0000987654",
        ReagSoc: "BETA MATERIALS SPA",
        Open: "",
        ToApprove: 0,
        Rejected: 0
      }
    ];
  }

  function buildMaterialsForVendor(vendorId) {
    var v = padVendor(vendorId);
    // “simil-real”: codici stile SAP + contatori vari
    return [
      { Material: "IW2B0626SVS", MaterialDescription: "Tessuto tecnico - campione", OpenPo: 1, Open: "X", Pending: 2, ToApprove: 2, Approved: 0, Rejected: 0 },
      { Material: "IW2B0626SVSS", MaterialDescription: "Tessuto tecnico - variante S", OpenPo: 1, Open: "X", Pending: 1, ToApprove: 1, Approved: 0, Rejected: 0 },
      { Material: "LEA0001234", MaterialDescription: "Pelle pieno fiore", OpenPo: 1, Open: "X", Pending: 0, ToApprove: 0, Approved: 2, Rejected: 0 },
      { Material: "COT0009988", MaterialDescription: "Cotone organico", OpenPo: 1, Open: "X", Pending: 1, ToApprove: 1, Approved: 0, Rejected: 1 },
      { Material: "POL0007711", MaterialDescription: "Poliestere riciclato", OpenPo: 0, Open: "", Pending: 0, ToApprove: 0, Approved: 1, Rejected: 0 }
    ].map(function (m) {
      // ti lascio vendor “implicito” (Screen2 non lo usa nelle row)
      m.__vendor = v;
      return m;
    });
  }

  function buildMMCT() {
    // 1 categoria “CF” con campi per Screen3 (01) e Screen4 (02)
    // Nota: i campi scelti esistono già nel tuo dataset mock/base (Fibra, FattEmissione, QtaFibra, PaeseFibra, CertRic...)
    var fields = [
      // SCREEN 01 (tabella record)
      { CatMateriale: "CF", LivelloSchermata: "01", UiFieldname: "Fibra",         Descrizione: "Fibra",                Dominio: "DOM_FIBRA",   MultipleVal: "",  Impostazione: "O" },
      { CatMateriale: "CF", LivelloSchermata: "01", UiFieldname: "FattEmissione", Descrizione: "Fattore Emissione",    Dominio: "",            MultipleVal: "",  Impostazione: "O" },
      { CatMateriale: "CF", LivelloSchermata: "01", UiFieldname: "PaeseFibra",    Descrizione: "Paese Fibra",          Dominio: "DOM_COUNTRY", MultipleVal: "",  Impostazione: ""  },
      { CatMateriale: "CF", LivelloSchermata: "01", UiFieldname: "CertRic",       Descrizione: "Cert. Riciclo",        Dominio: "DOM_CERT",    MultipleVal: "X", Impostazione: ""  },
      { CatMateriale: "CF", LivelloSchermata: "01", UiFieldname: "Stagione",      Descrizione: "Stagione",             Dominio: "DOM_STAGIONE",MultipleVal: "",  Impostazione: ""  },

      // SCREEN 02 (dettaglio righe)
      { CatMateriale: "CF", LivelloSchermata: "02", UiFieldname: "Linea",         Descrizione: "Linea",                Dominio: "",            MultipleVal: "",  Impostazione: "B" }, // bloccato
      { CatMateriale: "CF", LivelloSchermata: "02", UiFieldname: "QtaFibra",      Descrizione: "Quantità Fibra",       Dominio: "",            MultipleVal: "",  Impostazione: "O" },
      { CatMateriale: "CF", LivelloSchermata: "02", UiFieldname: "NoteMateriale", Descrizione: "Note Materiale",       Dominio: "",            MultipleVal: "",  Impostazione: ""  }
    ];

    return {
      userCategories: [
        {
          CatMateriale: "CF",
          UserMMCTFields: { results: fields }
        }
      ],
      userMMCT: [
        {
          CatMateriale: "CF",
          UserMMCTFields: { results: fields }
        }
      ],
      UserInfosMMCT: [
        {
          CatMateriale: "CF",
          UserMMCTFields: { results: fields }
        }
      ]
    };
  }

  function buildMmctFieldsByCat(mmctFields) {
    var out = {};
    (mmctFields || []).forEach(function (f) {
      var c = f && f.CatMateriale;
      if (!c) return;
      if (!out[c]) out[c] = [];
      out[c].push(f);
    });
    return out;
  }

  function buildUserDomainsFromDomainsByName(domainsByName) {
    // struttura “simil-UserInfosDomains/DomainsValues”
    return Object.keys(domainsByName || {}).map(function (dom) {
      return {
        Domain: dom,
        DomainsValues: {
          results: (domainsByName[dom] || []).map(function (it) { return { Value: it.key }; })
        }
      };
    });
  }

  function applyFlagsByStato(r, stato) {
    r.Stato = stato;
    if (stato === "AP") { r.Approved = 1; r.ToApprove = 0; r.Rejected = 0; }
    if (stato === "RJ") { r.Approved = 0; r.ToApprove = 0; r.Rejected = 1; }
    if (stato === "ST") { r.Approved = 0; r.ToApprove = 1; r.Rejected = 0; }
    if (stato === "CH") { r.Approved = 0; r.ToApprove = 1; r.Rejected = 0; }
  }

  function buildDataSetRows(opts) {
    opts = opts || {};
    var sVendor = padVendor(opts.vendorId || "0000123456");
    var sMat = norm(opts.material || "IW2B0626SVS");
    var sUserId = String(opts.userId || "E_ZEMAF").trim();
    var sForceStato = String(opts.forceStato || "").trim().toUpperCase();

    var sCat = String(opts.cat || "CF").trim() || "CF";

    function mkBase() {
      return {
        CatMateriale: sCat,
        Fornitore: sVendor,
        Materiale: sMat,
        GruppoMerci: sMat,
        RagSoc: (opts.vendorName || "CITY MODELES"),
        Plant: "5110",
        GerProd: "CAL B1 BD",
        Stagione: "44",
        UserID: sUserId,

        Guid: "",
        Fibra: "",
        Linea: "",

        // campi “usati” dai MMCT mock
        FattEmissione: "0.000",
        QtaFibra: "0.000",
        PaeseFibra: "IT",
        CertRic: "GRS;RCS",      // MULTI -> verrà splittato in array
        NoteMateriale: "",

        // flag stato
        Stato: "",
        Approved: 0,
        ToApprove: 0,
        Rejected: 0,
        Open: "X"
      };
    }

    function mkRecord2Rows(stato, idx) {
      var guid = "GUID_" + stato + "_" + idx;
      var fibra = (idx % 2 === 0) ? "COTONE" : "LANA";

      var r1 = mkBase();
      r1.Guid = guid;
      r1.Fibra = fibra;
      r1.Linea = "1R";
      r1.FattEmissione = (idx * 0.111).toFixed(3);
      r1.QtaFibra = (idx * 1.234).toFixed(3);
      r1.NoteMateriale = "Nota riga 1 (" + stato + ")";
      applyFlagsByStato(r1, stato);

      var r2 = mkBase();
      r2.Guid = guid;
      r2.Fibra = fibra;
      r2.Linea = "2R";
      r2.FattEmissione = (idx * 0.222).toFixed(3);
      r2.QtaFibra = (idx * 2.468).toFixed(3);
      r2.NoteMateriale = "Nota riga 2 (" + stato + ")";
      applyFlagsByStato(r2, stato);

      return [r1, r2];
    }

    var a = []
      .concat(mkRecord2Rows("ST", 1), mkRecord2Rows("ST", 2))
      .concat(mkRecord2Rows("AP", 1), mkRecord2Rows("AP", 2))
      .concat(mkRecord2Rows("RJ", 1), mkRecord2Rows("RJ", 2))
      .concat(mkRecord2Rows("CH", 1), mkRecord2Rows("CH", 2));

    if (sForceStato === "ST" || sForceStato === "AP" || sForceStato === "RJ" || sForceStato === "CH") {
      a.forEach(function (r) { applyFlagsByStato(r, sForceStato); });
    }

    return a;
  }

  function applyVm(oVm, cfg) {
    cfg = cfg || {};

    var userId = String(cfg.userId || "E_ZEMAF").trim();
    var userType = String(cfg.userType || "E").trim().toUpperCase(); // E/I/S

    var dom = buildDomains();
    var domainsByName = dom.domainsByName;
    var domainsByKey = toDomainsByKey(domainsByName);

    var vendors = buildUserVendors();
    var mmct = buildMMCT();

    // estraggo lista fields unica per mmctFieldsByCat (come fai tu in Screen0)
    var allFields = [];
    (mmct.UserInfosMMCT || []).forEach(function (cat) {
      var rr = (cat.UserMMCTFields && cat.UserMMCTFields.results) || [];
      allFields = allFields.concat(rr);
    });
    var mmctFieldsByCat = buildMmctFieldsByCat(allFields);

    var userDomains = buildUserDomainsFromDomainsByName(domainsByName);

    // payload “compatibile” col tuo oVm.setData(...)
    var payload = {
      userId: userId,
      userType: userType,
      userDescription: "MOCK USER (" + userType + ")",
      showAggregatedTile: userType !== "E",

      auth: {
        role: (userType === "E" ? "FORNITORE" : (userType === "I" ? "VALENTINO" : (userType === "S" ? "SUPERUSER" : "UNKNOWN"))),
        isSupplier: userType === "E",
        isValentino: userType === "I",
        isSuperuser: userType === "S"
      },

      userDomains: userDomains,
      userCategories: mmct.userCategories,
      userVendors: vendors,

      userMMCT: mmct.userMMCT,
      mmctFieldsByCat: mmctFieldsByCat,

      UserInfosMMCT: mmct.UserInfosMMCT,
      UserInfosVend: vendors,
      UserInfosDomains: userDomains,

      domainsByName: domainsByName,
      domainsByKey: domainsByKey,

      // preserva ciò che già usi
      mdcCfg: oVm.getProperty("/mdcCfg") || {},
      cache: oVm.getProperty("/cache") || { dataRowsByKey: {}, recordsByKey: {} },

      // flags mock (se già settati li lasciamo)
      mock: oVm.getProperty("/mock") || {}
    };

    oVm.setData(payload, true);
    return payload;
  }

  return {
    applyVm: applyVm,
    buildMaterialsForVendor: buildMaterialsForVendor,
    buildDataSetRows: buildDataSetRows,
    padVendor: padVendor
  };
});
