sap.ui.define([], function () {
  "use strict";

  async function forceP13nAllVisible(oTbl, StateUtil, fnLog, reason) {
    if (!oTbl || !StateUtil) return;

    try {
      var st = await StateUtil.retrieveExternalState(oTbl);
      var patched = JSON.parse(JSON.stringify(st || {}));

      var arr =
        patched.items ||
        patched.columns ||
        patched.Columns ||
        (patched.table && patched.table.items) ||
        null;

      if (Array.isArray(arr) && arr.length) {
        arr.forEach(function (it) {
          if (!it) return;
          if (it.visible === false) it.visible = true;
          if (it.visible == null) it.visible = true;
        });

        await StateUtil.applyExternalState(oTbl, patched);
        if (typeof fnLog === "function") fnLog("P13N applyExternalState FORCED visible @ " + reason);
        if (typeof oTbl.rebind === "function") oTbl.rebind();
      }
    } catch (e) {
      if (typeof fnLog === "function") fnLog("P13N force visible FAILED @ " + reason, e && e.message);
    }
  }

  return { forceP13nAllVisible: forceP13nAllVisible };
});
