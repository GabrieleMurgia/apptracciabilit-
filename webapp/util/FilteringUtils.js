sap.ui.define([], function () {
  "use strict";

  // ---------- normalizzazione ----------
  function _norm(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "") // rimuove accenti
      .replace(/\s+/g, " ")
      .trim();
  }

  // ricava le property key cercabili dalla MDC Table
  function _getSearchableKeys(oMdc) {
    // 1) dallo stato corrente MDC (più affidabile)
    const stCols = oMdc?.getCurrentState?.()?.columns || [];
    if (stCols.length) {
      return stCols
        .filter(c => c.visible !== false)
        .map(c => c.name || c.propertyKey) // name è la key MDC
        .filter(Boolean);
    }

    // 2) fallback: dal template delle colonne interne
    const inner = oMdc && (oMdc._oTable || oMdc.getInnerTable?.());
    const cols = (inner?.getColumns?.() || []);
    const keys = [];
    cols.forEach(col => {
      const t = col.getTemplate?.();
      if (t?.getBindingInfo) {
        const bi = t.getBindingInfo("text") || t.getBindingInfo("value");
        const path = bi?.path || bi?.parts?.[0]?.path;
        if (path) keys.push(path);
      }
    });
    return keys;
  }

  // filtra gli oggetti di un array in base ai tokens su più campi
  function _filterArray(arr, tokens, keys) {
    if (!tokens.length) return arr.slice();
    return arr.filter(row => {
      // AND su token, OR su campi
      return tokens.every(tok => {
        for (let k of keys) {
          const v = _norm(row?.[k]);
          if (v.includes(tok)) return true;
        }
        return false;
      });
    });
  }

  // ordina l’array filtrato secondo i sorters memorizzati (stabile)
  function _sortArrayIfNeeded(rows, sorters) {
    if (!Array.isArray(sorters) || !sorters.length) return rows;

    // semplice comparator naturale su stringhe e numerico su numeri/date-like
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

    const guessType = (arr, path) => {
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i]?.[path];
        if (v === "" || v === null || v === undefined) continue;
        if (typeof v === "number") return "number";
        if (v instanceof Date) return "number"; // useremo getTime()
        const s = String(v);
        if (!isNaN(Date.parse(s))) return "number"; // date -> numero
        if (!isNaN(parseFloat(s.replace(",", ".")))) return "number";
        return "string";
      }
      return "string";
    };

    const norm = (v, type) => {
      if (v === "" || v === null || v === undefined) return null;
      if (type === "number") {
        if (v instanceof Date) return v.getTime();
        if (typeof v === "number") return v;
        const n = parseFloat(String(v).replace(",", "."));
        return isNaN(n) ? null : n;
      }
      return String(v);
    };

    const specs = sorters.map(s => {
      const path = s.name || s.path || s.key;
      return { path, desc: !!s.descending, type: guessType(rows, path) };
    });

    const work = rows.map((r, i) => ({ r, __i: i }));
    work.sort((A, B) => {
      for (const s of specs) {
        const a = norm(A.r?.[s.path], s.type);
        const b = norm(B.r?.[s.path], s.type);
        if (a === null && b === null) continue;
        if (a === null) return 1;
        if (b === null) return -1;
        const res = (s.type === "string") ? collator.compare(a, b) : (a < b ? -1 : a > b ? 1 : 0);
        if (res !== 0) return s.desc ? -res : res;
      }
      return A.__i - B.__i;
    });

    return work.map(x => x.r);
  }

  // ---------- API ----------
  function rebuildMaster(oController, oModel, sPath) {
    const arr = oModel.getProperty(sPath) || [];
    oController._dataMaster = JSON.parse(JSON.stringify(arr)); // copia profonda
  }

  /**
   * Applica ricerca globale (AND su token, OR su colonne visibili).
   * - query: stringa digitata
   * - lastSorters: array di sorters MDC (opzionale) per riapplicare l’ordinamento
   */
  function applyGlobalFilter({ controller, mdcTable, model, path, query, lastSorters }) {
    const base = controller._dataMaster || model.getProperty(path) || [];
    const keys = _getSearchableKeys(mdcTable);
    const tokens = _norm(query).split(" ").filter(Boolean);

    // 1) filtra
    const filtered = _filterArray(base, tokens, keys);

    // 2) (opzionale) riordina secondo gli ultimi sorters noti
    const out = _sortArrayIfNeeded(filtered, lastSorters);

    // 3) scrivi nel modello
    model.setProperty(path, JSON.parse(JSON.stringify(out)));
    model.refresh(true);
  }

  return {
    rebuildMaster,
    applyGlobalFilter
  };
});
