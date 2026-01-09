sap.ui.define([], function () {
  "use strict";

  // Toggle:
  // - URL:   ?mockDom=1  (forza ON)  |  ?mockDom=0 (forza OFF)
  // - oppure localStorage: VENDTRACE_MOCK_DOMAIN_FALLBACK = "1" / "0"
  const LS_KEY = "VENDTRACE_MOCK_DOMAIN_FALLBACK";

  function isEnabled() {
    try {
      const p = new URLSearchParams(window.location.search);
      const urlFlag = p.get("mockDom");
      if (urlFlag === "1") return true;
      if (urlFlag === "0") return false;
      return window.localStorage.getItem(LS_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function setEnabled(b) {
    try {
      window.localStorage.setItem(LS_KEY, b ? "1" : "0");
    } catch (e) {}
  }

  function makeDefaultValues(n) {
    const out = [];
    for (let i = 1; i <= (n || 5); i++) {
      out.push({ key: "val" + i, text: "val" + i });
    }
    return out;
  }

  function mockForField(/* f */) {
    // Se vuoi in futuro fare mock diversi per Fieldname/UiFieldname, lo fai qui.
    return makeDefaultValues(5);
  }

  /**
   * domainsByKey: { [domainKey]: [{key,text}, ...] }
   * aFields: lista MMCTFields (quelli che usi per generare i controlli)
   *
   * - Se MultipleVal === "X" e Dominio manca o ha 0 valori -> crea valori finti
   * - Se Dominio è vuoto -> assegna un "domainKey" sintetico __MOCK__<Fieldname>
   */
  function apply(domainsByKey, aFields) {
    if (!isEnabled()) {
      return { domainsByKey: domainsByKey, fields: aFields };
    }

    const outDomains = Object.assign({}, domainsByKey || {});
    const outFields = (aFields || []).map(function (f) {
      if (!f || f.MultipleVal !== "X") return f;

      const dom = String(f.Dominio || "").trim();
      const syntheticKey = "__MOCK__" + String(f.Fieldname || f.UiFieldname || "FIELD");
      const key = dom || syntheticKey;

      const existing = outDomains[key];
      if (!Array.isArray(existing) || existing.length === 0) {
        outDomains[key] = mockForField(f);
      }

      // se Dominio era vuoto, lo “patcho” SOLO nella copia usata dalla UI
      if (!dom) {
        return Object.assign({}, f, { Dominio: key });
      }
      return f;
    });

    return { domainsByKey: outDomains, fields: outFields };
  }

  return {
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    apply: apply
  };
});
