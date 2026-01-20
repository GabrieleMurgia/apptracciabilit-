sap.ui.define([], function () {
  "use strict";

  function getApprovedFlag(r) {
    if (!r) return 0;

    var v =
      (r.Approved !== undefined ? r.Approved : undefined) ??
      (r.APPROVED !== undefined ? r.APPROVED : undefined) ??
      (r.approved !== undefined ? r.approved : undefined) ??
      (r.FLAG_APPROVED !== undefined ? r.FLAG_APPROVED : undefined) ??
      (r.FlagApproved !== undefined ? r.FlagApproved : undefined);

    if (v === true) return 1;
    if (v === false) return 0;

    var n = parseInt(String(v || "0"), 10);
    return isNaN(n) ? 0 : n;
  }

  function rankStato(st) {
    st = String(st || "").trim().toUpperCase();
    if (st === "AP") return 4;
    if (st === "CH") return 3;
    if (st === "RJ") return 2;
    return 1; // ST default
  }

  function mergeStatus(a, b) {
    return (rankStato(b) > rankStato(a)) ? b : a;
  }

  function canEdit(role, status) {
    role = String(role || "").trim().toUpperCase();
    status = String(status || "").trim().toUpperCase();
    if (role === "S") return false;
    if (role === "I") return false;
    if (role === "E") return status !== "AP";
    return false;
  }

  function canApprove(role, status) {
    role = String(role || "").trim().toUpperCase();
    status = String(status || "").trim().toUpperCase();
    return role === "I" && (status === "ST" || status === "CH");
  }

  function canReject(role, status) {
    role = String(role || "").trim().toUpperCase();
    status = String(status || "").trim().toUpperCase();
    return role === "I" && (status === "ST" || status === "CH");
  }

  function normStatoRow(r, oVm /* JSONModel vm */) {
    var mock = (oVm && oVm.getProperty && oVm.getProperty("/mock")) || {};
    var sForce = String(mock.forceStato || "").trim().toUpperCase();
    if (sForce === "ST" || sForce === "AP" || sForce === "RJ" || sForce === "CH") return sForce;

    var s = String((r && (r.Stato || r.STATO)) || "").trim().toUpperCase();
    if (s === "ST" || s === "AP" || s === "RJ" || s === "CH") return s;

    var ap = getApprovedFlag(r);
    if (ap === 1) return "AP";

    var rej = parseInt(String(r.Rejected || r.REJECTED || "0"), 10) || 0;
    if (rej > 0) return "RJ";

    var pend = parseInt(String(r.ToApprove || r.TOAPPROVE || "0"), 10) || 0;
    if (pend > 0) return "ST";

    return "ST";
  }

  return {
    getApprovedFlag: getApprovedFlag,
    rankStato: rankStato,
    mergeStatus: mergeStatus,
    canEdit: canEdit,
    canApprove: canApprove,
    canReject: canReject,
    normStatoRow: normStatoRow
  };
});
