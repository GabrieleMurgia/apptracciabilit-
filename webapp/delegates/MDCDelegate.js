sap.ui.define([
  "sap/ui/mdc/TableDelegate",
  "sap/ui/mdc/table/Column",
  "sap/ui/mdc/Field"
], function (BaseTableDelegate, Column, Field) {
  "use strict";

  const Delegate = Object.assign({}, BaseTableDelegate);

  function _getPayload(oTable) {
    const d = oTable && oTable.getDelegate && oTable.getDelegate();
    return (d && d.payload) || {};
  }

  function _getCfg(oTable) {
    const p = _getPayload(oTable);
    const sCfgModel = p.cfgModel || "vm";
    const sCfgPath = p.cfgPath || "/mdcCfg/default";

    // importante: il model deve essere visibile al controllo (inherited dalla View va bene)
    const oCfgModel = oTable.getModel(sCfgModel);
    const oCfg = oCfgModel ? (oCfgModel.getProperty(sCfgPath) || {}) : {};

    // normalizza fallback
    return {
      modelName: (oCfg.modelName !== undefined) ? oCfg.modelName : (p.modelName !== undefined ? p.modelName : "detail"),
      collectionPath: oCfg.collectionPath || p.collectionPath || "/Records",
      properties: Array.isArray(oCfg.properties) ? oCfg.properties : (Array.isArray(p.properties) ? p.properties : []),
      bindingPaths: oCfg.bindingPaths || p.bindingPaths || {},
      editMode: oCfg.editMode || p.editMode || "Display"
    };
  }

  // DICE ALLA TABELLA QUALE MODEL/PATH USARE PER LE RIGHE
  Delegate.updateBindingInfo = function (oTable, oBindingInfo) {
    const cfg = _getCfg(oTable);

    // binding al model giusto
    if (cfg.modelName) {
      oBindingInfo.model = cfg.modelName; // named model
    } else {
      delete oBindingInfo.model; // default model
    }

    // path assoluto tipo "/Records"
    oBindingInfo.path = cfg.collectionPath || "/Records";

    // sicurezza: evita "No data available" per refresh lenti
    oBindingInfo.parameters = oBindingInfo.parameters || {};
  };

  // PROPRIETÀ CONOSCIUTE (PER P13N, VARIANT, ETC.)
  Delegate.fetchProperties = async function (oTable) {
    const cfg = _getCfg(oTable);
    return (cfg.properties || []).map(p => ({
      name: p.name,
      label: p.label || p.name,
      dataType: p.dataType || "String"
    }));
  };

  // CREAZIONE COLONNA DA propertyKey
  Delegate.addItem = async function (oTable, sPropertyKey /*, mPropertyBag */) {
    const cfg = _getCfg(oTable);
    const aProps = cfg.properties || [];
    const oProp = aProps.find(p => p.name === sPropertyKey);

    if (!oProp) return null;

    const sModel = cfg.modelName || ""; // "" = default model
    const mPaths = cfg.bindingPaths || {};
    const sPath = mPaths[sPropertyKey] || sPropertyKey;
    const sBinding = sModel ? ("{" + sModel + ">" + sPath + "}") : ("{" + sPath + "}");

    return new Column({
      propertyKey: oProp.name,
      header: oProp.label || oProp.name,
      template: new Field({
        value: sBinding,
        editMode: cfg.editMode || "Display"
      })
    });
  };

  return Delegate;
});
