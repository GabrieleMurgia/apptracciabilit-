sap.ui.define([
  "sap/ui/test/opaQunit"
], function (opaTest) {
  "use strict";

  QUnit.module("Flow C");

  opaTest("Screen5 loads saved rows and applies global filtering", function (Given, When, Then) {
    Given.iStartMyApp({ hash: "", profile: "valentino-synthetic-i" });
    Then.onTheScreen0Page.iShouldSeeLandingPage();

    When.onTheScreen0Page.iPressFlowCTile();
    When.onTheScreen5Page.iSelectCategory("CF");
    When.onTheScreen5Page.iPressLoadData();
    Then.onTheScreen5Page.iShouldSeeLoadedRows();

    When.onTheScreen5Page.iEnterGlobalFilter("BATCH-CO");
    Then.onTheScreen5Page.iShouldSeeRowCount(1);
    Then.iTeardownMyApp();
  });
});
