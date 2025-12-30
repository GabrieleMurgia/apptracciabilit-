sap.ui.define([
  "sap/m/MessageToast"
], function (MessageToast) {
  "use strict";

  function scanFlexLS() {
    const FLEX_PREFIX = "sap.ui.fl.";
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(FLEX_PREFIX)) continue;
      const raw = localStorage.getItem(k);
      try {
        const obj = JSON.parse(raw);
        out.push({ key: k, raw, obj });
      } catch (e) { /* ignore */ }
    }
    return out;
  }

  function buildVariantBundleFromLS(variantId) {
    const all = scanFlexLS();
    const items = all.filter(e =>
      (e.obj?.fileType === "ctrl_variant" && e.obj.fileName === variantId) ||
      (e.obj?.variantReference === variantId)
    ).map(e => ({ key: e.key, value: e.raw }));
    return { variantId, items };
  }

  function resolveVariantIdFromVMKey(oVM, keyOrName) {
    if (typeof keyOrName === "string" && keyOrName.startsWith("id_") && keyOrName.endsWith("_flVariant")) {
      return keyOrName;
    }
    const vs = oVM.getVariants?.() || [];
    const byKey = vs.find(i => (i.getKey?.() || i.mProperties?.key) === keyOrName);
    if (byKey) return byKey.getKey?.() || byKey.mProperties?.key;
    const byName = vs.find(i => (i.getTitle?.() || i.mProperties?.title) === keyOrName);
    return byName ? (byName.getKey?.() || byName.mProperties?.key) : null;
  }

  async function handleSave(oVM, oEvent, options) {
    const { overwrite, key: overwriteKey, name, def, execute } = oEvent.getParameters();
    await Promise.resolve(); // lascia finire Flex
    const currentKey = overwrite ? (overwriteKey || oVM.getCurrentVariantKey()) : oVM.getCurrentVariantKey();
    const variantId = resolveVariantIdFromVMKey(oVM, currentKey || name);
    if (!variantId) {
      console.warn("Impossibile risolvere variantId per", currentKey || name);
      return;
    }
    const bundle = buildVariantBundleFromLS(variantId);
    const payload = {
      appId: options?.appId || "",
      vmId: options?.vmId || "",
      name,
      variantId,
      isDefault: !!def,
      executeOnSelection: !!execute,
      scope: options?.scope || "U",
      items: bundle.items
    };
    try {
      await fetch(options?.serverUrl || "/sap/zui_variant_srv/Variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      MessageToast.show("Variante replicata al backend");
    } catch (e) {
      console.error("Errore nel POST varianti:", e);
      MessageToast.show("Replica backend fallita");
    }
  }

  function handleManage(oEvent) {
    // qui puoi serializzare e inviare al backend anche rename/delete/default etc.
    // per ora solo log
    console.log("VariantManagement manage:", oEvent.getParameters());
  }

  function handleSelect(oEvent) {
    console.log("VariantManagement select:", oEvent.getParameters()?.key);
  }

  return {
    scanFlexLS,
    buildVariantBundleFromLS,
    resolveVariantIdFromVMKey,
    handleSave,
    handleManage,
    handleSelect
  };
});