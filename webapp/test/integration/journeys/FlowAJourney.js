sap.ui.define([
  "sap/ui/test/opaQunit"
], function (opaTest) {
  "use strict";

  QUnit.module("Flow A");

  opaTest("Screen0 -> Screen1 -> Screen2 -> Screen3 -> Screen4 save round-trip works", function (Given, When, Then) {
    Given.iStartMyApp({ hash: "", profile: "valentino-synthetic-i" });
    Then.onTheScreen0Page.iShouldSeeLandingPage();

    When.onTheScreen0Page.iPressFlowATile();
    Then.onTheScreen1Page.iShouldSeeVendorsLoaded();

    When.onTheScreen1Page.iPressFirstVendor();
    Then.onTheScreen2Page.iShouldSeeMaterialsLoaded();

    When.onTheScreen2Page.iPressFirstMaterial();
    Then.onTheScreen3Page.iShouldSeeRecordsLoaded();

    When.onTheScreen3Page.iEditParentFieldTo("MaterialeFornitore", "KT-S3-SAVE");
    When.onTheScreen3Page.iPressSave();
    Then.onTheScreen3Page.iShouldSeeBackendParentFieldValue("MaterialeFornitore", "KT-S3-SAVE");

    When.onTheScreen3Page.iPressFirstDetailNavigationButton();
    Then.onTheScreen4Page.iShouldSeeRowsLoaded();

    When.onTheScreen4Page.iEditDetailFieldTo("Note", "KT-S4-SAVE");
    When.onTheScreen4Page.iPressSave();
    Then.onTheScreen3Page.iShouldSeeRecordsLoaded();
    Then.onTheScreen4Page.iShouldSeeBackendDetailFieldValue("Note", "KT-S4-SAVE");
    Then.iTeardownMyApp();
  });
});
