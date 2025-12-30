sap.ui.define([
  "sap/ui/mdc/TableDelegate",
  "sap/ui/mdc/table/Column",
  "sap/ui/mdc/Field"
], function (BaseTableDelegate, Column, Field) {
  "use strict";

  const Delegate = Object.assign({}, BaseTableDelegate);

    // DICE ALLA TABELLA DOVE STA IL PATH DEL MODELLO
  Delegate.updateBindingInfo = function (oTable, oBindingInfo) {
    const sCollection = oTable?.getDelegate()?.payload?.collectionName || "items";
    oBindingInfo.path = "/" + sCollection; // usa il default model della View
  };

  // Elenco delle proprietà note alla tabella (devono combaciare con i propertyKey delle colonne)
  Delegate.fetchProperties = async function (oTable) {
    return [
      { name: "Season",             label: "Stagione",            dataType: "String" },
      { name: "ArticoloValentino",  label: "Art. Cod. Valent",    dataType: "String" },
      { name: "ArticoloFornitore",  label: "Articolo Fornitore",  dataType: "String" },
      { name: "Materiale",          label: "Materiale",           dataType: "String" },
      { name: "IdLotto",            label: "Id Lotto",            dataType: "String" },
      { name: "PaeseConcia",        label: "Paese Concia finito", dataType: "String" }
    ];
  };

  // Chiamato da Flex quando deve (ri)creare una colonna rimossa/aggiunta da una variante
  Delegate.addItem = async function (oTable, sPropertyKey /*, mPropertyBag */) {
    const aProps = await this.fetchProperties(oTable);
    const oProp = aProps.find(p => p.name === sPropertyKey);

    if (!oProp) {
      // proprietà sconosciuta → impossibile creare la colonna (causa tipica dell’errore)
      return null;
    }

    return new Column({
      propertyKey: oProp.name,
      header: oProp.label,
      template: new Field({
        value: "{" + oProp.name + "}",
        editMode: "Editable"
      })
    });
  };

  return Delegate;
});

