/* sap.ui.define([
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
  Delegate.addItem = async function (oTable, sPropertyKey ) {
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
 */

sap.ui.define([
  "sap/ui/mdc/TableDelegate",
  "sap/ui/mdc/table/Column",
  "sap/m/HBox",
  "sap/m/Text",
  "sap/m/Input",
  "sap/m/MultiComboBox",
  "sap/ui/core/ListItem"
], function (BaseTableDelegate, Column, HBox, Text, Input, MultiComboBox, ListItem) {
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

  function _getPropCfg(oTable, sPropertyKey) {
    const oCfg = _getCfg(oTable) || {};
    const a = Array.isArray(oCfg.properties) ? oCfg.properties : [];
    return a.find(p => p && p.name === sPropertyKey) || null;
  }

  function _getDomainsMap() {
    // globale (creato in Screen0)
    return sap.ui.getCore().getModel("cfg")?.getProperty("/domainsMap") || {};
  }

  function _hasDomainValues(sDomain) {
    if (!sDomain) return false;
    const map = _getDomainsMap();
    const a = map[sDomain];
    return Array.isArray(a) && a.length > 0;
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

  function _buildTemplate(sBinding, sModelName, sDomain, bRequired) {
    // sBinding es: "vm>Fibra" oppure "Fibra"
    const sReadOnlyExpr = sModelName ? "${" + sModelName + ">__readOnly}" : "${__readOnly}";

    const oText = new Text({
      text: "{" + sBinding + "}",
      visible: "{= " + sReadOnlyExpr + " }"
    });

    const sValueState = bRequired
      ? "{= (!" + sReadOnlyExpr + " && !${" + sBinding + "}) ? 'Error' : 'None' }"
      : "None";

    const sValueStateText = bRequired ? "Campo obbligatorio" : "";

    let oEditCtrl;

    if (sDomain && _hasDomainValues(sDomain)) {
      oEditCtrl = new MultiComboBox({
        selectedKey: "{" + sBinding + "}",
        value: "{" + sBinding + "}",
        visible: "{= !" + sReadOnlyExpr + " }",
        valueState: sValueState,
        valueStateText: sValueStateText,
        items: {
          path: "cfg>/domainsMap/" + sDomain,
          template: new ListItem({
            key: "{cfg>Key}",
            text: "{cfg>Text}"
          })
        }
      });
    } else {
      oEditCtrl = new Input({
        value: "{" + sBinding + "}",
        visible: "{= !" + sReadOnlyExpr + " }",
        valueState: sValueState,
        valueStateText: sValueStateText
      });
    }

    return new HBox({
      items: [oText, oEditCtrl]
    });
  }

  // Dice alla tabella da dove leggere i record (path + modelName)
  Delegate.updateBindingInfo = function (oTable, oBindingInfo) {
    const oCfg = _getCfg(oTable);

    const sPath = (oCfg && oCfg.collectionPath) ? oCfg.collectionPath : "/items";
    const sModelName = (oCfg && oCfg.modelName) ? oCfg.modelName : undefined;

    oBindingInfo.path = sPath;
    if (sModelName) oBindingInfo.model = sModelName;
  };

  // Elenco proprietà (p13n)
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

  // Crea la colonna richiesta dal motore MDC
  Delegate.addItem = async function (oTable, sPropertyKey /*, mPropertyBag */) {
    const oCfg = _getCfg(oTable) || {};
    const sModelName = oCfg.modelName || ""; // es "vm" oppure ""

    const oPropCfg = _getPropCfg(oTable, sPropertyKey);
    if (!oPropCfg) return null;

    const sBinding = sModelName ? (sModelName + ">" + sPropertyKey) : sPropertyKey;

    // dominio + required (devono stare nella cfg.properties)
    const sDomain = String(oPropCfg.domain || oPropCfg.Dominio || "").trim();
    const bRequired = !!oPropCfg.required;

    // header con asterisco (non rosso: il rosso lo fai con ValueState)
    const sHeader = (oPropCfg.label || sPropertyKey) + (bRequired ? " *" : "");

    const bHasPropertyKey = _columnSupportsPropertyKey();
    const bHasDataProperty = _columnSupportsDataProperty();

    const sStableId = oTable.getId() + "--col-" + sPropertyKey;

    const mSettings = {
      id: sStableId,
      header: sHeader,
      template: _buildTemplate(sBinding, sModelName, sDomain, bRequired)
    };

    if (bHasPropertyKey) mSettings.propertyKey = sPropertyKey;
    else if (bHasDataProperty) mSettings.dataProperty = sPropertyKey;

    return new Column(mSettings);
  };

  return Delegate;
});
