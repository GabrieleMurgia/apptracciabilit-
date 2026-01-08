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

  // ---- Helpers per __metadata “stile OData V2” ----
  var SERVICE_BASE = "https://s4d:44300/sap/opu/odata/sap/ZVEND_TRACE_SRV";

  function md(sType, sEntityPath) {
    var url = SERVICE_BASE + "/" + String(sEntityPath || "").replace(/^\//, "");
    return { id: url, uri: url, type: sType };
  }

  function deepClone(x) {
    try { return JSON.parse(JSON.stringify(x)); } catch (e) { return x; }
  }

  function pad2(n) {
    n = parseInt(n, 10);
    if (isNaN(n)) n = 0;
    return String(n).padStart(2, "0");
  }

  function buildDomains(sUserId) {
    // 13 domini come nel tuo dump (nomi + descrizioni coerenti)
    var defs = [
      { Domain: "CALC_CARBON_FOOT", Description: "Calcolo Carbon Footprint di prodotto" },
      { Domain: "CERTMAT",          Description: "Certificazioni Materiali" },
      { Domain: "CERTPROC",         Description: "Certificazioni Processo" },
      { Domain: "COMPOST",          Description: "Compostabile" },
      { Domain: "DENSEMPL",         Description: "Codice per denominazione semplificata" },
      { Domain: "DEST_PACK",        Description: "Destinaz. Packaging" },
      { Domain: "FIBRA",            Description: "Fibra" },
      { Domain: "FOOTPRINT",        Description: "Calcolo Carbon Footprint di prodotto" },
      { Domain: "GRADO_RIC",        Description: "Grado di riciclabilità" },
      { Domain: "PAESIE",           Description: "Paese" },
      { Domain: "PRES_SOST",        Description: "Presenza di sostanze SVHC" },
      { Domain: "RICI_PACK",        Description: "Packaging riutilizzabile" },
      { Domain: "UM_FIBRA",         Description: "Unità Misura Fibra" }
    ];

    var fibraVals = ["Cordura", "Cotone", "Elasten", "Lana", "NN", "Sintetico"].map(function (v) {
      return {
        __metadata: md("ZVEND_TRACE_SRV.DomainsValues", "DomainsValuesSet(UserID='" + sUserId + "',Domain='FIBRA',Value='" + encodeURIComponent(v) + "')"),
        UserID: sUserId,
        Domain: "FIBRA",
        Value: v
      };
    });

    var umFibraVals = ["KG"].map(function (v) {
      return {
        __metadata: md("ZVEND_TRACE_SRV.DomainsValues", "DomainsValuesSet(UserID='" + sUserId + "',Domain='UM_FIBRA',Value='" + encodeURIComponent(v) + "')"),
        UserID: sUserId,
        Domain: "UM_FIBRA",
        Value: v
      };
    });

    return defs.map(function (d) {
      var values = [];
      if (d.Domain === "FIBRA") values = fibraVals;
      if (d.Domain === "UM_FIBRA") values = umFibraVals;

      return {
        __metadata: md("ZVEND_TRACE_SRV.Domains", "DomainsSet(UserID='" + sUserId + "',Domain='" + d.Domain + "')"),
        UserID: sUserId,
        Domain: d.Domain,
        Description: d.Description,
        DomainsValues: { results: values }
      };
    });
  }

  function buildVendors(sUserId) {
    // 7 vendor come nel tuo dump (numeri + ragioni sociali)
    var arr = [
      { Fornitore: "0000002056", ReagSoc: "CITY MODELES", Open: "X", ToApprove: 0, Rejected: 0, Approved: 0 },
      { Fornitore: "0000002856", ReagSoc: "CALZATURIFICIO GISBERTO VALORI", Open: "X", ToApprove: 0, Rejected: 0, Approved: 0 },
      { Fornitore: "0000003883", ReagSoc: "STUDIO DANIELA ACCARDO", Open: "X", ToApprove: 0, Rejected: 0, Approved: 0 },
      { Fornitore: "0000007857", ReagSoc: "MOOD MAGLIFICIO SRL", Open: "X", ToApprove: 0, Rejected: 0, Approved: 0 },
      { Fornitore: "0000008994", ReagSoc: "JATO SPA", Open: "X", ToApprove: 0, Rejected: 0, Approved: 0 },
      { Fornitore: "0000019727", ReagSoc: "CONFEZIONI VALENTINA", Open: "X", ToApprove: 0, Rejected: 0, Approved: 0 },
      { Fornitore: "0000070242", ReagSoc: "VALENTINO BAGS LAB SRL", Open: "X", ToApprove: 0, Rejected: 0, Approved: 0 }
    ];

    return arr.map(function (v) {
      return {
        __metadata: md("ZVEND_TRACE_SRV.VendorData", "VendorDataSet(UserID='" + sUserId + "',Fornitore='" + v.Fornitore + "')"),
        UserID: sUserId,
        Fornitore: v.Fornitore,
        ReagSoc: v.ReagSoc,
        Open: v.Open,
        ToApprove: v.ToApprove,
        Rejected: v.Rejected,
        Approved: v.Approved
      };
    });
  }

  function buildMaterialsByVendor(sUserId) {
    // PIÙ record: per OGNI vendor genero un set di materiali.
    // Mantengo i 4 originali per 0000002056 + aggiungo extra in loop.
    var vendorIds = [
      "0000002056",
      "0000002856",
      "0000003883",
      "0000007857",
      "0000008994",
      "0000019727",
      "0000070242"
    ];

    var map = {};

    function mkMat(vendor, matShort, matDescLong) {
      return {
        __metadata: md(
          "ZVEND_TRACE_SRV.MaterialData",
          "MaterialDataSet(UserID='" + sUserId + "',Fornitore='" + vendor + "',Materiale='" + matShort + "')"
        ),
        UserID: sUserId,
        Fornitore: vendor,
        Materiale: matShort,
        DescMateriale: matDescLong,
        Open: "X",
        ToApprove: 0,
        Rejected: 0,
        Approved: 0
      };
    }

    vendorIds.forEach(function (vendor, vi) {
      var arr = [];

      if (vendor === "0000002056") {
        // 4 del dump
        arr.push(mkMat(vendor, "IW20151LBB", "TEST LBB"));
        arr.push(mkMat(vendor, "IW2B0626SV", "IW2B0626SVS"));
        arr.push(mkMat(vendor, "IW2B0631SV", "IW2B0631SVS"));
        arr.push(mkMat(vendor, "IW2B0640SV", "IW2B0640SVS"));

        // extra (loop)
        for (var n = 41; n <= 60; n++) {
          var code = "IW2B06" + pad2(n) + "SV";      // es IW2B0641SV
          arr.push(mkMat(vendor, code, code + "S")); // es IW2B0641SVS
        }
      } else {
        // per gli altri vendor: 12 materiali sintetici ciascuno
        for (var k = 1; k <= 12; k++) {
          var baseNum = (vi + 1) * 100 + k; // stabile
          var code2 = "IW2B" + baseNum + "SV";
          arr.push(mkMat(vendor, code2, code2 + "S"));
        }
      }

      map[vendor] = arr;
    });

    return map;
  }

  function mkMmctField(sUserId, cat, idx, livello, fieldname, uiFieldname, dominio, imp, numCampiVal, multipleVal, descrizione) {
    return {
      __metadata: md("ZVEND_TRACE_SRV.MMCTFields", "MMCTFieldsSet(UserID='" + sUserId + "',CatMateriale='" + cat + "')"),
      UserID: sUserId,
      CatMateriale: cat,
      LivelloSchermata: String(livello),
      NumCampiVal: (typeof numCampiVal === "number" ? numCampiVal : 1),
      MultipleVal: (multipleVal == null ? "" : String(multipleVal)),
      Fieldname: String(fieldname || ("FIELD_" + idx)),
      UiFieldname: String(uiFieldname || ("Field_" + idx)),
      Descrizione: (descrizione == null ? "" : String(descrizione)),
      Dominio: (dominio == null ? "" : String(dominio)),
      Impostazione: (imp == null ? "" : String(imp))
    };
  }

  function buildMmct(sUserId) {
    // 6 categorie come nel tuo dump (CatMaterialeDesc “realistiche”)
    var cats = [
      { CatMateriale: "CF", CatMaterialeDesc: "Clothing FG",  fieldsCount: 55, owner: "E_ZEMAF" },
      { CatMateriale: "CR", CatMaterialeDesc: "Clothing RM",  fieldsCount: 55, owner: "E_ZEMAF" },
      { CatMateriale: "LG", CatMaterialeDesc: "Leather Goods",fieldsCount: 47, owner: "E_CASAS" },
      { CatMateriale: "FW", CatMaterialeDesc: "Footwear",     fieldsCount: 39, owner: "E_CASAS" },
      { CatMateriale: "PK", CatMaterialeDesc: "Packaging",    fieldsCount: 47, owner: "E_CASAS" },
      { CatMateriale: "PK", CatMaterialeDesc: "Packaging",    fieldsCount: 47, owner: "E_ZEMAF" }
    ];

    // campi “chiave”
    function keyFieldsFor(cat) {
      var base = [
        mkMmctField(sUserId, cat, 1, "01", "COLLEZIONE", "Collezione", "", "B", 1, "", ""),
        mkMmctField(sUserId, cat, 2, "01", "FAMIGLIA", "Famiglia", "", "B", 1, "", ""),

        // Fibra in schermata 02
        mkMmctField(sUserId, cat, 3, "02", "FIBRA", "Fibra", "FIBRA", "B", 1, "", ""),

        mkMmctField(sUserId, cat, 4, "02", "UM_FIBRA", "UmFibra", "UM_FIBRA", "B", 1, "", ""),
        mkMmctField(sUserId, cat, 5, "02", "CERTMAT", "CertMat", "CERTMAT", "B", 1, "", ""),
        mkMmctField(sUserId, cat, 6, "02", "CERTPROC", "CertProcess", "CERTPROC", "B", 1, "", "")
      ];
      return base;
    }

    function fillFields(cat, count, startIdx) {
      var out = [];
      var levels = ["01", "02", "01", "02", "00", "02", "01"];
      for (var i = 0; i < count; i++) {
        var idx = startIdx + i;
        var livello = levels[i % levels.length];
        var fn = "FIELD_" + idx;
        var uin = "Field_" + idx;
        out.push(mkMmctField(sUserId, cat, idx, livello, fn, uin, "", (i % 3 === 0 ? "B" : ""), 1, "", ""));
      }
      return out;
    }

    return cats.map(function (c) {
      var cat = c.CatMateriale;
      var owner = c.owner || sUserId;

      var fields = [];
      fields = fields.concat(keyFieldsFor(cat).map(function (f) { f.UserID = owner; return f; }));

      var missing = Math.max(0, (c.fieldsCount || 0) - fields.length);
      fields = fields.concat(fillFields(cat, missing, 100).map(function (f) { f.UserID = owner; return f; }));

      return {
        __metadata: md("ZVEND_TRACE_SRV.UserMMCT", "UserMMCTSet(UserID='" + owner + "',CatMateriale='" + cat + "')"),
        UserID: owner,
        CatMateriale: cat,
        CatMaterialeDesc: c.CatMaterialeDesc,
        UserMMCTFields: { results: fields }
      };
    });
  }

  function buildDataRows(sUserId, vendors) {
    // Screen3: molte righe, con Stato approvato / non approvato
    var matsByVendor = buildMaterialsByVendor(sUserId);

    function mkGuid(i) {
      return ("AAAA" + String(i).padStart(18, "0") + "==");
    }

    function baseRowTemplate(v, matLong, guid, stato) {
      return {
        __metadata: md("ZVEND_TRACE_SRV.Data", "DataSet(binary'" + guid + "')"),

        Bonus: "",
        CalcCarbonFoot: "",
        CatMateriale: "CF",
        CertMat: "",
        CertProcess: "",
        CertRic: "",
        CodiceDenSempl: "",
        Collezione: "",
        Compost: "",
        DataIns: null,
        DataMod: null,
        DescrPack: "",
        DestPack: "",
        DestUso: "",
        EnteCert: "",
        Esito: "",
        Famiglia: "",
        FattEmissione: "0.000",
        Fibra: "",
        FineVal: null,
        Fornitore: v.Fornitore,
        GerProd: "CAL B1 BD",
        GradoRic: "",
        GruppoMerci: matLong,
        Guid: guid,
        InizioVal: null,
        Linea: "1R",
        LocAllev: "",
        LocConciaCrust: "",
        LocConciaPf: "",
        LocConfez: "",
        LocFibra: "",
        LocFilatura: "",
        LocMacellazione: "",
        LocPolimero: "",
        LocTessitura: "",
        LocTintura: "",
        Materiale: matLong,
        MaterialeFornitore: "",
        MatnrMp: "",
        Message: "",
        MpFittizio: "",
        NReport: "",
        NoteCertMat: "",
        NoteCertProcess: "",
        NoteMateriale: "",
        OtherAction: "",
        PaeseAllev: "",
        PaeseConciaCrust: "",
        PaeseConciaPf: "",
        PaeseConfez: "",
        PaeseFibra: "",
        PaeseFilatura: "",
        PaeseMacellazione: "",
        PaesePolimero: "",
        PaesePrAgg: "",
        PaesePrMont: "",
        PaesePrRif: "",
        PaeseTessitura: "",
        PaeseTintura: "",
        PartitaFornitore: "",
        PercMatRicicl: "",
        Perccomp: "",
        PerccompFibra: "0.00",
        PesoPack: "0.000",
        Plant: "5110",
        PresSost: "",
        QtaFibra: "0.000",
        RagSoc: v.ReagSoc || "",
        RagSocAllev: "",
        RagSocConciaCrust: "",
        RagSocConciaPf: "",
        RagSocConfez: "",
        RagSocFibra: "",
        RagSocFilatura: "",
        RagSocMacellazione: "",
        RagSocPolimero: "",
        RagSocTessitura: "",
        RagSocTintura: "",
        RiciPack: "",
        Stagione: "44",
        Stato: (stato == null ? "" : String(stato)),
        TipSost: "",
        UdM: "PC",
        UmFibra: "",
        UserID: sUserId,
        UserIns: "",
        UserMod: "",

        COLLEZIONE: "",
        FAMIGLIA: "",
        FIBRA: "",
        UM_FIBRA: "",
        CERTMAT: "",
        CERTPROC: ""
      };
    }

    var rows = [];
    var guidCounter = 1;

    vendors.forEach(function (v) {
      var mats = matsByVendor[v.Fornitore] || [];
      var limit = Math.min(mats.length, 15);

      for (var i = 0; i < limit; i++) {
        var m = mats[i];
        var matLong = (m && m.DescMateriale) ? String(m.DescMateriale) : String((m && m.Materiale) || "");

        // non approvato
        rows.push(baseRowTemplate(v, matLong, mkGuid(guidCounter++), ""));
        // approvato
        rows.push(baseRowTemplate(v, matLong, mkGuid(guidCounter++), "Approvato"));
      }
    });

    if (!rows.length) {
      var fallbackV = vendors[0] || { Fornitore: "0000002056", ReagSoc: "CITY MODELES" };
      rows.push(baseRowTemplate(fallbackV, "IW2B0626SVS", mkGuid(guidCounter++), ""));
      rows.push(baseRowTemplate(fallbackV, "IW2B0626SVS", mkGuid(guidCounter++), "Approvato"));
    }

    return rows;
  }

function buildDataRowsScreen4(sUserId, screen3Rows) {
  var fibers = ["Cotone", "Lana", "Sintetico", "Cordura", "Elasten", "NN"];
  var out = [];
  var detCounter = 1;

  function mkDetGuid(i) {
    return ("BBBB" + String(i).padStart(18, "0") + "==");
  }

  function cloneBase(r, guidDett, idx) {
    var rr = deepClone(r);

    // metadata e guid
    rr.__metadata = md("ZVEND_TRACE_SRV.Data", "DataSet(binary'" + guidDett + "')");
    rr.GuidPadre = r.Guid;                 // 🔗 link alla riga Screen3
    rr.Guid = guidDett;                    // guid univoco per la riga di Screen4

    // 🔥 CHIAVE: Stato dettagli = Stato padre (così qualunque filtro Stato non taglia a 1)
    rr.Stato = (r && r.Stato != null) ? String(r.Stato) : "";

    // variazioni realistiche (schermata 02)
    var fibra = fibers[(idx + detCounter) % fibers.length];
    rr.Fibra = fibra;
    rr.FIBRA = fibra;

    rr.UmFibra = "KG";
    rr.UM_FIBRA = "KG";

    rr.QtaFibra = (idx === 1 ? "12.000" : idx === 2 ? "7.500" : idx === 3 ? "3.000" : "1.000");

    rr.CertMat = (idx % 2 === 0 ? "X" : "");
    rr.CERTMAT = rr.CertMat;

    rr.CertProcess = (idx === 4 ? "X" : "");
    rr.CERTPROC = rr.CertProcess;

    rr.NoteMateriale = "Dettaglio " + idx;

    return rr;
  }

  for (var i = 0; i < screen3Rows.length; i++) {
    var r = screen3Rows[i];

    // 4 detail per ogni record di Screen3 (sempre 4, sempre filtrabili col medesimo Stato)
    out.push(cloneBase(r, mkDetGuid(detCounter++), 1));
    out.push(cloneBase(r, mkDetGuid(detCounter++), 2));
    out.push(cloneBase(r, mkDetGuid(detCounter++), 3));
    out.push(cloneBase(r, mkDetGuid(detCounter++), 4));
  }

  return out;
}


  function buildDb(userId) {
    var sUserId = userId || "E_ZEMAF";

    var domains = buildDomains(sUserId);
    var mmct = buildMmct(sUserId);
    var vendors = buildVendors(sUserId);

    var materialsByVendor = buildMaterialsByVendor(sUserId);
    var dataRows = buildDataRows(sUserId, vendors);                 // Screen3
    var dataRowsScreen4 = buildDataRowsScreen4(sUserId, dataRows);  // Screen4 (4x)

    return {
      userInfos: {
        __metadata: md("ZVEND_TRACE_SRV.UserInfos", "UserInfosSet('" + sUserId + "')"),
        UserID: sUserId,
        UserType: "S",
        UserTypeDescription: "",
        UserUserDescription: "Fabio Zamana",
        UserDescription: "Fabio Zamana",

        UserInfosDomains: { results: domains },
        UserInfosMMCT: { results: mmct },
        UserInfosVend: { results: vendors }
      },
      domains: domains,
      mmct: mmct,
      vendors: vendors,
      materialsByVendor: materialsByVendor,
      dataRows: dataRows,
      dataRowsScreen4: dataRowsScreen4
    };
  }

  function isScreen4Path(sPath) {
    return (
      sPath === "/DataSetScreen4" ||
      sPath === "/DataScreen4Set" ||
      sPath === "/DataSetS4" ||
      sPath === "/DataSet4" ||
      sPath === "/DataDettSet" ||
      sPath === "/DataDetailSet" ||
      sPath === "/DataDetailsSet" ||
      sPath === "/DataSetDett" ||
      sPath === "/DataSetDettagli"
    );
  }

  function materialMatchTollerante(rowMat, filterMat) {
    var rm = String(rowMat || "").toUpperCase();
    var mf = String(filterMat || "").toUpperCase();
    return rm === mf || rm.indexOf(mf) === 0 || mf.indexOf(rm) === 0;
  }

  var MockODataModel = JSONModel.extend("apptracciabilita.apptracciabilita.model.MockODataModel", {
    constructor: function (mOpts) {
      JSONModel.call(this, {});
      this.__isMock = true;
      this._opts = mOpts || {};
      this._db = buildDb(this._opts.userId || "E_ZEMAF");
      this.setSizeLimit(5000);
    },

    read: function (sPath, mParams) {
      mParams = mParams || {};
      var that = this;

      function ok(data) {
        asyncCall(function () {
          if (typeof mParams.success === "function") {
            mParams.success(deepClone(data), { statusCode: 200 });
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
        that._db = buildDb(userId || (that._opts.userId || "E_ZEMAF"));
        return ok(that._db.userInfos);
      }

      // -------- VendorDataSet --------
      if (sPath === "/VendorDataSet") {
        var flatV = pickFilters(mParams.filters);
        var uidV = "";

        flatV.forEach(function (f) {
          if (f.path === "UserID" && f.op === "EQ") uidV = String(f.v1 || "");
        });

        if (!uidV) uidV = that._db.userInfos.UserID;
        var vendors = buildVendors(uidV);
        return ok({ results: vendors });
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

        if (!uid) uid = that._db.userInfos.UserID;

        var matsByVendor = buildMaterialsByVendor(uid);
        var arr = (matsByVendor[vendor] || []).map(function (x) { return x; });

        return ok({ results: arr });
      }
      var urlParams = (mParams && mParams.urlParameters) || {};

// se Screen4 usa ancora /DataSet e filtra per Guid della testata,
// devo forzare la risposta “dettaglio”
var flatPre = pickFilters(mParams.filters);
var hasGuidEq = flatPre.some(function (f) {
  return (f.path === "Guid" || f.path === "GUID") && f.op === "EQ" && f.v1 != null && String(f.v1) !== "";
});

var forcedS4 =
  (sPath === "/DataSet" && String(urlParams.__screen || urlParams.screen || "") === "4") ||
  (sPath === "/DataSet" && hasGuidEq);

      if (isScreen4Path(sPath) || forcedS4) {
        var flatS4 = pickFilters(mParams.filters);
        var vendorS4 = "";
        var uidS4 = "";
        var guidPadre = "";
        var matFiltersS4 = [];

        flatS4.forEach(function (f) {
          if (f.path === "Fornitore" && f.op === "EQ") vendorS4 = String(f.v1 || "");
          if (f.path === "UserID" && f.op === "EQ") uidS4 = String(f.v1 || "");
          if (f.path === "Materiale" && f.op === "EQ") {
            var mv = String(f.v1 || "");
            if (mv) matFiltersS4.push(mv);
          }
          // se in screen4 filtri Guid, lo interpreto come “Guid padre” (testata)
          if ((f.path === "Guid" || f.path === "GUID") && f.op === "EQ") guidPadre = String(f.v1 || "");
          if (f.path === "GuidPadre" && f.op === "EQ") guidPadre = String(f.v1 || "");
        });

        if (!uidS4) uidS4 = that._db.userInfos.UserID;

        // genero coerente e poi filtro
        var vendorsS4 = buildVendors(uidS4);
        var s3RowsAll = buildDataRows(uidS4, vendorsS4);
        var s4RowsAll = buildDataRowsScreen4(uidS4, s3RowsAll);

        var rowsS4 = s4RowsAll;

        if (vendorS4) {
          rowsS4 = rowsS4.filter(function (r) { return String(r.Fornitore) === vendorS4; });
        }

        if (matFiltersS4.length) {
          rowsS4 = rowsS4.filter(function (r) {
            return matFiltersS4.some(function (mf) {
              return materialMatchTollerante(r.Materiale, mf);
            });
          });
        }

        if (guidPadre) {
          rowsS4 = rowsS4.filter(function (r) { return String(r.GuidPadre) === guidPadre; });
        }

        return ok({ results: rowsS4 });
      }

      // -------- DataSet (Screen3) --------
      if (sPath === "/DataSet") {
        var flat2 = pickFilters(mParams.filters);
        var vendor2 = "";
        var uid2 = "";
        var matFilters = [];

        flat2.forEach(function (f) {
          if (f.path === "Fornitore" && f.op === "EQ") vendor2 = String(f.v1 || "");
          if (f.path === "UserID" && f.op === "EQ") uid2 = String(f.v1 || "");
          if (f.path === "Materiale" && f.op === "EQ") {
            var v = String(f.v1 || "");
            if (v) matFilters.push(v);
          }
        });

        if (!uid2) uid2 = that._db.userInfos.UserID;

        var rows = buildDataRows(uid2, buildVendors(uid2));

        if (vendor2) {
          rows = rows.filter(function (r) { return String(r.Fornitore) === vendor2; });
        }

        if (matFilters.length) {
          rows = rows.filter(function (r) {
            return matFilters.some(function (mf) {
              return materialMatchTollerante(r.Materiale, mf);
            });
          });
        }

        return ok({ results: rows });
      }

      // -------- DomainsSet(UserID='...',Domain='...') --------
      var mdDom = String(sPath || "").match(/^\/DomainsSet\(UserID='([^']+)',Domain='([^']+)'\)\s*$/);
      if (mdDom) {
        var uDom = decodeURIComponent(mdDom[1] || "");
        var dDom = decodeURIComponent(mdDom[2] || "");
        var all = buildDomains(uDom);
        var one = all.filter(function (x) { return x.Domain === dDom; })[0];
        return one ? ok(one) : fail(404, "DomainsSet non trovato: " + dDom);
      }

      // -------- UserMMCTSet(UserID='...',CatMateriale='...') --------
      var mdMm = String(sPath || "").match(/^\/UserMMCTSet\(UserID='([^']+)',CatMateriale='([^']+)'\)\s*$/);
      if (mdMm) {
        var uMm = decodeURIComponent(mdMm[1] || "");
        var cMm = decodeURIComponent(mdMm[2] || "");
        var mm = buildMmct(uMm).filter(function (x) { return x.CatMateriale === cMm; })[0];
        return mm ? ok(mm) : fail(404, "UserMMCTSet non trovato: " + cMm);
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
