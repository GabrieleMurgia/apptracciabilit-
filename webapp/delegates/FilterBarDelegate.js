sap.ui.define([
  "sap/ui/mdc/FilterBarDelegate",
  "sap/ui/mdc/FilterField"
], function (FilterBarDelegate, FilterField) {
  "use strict";

  const Delegate = Object.assign({}, FilterBarDelegate);

  // Proprietà esposte al FilterBar/P13n
  Delegate.fetchProperties = function () {
    return Promise.resolve([
      { name: "Season",             label: "Stagione",              path: "Season",             dataType: "sap.ui.model.type.String", maxConditions: 1 },
      { name: "ArticoloValentino",  label: "Art. Cod. Valent",      path: "ArticoloValentino",  dataType: "sap.ui.model.type.String", maxConditions: 1 },
      { name: "ArticoloFornitore",  label: "Articolo Fornitore",    path: "ArticoloFornitore",  dataType: "sap.ui.model.type.String", maxConditions: 1 },
      { name: "Materiale",          label: "Materiale",             path: "Materiale",          dataType: "sap.ui.model.type.String", maxConditions: 1 },
      { name: "IdLotto",            label: "Id Lotto",              path: "IdLotto",            dataType: "sap.ui.model.type.String", maxConditions: 1 },
      { name: "PaeseConcia",        label: "Paese Concia finito",   path: "PaeseConcia",        dataType: "sap.ui.model.type.String", maxConditions: 1 }
    ]);
  };

  // Creazione dinamica dei FilterField (anche per la UI di personalizzazione)
  Delegate.addItem = function (oFilterBar, sPropertyName) {
    return oFilterBar.awaitPropertyHelper().then(function (oPropertyHelper) {
      const oProp = oPropertyHelper.getProperty(sPropertyName);
      if (!oProp) {
        return null;
      }
      return new FilterField({
        label: oProp.label,
        propertyKey: oProp.name,
        maxConditions: oProp.maxConditions || 1,
        // Binding atteso dal FilterBar: modello interno "$filters"
        conditions: "{$filters>/conditions/" + oProp.name + "}"
      });
    });
  };

  return Delegate;
});
