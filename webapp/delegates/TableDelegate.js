sap.ui.define([
  "sap/ui/mdc/TableDelegate",
  "sap/ui/model/Sorter"
], function (BaseDelegate, Sorter) {
  "use strict";

  const Delegate = Object.assign({}, BaseDelegate);

  Delegate.updateBindingInfo = function (oTable, oBindingInfo) {
    // ⬅️ importantissimo: lascia che il delegate base costruisca sorter/filters
    BaseDelegate.updateBindingInfo(oTable, oBindingInfo);

    // Path del JSONModel
    const payload = oTable?.getDelegate()?.payload || {};
    const sCollection = payload.collectionName || "items";
    oBindingInfo.path = "/" + sCollection;

    // Fallback: se per qualche motivo non ci sono sorters, leggili dallo stato
    if (!oBindingInfo.sorter || !oBindingInfo.sorter.length) {
      const st = oTable.getCurrentState ? oTable.getCurrentState() : {};
      const aConds = st.sorters || (st.sortConditions && st.sortConditions.sorters) || [];
      oBindingInfo.sorter = aConds.map(s => new Sorter(s.name || s.path, !!s.descending));
    }
  };

  Delegate.fetchProperties = function () {
    return Promise.resolve([
      { name: "Season",             label: "Stagione",             path: "Season",             dataType: "sap.ui.model.type.String" },
      { name: "ArticoloValentino",  label: "Art. Cod. Valent",     path: "ArticoloValentino",  dataType: "sap.ui.model.type.String" },
      { name: "ArticoloFornitore",  label: "Articolo Fornitore",   path: "ArticoloFornitore",  dataType: "sap.ui.model.type.String" },
      { name: "Materiale",          label: "Materiale",            path: "Materiale",          dataType: "sap.ui.model.type.String" },
      { name: "IdLotto",            label: "Id Lotto",             path: "IdLotto",            dataType: "sap.ui.model.type.String" },
      { name: "PaeseConcia",        label: "Paese Concia finito",  path: "PaeseConcia",        dataType: "sap.ui.model.type.String" }
    ]);
  };

  Delegate.getSupportedFeatures = function () {
    return {
      p13nModes: ["Column", "Sort", "Group", "Aggregate"],
      columnResize: true,
      rebindTable: true
    };
  };

  // (facoltativo ma utile) applica l’ordinamento anche senza rebind completo
  Delegate.rebindTable = function (oTable, oBindingInfo) {
    const oInner = oTable._oTable || oTable.getInnerTable?.();
    const oBind = oInner?.getBinding("rows") || oInner?.getBinding("items");
    if (oBind) {
      oBind.sort(oBindingInfo.sorter || []);
    }
  };

  return Delegate;
});
