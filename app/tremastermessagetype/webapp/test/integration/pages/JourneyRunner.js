sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"com/inc/tremastermessagetype/test/integration/pages/MessageTypesForMetadataList",
	"com/inc/tremastermessagetype/test/integration/pages/MessageTypesForMetadataObjectPage"
], function (JourneyRunner, MessageTypesForMetadataList, MessageTypesForMetadataObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('com/inc/tremastermessagetype') + '/test/flpSandbox.html#cominctremastermessagetype-tile',
        pages: {
			onTheMessageTypesForMetadataList: MessageTypesForMetadataList,
			onTheMessageTypesForMetadataObjectPage: MessageTypesForMetadataObjectPage
        },
        async: true
    });

    return runner;
});

