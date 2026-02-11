sap.ui.define([
  "apptracciabilita/apptracciabilita/util/normalize"
], function (N) {
  "use strict";

  return {
    ts: N.ts,
    deepClone: N.deepClone,
    toStableString: N.toStableString,
    valToText: N.valToText
  };
});