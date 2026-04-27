sap.ui.define([
  "sap/ui/test/opaQunit"
], function (opaTest) {
  "use strict";

  QUnit.module("Flow B");

  opaTest("Screen6 parses workbook, checks rows and sends valid data", function (Given, When, Then) {
    Given.iStartMyApp({ hash: "", profile: "valentino-synthetic-i" });
    Then.onTheScreen0Page.iShouldSeeLandingPage();

    When.onTheScreen0Page.iPressFlowBTile();
    When.onTheScreen6Page.iSelectCategory("CF");
    When.onTheScreen6Page.iUploadFixtureWorkbook();
    Then.onTheScreen6Page.iShouldSeePreviewLoaded();

    When.onTheScreen6Page.iPressSendData();
    When.onTheDialog.iConfirmWithOk();
    When.onTheDialog.iConfirmWithOk();
    Then.onTheScreen6Page.iShouldSeeUploadCleared();
    Then.onTheScreen6Page.iShouldSeeBackendPostCount(1);
    Then.iTeardownMyApp();
  });
});
