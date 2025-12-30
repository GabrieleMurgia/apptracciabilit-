sap.ui.define([
  "sap/ui/mdc/TableDelegate",
  "sap/ui/mdc/table/Column",
  "sap/ui/mdc/Field"
], function (BaseTableDelegate, Column, Field) {
  "use strict";

  const Delegate = Object.assign({}, BaseTableDelegate);

  function _getPayload(oTable) {
    const d = oTable && oTable.getDelegate && oTable.getDelegate();
    return (d && d.payload) ? d.payload : {};
  }

  function _getCfg(oTable) {
    const p = _getPayload(oTable);
    const sCfgModel = p.cfgModel || "vm";
    const sCfgPath = p.cfgPath || "";

    const oCfgModel = oTable.getModel(sCfgModel);
    if (!oCfgModel || !sCfgPath) return null;

    const oCfg = oCfgModel.getProperty(sCfgPath);
    return oCfg || null;
  }

  function _columnSupportsPropertyKey() {
    try {
      const oMeta = Column && Column.getMetadata && Column.getMetadata();
      return !!(oMeta && oMeta.getProperty && oMeta.getProperty("propertyKey"));
    } catch (e) {
      return false;
    }
  }

  function _columnSupportsDataProperty() {
    try {
      const oMeta = Column && Column.getMetadata && Column.getMetadata();
      return !!(oMeta && oMeta.getProperty && oMeta.getProperty("dataProperty"));
    } catch (e) {
      return false;
    }
  }

  // Dice alla tabella da dove leggere i record (path + modelName)
  Delegate.updateBindingInfo = function (oTable, oBindingInfo) {
    const oCfg = _getCfg(oTable);

    const sPath = (oCfg && oCfg.collectionPath) ? oCfg.collectionPath : "/items";
    const sModelName = (oCfg && oCfg.modelName) ? oCfg.modelName : undefined;

    oBindingInfo.path = sPath;
    if (sModelName) oBindingInfo.model = sModelName;
  };

  // Elenco proprietà (usato da p13n/engine per conoscere i campi)
  Delegate.fetchProperties = async function (oTable) {
    const oCfg = _getCfg(oTable);
    const a = (oCfg && Array.isArray(oCfg.properties)) ? oCfg.properties : [];

    return a.map(function (p) {
      return {
        name: p.name,
        label: p.label || p.name,
        dataType: p.dataType || "String"
      };
    });
  };

  // Crea la colonna richiesta dal motore MDC (p13n / variant / ecc.)
  Delegate.addItem = async function (oTable, sPropertyKey /*, mPropertyBag */) {
    const aProps = await this.fetchProperties(oTable);
    const oProp = (aProps || []).find(function (p) { return p.name === sPropertyKey; });

    if (!oProp) return null;

    const oCfg = _getCfg(oTable) || {};
    const sModelName = oCfg.modelName || "";
    const sBinding = sModelName ? (sModelName + ">" + sPropertyKey) : sPropertyKey;

    const bHasPropertyKey = _columnSupportsPropertyKey();
    const bHasDataProperty = _columnSupportsDataProperty();

    // ID stabile: fondamentale per non far impazzire p13n/varianti
    const sStableId = oTable.getId() + "--col-" + sPropertyKey;

    const mSettings = {
      id: sStableId,
      header: oProp.label,
      template: new Field({
        value: "{" + sBinding + "}",
        editMode: "Display"
      })
    };

    if (bHasPropertyKey) mSettings.propertyKey = sPropertyKey;
    else if (bHasDataProperty) mSettings.dataProperty = sPropertyKey;

    return new Column(mSettings);
  };

  return Delegate;
});
