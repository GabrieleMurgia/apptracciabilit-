sap.ui.define([], function () {
  "use strict";

  // ---------- helpers di parsing/guess ----------
  const _isEUThousand = s => /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s);
  const _isUSThousand = s => /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s);
  const _trim = v => (typeof v === "string" ? v.trim() : v);
  const _collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

  function _parseNumber(val) {
    if (val === null || val === undefined || val === "") return null;
    if (typeof val === "number") return isFinite(val) ? val : null;
    let s = String(val).replace(/\s/g, "");
    if (_isEUThousand(s)) s = s.replace(/\./g, "").replace(",", ".");
    else if (_isUSThousand(s)) s = s.replace(/,/g, "");
    else if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  function _parseBoolean(val) {
    if (typeof val === "boolean") return val ? 1 : 0;
    const s = String(val).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    if (["si","sì","yes","true","1","y","t"].includes(s)) return 1;
    if (["no","false","0","n","f"].includes(s)) return 0;
    return null;
  }

  function _parseDate(val) {
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val.getTime();
    const s = String(val).trim();

    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); // dd/MM/yyyy
    if (m) {
      const dd = m[1].padStart(2,"0"), mm = m[2].padStart(2,"0");
      const yyyy = m[3].length === 2 ? ("20"+m[3]) : m[3];
      const t = Date.parse(`${yyyy}-${mm}-${dd}T00:00:00`);
      return isNaN(t) ? null : t;
    }
    m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/); // dd-MM-yyyy
    if (m) {
      const dd = m[1].padStart(2,"0"), mm = m[2].padStart(2,"0");
      const yyyy = m[3].length === 2 ? ("20"+m[3]) : m[3];
      const t = Date.parse(`${yyyy}-${mm}-${dd}T00:00:00`);
      return isNaN(t) ? null : t;
    }
    m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/); // dd.MM.yyyy
    if (m) {
      const dd = m[1].padStart(2,"0"), mm = m[2].padStart(2,"0");
      const yyyy = m[3].length === 2 ? ("20"+m[3]) : m[3];
      const t = Date.parse(`${yyyy}-${mm}-${dd}T00:00:00`);
      return isNaN(t) ? null : t;
    }
    const t = Date.parse(s); // ISO e vari
    return isNaN(t) ? null : t;
  }

  function _guessType(arr, path) {
    for (let i = 0; i < arr.length; i++) {
      const v = _trim(arr[i]?.[path]);
      if (v === "" || v === null || v === undefined) continue;
      if (typeof v === "number") return "number";
      if (v instanceof Date) return "date";
      if (typeof v === "boolean") return "boolean";
      if (_parseBoolean(v) !== null) return "boolean";
      if (_parseNumber(v)  !== null) return "number";
      if (_parseDate(v)    !== null) return "date";
      return "string";
    }
    return "string";
  }

  function _normalize(v, type) {
    if (v === "" || v === null || v === undefined) return null;
    if (type === "boolean") return _parseBoolean(v);
    if (type === "number")  return _parseNumber(v);
    if (type === "date")    return _parseDate(v);
    return String(v);
  }

  function _cmpVals(a, b, type) {
    const A = _normalize(a, type);
    const B = _normalize(b, type);
    if (A === null && B === null) return 0;
    if (A === null) return 1;      // nulls last in asc
    if (B === null) return -1;
    if (type === "string") return _collator.compare(A, B);
    return A < B ? -1 : (A > B ? 1 : 0);
  }

  function _extractSortersFromEngineState(oEvt) {
    const st = oEvt.getParameter("state") || oEvt.mParameters?.state || {};
    return st.Sort || st.sorters || (st.sortConditions && st.sortConditions.sorters) || [];
  }

  // ---------- API pubblica ----------
  function refreshBackup(oController, oModel, sPath) {
    const arr = oModel.getProperty(sPath) || [];
    const backup = JSON.parse(JSON.stringify(arr));
    backup.forEach((r, i) => r.__origIdx = i); // per sort stabile
    oController._sortingBackup = { path: sPath, data: backup };
  }

  function _getBackup(oController, oModel, sPath) {
    const liveLen = (oModel.getProperty(sPath) || []).length;
    if (!oController._sortingBackup ||
        oController._sortingBackup.path !== sPath ||
        !Array.isArray(oController._sortingBackup.data) ||
        oController._sortingBackup.data.length !== liveLen) {
      refreshBackup(oController, oModel, sPath);
    }
    return oController._sortingBackup.data;
  }

  function _sortFromBackup(backupArr, sorters) {
    // prepara descriptor (tipo per colonna)
    const specs = sorters.map(s => {
      const path = s.name || s.path || s.key;
      return { path, desc: !!s.descending, type: _guessType(backupArr, path) };
    });

    // sort stabile usando indice originale come tie-breaker
    const work = backupArr.map((r, i) => ({ r, __i: r.__origIdx ?? i }));
    work.sort((A, B) => {
      for (const s of specs) {
        const res = _cmpVals(A.r?.[s.path], B.r?.[s.path], s.type);
        if (res !== 0) return s.desc ? -res : res;
      }
      return A.__i - B.__i;
    });

    return work.map(x => {
      const clone = { ...x.r };
      delete clone.__origIdx;
      return clone;
    });
  }

  function applyFromEngineEvent(oEvt, oController, oModel, sPath) {
    const sorters = _extractSortersFromEngineState(oEvt);
    const backup = _getBackup(oController, oModel, sPath);

    if (!sorters.length) {
      // restore ordine originale
      const restored = JSON.parse(JSON.stringify(backup));
      oModel.setProperty(sPath, restored);
      oModel.refresh(true);
      return;
    }

    const out = _sortFromBackup(backup, sorters);
    oModel.setProperty(sPath, out);
    oModel.refresh(true);
  }

  return {
    refreshBackup,
    applyFromEngineEvent
  };
});
